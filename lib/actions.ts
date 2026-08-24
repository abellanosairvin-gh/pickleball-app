"use server";

import { and, asc, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import {
  checkCredentials,
  clearAuthCookie,
  requireAuth,
  setAuthCookie,
} from "./auth";
import { db } from "./db";
import { runLadderMatchmaking } from "./ladder";
import { runTournamentRound } from "./tournament";
import { generateSchedule as runGenerator } from "./scheduler";
import { games, players, sessions } from "./schema";
import type { ParsedPlayer } from "./roster";

const revalidate = (sessionId: number) => revalidatePath(`/session/${sessionId}`);

// ---------- auth ----------

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!checkCredentials(username, password)) {
    redirect("/login?error=1");
  }
  await setAuthCookie();
  redirect("/");
}

export async function logout() {
  await clearAuthCookie();
  redirect("/login");
}

// ---------- session ----------

export async function createSession(formData: FormData) {
  await requireAuth();
  const [existing] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.status, "active"));
  if (existing) redirect(`/session/${existing.id}`);

  const name = String(formData.get("name") ?? "").trim() || "Open Play";
  const courtCount = clampInt(formData.get("courtCount"), 1, 20, 2);
  const gameCap = clampInt(formData.get("gameCap"), 1, 30, 6);
  const mode = pickMode(formData.get("defaultMode"));
  const tournament = formData.get("tournament") === "on";
  const maleSlots = tournament
    ? pow2Slots(formData.get("maleSlots"), 8)
    : null;
  const femaleSlots = tournament
    ? pow2Slots(formData.get("femaleSlots"), 4)
    : null;
  const [row] = await db
    .insert(sessions)
    .values({
      name,
      courtCount,
      gameCap,
      defaultMode: mode,
      tournament,
      maleSlots,
      femaleSlots,
      publicToken: randomUUID().replace(/-/g, "").slice(0, 12),
    })
    .returning({ id: sessions.id });
  redirect(`/session/${row.id}`);
}

export async function endSession(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  await db
    .update(sessions)
    .set({ status: "ended" })
    .where(eq(sessions.id, sessionId));
  revalidate(sessionId);
}

/** Permanently deletes a session with all its players and games. Only ended sessions can be deleted. */
export async function deleteSession(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  if (!Number.isInteger(sessionId)) return;
  const [session] = await db
    .select({ status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session || session.status !== "ended") return;
  await db.delete(games).where(eq(games.sessionId, sessionId));
  await db.delete(players).where(eq(players.sessionId, sessionId));
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  revalidatePath("/");
  redirect("/");
}

// ---------- roster ----------

export async function addPlayersBulk(sessionId: number, playersJson: string) {
  await requireAuth();
  const parsed = JSON.parse(playersJson) as ParsedPlayer[];
  if (!Array.isArray(parsed) || parsed.length === 0) return;
  const existing = await db
    .select({ name: players.name })
    .from(players)
    .where(and(eq(players.sessionId, sessionId), eq(players.active, true)));
  const taken = new Set(existing.map((p) => p.name.toLowerCase()));
  const fresh = parsed.filter((p) => {
    const key = p.name.toLowerCase();
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });
  if (fresh.length > 0) {
    await db.insert(players).values(
      fresh.map((p) => ({
        sessionId,
        name: p.name,
        gender: p.gender,
        rating: p.rating,
      })),
    );
  }
  revalidate(sessionId);
}

export async function updatePlayer(formData: FormData) {
  await requireAuth();
  const id = Number(formData.get("playerId"));
  const sessionId = Number(formData.get("sessionId"));
  const name = String(formData.get("name") ?? "").trim();
  const gender = formData.get("gender") === "F" ? "F" : "M";
  const ratingRaw = String(formData.get("rating"));
  const rating =
    ratingRaw === "beginner" || ratingRaw === "advanced" ? ratingRaw : "mid";
  if (!name) return;
  await db
    .update(players)
    .set({ name, gender, rating })
    .where(and(eq(players.id, id), eq(players.sessionId, sessionId)));
  revalidate(sessionId);
}

/**
 * Removes a player from the roster (stats on completed games survive) and
 * deletes their un-started games - the organizer then regenerates the tail.
 */
export async function removePlayer(formData: FormData) {
  await requireAuth();
  const id = Number(formData.get("playerId"));
  const sessionId = Number(formData.get("sessionId"));
  await db
    .update(players)
    .set({ active: false })
    .where(and(eq(players.id, id), eq(players.sessionId, sessionId)));
  await db
    .delete(games)
    .where(
      and(
        eq(games.sessionId, sessionId),
        eq(games.status, "queued"),
        or(
          eq(games.t1p1, id),
          eq(games.t1p2, id),
          eq(games.t2p1, id),
          eq(games.t2p2, id),
        ),
      ),
    );
  revalidate(sessionId);
}

// ---------- schedule ----------

/**
 * (Re)generates the Queue per ADR-0002: completed, in-progress, and pinned
 * queued games are kept and counted; the unpinned queued tail is replaced.
 */
export async function generateSchedule(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session || session.status !== "active") return;

  const roster = await db
    .select()
    .from(players)
    .where(and(eq(players.sessionId, sessionId), eq(players.active, true)));
  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.sessionId, sessionId))
    .orderBy(asc(games.queueOrder), asc(games.seq));

  // Ladder mode: Generate only seeds a round for idle players (one game each,
  // random and rule-respecting) - results drive everything after that, and
  // nothing already queued is deleted.
  if (session.defaultMode === "ladder") {
    const busy = new Set<number>();
    const counts = new Map<number, number>();
    for (const g of allGames) {
      for (const id of [g.t1p1, g.t1p2, g.t2p1, g.t2p2]) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (g.status !== "completed") busy.add(id);
      }
    }
    const idle = roster.filter(
      (p) => !busy.has(p.id) && (counts.get(p.id) ?? 0) < session.gameCap,
    );
    const seeded = runGenerator({
      players: idle.map((p) => ({ id: p.id, rating: p.rating, gender: p.gender })),
      cap: 1,
      mode: "random",
      existing: [],
    });
    let seq = Math.max(0, ...allGames.map((g) => g.seq));
    let queueOrder = Math.max(0, ...allGames.map((g) => g.queueOrder));
    if (seeded.games.length > 0) {
      await db.insert(games).values(
        seeded.games.map((m) => ({
          sessionId,
          seq: ++seq,
          queueOrder: ++queueOrder,
          t1p1: m.t1[0],
          t1p2: m.t1[1],
          t2p1: m.t2[0],
          t2p2: m.t2[1],
        })),
      );
    }
    revalidate(sessionId);
    return;
  }

  const removable = allGames.filter(
    (g) => g.status === "queued" && !g.pinned,
  );
  if (removable.length > 0) {
    await db.delete(games).where(
      inArray(
        games.id,
        removable.map((g) => g.id),
      ),
    );
  }
  const kept = allGames.filter((g) => g.status !== "queued" || g.pinned);

  const result = runGenerator({
    players: roster.map((p) => ({ id: p.id, rating: p.rating, gender: p.gender })),
    cap: session.gameCap,
    mode: session.defaultMode === "rating" ? "rating" : "random",
    existing: kept.map((g) => ({
      t1: [g.t1p1, g.t1p2] as [number, number],
      t2: [g.t2p1, g.t2p2] as [number, number],
    })),
  });

  let seq = Math.max(0, ...allGames.map((g) => g.seq));
  let queueOrder = Math.max(0, ...kept.map((g) => g.queueOrder));
  if (result.games.length > 0) {
    await db.insert(games).values(
      result.games.map((m) => ({
        sessionId,
        seq: ++seq,
        queueOrder: ++queueOrder,
        t1p1: m.t1[0],
        t1p2: m.t1[1],
        t2p1: m.t2[0],
        t2p2: m.t2[1],
      })),
    );
  }
  revalidate(sessionId);
}

export async function createFixedGame(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  const ids = ["p1", "p2", "p3", "p4"].map((k) => Number(formData.get(k)));
  if (new Set(ids).size !== 4 || ids.some((n) => !Number.isFinite(n) || n <= 0))
    return;
  const allGames = await db
    .select({ seq: games.seq, queueOrder: games.queueOrder })
    .from(games)
    .where(eq(games.sessionId, sessionId));
  await db.insert(games).values({
    sessionId,
    seq: Math.max(0, ...allGames.map((g) => g.seq)) + 1,
    queueOrder: Math.max(0, ...allGames.map((g) => g.queueOrder)) + 1,
    t1p1: ids[0],
    t1p2: ids[1],
    t2p1: ids[2],
    t2p2: ids[3],
    pinned: true,
  });
  revalidate(sessionId);
}

/** Organizer override: replace a queued game's players (marks it pinned; bypasses generation rules). */
export async function updateGame(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  const gameId = Number(formData.get("gameId"));
  const ids = ["p1", "p2", "p3", "p4"].map((k) => Number(formData.get(k)));
  if (new Set(ids).size !== 4 || ids.some((n) => !Number.isFinite(n) || n <= 0))
    return;
  await db
    .update(games)
    .set({
      t1p1: ids[0],
      t1p2: ids[1],
      t2p1: ids[2],
      t2p2: ids[3],
      pinned: true,
    })
    .where(
      and(
        eq(games.id, gameId),
        eq(games.sessionId, sessionId),
        eq(games.status, "queued"),
      ),
    );
  revalidate(sessionId);
}

/**
 * Seeds the playoff bracket from the current standings (top-N per gender),
 * or advances a stalled round. No-op while bracket games are still open.
 */
export async function startTournament(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  await runTournamentRound(sessionId, { start: true });
  revalidate(sessionId);
}

/**
 * TEMP dev tool (delete before real use): completes every queued/playing
 * game with random valid scores so playoffs can be simulated. Each press
 * finishes the open games and lets the bracket advance one round.
 */
export async function simulateScores(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session || session.status !== "active") return;
  const open = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.sessionId, sessionId),
        inArray(games.status, ["queued", "playing"]),
      ),
    )
    .orderBy(asc(games.seq));
  const base = Date.now();
  for (const [i, g] of open.entries()) {
    const target = g.round !== null ? 15 : 11;
    const t1Wins = Math.random() < 0.5;
    const loser = Math.floor(Math.random() * target);
    const completedAt = new Date(base + i * 1000);
    const startedAt =
      g.startedAt ??
      new Date(completedAt.getTime() - (8 + Math.floor(Math.random() * 8)) * 60000);
    await db
      .update(games)
      .set({
        status: "completed",
        score1: t1Wins ? target : loser,
        score2: t1Wins ? loser : target,
        startedAt,
        completedAt,
      })
      .where(eq(games.id, g.id));
  }
  await runTournamentRound(sessionId);
  await runLadderMatchmaking(sessionId);
  revalidate(sessionId);
}

export async function deleteGame(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  const gameId = Number(formData.get("gameId"));
  // Any status is deletable: queued (off the queue), playing (frees the
  // court), completed (its result comes off the leaderboard).
  await db
    .delete(games)
    .where(and(eq(games.id, gameId), eq(games.sessionId, sessionId)));
  revalidate(sessionId);
}

export async function moveGame(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  const gameId = Number(formData.get("gameId"));
  const dir = formData.get("dir") === "up" ? "up" : "down";
  const queue = await db
    .select()
    .from(games)
    .where(and(eq(games.sessionId, sessionId), eq(games.status, "queued")))
    .orderBy(asc(games.queueOrder), asc(games.seq));
  const idx = queue.findIndex((g) => g.id === gameId);
  if (idx < 0) return;
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= queue.length) return;
  const a = queue[idx];
  const b = queue[swapWith];
  await db.update(games).set({ queueOrder: b.queueOrder }).where(eq(games.id, a.id));
  await db.update(games).set({ queueOrder: a.queueOrder }).where(eq(games.id, b.id));
  revalidate(sessionId);
}

// ---------- play ----------

/** Starts a queued game on the lowest-numbered free court. */
export async function startGame(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  const gameId = Number(formData.get("gameId"));
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session || session.status !== "active") return;
  const inUse = await db
    .select({ court: games.court })
    .from(games)
    .where(
      and(eq(games.sessionId, sessionId), eq(games.status, "playing")),
    );
  const used = new Set(inUse.map((g) => g.court));
  let court = 0;
  for (let c = 1; c <= session.courtCount; c++) {
    if (!used.has(c)) {
      court = c;
      break;
    }
  }
  if (court === 0) return; // every court occupied
  await db
    .update(games)
    .set({ status: "playing", court, startedAt: new Date() })
    .where(
      and(
        eq(games.id, gameId),
        eq(games.sessionId, sessionId),
        eq(games.status, "queued"),
      ),
    );
  revalidate(sessionId);
}

/** Records (or edits) a final score. Completing a playing game frees its court. */
export async function submitScore(formData: FormData) {
  await requireAuth();
  const sessionId = Number(formData.get("sessionId"));
  const gameId = Number(formData.get("gameId"));
  const score1 = Number(formData.get("score1"));
  const score2 = Number(formData.get("score2"));
  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.sessionId, sessionId)));
  if (!game || game.status === "queued") return;
  // Regular games go to 11; tournament bracket games go to 15.
  const winningScore = game.round !== null ? 15 : 11;
  if (
    !Number.isInteger(score1) ||
    !Number.isInteger(score2) ||
    score1 < 0 ||
    score2 < 0 ||
    score1 === score2 || // no ties
    Math.max(score1, score2) !== winningScore
  )
    return;
  await db
    .update(games)
    .set({
      score1,
      score2,
      status: "completed",
      completedAt: game.completedAt ?? new Date(),
    })
    .where(eq(games.id, gameId));
  // A fresh completion (not a score edit) advances rolling matchmaking -
  // the tournament bracket when it has started, otherwise ladder (both
  // self-guard on the session's configuration).
  if (game.status === "playing") {
    await runTournamentRound(sessionId);
    await runLadderMatchmaking(sessionId);
  }
  revalidate(sessionId);
}

// ---------- helpers ----------

function clampInt(raw: FormDataEntryValue | null, min: number, max: number, dflt: number) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function pickMode(
  raw: FormDataEntryValue | null,
): "random" | "rating" | "fixed" | "ladder" {
  return raw === "rating" || raw === "fixed" || raw === "ladder"
    ? raw
    : "random";
}

/** Clamp to [2, 64] and round down to a power of two (clean brackets). */
function pow2Slots(raw: FormDataEntryValue | null, dflt: number) {
  const n = clampInt(raw, 2, 64, dflt);
  return 2 ** Math.floor(Math.log2(n));
}
