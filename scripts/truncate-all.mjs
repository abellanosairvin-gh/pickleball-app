// One-off: wipe all rows (sessions, players, games) and reset id sequences.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="))
  ?.slice("DATABASE_URL=".length)
  .trim();
if (!url) throw new Error("DATABASE_URL not found in .env.local");

const sql = neon(url);
await sql`TRUNCATE TABLE games, players, sessions RESTART IDENTITY`;
const [counts] = await sql`
  SELECT (SELECT count(*) FROM sessions) AS sessions,
         (SELECT count(*) FROM players) AS players,
         (SELECT count(*) FROM games) AS games
`;
console.log("after truncate:", JSON.stringify(counts));
