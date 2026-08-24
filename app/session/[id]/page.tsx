import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BulkAdd } from "@/components/BulkAdd";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { FixedGamePopup } from "@/components/FixedGamePopup";
import { GameEditPopup } from "@/components/GameEditPopup";
import { OrganizerTabs } from "@/components/OrganizerTabs";
import { PlayerEditPopup } from "@/components/PlayerEditPopup";
import { QrPopup } from "@/components/QrPopup";
import { RunningClock } from "@/components/RunningClock";
import { ScoreEditPopup } from "@/components/ScoreEditPopup";
import { ScoreForm } from "@/components/ScoreForm";
import { WaitBadge } from "@/components/WaitBadge";
import {
  deleteGame,
  deleteSession,
  endSession,
  generateSchedule,
  logout,
  moveGame,
  removePlayer,
  simulateScores,
  startGame,
  startTournament,
  submitScore,
} from "@/lib/actions";
import { ChampionshipLadder } from "@/components/ChampionshipLadder";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { requireAuth } from "@/lib/auth";
import {
  courtName,
  formatDuration,
  GENDER_LABEL,
  MODE_LABEL,
  RATING_ABBR,
} from "@/lib/format";
import {
  buildSnapshot,
  computeLeaderboard,
  computeShortfall,
  loadSessionData,
} from "@/lib/queries";
import { generateSchedule as computeSuggestions } from "@/lib/scheduler";
import { bracketLabel, tournamentStatus } from "@/lib/tournament";
import type { Game, Player } from "@/lib/schema";

export const dynamic = "force-dynamic";

const RATING_LABEL = { beginner: "B", mid: "M", advanced: "A" } as const;

function teamNames(
  g: Game,
  byId: Map<number, Player>,
  team: 1 | 2,
  sep = " & ",
) {
  const ids = team === 1 ? [g.t1p1, g.t1p2] : [g.t2p1, g.t2p2];
  return ids.map((id) => byId.get(id)?.name ?? "?").join(sep);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 font-display text-xl">{children}</h2>;
}

function GameNo({ seq }: { seq: number }) {
  return (
    <span className="mr-2 text-xs uppercase tracking-[0.14em] text-faint">
      No. {seq}
    </span>
  );
}

function playerOptions(roster: Player[]) {
  return roster.map((p) => ({
    id: p.id,
    label: `${p.name} (${p.gender}/${RATING_LABEL[p.rating]})`,
    gender: p.gender,
  }));
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const data = await loadSessionData(Number(id));
  if (!data) notFound();
  const { session, players: allPlayers, games: allGames } = data;

  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  const roster = allPlayers.filter((p) => p.active);
  const snapshot = buildSnapshot(session, allPlayers, allGames);
  const isTournament = session.tournament;
  // gameId → names whose result didn't count toward the leaderboard (over
  // cap). Bracket games never count toward the leaderboard at all.
  const uncounted = new Map<number, string[]>();
  computeLeaderboard(allPlayers, allGames, session.gameCap, uncounted);
  const tstatus = isTournament ? tournamentStatus(roster, allGames) : null;
  const label = (g: Game) => bracketLabel(g, allGames, byId);
  // Regular games go to 11; tournament bracket games go to 15.
  const target = (g: Game) => (g.round !== null ? 15 : 11);
  const bracketStarted = allGames.some((g) => g.round !== null);
  // Bracket games don't count toward the Game Cap - shortfall is about the
  // regular night games that build fair standings.
  const shortfall = computeShortfall(
    session,
    allPlayers,
    allGames.filter((g) => g.round === null),
  );
  const playing = allGames.filter((g) => g.status === "playing");
  const queue = allGames
    .filter((g) => g.status === "queued")
    .sort((a, b) => a.queueOrder - b.queueOrder || a.seq - b.seq);
  const completed = allGames
    .filter((g) => g.status === "completed")
    .sort(
      (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    );
  // Finished bracket games get their own section above the regular games.
  const completedSections = [
    {
      title: "Tournament",
      note: "Bracket results stay off the leaderboard.",
      games: completed.filter((g) => g.round !== null),
    },
    { title: "Completed", note: null, games: completed.filter((g) => g.round === null) },
  ].filter((s) => s.title === "Completed" || s.games.length > 0);
  const lastPlayed = new Map<number, number>();
  const onCourt = new Set<number>();
  for (const g of allGames) {
    const ids = [g.t1p1, g.t1p2, g.t2p1, g.t2p2];
    if (g.status === "playing") ids.forEach((pid) => onCourt.add(pid));
    if (g.status === "completed" && g.completedAt) {
      const at = g.completedAt.getTime();
      ids.forEach((pid) =>
        lastPlayed.set(pid, Math.max(lastPlayed.get(pid) ?? 0, at)),
      );
    }
  }
  // What the matchmaker would queue next - feeds the Fixed game Suggest
  // button. The cap is lifted just past the busiest player so suggestions
  // keep coming for shortfall-filling games after most players hit the cap;
  // the hard rules (gender, rating, partner uniqueness) always apply.
  const busiest = Math.max(
    0,
    ...roster.map(
      (p) =>
        allGames.filter((g) =>
          [g.t1p1, g.t1p2, g.t2p1, g.t2p2].includes(p.id),
        ).length,
    ),
  );
  const suggestions =
    session.status === "active" && roster.length >= 4
      ? computeSuggestions({
          players: roster.map((p) => ({
            id: p.id,
            rating: p.rating,
            gender: p.gender,
          })),
          cap: Math.max(session.gameCap, busiest + 1),
          mode: session.defaultMode === "rating" ? "rating" : "random",
          existing: allGames.map((g) => ({
            t1: [g.t1p1, g.t1p2] as [number, number],
            t2: [g.t2p1, g.t2p2] as [number, number],
          })),
          restarts: 20,
        })
          .games.slice(0, 5)
          .map(
            (m) =>
              [m.t1[0], m.t1[1], m.t2[0], m.t2[1]] as [
                number,
                number,
                number,
                number,
              ],
          )
      : [];
  const usedCourts = new Set(playing.map((g) => g.court));
  const freeCourts = Array.from(
    { length: session.courtCount },
    (_, i) => i + 1,
  ).filter((c) => !usedCourts.has(c));
  const ended = session.status === "ended";

  // Court-aware queue highlighting: with N free courts, walk the queue in
  // order and pick the games that could start right now. A game is ready only
  // if none of its players are on court or already claimed by an earlier
  // ready game; games passed over while seats remain are blocked.
  const readyGames = new Set<number>();
  const blockedGames = new Map<number, string[]>();
  if (!ended && freeCourts.length > 0) {
    const busy = new Set(onCourt);
    let seats = freeCourts.length;
    for (const g of queue) {
      if (seats === 0) break;
      const ids = [g.t1p1, g.t1p2, g.t2p1, g.t2p2];
      const blockers = ids.filter((pid) => busy.has(pid));
      if (blockers.length > 0) {
        blockedGames.set(
          g.id,
          blockers.map((pid) => byId.get(pid)?.name ?? "?"),
        );
      } else {
        readyGames.add(g.id);
        ids.forEach((pid) => busy.add(pid));
        seats--;
      }
    }
  }

  const host = (await headers()).get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const publicUrl = `${proto}://${host}/s/${session.publicToken}`;
  const qrDataUrl = await QRCode.toDataURL(publicUrl, {
    width: 260,
    margin: 1,
    color: { dark: "#22382b", light: "#fffdf7" },
  });

  return (
    <main className="mx-auto max-w-3xl p-4 pb-24">
      {/* header */}
      <div className="mb-5 border-b-2 border-ink pb-4">
        <Link href="/" className="text-xs text-muted underline">
          ← Sessions
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl leading-tight">{session.name}</h1>
          <div className="flex gap-2">
          <QrPopup qrDataUrl={qrDataUrl} publicUrl={publicUrl} />
          {!ended && (
            <form action={endSession}>
              <input type="hidden" name="sessionId" value={session.id} />
              <ConfirmSubmit
                title="End this session?"
                message="Scores stay editable and the public view stays up, but no new games can start."
                confirmLabel="End session"
                danger
                className="rounded-md border border-clay px-3 py-2 text-sm font-medium text-clay hover:bg-[#f9e9df]"
              >
                End session
              </ConfirmSubmit>
            </form>
          )}
          {ended && (
            <form action={deleteSession}>
              <input type="hidden" name="sessionId" value={session.id} />
              <ConfirmSubmit
                title={`Delete “${session.name}” forever?`}
                message="All its players, games, and scores are permanently removed, and its spectator link stops working."
                confirmLabel="Delete forever"
                danger
                className="rounded-md border border-[#e3c4b0] px-3 py-2 text-sm font-medium text-clay-deep hover:bg-[#f9e9df]"
              >
                Delete
              </ConfirmSubmit>
            </form>
          )}
          <form action={logout}>
            <button className="rounded-md border border-line bg-card px-3 py-2 text-sm font-medium text-muted hover:bg-paper">
              Sign out
            </button>
          </form>
          </div>
        </div>
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
          {session.courtCount} courts · cap {session.gameCap} games ·{" "}
          {MODE_LABEL[session.defaultMode] ?? session.defaultMode}
          {session.tournament ? " · Tournament" : ""} ·{" "}
          <span className="font-semibold text-clay">
            {ended ? "Ended" : "In play"}
          </span>
        </p>
      </div>

      {/* shortfall banner (ladder excepted - its games form from results) */}
      {session.defaultMode !== "ladder" &&
        shortfall.length > 0 &&
        queue.length + playing.length + completed.length > 0 && (
        <div className="mb-4 rounded-md border border-[#e3c4b0] bg-[#f9e9df] p-3 text-sm text-ink">
          <strong className="font-semibold">Best effort:</strong>{" "}
          {shortfall
            .map((s) => `${s.name} gets ${s.scheduled} of ${session.gameCap}`)
            .join(", ")}
          . Hand-fix via the queue editor or create fixed games.
        </div>
      )}

      <OrganizerTabs
        tabs={[
          { key: "play", label: "Play" },
          { key: "roster", label: "Roster" },
          { key: "results", label: "Results" },
        ]}
        panels={{
          play: (
            <>
      {tstatus &&
        (tstatus.phase === "champions" ? (
          <div className="mb-5 rounded-md border border-ink bg-[#eef2e4] p-4 text-center shadow-[0_1px_0_#d9d2c2]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-clay">
              Champions
            </p>
            <p className="mt-1 font-display text-2xl leading-snug">
              {tstatus.champions![0]} &amp; {tstatus.champions![1]}
            </p>
          </div>
        ) : (
          <div className="mb-5 rounded-md border border-line bg-card p-3 text-sm shadow-[0_1px_0_#d9d2c2]">
            <span className="font-bold uppercase tracking-[0.14em] text-clay">
              {tstatus.phase === "not-started"
                ? "Tournament"
                : tstatus.phase === "qualifier"
                  ? `Qualifier · Round ${tstatus.round}`
                  : `Finals · Round ${tstatus.round}`}
            </span>{" "}
            <span className="text-muted">
              {tstatus.phase === "not-started"
                ? `- play the night; the top ${session.maleSlots} men and top ${session.femaleSlots} women on the leaderboard make the playoffs.`
                : `- ${tstatus.aliveCount} players still in the bracket.`}
            </span>
          </div>
        ))}
      <section className="mb-6">
        <SectionTitle>Courts</SectionTitle>
        <div className="grid gap-3">
          {Array.from({ length: session.courtCount }, (_, i) => i + 1).map(
            (court) => {
              const g = playing.find((x) => x.court === court);
              return g ? (
                <div
                  key={court}
                  className="rounded-md border border-line bg-card p-4 shadow-[0_1px_0_#d9d2c2]"
                >
                  <div className="flex items-baseline justify-between border-b border-rule pb-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-clay">
                      {courtName(court)}
                      {g.round !== null && (
                        <span className="ml-2 rounded-full border border-[#d89a7c] bg-[#f9e9df] px-2 py-0.5 tracking-[0.12em]">
                          {label(g)}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted">
                      No. {g.seq}
                      {g.startedAt && (
                        <>
                          {" · "}
                          <span className="font-semibold text-clay">
                            <RunningClock since={g.startedAt.toISOString()} />
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="flex-1 font-display text-xl leading-snug">
                      {byId.get(g.t1p1)?.name ?? "?"}
                      <br />
                      {byId.get(g.t1p2)?.name ?? "?"}
                    </div>
                    <div className="font-serif text-xs italic tracking-wide text-muted">
                      versus
                    </div>
                    <div className="flex-1 text-right font-display text-xl leading-snug">
                      {byId.get(g.t2p1)?.name ?? "?"}
                      <br />
                      {byId.get(g.t2p2)?.name ?? "?"}
                    </div>
                  </div>
                  <ScoreForm
                    action={submitScore}
                    className="mt-3 border-t border-rule pt-3"
                    winningScore={target(g)}
                  >
                    <input type="hidden" name="sessionId" value={session.id} />
                    <input type="hidden" name="gameId" value={g.id} />
                    <div className="flex items-center gap-3">
                      <div className="flex flex-1 justify-start">
                        <input
                          name="score1"
                          type="number"
                          min={0}
                          max={target(g)}
                          required
                          placeholder="0"
                          className="w-16 rounded-md border border-line bg-paper p-2 text-center tabular-nums"
                        />
                      </div>
                      <span className="font-serif italic text-faint">–</span>
                      <div className="flex flex-1 justify-end">
                        <input
                          name="score2"
                          type="number"
                          min={0}
                          max={target(g)}
                          required
                          placeholder="0"
                          className="w-16 rounded-md border border-line bg-paper p-2 text-center tabular-nums"
                        />
                      </div>
                    </div>
                    <button className="mt-2.5 w-full rounded-md bg-ink px-3 py-2 text-sm font-semibold text-card hover:bg-ink-deep">
                      Final
                    </button>
                  </ScoreForm>
                </div>
              ) : (
                <div
                  key={court}
                  className="flex items-center justify-between rounded-md border border-dashed border-dash p-4"
                >
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-faint">
                    {courtName(court)}
                  </span>
                  <span className="font-serif text-sm italic text-faint">
                    {ended ? "session ended" : "open"}
                  </span>
                </div>
              );
            },
          )}
        </div>
      </section>

      {/* schedule controls */}
      {!ended && (
        <section className="mb-6 flex flex-wrap items-center gap-3">
          <form action={generateSchedule}>
            <input type="hidden" name="sessionId" value={session.id} />
            <ConfirmSubmit
              title={
                session.defaultMode === "ladder"
                  ? "Seed a round?"
                  : queue.some((g) => !g.pinned)
                    ? "Regenerate the queue?"
                    : "Generate the schedule?"
              }
              message={
                session.defaultMode === "ladder"
                  ? "Queues one game for each waiting player. Nothing already queued is touched - results drive the rest of the night."
                  : queue.some((g) => !g.pinned)
                    ? "Un-started, un-pinned games are replaced. Completed, playing, and pinned games are kept."
                    : "Builds the full night’s games for the current roster."
              }
              confirmLabel={
                session.defaultMode === "ladder"
                  ? "Seed round"
                  : queue.some((g) => !g.pinned)
                    ? "Regenerate"
                    : "Generate"
              }
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-card hover:bg-ink-deep"
            >
              {session.defaultMode === "ladder"
                ? "Seed round"
                : queue.length > 0
                  ? "Regenerate"
                  : "Generate"}
            </ConfirmSubmit>
          </form>
          {isTournament && tstatus?.phase !== "champions" && (
            <form action={startTournament}>
              <input type="hidden" name="sessionId" value={session.id} />
              <ConfirmSubmit
                title={
                  bracketStarted ? "Advance the round?" : "Start the playoffs?"
                }
                message={
                  bracketStarted
                    ? "Draws the next round once every bracket game is scored (rounds normally advance on their own)."
                    : `Seeds the bracket from the standings - the top ${session.maleSlots} men and top ${session.femaleSlots} women qualify. Same-gender knockout first if one gender has more, then mixed MF rounds.`
                }
                confirmLabel={bracketStarted ? "Advance round" : "Start playoffs"}
                className="rounded-md border-2 border-clay bg-card px-4 py-2 text-sm font-semibold text-clay-deep hover:bg-[#f9e9df]"
              >
                {bracketStarted ? "Advance round" : "Start playoffs"}
              </ConfirmSubmit>
            </form>
          )}
          {roster.length >= 4 && (
            <FixedGamePopup
              sessionId={session.id}
              options={playerOptions(roster)}
              suggestions={suggestions}
              enforceGender={session.defaultMode !== "ladder"}
            />
          )}
          {/* TEMP dev tool - delete later */}
          <form action={simulateScores}>
            <input type="hidden" name="sessionId" value={session.id} />
            <button className="rounded-md border border-dashed border-dash px-4 py-2 text-sm font-medium text-muted hover:bg-paper">
              Simulate scores
            </button>
          </form>
        </section>
      )}

      {/* queue */}
      <section className="mb-6">
        <SectionTitle>
          Queue <span className="text-sm text-muted">({queue.length})</span>
        </SectionTitle>
        {queue.length === 0 ? (
          <p className="rounded-md border border-dashed border-dash p-4 text-sm text-faint">
            No games queued.
          </p>
        ) : (
          <ol className="space-y-2">
            {queue.map((g, idx) => {
              const ready = readyGames.has(g.id);
              const blockers = blockedGames.get(g.id);
              return (
              <li
                key={g.id}
                className={`rounded-md border p-3 shadow-[0_1px_0_#d9d2c2] ${
                  ready
                    ? "border-ink bg-[#eef2e4]"
                    : blockers
                      ? "border-[#d89a7c] bg-[#f9e9df]"
                      : "border-line bg-card"
                }`}
              >
                {ready && (
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-ink">
                    Ready - court open
                  </p>
                )}
                {blockers && (
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-clay-deep">
                    Waiting on {blockers.join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <GameNo seq={g.seq} />
                    <span className={ready || idx === 0 ? "font-semibold" : ""}>
                      {teamNames(g, byId, 1, "/")}{" "}
                      <span className="font-serif italic text-faint">vs</span>{" "}
                      {teamNames(g, byId, 2, "/")}
                    </span>
                    {g.round !== null && (
                      <span
                        className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                          g.stage !== null
                            ? "border-[#d89a7c] bg-[#f9e9df] font-bold text-clay"
                            : "border-line bg-paper text-muted"
                        }`}
                      >
                        {label(g)}
                      </span>
                    )}
                    {g.pinned && (
                      <span className="ml-2 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted">
                        pinned
                      </span>
                    )}
                  </div>
                  {!ended && (
                    <div className="flex items-center gap-1">
                      {freeCourts.length > 0 && (
                        <form action={startGame}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <input type="hidden" name="gameId" value={g.id} />
                          <button className="rounded-md bg-ink px-2.5 py-1.5 text-xs font-semibold text-card hover:bg-ink-deep">
                            Start
                          </button>
                        </form>
                      )}
                      <form action={moveGame}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <input type="hidden" name="gameId" value={g.id} />
                        <input type="hidden" name="dir" value="up" />
                        <button
                          disabled={idx === 0}
                          className="rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-30"
                        >
                          ↑
                        </button>
                      </form>
                      <form action={moveGame}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <input type="hidden" name="gameId" value={g.id} />
                        <input type="hidden" name="dir" value="down" />
                        <button
                          disabled={idx === queue.length - 1}
                          className="rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </form>
                      <GameEditPopup
                        sessionId={session.id}
                        gameId={g.id}
                        seq={g.seq}
                        options={playerOptions(roster)}
                        defaults={[g.t1p1, g.t1p2, g.t2p1, g.t2p2]}
                        enforceGender={session.defaultMode !== "ladder"}
                      />
                      <form action={deleteGame}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <input type="hidden" name="gameId" value={g.id} />
                        <ConfirmSubmit
                          title={`Delete game No. ${g.seq}?`}
                          message="It comes off the queue permanently."
                          confirmLabel="Delete"
                          danger
                          className="flex items-center justify-center rounded-md border border-[#e3c4b0] p-1.5 text-clay-deep hover:bg-[#f9e9df]"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-label={`Delete game No. ${g.seq}`}
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </ConfirmSubmit>
                      </form>
                    </div>
                  )}
                </div>
              </li>
              );
            })}
          </ol>
        )}
      </section>
            </>
          ),
          roster: (
      <section className="mb-6">
        <SectionTitle>
          Roster <span className="text-sm text-muted">({roster.length})</span>
          {isTournament && (
            <span className="ml-2 align-middle text-xs font-sans text-muted">
              M {roster.filter((p) => p.gender === "M").length} · F{" "}
              {roster.filter((p) => p.gender === "F").length} · playoffs: top{" "}
              {session.maleSlots}M + {session.femaleSlots}F
            </span>
          )}
        </SectionTitle>
        {!ended && <BulkAdd sessionId={session.id} />}
        {roster.length > 0 && (
          <ul className="mt-3 divide-y divide-rule rounded-md border border-line bg-card shadow-[0_1px_0_#d9d2c2]">
            {roster.map((p) => (
              <li key={p.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {p.name}{" "}
                    <span className="text-xs text-faint">
                      {GENDER_LABEL[p.gender]} ({RATING_ABBR[p.rating]})
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <WaitBadge
                      lastPlayedAt={
                        lastPlayed.has(p.id)
                          ? new Date(lastPlayed.get(p.id)!).toISOString()
                          : null
                      }
                      onCourt={onCourt.has(p.id)}
                    />
                    {!ended && (
                      <>
                        <PlayerEditPopup
                          sessionId={session.id}
                          player={{
                            id: p.id,
                            name: p.name,
                            gender: p.gender,
                            rating: p.rating,
                          }}
                        />
                        <form action={removePlayer}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <input type="hidden" name="playerId" value={p.id} />
                          <ConfirmSubmit
                            title={`Remove ${p.name}?`}
                            message="Their un-started games are deleted (regenerate the queue after); played stats stay."
                            confirmLabel="Remove"
                            danger
                            className="flex items-center justify-center rounded-md border border-[#e3c4b0] p-2 text-clay-deep hover:bg-[#f9e9df]"
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-label={`Remove ${p.name}`}
                            >
                              <path d="M3 6h18" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </ConfirmSubmit>
                        </form>
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
          ),
          results: (
            <>
      {snapshot.podium.length > 0 && (
        <section className="mb-6">
          <SectionTitle>Championship ladder</SectionTitle>
          <ChampionshipLadder podium={snapshot.podium} />
        </section>
      )}
      <section className="mb-6">
        <SectionTitle>Leaderboard</SectionTitle>
        {isTournament ? (
          <div className="space-y-5">
            <div>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.16em] text-muted">
                Male - top {session.maleSlots} make the playoffs
              </h3>
              <LeaderboardTable
                rows={snapshot.leaderboard.filter((r) => r.gender === "M")}
                qualifyCount={session.maleSlots ?? 0}
              />
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.16em] text-muted">
                Female - top {session.femaleSlots} make the playoffs
              </h3>
              <LeaderboardTable
                rows={snapshot.leaderboard.filter((r) => r.gender === "F")}
                qualifyCount={session.femaleSlots ?? 0}
              />
            </div>
          </div>
        ) : (
          <LeaderboardTable rows={snapshot.leaderboard} />
        )}
      </section>

      {/* completed games: tournament bracket games first, then regular play */}
      {completedSections.map((section, sIdx) => (
      <section
        key={section.title}
        className={sIdx < completedSections.length - 1 ? "mb-6" : undefined}
      >
        <SectionTitle>
          {section.title}{" "}
          <span className="text-sm text-muted">({section.games.length})</span>
        </SectionTitle>
        {section.note && (
          <p className="-mt-1 mb-2 text-xs text-muted">{section.note}</p>
        )}
        <ul className="space-y-2">
          {section.games.map((g) => {
            const duration =
              g.startedAt && g.completedAt
                ? formatDuration(
                    g.completedAt.getTime() - g.startedAt.getTime(),
                  )
                : null;
            const t1Won = (g.score1 ?? 0) > (g.score2 ?? 0);
            return (
              <li
                key={g.id}
                className="rounded-md border border-line bg-card p-4 shadow-[0_1px_0_#d9d2c2]"
              >
                <div className="flex items-center justify-between border-b border-rule pb-2">
                  <span className="flex items-center">
                    <GameNo seq={g.seq} />
                    {g.round !== null && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                          g.stage !== null
                            ? "border-[#d89a7c] bg-[#f9e9df] font-bold text-clay"
                            : "border-line bg-paper text-muted"
                        }`}
                      >
                        {label(g)}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-faint tabular-nums">
                      {duration ?? ""}
                    </span>
                    <ScoreEditPopup
                      sessionId={session.id}
                      gameId={g.id}
                      seq={g.seq}
                      team1={[
                        byId.get(g.t1p1)?.name ?? "?",
                        byId.get(g.t1p2)?.name ?? "?",
                      ]}
                      team2={[
                        byId.get(g.t2p1)?.name ?? "?",
                        byId.get(g.t2p2)?.name ?? "?",
                      ]}
                      score1={g.score1}
                      score2={g.score2}
                      winningScore={target(g)}
                    />
                    <form action={deleteGame}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="gameId" value={g.id} />
                      <ConfirmSubmit
                        title={`Delete game No. ${g.seq}?`}
                        message="Its result is permanently removed from the leaderboard and every player's record."
                        confirmLabel="Delete"
                        danger
                        className="flex items-center justify-center rounded-md border border-[#e3c4b0] p-1.5 text-clay-deep hover:bg-[#f9e9df]"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-label={`Delete game No. ${g.seq}`}
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </ConfirmSubmit>
                    </form>
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <div
                    className={`flex-1 font-display text-lg leading-snug ${
                      t1Won ? "text-ink" : "text-muted"
                    }`}
                  >
                    {byId.get(g.t1p1)?.name ?? "?"}
                    <br />
                    {byId.get(g.t1p2)?.name ?? "?"}
                  </div>
                  <div className="font-display text-2xl tabular-nums">
                    {g.score1}–{g.score2}
                  </div>
                  <div
                    className={`flex-1 text-right font-display text-lg leading-snug ${
                      t1Won ? "text-muted" : "text-ink"
                    }`}
                  >
                    {byId.get(g.t2p1)?.name ?? "?"}
                    <br />
                    {byId.get(g.t2p2)?.name ?? "?"}
                  </div>
                </div>
                {(uncounted.get(g.id)?.length ?? 0) > 0 && (
                  <p className="mt-2.5 border-t border-rule pt-2 text-xs text-muted">
                    <span className="font-bold uppercase tracking-[0.12em] text-faint">
                      Not counted
                    </span>{" "}
                    - {uncounted.get(g.id)!.join(", ")} already at the game
                    cap; this result stays off their leaderboard record.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      ))}
            </>
          ),
        }}
      />
    </main>
  );
}
