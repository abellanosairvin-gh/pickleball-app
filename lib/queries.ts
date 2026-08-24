import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { games, players, sessions, type Game, type Player, type Session } from "./schema";
import {
  bracketLabel,
  championshipLadder,
  type PodiumEntry,
} from "./tournament";

export type TeamView = { names: [string, string] };
export type GameView = {
  id: number;
  seq: number;
  status: Game["status"];
  court: number | null;
  team1: TeamView;
  team2: TeamView;
  score1: number | null;
  score2: number | null;
  pinned: boolean;
  startedAt: string | null;
  durationMs: number | null;
  /** Bracket badge: "Championship", "Battle for 3rd", or "Men battle for top 4". */
  label: string | null;
  /** Medal game (final / battle for 3rd), for emphasised badges. */
  stage: Game["stage"];
  /** Players already at the game cap whose result here didn't count. */
  uncounted: string[];
};

export type LeaderboardRow = {
  playerId: number;
  name: string;
  gender: "M" | "F";
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  gamesPlayed: number;
  /** Chronological win/loss form guide, first game first. */
  results: ("W" | "L")[];
};

export type Snapshot = {
  session: {
    name: string;
    status: Session["status"];
    courtCount: number;
    gameCap: number;
    tournament: boolean;
    maleSlots: number | null;
    femaleSlots: number | null;
  };
  playing: GameView[];
  queue: GameView[];
  history: GameView[];
  leaderboard: LeaderboardRow[];
  /** Final tournament placements; empty until the bracket has finished. */
  podium: PodiumEntry[];
};

export async function loadSessionData(sessionId: number) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session) return null;
  const allPlayers = await db
    .select()
    .from(players)
    .where(eq(players.sessionId, sessionId))
    .orderBy(asc(players.name));
  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.sessionId, sessionId))
    .orderBy(asc(games.queueOrder), asc(games.seq));
  return { session, players: allPlayers, games: allGames };
}

export async function getSessionByToken(token: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.publicToken, token));
  return session ?? null;
}

export function computeLeaderboard(
  allPlayers: Player[],
  allGames: Game[],
  gameCap = 0,
  /** When given, filled with gameId → names whose result didn't count (over cap). */
  uncountedOut?: Map<number, string[]>,
): LeaderboardRow[] {
  const rows = new Map<number, LeaderboardRow>();
  const ensure = (p: Player) => {
    if (!rows.has(p.id)) {
      rows.set(p.id, {
        playerId: p.id,
        name: p.name,
        gender: p.gender,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        gamesPlayed: 0,
        results: [],
      });
    }
    return rows.get(p.id)!;
  };
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  // Games counted per player, for the cap.
  const counted = new Map<number, number>();
  // Every active player appears even with zero games; departed players appear
  // once they have a completed game (stats survive departure).
  for (const p of allPlayers) if (p.active) ensure(p);
  // Chronological order so each player's form guide reads first game first.
  // Tournament bracket games are left out entirely: the leaderboard is the
  // night's regular play, which is what seeds the bracket - playoff results
  // show on the championship ladder instead.
  const completedGames = allGames
    .filter(
      (g) =>
        g.round === null &&
        g.status === "completed" &&
        g.score1 !== null &&
        g.score2 !== null,
    )
    .sort(
      (a, b) =>
        (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0) ||
        a.seq - b.seq,
    );
  for (const g of completedGames) {
    const t1Won = g.score1! > g.score2!;
    const apply = (ids: number[], scored: number, given: number, won: boolean) => {
      for (const id of ids) {
        const p = byId.get(id);
        if (!p) continue;
        const row = ensure(p);
        // Fairness: once a player has the cap's worth of counted regular
        // games, extra games (e.g. filling someone else's shortfall) don't
        // score for them - only for the players still under the cap.
        if (gameCap > 0) {
          const n = counted.get(id) ?? 0;
          if (n >= gameCap) {
            if (uncountedOut) {
              const list = uncountedOut.get(g.id) ?? [];
              list.push(p.name);
              uncountedOut.set(g.id, list);
            }
            continue;
          }
          counted.set(id, n + 1);
        }
        row.gamesPlayed++;
        row.pointsFor += scored;
        row.pointsAgainst += given;
        row.diff = row.pointsFor - row.pointsAgainst;
        if (won) row.wins++;
        else row.losses++;
        row.results.push(won ? "W" : "L");
      }
    };
    apply([g.t1p1, g.t1p2], g.score1!, g.score2!, t1Won);
    apply([g.t2p1, g.t2p2], g.score2!, g.score1!, !t1Won);
  }
  // Sort: wins desc, losses asc, +/- desc, then name.
  return [...rows.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.diff - a.diff ||
      a.name.localeCompare(b.name),
  );
}

function toGameView(
  g: Game,
  allGames: Game[],
  byId: Map<number, Player>,
  uncounted: string[] = [],
): GameView {
  const name = (id: number) => byId.get(id)?.name ?? "?";
  const durationMs =
    g.startedAt && g.completedAt
      ? Math.max(0, g.completedAt.getTime() - g.startedAt.getTime())
      : null;
  return {
    id: g.id,
    seq: g.seq,
    status: g.status,
    court: g.court,
    team1: { names: [name(g.t1p1), name(g.t1p2)] },
    team2: { names: [name(g.t2p1), name(g.t2p2)] },
    score1: g.score1,
    score2: g.score2,
    pinned: g.pinned,
    startedAt: g.startedAt?.toISOString() ?? null,
    durationMs,
    label: bracketLabel(g, allGames, byId),
    stage: g.stage,
    uncounted,
  };
}

export function buildSnapshot(
  session: Session,
  allPlayers: Player[],
  allGames: Game[],
): Snapshot {
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  const uncounted = new Map<number, string[]>();
  const leaderboard = computeLeaderboard(
    allPlayers,
    allGames,
    session.gameCap,
    uncounted,
  );
  const view = (g: Game) =>
    toGameView(g, allGames, byId, uncounted.get(g.id) ?? []);
  return {
    session: {
      name: session.name,
      status: session.status,
      courtCount: session.courtCount,
      gameCap: session.gameCap,
      tournament: session.tournament,
      maleSlots: session.maleSlots,
      femaleSlots: session.femaleSlots,
    },
    playing: allGames.filter((g) => g.status === "playing").map(view),
    queue: allGames.filter((g) => g.status === "queued").map(view),
    history: allGames
      .filter((g) => g.status === "completed")
      .sort(
        (a, b) =>
          (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
      )
      .map(view),
    leaderboard,
    podium: session.tournament ? championshipLadder(allPlayers, allGames) : [],
  };
}

/** Active players whose scheduled games (queued+playing+completed) fall short of the Game Cap. */
export function computeShortfall(
  session: Session,
  allPlayers: Player[],
  allGames: Game[],
): { name: string; scheduled: number }[] {
  const counts = new Map<number, number>();
  for (const g of allGames) {
    for (const id of [g.t1p1, g.t1p2, g.t2p1, g.t2p2]) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return allPlayers
    .filter(
      (p) => p.active && !p.out && (counts.get(p.id) ?? 0) < session.gameCap,
    )
    .map((p) => ({ name: p.name, scheduled: counts.get(p.id) ?? 0 }));
}
