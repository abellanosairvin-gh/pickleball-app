# Pickleball Session Tracker

An app for running pickleball open-play events: roster entry, rule-aware
matchup generation, score logging, and an anonymous QR spectator view.
See `CONTEXT.md` for the domain vocabulary and `docs/adr/` for key decisions.

## Setup

1. Create a free Postgres database at [neon.tech](https://neon.tech) and copy
   its connection string.
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — the Neon connection string
   - `AUTH_SECRET` — any long random string
   - `ORGANIZER_USERNAME` / `ORGANIZER_PASSWORD` — the single organizer login
3. Install and push the schema:

   ```sh
   npm install
   npm run db:push
   ```

4. Run it:

   ```sh
   npm run dev
   ```

   Sign in at http://localhost:3000/login with the organizer credentials.

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add the four environment variables from `.env.local` in the Vercel project
   settings.
3. Deploy. Run `npm run db:push` locally (pointed at the production
   `DATABASE_URL`) whenever the schema changes.

## How a night works

1. **Create a session** — name, court count, Game Cap (games per player, same
   for everyone), default matchup mode (random / rating-based / fixed).
2. **Add players** — paste a list, one per line: `Name, gender, rating`
   (e.g. `Sarah, F, mid`; shorthand `b`/`m`/`a` works).
3. **Generate the schedule** — the whole night is generated up front under the
   hard rules: nobody exceeds the cap, beginners and advanced players never
   share a game, an all-male team only faces another all-male team, and no two
   players partner twice all night. If a full schedule is impossible, a banner
   reports who falls short so you can hand-fix.
4. **Run games** — tap Start on a queued game and pick a free court; enter the
   final score to complete it (played to 11 by convention; only ties are
   rejected). Scores stay editable forever.
5. **Share the QR code** — spectators get a read-only mobile view with four
   tabs: now Playing, the Queue, the Leaderboard (W/L, PF/PA, +/−), and game
   History with durations. It refreshes itself every 10 seconds.
6. **Adjust as people come and go** — add or remove players any time, then
   regenerate: completed, in-progress, and pinned games are kept, and only the
   un-started remainder is rebuilt.
