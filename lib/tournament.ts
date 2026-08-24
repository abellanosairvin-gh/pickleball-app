import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { computeLeaderboard } from "./queries";
import { games, players, sessions, type Game, type Player, type Session } from "./schema";

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every partnership (teammate pair) that appears in the given games. */
function partnerships(list: Game[]): Set<string> {
  const s = new Set<string>();
  for (const g of list) {
    s.add(pairKey(g.t1p1, g.t1p2));
    s.add(pairKey(g.t2p1, g.t2p2));
  }
  return s;
}

/**
 * Random male-female pairing where no pair is in `forbidden`, found by
 * backtracking over shuffled orders. Null when no such pairing exists.
 * Expects equally sized pools.
 */
function matchMixed(
  males: Player[],
  females: Player[],
  forbidden: Set<string>,
): [Player, Player][] | null {
  const m = shuffle(males);
  const f = shuffle(females);
  const used = new Array<boolean>(f.length).fill(false);
  const out: [Player, Player][] = [];
  const place = (i: number): boolean => {
    if (i === m.length) return true;
    for (let j = 0; j < f.length; j++) {
      if (used[j] || forbidden.has(pairKey(m[i].id, f[j].id))) continue;
      used[j] = true;
      out.push([m[i], f[j]]);
      if (place(i + 1)) return true;
      used[j] = false;
      out.pop();
    }
    return false;
  };
  return place(0) ? out : null;
}

/**
 * Random pairing of one pool into teams where no pair is in `forbidden`,
 * found by backtracking over shuffled orders. An odd pool leaves one random
 * player out (matches the round generator, which drops an odd team anyway).
 * Null when no such pairing exists.
 */
function matchPool(
  pool: Player[],
  forbidden: Set<string>,
): [Player, Player][] | null {
  let p = shuffle(pool);
  if (p.length % 2 === 1) p = p.slice(0, -1);
  const used = new Array<boolean>(p.length).fill(false);
  const out: [Player, Player][] = [];
  const place = (): boolean => {
    const i = used.findIndex((u) => !u);
    if (i === -1) return true;
    used[i] = true;
    for (let j = i + 1; j < p.length; j++) {
      if (used[j] || forbidden.has(pairKey(p[i].id, p[j].id))) continue;
      used[j] = true;
      out.push([p[i], p[j]]);
      if (place()) return true;
      used[j] = false;
      out.pop();
    }
    used[i] = false;
    return false;
  };
  return place() ? out : null;
}

/** Last resort when repeats are unavoidable: the draw with the fewest. */
function leastRepeats(
  draws: () => [Player, Player][],
  forbidden: Set<string>,
): [Player, Player][] {
  let best: [Player, Player][] = draws();
  let bestN = Infinity;
  for (let attempt = 0; attempt < 20 && bestN > 0; attempt++) {
    const cand = attempt === 0 ? best : draws();
    const n = cand.filter((t) =>
      forbidden.has(pairKey(t[0].id, t[1].id)),
    ).length;
    if (n < bestN) {
      bestN = n;
      best = cand;
    }
  }
  return best;
}

/**
 * Teams for one bracket round. Partnering the same person twice in the
 * bracket is a hard rule: the draw first tries to also avoid the night's
 * regular-game partnerships, then relaxes to bracket-only, and only if even
 * that is mathematically impossible settles for the fewest repeats.
 */
function drawTeams(
  males: Player[],
  females: Player[],
  bracketPairs: Set<string>,
  anyPairs: Set<string>,
): [Player, Player][] {
  if (males.length === females.length) {
    return (
      matchMixed(males, females, anyPairs) ??
      matchMixed(males, females, bracketPairs) ??
      leastRepeats(() => {
        const m = shuffle(males);
        const f = shuffle(females);
        return m.map((p, i) => [p, f[i]] as [Player, Player]);
      }, bracketPairs)
    );
  }
  const larger = males.length > females.length ? males : females;
  return (
    matchPool(larger, anyPairs) ??
    matchPool(larger, bracketPairs) ??
    leastRepeats(() => {
      const p = shuffle(larger);
      const out: [Player, Player][] = [];
      for (let i = 0; i + 1 < p.length; i += 2) out.push([p[i], p[i + 1]]);
      return out;
    }, bracketPairs)
  );
}

/** Playoff qualifiers: the top maleSlots men and top femaleSlots women by standings. */
function qualifiedPlayers(
  session: Session,
  roster: Player[],
  allGames: Game[],
): Player[] {
  // Same capped standings the leaderboard shows: extra fill-in games beyond
  // the cap don't influence who qualifies.
  const standings = computeLeaderboard(roster, allGames, session.gameCap);
  const rank = new Map(standings.map((r, i) => [r.playerId, i]));
  const byRank = (a: Player, b: Player) =>
    (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
    (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER);
  const top = (gender: "M" | "F", slots: number | null) =>
    roster
      .filter((p) => p.gender === gender)
      .sort(byRank)
      .slice(0, slots ?? undefined);
  return [...top("M", session.maleSlots), ...top("F", session.femaleSlots)];
}

/**
 * Tournament playoffs (knockout brackets) on top of a normal session: the
 * night's games build the standings, and the top-N per gender (the
 * configured slots) qualify. Two phases:
 *
 * 1. Qualifier - while one gender outnumbers the other, the larger gender
 *    plays same-gender doubles knockout rounds (partners redrawn each
 *    round); both players of a winning team advance, halving the field.
 * 2. Finals - once the gender counts are equal, every round draws fresh
 *    mixed (MF) pairs from the surviving players; winners advance
 *    individually. The last game's winning pair are the champions.
 *
 * Nobody partners the same person twice across bracket rounds (see
 * drawTeams).
 *
 * Eliminated players get no further bracket games. A round is generated only
 * when no bracket game is queued or playing. Seeding round 1 requires
 * `start: true` (the organizer's button); the auto path after each score
 * only advances a bracket that already exists.
 */
export async function runTournamentRound(
  sessionId: number,
  opts?: { start?: boolean },
) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session || session.status !== "active" || !session.tournament) return;

  const roster = await db
    .select()
    .from(players)
    .where(and(eq(players.sessionId, sessionId), eq(players.active, true)));
  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.sessionId, sessionId))
    .orderBy(asc(games.seq));

  const bracket = allGames.filter((g) => g.round !== null);
  // Starting the bracket is an explicit organizer action, never automatic.
  if (bracket.length === 0 && !opts?.start) return;
  // The bracket only advances between rounds: every bracket game finished.
  if (bracket.some((g) => g.status !== "completed")) return;

  const byId = new Map(roster.map((p) => [p.id, p]));
  const lastRound = Math.max(0, ...bracket.map((g) => g.round ?? 0));

  // Survivors: winners of the last round (round 0 = the playoff qualifiers).
  let survivors: Player[];
  if (lastRound === 0) {
    survivors = qualifiedPlayers(session, roster, allGames);
  } else {
    const ids = new Set<number>();
    for (const g of bracket) {
      // Battle-for-3rd winners are already out of the title race.
      if (g.round !== lastRound || g.stage === "bronze") continue;
      if (g.score1 === null || g.score2 === null) return; // unscored - wait
      const winners =
        g.score1 > g.score2 ? [g.t1p1, g.t1p2] : [g.t2p1, g.t2p2];
      winners.forEach((id) => ids.add(id));
    }
    survivors = [...ids].map((id) => byId.get(id)).filter(Boolean) as Player[];
    // Qualifier rounds only reduce one gender; the waiting gender's
    // qualifiers (never in a bracket game yet) rejoin for the finals.
    const playedGender = survivors[0]?.gender;
    if (survivors.length > 0 && survivors.every((p) => p.gender === playedGender)) {
      const waiting = qualifiedPlayers(session, roster, allGames).filter(
        (p) =>
          p.gender !== playedGender &&
          !bracket.some((g) =>
            [g.t1p1, g.t1p2, g.t2p1, g.t2p2].includes(p.id),
          ),
      );
      survivors = [...survivors, ...waiting];
    }
  }

  const males = survivors.filter((p) => p.gender === "M");
  const females = survivors.filter((p) => p.gender === "F");

  // Champions crowned (one pair left) or nothing to schedule.
  if (survivors.length < 4) return;

  // Build this round's teams: qualifier while genders are uneven (larger
  // gender plays same-gender; smaller gender sits out), finals once even
  // (fresh MF pairs every round). Nobody partners the same person twice in
  // the bracket; the night's regular-game partnerships are also avoided
  // whenever a repeat-free draw exists.
  if (
    males.length !== females.length &&
    (males.length > females.length ? males : females).length < 4
  ) {
    return; // can't run a doubles round
  }
  const bracketPairs = partnerships(bracket);
  const anyPairs = partnerships(allGames);
  const teams = drawTeams(males, females, bracketPairs, anyPairs);
  if (teams.length < 2) return;

  const matchTeams = shuffle(teams);
  const round = lastRound + 1;
  // One game left between the last teams standing: the championship final.
  const isFinal =
    teams.length === 2 &&
    (males.length === females.length ||
      males.length === 0 ||
      females.length === 0);
  let seq = Math.max(0, ...allGames.map((g) => g.seq));
  let queueOrder = Math.max(0, ...allGames.map((g) => g.queueOrder));
  const newGames: (typeof games.$inferInsert)[] = [];
  for (let i = 0; i + 1 < matchTeams.length; i += 2) {
    const [t1, t2] = [matchTeams[i], matchTeams[i + 1]];
    newGames.push({
      sessionId,
      seq: ++seq,
      queueOrder: ++queueOrder,
      round,
      stage: isFinal ? "final" : null,
      t1p1: t1[0].id,
      t1p2: t1[1].id,
      t2p1: t2[0].id,
      t2p2: t2[1].id,
    });
  }

  // Alongside the final, the semifinal losers play a battle for 3rd.
  if (isFinal) {
    const semis = bracket.filter(
      (g) => g.round === lastRound && g.stage !== "bronze",
    );
    const losers = semis
      .flatMap((g) =>
        g.score1! > g.score2! ? [g.t2p1, g.t2p2] : [g.t1p1, g.t1p2],
      )
      .map((id) => byId.get(id))
      .filter(Boolean) as Player[];
    if (semis.length === 2 && losers.length === 4) {
      // Same no-repeat-partners rule — in particular, the losing semifinal
      // pairs never replay as-is in the battle for 3rd.
      const bronzeTeams = drawTeams(
        losers.filter((p) => p.gender === "M"),
        losers.filter((p) => p.gender === "F"),
        bracketPairs,
        anyPairs,
      );
      if (bronzeTeams.length === 2) {
        newGames.push({
          sessionId,
          seq: ++seq,
          queueOrder: ++queueOrder,
          round,
          stage: "bronze",
          t1p1: bronzeTeams[0][0].id,
          t1p2: bronzeTeams[0][1].id,
          t2p1: bronzeTeams[1][0].id,
          t2p2: bronzeTeams[1][1].id,
        });
      }
    }
  }
  if (newGames.length > 0) await db.insert(games).values(newGames);
}

export type TournamentStatus = {
  phase: "not-started" | "qualifier" | "finals" | "champions";
  round: number;
  /** Champions (final winning pair) once decided. */
  champions?: [string, string];
  /** Players still alive in the bracket. */
  aliveCount: number;
};

export type PodiumEntry = { title: string; names: [string, string] };

/**
 * Final placements once the champions are crowned: the final's winning pair,
 * the final's losing pair (1st runners-up), then the battle-for-3rd result
 * (winners 2nd runners-up, losers 3rd) - those two entries wait until that
 * game is scored. Older brackets without a battle for 3rd fall back to
 * ranking the semifinal losing pairs by how close their loss was. Empty
 * until the final has been played.
 */
export function championshipLadder(
  roster: Player[],
  allGames: Game[],
): PodiumEntry[] {
  if (tournamentStatus(roster, allGames).phase !== "champions") return [];
  const byId = new Map(roster.map((p) => [p.id, p]));
  const nameOf = (id: number) => byId.get(id)?.name ?? "?";
  const pair = (ids: [number, number]): [string, string] => [
    nameOf(ids[0]),
    nameOf(ids[1]),
  ];
  const scored = (g: Game) =>
    g.status === "completed" && g.score1 !== null && g.score2 !== null;
  const winners = (g: Game): [number, number] =>
    g.score1! > g.score2! ? [g.t1p1, g.t1p2] : [g.t2p1, g.t2p2];
  const losers = (g: Game): [number, number] =>
    g.score1! > g.score2! ? [g.t2p1, g.t2p2] : [g.t1p1, g.t1p2];
  const bracket = allGames.filter(
    (g) => g.round !== null && g.stage !== "bronze" && scored(g),
  );
  const lastRound = Math.max(...bracket.map((g) => g.round!));
  const final = bracket.find((g) => g.round === lastRound)!;
  const podium: PodiumEntry[] = [
    { title: "Champions", names: pair(winners(final)) },
    { title: "1st runners-up", names: pair(losers(final)) },
  ];
  const bronze = allGames.find((g) => g.stage === "bronze");
  if (bronze) {
    // Placements 3 and 4 wait for the battle for 3rd to finish.
    if (scored(bronze)) {
      podium.push(
        { title: "2nd runners-up", names: pair(winners(bronze)) },
        { title: "3rd runners-up", names: pair(losers(bronze)) },
      );
    }
    return podium;
  }
  const semiLosers = allGames
    .filter((g) => g.round === lastRound - 1 && g.stage !== "bronze" && scored(g))
    .map((g) => ({
      ids: losers(g),
      margin: Math.abs(g.score1! - g.score2!),
      scored: Math.min(g.score1!, g.score2!),
    }))
    .sort((a, b) => a.margin - b.margin || b.scored - a.scored);
  const ordinals = ["2nd", "3rd"];
  semiLosers.slice(0, ordinals.length).forEach((l, i) => {
    podium.push({ title: `${ordinals[i]} runners-up`, names: pair(l.ids) });
  });
  return podium;
}

/** Derives bracket progress for display from already-loaded data. */
export function tournamentStatus(
  roster: Player[],
  allGames: Game[],
): TournamentStatus {
  // The battle for 3rd is outside the title race - champions can be crowned
  // while it is still being played.
  const bracket = allGames.filter(
    (g) => g.round !== null && g.stage !== "bronze",
  );
  if (bracket.length === 0)
    return { phase: "not-started", round: 0, aliveCount: roster.length };
  const byId = new Map(roster.map((p) => [p.id, p]));
  const lastRound = Math.max(...bracket.map((g) => g.round ?? 0));
  const lastGames = bracket.filter((g) => g.round === lastRound);
  const done = lastGames.every(
    (g) => g.status === "completed" && g.score1 !== null && g.score2 !== null,
  );
  const survivors = new Set<number>();
  if (done) {
    for (const g of lastGames) {
      const w = g.score1! > g.score2! ? [g.t1p1, g.t1p2] : [g.t2p1, g.t2p2];
      w.forEach((id) => survivors.add(id));
    }
  } else {
    for (const g of lastGames)
      [g.t1p1, g.t1p2, g.t2p1, g.t2p2].forEach((id) => survivors.add(id));
  }
  if (done && lastGames.length === 1 && survivors.size === 2) {
    const [a, b] = [...survivors];
    return {
      phase: "champions",
      round: lastRound,
      champions: [byId.get(a)?.name ?? "?", byId.get(b)?.name ?? "?"],
      aliveCount: 2,
    };
  }
  const genders = new Set(
    [...survivors].map((id) => byId.get(id)?.gender).filter(Boolean),
  );
  return {
    phase: genders.size > 1 ? "finals" : "qualifier",
    round: lastRound,
    aliveCount: survivors.size,
  };
}
