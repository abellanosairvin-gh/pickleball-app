/**
 * Queue arrangement: reorders queued games (teams untouched) so players
 * get rest between appearances. Courts free up one at a time, so queued
 * game j starts roughly when game j - C finishes (C courts): a player in
 * games i and j gets about j - i - C games of rest. A gap under C means
 * they'd be wanted on two courts at once; a gap of C is back-to-back; the
 * target is C + 2 or more (at least two games' rest).
 */

export type QueuedGame = { id: number; players: number[] };

export type ArrangeInput = {
  /** Queued games in current order. */
  queue: QueuedGame[];
  courtCount: number;
  /** Games on court right now, in start order: slots -N..-1 before the queue. */
  playing: QueuedGame[];
};

function gapPenalty(gap: number, courts: number): number {
  const short = courts + 2 - gap;
  if (short <= 0) return 0;
  // Lexicographic in effect: one conflict (gap < C, a player wanted on two
  // courts at once) outweighs any number of back-to-backs (gap = C), which
  // outweigh any amount of short-rest shortfall (quadratic).
  return short * short + (gap < courts ? 10_000 : gap === courts ? 100 : 0);
}

function totalPenalty(
  order: QueuedGame[],
  courts: number,
  initialLast: Map<number, number>,
): number {
  const last = new Map(initialLast);
  let total = 0;
  order.forEach((g, i) => {
    for (const p of g.players) {
      const prev = last.get(p);
      if (prev !== undefined) total += gapPenalty(i - prev, courts);
      last.set(p, i);
    }
  });
  return total;
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

/** Greedy build: each slot takes the game whose players have rested most. */
function greedy(
  queue: QueuedGame[],
  courts: number,
  initialLast: Map<number, number>,
  rand: () => number,
): QueuedGame[] {
  const remaining = [...queue];
  const order: QueuedGame[] = [];
  const last = new Map(initialLast);
  while (remaining.length > 0) {
    const slot = order.length;
    let bestI = 0;
    let bestCost = Infinity;
    remaining.forEach((g, i) => {
      let cost = 0;
      for (const p of g.players) {
        const prev = last.get(p);
        if (prev !== undefined) cost += gapPenalty(slot - prev, courts);
      }
      // Tiny jitter breaks ties differently per restart; original order
      // wins otherwise (stable for the organizer).
      cost += rand() * 0.5;
      if (cost < bestCost) {
        bestCost = cost;
        bestI = i;
      }
    });
    const [g] = remaining.splice(bestI, 1);
    for (const p of g.players) last.set(p, slot);
    order.push(g);
  }
  return order;
}

/** Swap and insertion moves until neither lowers the total penalty. */
function improve(
  order: QueuedGame[],
  courts: number,
  initialLast: Map<number, number>,
): number {
  let best = totalPenalty(order, courts, initialLast);
  for (let pass = 0; pass < 40 && best > 0; pass++) {
    let improved = false;
    const n = order.length;
    for (let a = 0; a < n - 1; a++) {
      for (let b = a + 1; b < n; b++) {
        [order[a], order[b]] = [order[b], order[a]];
        const cost = totalPenalty(order, courts, initialLast);
        if (cost < best) {
          best = cost;
          improved = true;
        } else {
          [order[a], order[b]] = [order[b], order[a]];
        }
      }
    }
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const [g] = order.splice(a, 1);
        order.splice(b, 0, g);
        const cost = totalPenalty(order, courts, initialLast);
        if (cost < best) {
          best = cost;
          improved = true;
        } else {
          const [back] = order.splice(b, 1);
          order.splice(a, 0, back);
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

/**
 * Best of several seeded greedy + local-search runs (deterministic for a
 * given queue). Returns the games in their new order; the current order is
 * one of the candidates, so arranging never makes things worse.
 */
export function arrangeQueue(input: ArrangeInput): QueuedGame[] {
  const courts = Math.max(1, input.courtCount);
  const initialLast = initialSlots(input.playing);

  let bestOrder = [...input.queue];
  let bestCost = improve(bestOrder, courts, initialLast);
  for (let r = 0; r < 24 && bestCost > 0; r++) {
    const order = greedy(input.queue, courts, initialLast, mulberry32(r * 2654435761 + 7));
    const cost = improve(order, courts, initialLast);
    if (cost < bestCost) {
      bestCost = cost;
      bestOrder = order;
    }
  }
  return bestOrder;
}

/** On-court games sit at slots -N..-1 (earliest started first). */
function initialSlots(playing: QueuedGame[]): Map<number, number> {
  const last = new Map<number, number>();
  playing.forEach((g, i) => {
    for (const p of g.players) last.set(p, i - playing.length);
  });
  return last;
}

/** Smallest gap between any player's consecutive appearances (for display/tests). */
export function minGap(order: QueuedGame[], playing: QueuedGame[]): number {
  const last = initialSlots(playing);
  let min = Infinity;
  order.forEach((g, i) => {
    for (const p of g.players) {
      const prev = last.get(p);
      if (prev !== undefined) min = Math.min(min, i - prev);
      last.set(p, i);
    }
  });
  return min;
}
