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

/** Playoff qualifiers: the top maleSlots men and top femaleSlots women by standings. */
function qualifiedPlayers(
  session: Session,
  roster: Player[],
  allGames: Game[],
): Player[] {
  const standings = computeLeaderboard(roster, allGames, 0);
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
 * 1. Qualifier — while one gender outnumbers the other, the larger gender
 *    plays same-gender doubles knockout rounds (partners re-randomized each
 *    round); both players of a winning team advance, halving the field.
 * 2. Finals — once the gender counts are equal, every round draws fresh
 *    random mixed (MF) pairs from the surviving players; winners advance
 *    individually. The last game's winning pair are the champions.
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
      if (g.round !== lastRound) continue;
      if (g.score1 === null || g.score2 === null) return; // unscored — wait
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
  // (fresh random MF pairs every round).
  let teams: [Player, Player][];
  if (males.length !== females.length) {
    const larger = males.length > females.length ? males : females;
    if (larger.length < 4) return; // can't run a doubles round
    const pool = shuffle(larger);
    teams = [];
    for (let i = 0; i + 1 < pool.length; i += 2) teams.push([pool[i], pool[i + 1]]);
  } else {
    const m = shuffle(males);
    const f = shuffle(females);
    teams = m.map((p, i) => [p, f[i]] as [Player, Player]);
  }
  if (teams.length < 2) return;

  // Pair teams into games, retrying a few shuffles to avoid repeat partners.
  const partnerPairs = new Set<string>();
  for (const g of allGames) {
    partnerPairs.add(pairKey(g.t1p1, g.t1p2));
    partnerPairs.add(pairKey(g.t2p1, g.t2p2));
  }
  let bestTeams = teams;
  let bestRepeats = Infinity;
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = attempt === 0 ? teams : reshuffleTeams(teams, males, females);
    const repeats = candidate.filter((t) =>
      partnerPairs.has(pairKey(t[0].id, t[1].id)),
    ).length;
    if (repeats < bestRepeats) {
      bestRepeats = repeats;
      bestTeams = candidate;
    }
    if (bestRepeats === 0) break;
  }

  const matchTeams = shuffle(bestTeams);
  const round = lastRound + 1;
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
      t1p1: t1[0].id,
      t1p2: t1[1].id,
      t2p1: t2[0].id,
      t2p2: t2[1].id,
    });
  }
  if (newGames.length > 0) await db.insert(games).values(newGames);
}

/** Fresh random draw with the same composition rule as the original teams. */
function reshuffleTeams(
  original: [Player, Player][],
  males: Player[],
  females: Player[],
): [Player, Player][] {
  if (males.length === females.length && males.length === original.length) {
    const m = shuffle(males);
    const f = shuffle(females);
    return m.map((p, i) => [p, f[i]] as [Player, Player]);
  }
  const pool = shuffle(original.flat());
  const out: [Player, Player][] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) out.push([pool[i], pool[i + 1]]);
  return out;
}

export type TournamentStatus = {
  phase: "not-started" | "qualifier" | "finals" | "champions";
  round: number;
  /** Champions (final winning pair) once decided. */
  champions?: [string, string];
  /** Players still alive in the bracket. */
  aliveCount: number;
};

/** Derives bracket progress for display from already-loaded data. */
export function tournamentStatus(
  roster: Player[],
  allGames: Game[],
): TournamentStatus {
  const bracket = allGames.filter((g) => g.round !== null);
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
