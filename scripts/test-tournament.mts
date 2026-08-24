// End-to-end tournament engine test against the real DB (cleans up after).
// Run: npx tsx scripts/test-tournament.ts
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const { db } = await import("../lib/db");
const { games, players, sessions } = await import("../lib/schema");
const { championshipLadder, runTournamentRound, tournamentStatus } =
  await import("../lib/tournament");
const { and, asc, eq } = await import("drizzle-orm");

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` - ${extra}` : ""}`);
  if (!ok) failures++;
};

// --- setup: tournament session with 8 males + 4 females ---
const [sess] = await db
  .insert(sessions)
  .values({
    name: "TOURNEY-TEST",
    courtCount: 2,
    gameCap: 6,
    defaultMode: "random",
    tournament: true,
    maleSlots: 8,
    femaleSlots: 4,
    publicToken: `tt${Date.now().toString(36)}`,
  })
  .returning();
const sid = sess.id;

const roster = await db
  .insert(players)
  .values([
    ...Array.from({ length: 8 }, (_, i) => ({
      sessionId: sid,
      name: `M${i + 1}`,
      gender: "M" as const,
      rating: "mid" as const,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      sessionId: sid,
      name: `F${i + 1}`,
      gender: "F" as const,
      rating: "mid" as const,
    })),
  ])
  .returning();
const byId = new Map(roster.map((p) => [p.id, p]));
const genderOf = (id: number) => byId.get(id)!.gender;

const loadGames = () =>
  db
    .select()
    .from(games)
    .where(eq(games.sessionId, sid))
    .orderBy(asc(games.seq));

const completeAll = async () => {
  const open = (await loadGames()).filter((g) => g.status !== "completed");
  for (const g of open) {
    const t1Wins = Math.random() < 0.5;
    await db
      .update(games)
      .set({
        status: "completed",
        score1: t1Wins ? 11 : Math.floor(Math.random() * 10),
        score2: t1Wins ? Math.floor(Math.random() * 10) : 11,
        completedAt: new Date(),
      })
      .where(eq(games.id, g.id));
  }
};

try {
  // The bracket never starts on its own - only via the organizer's button.
  await runTournamentRound(sid);
  check("no auto-start without the button", (await loadGames()).length === 0);

  // Round 1: male qualifier - 8 males → 4 MM teams → 2 games, females idle.
  await runTournamentRound(sid, { start: true });
  let all = await loadGames();
  let r1 = all.filter((g) => g.round === 1);
  check("round 1 has 2 games", r1.length === 2, `got ${all.length} games`);
  check(
    "round 1 is MM vs MM only",
    r1.every((g) =>
      [g.t1p1, g.t1p2, g.t2p1, g.t2p2].every((id) => genderOf(id) === "M"),
    ),
  );
  const r1players = new Set(r1.flatMap((g) => [g.t1p1, g.t1p2, g.t2p1, g.t2p2]));
  check("round 1 uses all 8 males exactly once", r1players.size === 8);
  // Engine is a no-op while the round is open.
  await runTournamentRound(sid);
  check("no-op while round open", (await loadGames()).length === 2);

  await completeAll();
  await runTournamentRound(sid);
  all = await loadGames();
  const r2 = all.filter((g) => g.round === 2);
  check("round 2 has 2 games", r2.length === 2);
  const mixedTeam = (a: number, b: number) =>
    genderOf(a) !== genderOf(b);
  check(
    "round 2 is MF vs MF (finals)",
    r2.every((g) => mixedTeam(g.t1p1, g.t1p2) && mixedTeam(g.t2p1, g.t2p2)),
  );
  const r2males = new Set(
    r2.flatMap((g) => [g.t1p1, g.t1p2, g.t2p1, g.t2p2]).filter((id) => genderOf(id) === "M"),
  );
  const r1winners = new Set(
    r1
      .map((g) => {
        const fresh = all.find((x) => x.id === g.id)!;
        return fresh.score1! > fresh.score2!
          ? [fresh.t1p1, fresh.t1p2]
          : [fresh.t2p1, fresh.t2p2];
      })
      .flat(),
  );
  check(
    "round 2 males are exactly the round 1 winners",
    r2males.size === 4 && [...r2males].every((id) => r1winners.has(id)),
  );
  const r2females = new Set(
    r2.flatMap((g) => [g.t1p1, g.t1p2, g.t2p1, g.t2p2]).filter((id) => genderOf(id) === "F"),
  );
  check("all 4 females join round 2", r2females.size === 4);

  await completeAll();
  await runTournamentRound(sid);
  all = await loadGames();
  const r2LoserNames = new Set(
    all
      .filter((g) => g.round === 2)
      .flatMap((g) =>
        (g.score1! > g.score2! ? [g.t2p1, g.t2p2] : [g.t1p1, g.t1p2]).map(
          (id) => byId.get(id)!.name,
        ),
      ),
  );
  const r3 = all.filter((g) => g.round === 3);
  const fin = r3.find((g) => g.stage === "final");
  const bronze = r3.find((g) => g.stage === "bronze");
  check(
    "round 3 is the championship + battle for 3rd",
    r3.length === 2 && !!fin && !!bronze,
    `got ${r3.length} games`,
  );
  check(
    "championship is MF vs MF",
    !!fin && mixedTeam(fin.t1p1, fin.t1p2) && mixedTeam(fin.t2p1, fin.t2p2),
  );
  check(
    "battle for 3rd is the semifinal losers",
    !!bronze &&
      [bronze.t1p1, bronze.t1p2, bronze.t2p1, bronze.t2p2].every((id) =>
        r2LoserNames.has(byId.get(id)!.name),
      ),
  );

  // Complete only the championship - champions are crowned while the battle
  // for 3rd is still open, and the podium waits for it.
  const t1Wins = Math.random() < 0.5;
  await db
    .update(games)
    .set({
      status: "completed",
      score1: t1Wins ? 15 : 9,
      score2: t1Wins ? 9 : 15,
      completedAt: new Date(),
    })
    .where(eq(games.id, fin!.id));
  await runTournamentRound(sid);
  all = await loadGames();
  check("no new games after the final", all.length === 6, `got ${all.length}`);
  const status = tournamentStatus(roster, all);
  check(
    "status reports champions",
    status.phase === "champions" && status.champions !== undefined,
    status.phase === "champions" ? `champions: ${status.champions!.join(" & ")}` : `phase=${status.phase}`,
  );
  check(
    "podium holds places 3-4 while the battle for 3rd is open",
    championshipLadder(roster, all).length === 2,
  );

  await completeAll();
  await runTournamentRound(sid);
  all = await loadGames();
  check("no games after the battle for 3rd", all.length === 6, `got ${all.length}`);
  const podium = championshipLadder(roster, all);
  check(
    "podium has 4 placements",
    podium.length === 4,
    podium.map((e) => `${e.title}: ${e.names.join(" & ")}`).join(" | "),
  );
  check(
    "podium champions match status champions",
    podium[0]?.title === "Champions" &&
      [...podium[0].names].sort().join() === [...(status.champions ?? [])].sort().join(),
  );
  const finDone = all.find((g) => g.id === fin!.id)!;
  const finalLosers = (finDone.score1! > finDone.score2!
    ? [finDone.t2p1, finDone.t2p2]
    : [finDone.t1p1, finDone.t1p2]
  )
    .map((id) => byId.get(id)!.name)
    .sort()
    .join();
  check(
    "1st runners-up are the final's losing pair",
    podium[1]?.title === "1st runners-up" &&
      [...podium[1].names].sort().join() === finalLosers,
  );
  const bronzeDone = all.find((g) => g.id === bronze!.id)!;
  const bronzeWinners = (bronzeDone.score1! > bronzeDone.score2!
    ? [bronzeDone.t1p1, bronzeDone.t1p2]
    : [bronzeDone.t2p1, bronzeDone.t2p2]
  )
    .map((id) => byId.get(id)!.name)
    .sort()
    .join();
  check(
    "2nd runners-up won the battle for 3rd",
    podium[2]?.title === "2nd runners-up" &&
      [...podium[2].names].sort().join() === bronzeWinners,
  );
  check(
    "3rd runners-up lost the battle for 3rd",
    podium[3]?.title === "3rd runners-up" &&
      podium[3].names.every((n) => r2LoserNames.has(n)),
  );
  check(
    "no podium before the bracket ends",
    championshipLadder(roster, all.filter((g) => g.round !== 3)).length === 0,
  );

  // Hard rule: nobody partners the same person twice across bracket rounds.
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const partnerCounts = new Map<string, number>();
  for (const g of all.filter((x) => x.round !== null)) {
    for (const pair of [key(g.t1p1, g.t1p2), key(g.t2p1, g.t2p2)]) {
      partnerCounts.set(pair, (partnerCounts.get(pair) ?? 0) + 1);
    }
  }
  const repeats = [...partnerCounts.entries()].filter(([, n]) => n > 1);
  check(
    "no repeated bracket partnerships",
    repeats.length === 0,
    repeats.length > 0 ? `repeated: ${repeats.map(([k]) => k).join(", ")}` : "",
  );
} finally {
  await db.delete(games).where(eq(games.sessionId, sid));
  await db.delete(players).where(eq(players.sessionId, sid));
  await db.delete(sessions).where(eq(sessions.id, sid));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
