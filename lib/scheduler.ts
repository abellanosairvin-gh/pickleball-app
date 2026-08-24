import type { Gender, Rating } from "./schema";

export type SchedPlayer = { id: number; rating: Rating; gender: Gender };
export type Team = [number, number];
export type Matchup = { t1: Team; t2: Team };

export type GenerateInput = {
  players: SchedPlayer[];
  /** Game Cap: max games per player for the whole Session, same for everyone. */
  cap: number;
  mode: "random" | "rating";
  /**
   * Games that already count against caps and partner uniqueness:
   * completed, in-progress, and pinned queued games.
   */
  existing: Matchup[];
  restarts?: number;
  /**
   * Fill-in mode (top-up): every game must seat at least one player still
   * under the cap; the other seats may go to players already at the cap
   * (at most one game over it), fewest games and longest wait first. Without
   * it, only under-cap players are seated - three players short of a game
   * get nothing.
   */
  fillIn?: boolean;
};

export type GenerateResult = {
  games: Matchup[];
  /** Players who could not reach the cap: playerId -> games they ended up with. */
  shortfall: { playerId: number; games: number }[];
};

const RATING_SCORE: Record<Rating, number> = { beginner: 0, mid: 1, advanced: 2 };

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Hard rule: Beginner and Advanced never share a Game in any role. */
function ratingLegal(four: SchedPlayer[]): boolean {
  let hasBeginner = false;
  let hasAdvanced = false;
  for (const p of four) {
    if (p.rating === "beginner") hasBeginner = true;
    if (p.rating === "advanced") hasAdvanced = true;
  }
  return !(hasBeginner && hasAdvanced);
}

/** Hard rule (Gender Balance): an all-male team may only face another all-male team. */
function genderLegal(t1: SchedPlayer[], t2: SchedPlayer[]): boolean {
  const allMale = (t: SchedPlayer[]) => t.every((p) => p.gender === "M");
  return allMale(t1) === allMale(t2);
}

type State = {
  counts: Map<number, number>;
  partners: Set<string>;
  oppCounts: Map<string, number>;
  lastSeq: Map<number, number>;
};

function softScore(
  t1: SchedPlayer[],
  t2: SchedPlayer[],
  seq: number,
  state: State,
  mode: "random" | "rating",
  rand: () => number,
): number {
  let penalty = 0;
  // Opponent variety (soft): penalize repeat opponents.
  for (const a of t1)
    for (const b of t2)
      penalty += 4 * (state.oppCounts.get(pairKey(a.id, b.id)) ?? 0);
  // Spacing (soft): prefer players who have waited longest.
  for (const p of [...t1, ...t2]) {
    const last = state.lastSeq.get(p.id);
    const wait = last === undefined ? seq + 1 : seq - last;
    penalty -= Math.min(wait, 6);
  }
  if (mode === "rating") {
    // Prefer rating-cohesive games and evenly matched teams.
    const all = [...t1, ...t2].map((p) => RATING_SCORE[p.rating]);
    penalty += 3 * (Math.max(...all) - Math.min(...all));
    const sum = (t: SchedPlayer[]) =>
      t.reduce((acc, p) => acc + RATING_SCORE[p.rating], 0);
    penalty += 2 * Math.abs(sum(t1) - sum(t2));
  }
  return penalty + rand() * 0.5;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The three ways to split four players into two teams, as index pairs. */
const PARTITIONS: [Team, Team][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

function runOnce(input: GenerateInput, rand: () => number) {
  const { players, cap, mode, existing, fillIn = false } = input;
  const byId = new Map(players.map((p) => [p.id, p]));
  const state: State = {
    counts: new Map(players.map((p) => [p.id, 0])),
    partners: new Set(),
    oppCounts: new Map(),
    lastSeq: new Map(),
  };
  existing.forEach((g, i) => {
    for (const id of [...g.t1, ...g.t2]) {
      state.counts.set(id, (state.counts.get(id) ?? 0) + 1);
      state.lastSeq.set(id, i);
    }
    state.partners.add(pairKey(g.t1[0], g.t1[1]));
    state.partners.add(pairKey(g.t2[0], g.t2[1]));
    for (const a of g.t1)
      for (const b of g.t2) {
        const k = pairKey(a, b);
        state.oppCounts.set(k, (state.oppCounts.get(k) ?? 0) + 1);
      }
  });

  const result: Matchup[] = [];
  let seq = existing.length;
  let totalPenalty = 0;

  for (;;) {
    const count = (p: SchedPlayer) => state.counts.get(p.id) ?? 0;
    const needy = players.filter((p) => count(p) < cap);
    // Fill-in mode widens the pool to at-cap players (one game over, max);
    // every game still has to seat someone who is lacking games.
    const eligible = fillIn
      ? players.filter((p) => count(p) < cap + 1)
      : needy;
    if (needy.length === 0 || eligible.length < 4) break;
    const needyIds = new Set(needy.map((p) => p.id));

    // Prioritize fewest games played, then longest wait.
    const sorted = [...eligible].sort((a, b) => {
      const ca = state.counts.get(a.id)! - state.counts.get(b.id)!;
      if (ca !== 0) return ca;
      const la = state.lastSeq.get(a.id) ?? -1;
      const lb = state.lastSeq.get(b.id) ?? -1;
      if (la !== lb) return la - lb;
      return rand() - 0.5;
    });

    const findBest = (pool: SchedPlayer[]) => {
      let best: { m: Matchup; score: number } | null = null;
      const n = pool.length;
      for (let i = 0; i < n - 3; i++)
        for (let j = i + 1; j < n - 2; j++)
          for (let k = j + 1; k < n - 1; k++)
            for (let l = k + 1; l < n; l++) {
              const four = [pool[i], pool[j], pool[k], pool[l]];
              if (!ratingLegal(four)) continue;
              const fillers = four.filter((p) => !needyIds.has(p.id)).length;
              if (fillers === 4) continue; // must seat someone lacking games
              for (const [pi1, pi2] of PARTITIONS) {
                const t1 = [four[pi1[0]], four[pi1[1]]];
                const t2 = [four[pi2[0]], four[pi2[1]]];
                if (state.partners.has(pairKey(t1[0].id, t1[1].id))) continue;
                if (state.partners.has(pairKey(t2[0].id, t2[1].id))) continue;
                if (!genderLegal(t1, t2)) continue;
                // Each fill-in seat is a game that won't count for that
                // player - strongly prefer seating the lacking players.
                const score =
                  softScore(t1, t2, seq, state, mode, rand) + 12 * fillers;
                if (!best || score < best.score) {
                  best = {
                    m: {
                      t1: [t1[0].id, t1[1].id],
                      t2: [t2[0].id, t2[1].id],
                    },
                    score,
                  };
                }
              }
            }
      return best;
    };

    // Small pool of the most-deserving players first; widen if it has no
    // legal game. In fill-in mode the lacking players always make the pool.
    const head = Math.max(9, fillIn ? needy.length + 6 : 0);
    let best = findBest(sorted.slice(0, Math.min(head, sorted.length)));
    if (!best && sorted.length > head) best = findBest(sorted);
    if (!best) break;

    const { m } = best;
    totalPenalty += best.score;
    result.push(m);
    state.partners.add(pairKey(m.t1[0], m.t1[1]));
    state.partners.add(pairKey(m.t2[0], m.t2[1]));
    for (const a of m.t1)
      for (const b of m.t2) {
        const k = pairKey(a, b);
        state.oppCounts.set(k, (state.oppCounts.get(k) ?? 0) + 1);
      }
    for (const id of [...m.t1, ...m.t2]) {
      state.counts.set(id, state.counts.get(id)! + 1);
      state.lastSeq.set(id, seq);
    }
    seq++;
  }

  const shortfall = players
    .filter((p) => (state.counts.get(p.id) ?? 0) < cap)
    .map((p) => ({ playerId: p.id, games: state.counts.get(p.id) ?? 0 }));

  void byId;
  return { games: result, shortfall, totalPenalty };
}

/**
 * Best-effort schedule generation (ADR-0002). Multi-restart randomized greedy:
 * maximizes total legal games under the hard rules (Game Cap, rating
 * compatibility, Gender Balance Rule, partner uniqueness), then prefers the
 * run with the best soft score (opponent variety, spacing, rating cohesion).
 */
export function generateSchedule(input: GenerateInput): GenerateResult {
  const restarts = input.restarts ?? 80;
  let best: ReturnType<typeof runOnce> | null = null;
  for (let r = 0; r < restarts; r++) {
    const attempt = runOnce(input, mulberry32(r * 2654435761 + 1));
    if (
      !best ||
      attempt.games.length > best.games.length ||
      (attempt.games.length === best.games.length &&
        attempt.totalPenalty < best.totalPenalty)
    ) {
      best = attempt;
    }
  }
  return { games: best!.games, shortfall: best!.shortfall };
}
