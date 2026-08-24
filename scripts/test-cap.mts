// Pure-function check of the cap-fairness rules in computeLeaderboard.
// Run: npx tsx scripts/test-cap.mts
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const { computeLeaderboard } = await import("../lib/queries");
type Game = import("../lib/schema").Game;
type Player = import("../lib/schema").Player;

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` - ${extra}` : ""}`);
  if (!ok) failures++;
};

const P = (id: number, name: string): Player => ({
  id,
  sessionId: 1,
  name,
  gender: "M",
  rating: "mid",
  active: true,
});
const players = [P(1, "A"), P(2, "B"), P(3, "C"), P(4, "D"), P(5, "E")];

let seq = 0;
const G = (
  ids: [number, number, number, number],
  s1: number,
  s2: number,
  round: number | null = null,
): Game => (
  seq++,
  {
    id: seq,
    sessionId: 1,
    seq,
    queueOrder: seq,
    status: "completed",
    court: null,
    t1p1: ids[0],
    t1p2: ids[1],
    t2p1: ids[2],
    t2p2: ids[3],
    score1: s1,
    score2: s2,
    pinned: false,
    round,
    stage: null,
    startedAt: null,
    completedAt: new Date(2026, 0, 1, 0, seq),
  }
);

// Cap 1. Game 1: A/B beat C/D - everyone hits the cap. Game 2 (fill-in for
// E): A/E beat C/B - only E should score; A, B, C are over cap.
const games = [
  G([1, 2, 3, 4], 11, 5),
  G([1, 5, 3, 2], 11, 7),
  // Bracket game after everyone capped - still counts for all four.
  G([1, 2, 3, 4], 15, 10, 1),
];
const uncounted = new Map<number, string[]>();
const rows = computeLeaderboard(players, games, 1, uncounted);
const row = (name: string) => rows.find((r) => r.name === name)!;

check("E scores the fill-in game", row("E").wins === 1 && row("E").pointsFor === 11);
check(
  "A's extra regular game doesn't count",
  row("A").wins === 2 && row("A").gamesPlayed === 2, // game 1 + bracket only
  `A: ${row("A").wins}W ${row("A").gamesPlayed}gp`,
);
check(
  "game 2 notes A, B, C as uncounted",
  (uncounted.get(2) ?? []).sort().join() === "A,B,C",
  `got ${(uncounted.get(2) ?? []).join(",")}`,
);
check("bracket game counts for everyone", (uncounted.get(3) ?? []).length === 0);
check(
  "bracket points land on capped players",
  row("B").pointsFor === 11 + 15 && row("D").pointsAgainst === 11 + 15,
  `B PF=${row("B").pointsFor} D PA=${row("D").pointsAgainst}`,
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
