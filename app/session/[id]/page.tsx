import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BulkAdd } from "@/components/BulkAdd";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { FixedGamePopup } from "@/components/FixedGamePopup";
import { GameEditPopup } from "@/components/GameEditPopup";
import { OrganizerTabs } from "@/components/OrganizerTabs";
import { BracketChip } from "@/components/BracketChip";
import { MatchupNames } from "@/components/MatchupNames";
import { PlayingCardHeader } from "@/components/PlayingCardHeader";
import { PlayerEditPopup } from "@/components/PlayerEditPopup";
import { PlayerLabel } from "@/components/PlayerLabel";
import { QrPopup } from "@/components/QrPopup";
import { QueueSearch } from "@/components/QueueSearch";
import { ScoreEditPopup } from "@/components/ScoreEditPopup";
import { ScoreForm } from "@/components/ScoreForm";
import { WaitBadge } from "@/components/WaitBadge";
import {
  clearOutGames,
  deleteGame,
  deleteSession,
  endSession,
  generateSchedule,
  logout,
  moveGame,
  removePlayer,
  simulateScores,
  setPlayerCheckedIn,
  setPlayerOut,
  startGame,
  startTournament,
  submitScore,
  topUpSchedule,
} from "@/lib/actions";
import { ChampionshipLadder } from "@/components/ChampionshipLadder";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { requireAuth } from "@/lib/auth";
import {
  courtName,
  formatDuration,
  GENDER_LABEL,
  MODE_LABEL,
  queueOrdinal,
  RATING_ABBR,
} from "@/lib/format";
import {
  buildSnapshot,
  computeLeaderboard,
  computeShortfall,
  loadSessionData,
} from "@/lib/queries";
import { partnerKey } from "@/lib/partners";
import { generateSchedule as computeSuggestions } from "@/lib/scheduler";
import { bracketLabel, tournamentStatus } from "@/lib/tournament";
import type { Game, Player } from "@/lib/schema";

export const dynamic = "force-dynamic";

const RATING_LABEL = { beginner: "B", mid: "M", advanced: "A" } as const;

/** A player's name; orange when this game is past their Game Cap (a fill-in). */
function PlayerName({
  id,
  byId,
  overCap,
}: {
  id: number;
  byId: Map<number, Player>;
  overCap: boolean;
}) {
  return (
    <span
      className={overCap ? "text-[#d97706]" : undefined}
      title={overCap ? "Past the game cap - this game won't count for them" : undefined}
    >
      <PlayerLabel name={byId.get(id)?.name ?? "?"} />
    </span>
  );
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
  // Out players (done for the night) stay on the roster but get no games.
  const available = roster.filter((p) => !p.out);
  const outIds = new Set(roster.filter((p) => p.out).map((p) => p.id));
  const outNames = (g: Game) =>
    [g.t1p1, g.t1p2, g.t2p1, g.t2p2]
      .filter((id) => outIds.has(id))
      .map((id) => byId.get(id)?.name ?? "?");
  // Not checked in: hasn't arrived yet. A game can't start until all four
  // of its players are in; when it is otherwise ready it shows red.
  const uncheckedIds = new Set(roster.filter((p) => !p.checkedIn).map((p) => p.id));
  const uncheckedNames = (g: Game) =>
    [g.t1p1, g.t1p2, g.t2p1, g.t2p2]
      .filter((id) => uncheckedIds.has(id))
      .map((id) => byId.get(id)?.name ?? "?");
  const checkedInCount = available.filter((p) => p.checkedIn).length;
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
  // Queued games that include an Out player: red in the queue, cleared in
  // one go, then topped up.
  const outQueued = queue.filter((g) => outNames(g).length > 0);
  const completed = allGames
    .filter((g) => g.status === "completed")
    .sort(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0) ||
        b.seq - a.seq,
    );
  // Which players are past their Game Cap in each open game: walk the
  // night in play order (completed, on court, then the queue) counting
  // regular games; a player's cap+1-th game onward is a fill-in that won't
  // count for them - shown in orange on the courts and in the queue.
  // The night in play order: completed games by wall-clock finish time, then
  // games on court by start time, then the queue. Shared by the over-cap walk
  // and the Fixed game Suggest (whose "rest" is a player's position here).
  const inOrder = [
    ...[...completed].reverse(),
    ...[...playing].sort(
      (a, b) =>
        (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0),
    ),
    ...queue,
  ];
  const overCapIn = new Map<number, Set<number>>();
  {
    const played = new Map<number, number>();
    for (const g of inOrder) {
      if (g.round !== null) continue;
      for (const id of [g.t1p1, g.t1p2, g.t2p1, g.t2p2]) {
        const n = (played.get(id) ?? 0) + 1;
        played.set(id, n);
        if (n > session.gameCap) {
          if (!overCapIn.has(g.id)) overCapIn.set(g.id, new Set());
          overCapIn.get(g.id)!.add(id);
        }
      }
    }
  }
  const overCap = (g: Game) => overCapIn.get(g.id) ?? new Set<number>();
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
  // button. Every available player is a candidate - including those on a
  // court or not yet checked in - so games can be queued ahead of time;
  // fewest games toward the cap comes first. Games are fed in play order,
  // so the tiebreaker "longest wait" means the most wall-clock rest since a
  // player's last game (someone on court or already in the queue reads as
  // busy). The cap is lifted just past the busiest player so suggestions
  // keep coming for shortfall-filling games after most players hit the cap;
  // the hard rules (rating, partner uniqueness - and gender balance in
  // Tournament sessions) always apply.
  const suggestable = available;
  // Partnerships already used tonight (partnerKey -> first game No.), so the
  // manual picker can warn on a repeat. The edit popup gets the map without
  // the game being edited - its own current pair isn't a repeat.
  const partnersExcept = (skipGameId?: number) => {
    const used: Record<string, number> = {};
    for (const g of inOrder) {
      if (g.id === skipGameId) continue;
      for (const [a, b] of [
        [g.t1p1, g.t1p2],
        [g.t2p1, g.t2p2],
      ]) {
        const k = partnerKey(a, b);
        if (used[k] === undefined) used[k] = g.seq;
      }
    }
    return used;
  };
  const usedPartners = partnersExcept();
  const busiest = Math.max(
    0,
    ...suggestable.map(
      (p) =>
        allGames.filter((g) =>
          [g.t1p1, g.t1p2, g.t2p1, g.t2p2].includes(p.id),
        ).length,
    ),
  );
  const suggestions =
    session.status === "active" && suggestable.length >= 4
      ? computeSuggestions({
          players: suggestable.map((p) => ({
            id: p.id,
            rating: p.rating,
            gender: p.gender,
          })),
          cap: Math.max(session.gameCap, busiest + 1),
          mode: session.defaultMode === "rating" ? "rating" : "random",
          existing: inOrder.map((g) => ({
            t1: [g.t1p1, g.t1p2] as [number, number],
            t2: [g.t2p1, g.t2p2] as [number, number],
          })),
          restarts: 20,
          genderRule: session.tournament,
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
  // Nothing for the generator to do: every queued game is hand-built
  // (pinned) and nobody is short of the cap. Generate/Top up are hidden so a
  // stray tap can't disturb a hand-built night.
  const generatorIdle =
    session.defaultMode !== "ladder" &&
    queue.length > 0 &&
    queue.every((g) => g.pinned) &&
    shortfall.length === 0;

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
                className="rounded-md border border-clay px-3 py-2 text-sm font-medium text-clay hover:bg-clay-tint"
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
                className="rounded-md border border-clay-soft px-3 py-2 text-sm font-medium text-clay-deep hover:bg-clay-tint"
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
        <div className="mb-4 rounded-md border border-clay-soft bg-clay-tint p-3 text-sm text-ink">
          <strong className="font-semibold">Best effort</strong> - these
          players fall short of the cap:
          <ul className="my-2 flex flex-col gap-0.5">
            {shortfall.map((s) => (
              <li key={s.name} className="flex items-baseline gap-2">
                <span className="font-semibold">{s.name}</span>
                <span className="text-muted">
                  {s.scheduled} of {session.gameCap}
                  {s.lastGame !== null
                    ? ` · last in No. ${s.lastGame}`
                    : " · no games yet"}
                </span>
              </li>
            ))}
          </ul>
          Top up to add just their games, hand-fix via the queue editor, or
          create fixed games.
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
        <div className="grid gap-2.5">
          {Array.from({ length: session.courtCount }, (_, i) => i + 1).map(
            (court) => {
              const g = playing.find((x) => x.court === court);
              return g ? (
                <div
                  key={court}
                  className="rounded-md border border-line bg-card p-3 shadow-[0_1px_0_#d9d2c2]"
                >
                  <PlayingCardHeader
                    court={court}
                    seq={g.seq}
                    startedAt={g.startedAt?.toISOString() ?? null}
                    label={label(g)}
                    stage={g.stage}
                  />
                  {outNames(g).length > 0 && (
                    <p className="mt-2 rounded-md border border-[#e0a0a0] bg-[#fbe9e7] px-2.5 py-1.5 text-xs font-semibold text-[#9b2c2c]">
                      Out: {outNames(g).join(", ")} - score it or delete it
                    </p>
                  )}
                  <ScoreForm action={submitScore} winningScore={target(g)}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <input type="hidden" name="gameId" value={g.id} />
                    {/* Each side's score sits right beside its names. */}
                    <MatchupNames
                      className="mt-2"
                      team1={[
                        <PlayerName key={g.t1p1} id={g.t1p1} byId={byId} overCap={overCap(g).has(g.t1p1)} />,
                        <PlayerName key={g.t1p2} id={g.t1p2} byId={byId} overCap={overCap(g).has(g.t1p2)} />,
                      ]}
                      aside1={
                        <input
                          name="score1"
                          type="number"
                          min={0}
                          max={target(g)}
                          required
                          placeholder="0"
                          aria-label="Team 1 score"
                          inputMode="numeric"
                          className="w-16 shrink-0 rounded-md border border-line bg-paper px-1 py-1.5 text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      }
                      aside2={
                        <input
                          name="score2"
                          type="number"
                          min={0}
                          max={target(g)}
                          required
                          placeholder="0"
                          aria-label="Team 2 score"
                          inputMode="numeric"
                          className="w-16 shrink-0 rounded-md border border-line bg-paper px-1 py-1.5 text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      }
                      team2={[
                        <PlayerName key={g.t2p1} id={g.t2p1} byId={byId} overCap={overCap(g).has(g.t2p1)} />,
                        <PlayerName key={g.t2p2} id={g.t2p2} byId={byId} overCap={overCap(g).has(g.t2p2)} />,
                      ]}
                    />
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
          {generatorIdle ? (
            <p className="rounded-md border border-line bg-paper px-3 py-2 text-xs text-muted">
              Hand-built queue, everyone at the cap - Generate and Top up are
              off. Edit or delete a queued game, or add a fixed game, to
              change it.
            </p>
          ) : (
          <form action={generateSchedule}>
            <input type="hidden" name="sessionId" value={session.id} />
            <ConfirmSubmit
              title={
                session.defaultMode === "ladder"
                  ? "Seed a round?"
                  : queue.some((g) => !g.pinned)
                    ? "Regenerate the queue?"
                    : queue.some((g) => g.pinned)
                      ? "Fill in around the pinned games?"
                      : "Generate the schedule?"
              }
              message={
                session.defaultMode === "ladder"
                  ? "Queues one game for each waiting player. Nothing already queued is touched - results drive the rest of the night."
                  : queue.some((g) => !g.pinned)
                    ? "Un-started, un-pinned games are replaced. Completed, playing, and pinned games are kept."
                    : queue.some((g) => g.pinned)
                      ? "Pinned games stay put. The rest of the night is generated around them - they count toward each player’s cap, their partnerships won’t repeat, and new games are spaced out after them."
                      : "Builds the full night’s games for the current roster."
              }
              confirmLabel={
                session.defaultMode === "ladder"
                  ? "Seed round"
                  : queue.some((g) => !g.pinned)
                    ? "Regenerate"
                    : queue.some((g) => g.pinned)
                      ? "Fill in"
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
          )}
          {!generatorIdle &&
            session.defaultMode !== "ladder" &&
            queue.length + playing.length + completed.length > 0 && (
              <form action={topUpSchedule}>
                <input type="hidden" name="sessionId" value={session.id} />
                <ConfirmSubmit
                  title="Top up the queue?"
                  message="Keeps every queued game and adds only the games players still need to reach the cap. When fewer than four players are short, players already at the cap fill the empty seats (those games don't count for them). New games go to the end of the queue."
                  confirmLabel="Top up"
                  className="rounded-md border-2 border-ink bg-card px-4 py-2 text-sm font-semibold text-ink hover:bg-paper"
                >
                  Top up
                </ConfirmSubmit>
              </form>
            )}
          {available.length >= 4 && (
            <FixedGamePopup
              sessionId={session.id}
              options={playerOptions(available)}
              suggestions={suggestions}
              usedPartners={usedPartners}
            />
          )}
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
                className="rounded-md border-2 border-clay bg-card px-4 py-2 text-sm font-semibold text-clay-deep hover:bg-clay-tint"
              >
                {bracketStarted ? "Advance round" : "Start playoffs"}
              </ConfirmSubmit>
            </form>
          )}
          {/* TEMP dev tool - delete later */}
          <form action={simulateScores}>
            <input type="hidden" name="sessionId" value={session.id} />
            <button className="rounded-md border border-dashed border-dash px-4 py-2 text-sm font-medium text-muted hover:bg-paper">
              Simulate
            </button>
          </form>
        </section>
      )}

      {/* queue */}
      <section className="mb-6">
        <SectionTitle>
          Queue <span className="text-sm text-muted">({queue.length})</span>
        </SectionTitle>
        {!ended && outQueued.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#e0a0a0] bg-[#fbe9e7] p-3 text-sm text-[#9b2c2c]">
            <span>
              <strong className="font-semibold">
                {outQueued.length} game{outQueued.length === 1 ? "" : "s"}
              </strong>{" "}
              include a player who is out.
            </span>
            <form action={clearOutGames}>
              <input type="hidden" name="sessionId" value={session.id} />
              <ConfirmSubmit
                title={`Clear ${outQueued.length} game${outQueued.length === 1 ? "" : "s"}?`}
                message="Every queued game with an Out player is deleted. Then Top up to give the other players in those games their replacements."
                confirmLabel="Clear"
                danger
                className="rounded-md bg-[#9b2c2c] px-3 py-1.5 text-xs font-semibold text-card hover:bg-[#7f1d1d]"
              >
                Clear out games
              </ConfirmSubmit>
            </form>
          </div>
        )}
        {queue.length === 0 ? (
          <p className="rounded-md border border-dashed border-dash p-4 text-sm text-faint">
            No games queued.
          </p>
        ) : (
          <QueueSearch
            entries={queue.map((g, idx) => {
              const ready = readyGames.has(g.id);
              const blockers = blockedGames.get(g.id);
              const outHere = outNames(g);
              const uncheckedHere = uncheckedNames(g);
              // A court is open and the players are free, but someone
              // hasn't checked in: red instead of green, and no Start.
              const held = ready && uncheckedHere.length > 0;
              // Card tone: an Out player (red), a held game (red) and an
              // open court (green) outrank position; otherwise the next
              // game up sits on clay-tinted paper like the spectator's queue.
              const tone =
                outHere.length > 0 || held
                  ? "border-[#c94f4f] bg-[#fbe9e7]"
                  : ready
                    ? "border-ink bg-[#eef2e4]"
                    : idx === 0
                      ? "border-clay-line bg-clay-tint"
                      : "border-line bg-card";
              const rule =
                outHere.length > 0 || held
                  ? "border-[#e0a0a0]"
                  : ready
                    ? "border-ink/20"
                    : idx === 0
                      ? "border-clay-line"
                      : "border-rule";
              // Status sits in the middle of the header, between the
              // position and the game number.
              const status =
                outHere.length > 0
                  ? { text: `Out: ${outHere.join(", ")}`, tone: "text-[#9b2c2c]" }
                  : uncheckedHere.length > 0
                    ? { text: `Not checked in: ${uncheckedHere.join(", ")}`, tone: "text-[#9b2c2c]" }
                    : ready
                      ? { text: "Ready - court open", tone: "text-ink" }
                      : blockers
                        ? { text: `Waiting on ${blockers.join(", ")}`, tone: "text-clay-deep" }
                        : null;
              const names = [g.t1p1, g.t1p2, g.t2p1, g.t2p2].map(
                (id) => byId.get(id)?.name ?? "?",
              );
              const node = (
              <li
                key={g.id}
                className={`rounded-md border p-3 shadow-[0_1px_0_#d9d2c2] ${tone}`}
              >
                <div className={`flex items-baseline justify-between gap-3 border-b pb-2 ${rule}`}>
                  <span
                    className={`text-xs font-bold uppercase tracking-[0.16em] ${
                      idx === 0 ? "text-clay" : "text-muted"
                    }`}
                  >
                    {queueOrdinal(idx)}
                  </span>
                  {status && (
                    <span
                      className={`min-w-0 flex-1 text-center text-xs font-bold uppercase tracking-[0.16em] ${status.tone}`}
                    >
                      {status.text}
                    </span>
                  )}
                  <span
                    className={`flex items-center gap-2 whitespace-nowrap text-xs ${
                      idx === 0 ? "text-clay-deep" : "text-muted"
                    }`}
                  >
                    {g.pinned && (
                      <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted">
                        pinned
                      </span>
                    )}
                    No. {g.seq}
                  </span>
                </div>
                {g.round !== null && (
                  <BracketChip
                    block
                    label={label(g)!}
                    stage={g.stage}
                    className="mt-2"
                  />
                )}
                <MatchupNames
                  className="mt-2"
                  team1={[
                    <PlayerName key={g.t1p1} id={g.t1p1} byId={byId} overCap={overCap(g).has(g.t1p1)} />,
                    <PlayerName key={g.t1p2} id={g.t1p2} byId={byId} overCap={overCap(g).has(g.t1p2)} />,
                  ]}
                  team2={[
                    <PlayerName key={g.t2p1} id={g.t2p1} byId={byId} overCap={overCap(g).has(g.t2p1)} />,
                    <PlayerName key={g.t2p2} id={g.t2p2} byId={byId} overCap={overCap(g).has(g.t2p2)} />,
                  ]}
                />
                {!ended && (
                  <div className={`mt-2.5 flex items-center justify-end gap-1 border-t pt-2.5 ${rule}`}>
                      {freeCourts.length > 0 && (
                        <form action={startGame}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <input type="hidden" name="gameId" value={g.id} />
                          <button
                            disabled={uncheckedHere.length > 0}
                            title={
                              uncheckedHere.length > 0
                                ? `Can't start - not checked in: ${uncheckedHere.join(", ")}`
                                : undefined
                            }
                            className="rounded-md bg-ink px-2.5 py-1.5 text-xs font-semibold text-card hover:bg-ink-deep disabled:bg-[#c94f4f] disabled:opacity-60"
                          >
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
                        options={playerOptions(available)}
                        defaults={[g.t1p1, g.t1p2, g.t2p1, g.t2p2]}
                        usedPartners={partnersExcept(g.id)}
                      />
                      <form action={deleteGame}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <input type="hidden" name="gameId" value={g.id} />
                        <ConfirmSubmit
                          title={`Delete game No. ${g.seq}?`}
                          message="It comes off the queue permanently."
                          confirmLabel="Delete"
                          danger
                          className="flex items-center justify-center rounded-md border border-clay-soft p-1.5 text-clay-deep hover:bg-clay-tint"
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
              </li>
              );
              return { id: g.id, names, node };
            })}
          />
        )}
      </section>
            </>
          ),
          roster: (
      <section className="mb-6">
        <SectionTitle>
          Roster{" "}
          <span className="text-sm text-muted">
            ({checkedInCount}/{available.length} checked in
            {outIds.size > 0 ? ` · ${outIds.size} out` : ""})
          </span>
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
                  <span
                    className={`text-sm font-medium ${p.out ? "text-muted line-through decoration-[#c94f4f]" : ""}`}
                  >
                    <PlayerLabel name={p.name} />{" "}
                    <span className="text-xs text-faint">
                      {GENDER_LABEL[p.gender]} ({RATING_ABBR[p.rating]})
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {p.out ? (
                      <span className="rounded-full border border-[#c94f4f] bg-[#fbe9e7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9b2c2c]">
                        Out
                      </span>
                    ) : (
                      <WaitBadge
                        lastPlayedAt={
                          lastPlayed.has(p.id)
                            ? new Date(lastPlayed.get(p.id)!).toISOString()
                            : null
                        }
                        onCourt={onCourt.has(p.id)}
                      />
                    )}
                    {!ended && (
                      <>
                        {!p.out && (
                          <form action={setPlayerCheckedIn}>
                            <input type="hidden" name="sessionId" value={session.id} />
                            <input type="hidden" name="playerId" value={p.id} />
                            <input
                              type="hidden"
                              name="checkedIn"
                              value={p.checkedIn ? "0" : "1"}
                            />
                            {p.checkedIn ? (
                              <button
                                title="Checked in - tap to undo"
                                aria-label={`Undo check-in for ${p.name}`}
                                className="rounded-md border border-win bg-[#eef2e4] px-2 py-1.5 text-xs font-semibold text-win hover:bg-paper"
                              >
                                ✓ In
                              </button>
                            ) : (
                              <button
                                aria-label={`Check in ${p.name}`}
                                className="rounded-md bg-ink px-2 py-1.5 text-xs font-semibold text-card hover:bg-ink-deep"
                              >
                                Check in
                              </button>
                            )}
                          </form>
                        )}
                        <form action={setPlayerOut}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <input type="hidden" name="playerId" value={p.id} />
                          <input type="hidden" name="out" value={p.out ? "0" : "1"} />
                          {p.out ? (
                            <button className="rounded-md border border-line px-2 py-1.5 text-xs font-medium text-muted hover:bg-paper">
                              Back in
                            </button>
                          ) : (
                            <ConfirmSubmit
                              title={`${p.name} is out?`}
                              message="Done for the night: no new games are generated for them and their played results stay on the leaderboard. Their queued games turn red so you can clear them and top up."
                              confirmLabel="Mark out"
                              danger
                              className="rounded-md border border-[#e0a0a0] px-2 py-1.5 text-xs font-medium text-[#9b2c2c] hover:bg-[#fbe9e7]"
                            >
                              Out
                            </ConfirmSubmit>
                          )}
                        </form>
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
                            className="flex items-center justify-center rounded-md border border-clay-soft p-2 text-clay-deep hover:bg-clay-tint"
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
                  <span className="flex min-w-0 flex-wrap items-center gap-y-1">
                    <GameNo seq={g.seq} />
                    {g.round !== null && (
                      <BracketChip label={label(g)!} stage={g.stage} />
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
                        className="flex items-center justify-center rounded-md border border-clay-soft p-1.5 text-clay-deep hover:bg-clay-tint"
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
                      t1Won ? "text-win" : "text-loss"
                    }`}
                  >
                    <PlayerLabel name={byId.get(g.t1p1)?.name ?? "?"} />
                    <br />
                    <PlayerLabel name={byId.get(g.t1p2)?.name ?? "?"} />
                  </div>
                  <div className="font-display text-2xl tabular-nums">
                    {g.score1}–{g.score2}
                  </div>
                  <div
                    className={`flex-1 text-right font-display text-lg leading-snug ${
                      t1Won ? "text-loss" : "text-win"
                    }`}
                  >
                    <PlayerLabel name={byId.get(g.t2p1)?.name ?? "?"} />
                    <br />
                    <PlayerLabel name={byId.get(g.t2p2)?.name ?? "?"} />
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
