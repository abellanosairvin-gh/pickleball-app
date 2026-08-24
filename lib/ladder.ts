import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { games, players, sessions } from "./schema";

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Ladder mode ("winners vs winners"): called after a game completes. Players
 * whose last result was a win form the winners pool; losses - plus players
 * yet to finish a game (late arrivals) - form the losers pool. As soon as a
 * pool holds four free players under the Game Cap, a game is queued from the
 * four longest-waiting, split into the pairing with the fewest repeated
 * partnerships. Results trump the rating and gender rules here; the Game Cap
 * still applies.
 */
export async function runLadderMatchmaking(sessionId: number) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session || session.status !== "active" || session.defaultMode !== "ladder")
    return;

  const roster = await db
    .select()
    .from(players)
    .where(
      and(
        eq(players.sessionId, sessionId),
        eq(players.active, true),
        eq(players.out, false),
      ),
    );
  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.sessionId, sessionId))
    .orderBy(asc(games.seq));

  const counts = new Map<number, number>();
  const busy = new Set<number>();
  const partnerPairs = new Set<string>();
  const last = new Map<number, { result: "win" | "loss"; at: number }>();
  for (const g of allGames) {
    const ids = [g.t1p1, g.t1p2, g.t2p1, g.t2p2];
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    partnerPairs.add(pairKey(g.t1p1, g.t1p2));
    partnerPairs.add(pairKey(g.t2p1, g.t2p2));
    if (g.status !== "completed") {
      for (const id of ids) busy.add(id);
    } else if (g.score1 !== null && g.score2 !== null) {
      const at = g.completedAt?.getTime() ?? 0;
      const t1Won = g.score1 > g.score2;
      for (const id of [g.t1p1, g.t1p2])
        last.set(id, { result: t1Won ? "win" : "loss", at });
      for (const id of [g.t2p1, g.t2p2])
        last.set(id, { result: t1Won ? "loss" : "win", at });
    }
  }

  const eligible = roster.filter(
    (p) => !busy.has(p.id) && (counts.get(p.id) ?? 0) < session.gameCap,
  );
  const byWait = (a: { id: number }, b: { id: number }) =>
    (last.get(a.id)?.at ?? 0) - (last.get(b.id)?.at ?? 0);
  const winners = eligible
    .filter((p) => last.get(p.id)?.result === "win")
    .sort(byWait);
  const losers = eligible
    .filter((p) => last.get(p.id)?.result === "loss")
    .sort(byWait);
  const fresh = eligible.filter((p) => !last.has(p.id));
  const loserPool = [...losers, ...fresh];

  let seq = Math.max(0, ...allGames.map((g) => g.seq));
  let queueOrder = Math.max(0, ...allGames.map((g) => g.queueOrder));
  const PARTITIONS: [[number, number], [number, number]][] = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];
  const newGames: (typeof games.$inferInsert)[] = [];

  for (const pool of [winners, loserPool]) {
    while (pool.length >= 4) {
      const four = pool.splice(0, 4);
      let best = PARTITIONS[0];
      let bestRepeats = Infinity;
      for (const part of PARTITIONS) {
        const [t1, t2] = part;
        const repeats =
          (partnerPairs.has(pairKey(four[t1[0]].id, four[t1[1]].id)) ? 1 : 0) +
          (partnerPairs.has(pairKey(four[t2[0]].id, four[t2[1]].id)) ? 1 : 0);
        if (repeats < bestRepeats) {
          bestRepeats = repeats;
          best = part;
        }
      }
      const [t1, t2] = best;
      partnerPairs.add(pairKey(four[t1[0]].id, four[t1[1]].id));
      partnerPairs.add(pairKey(four[t2[0]].id, four[t2[1]].id));
      newGames.push({
        sessionId,
        seq: ++seq,
        queueOrder: ++queueOrder,
        t1p1: four[t1[0]].id,
        t1p2: four[t1[1]].id,
        t2p1: four[t2[0]].id,
        t2p2: four[t2[1]].id,
      });
    }
  }

  if (newGames.length > 0) await db.insert(games).values(newGames);
}
