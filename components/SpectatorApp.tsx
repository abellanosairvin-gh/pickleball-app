"use client";

import { useEffect, useState } from "react";
import { courtName, formatDuration } from "@/lib/format";
import { ChampionshipLadder } from "./ChampionshipLadder";
import { LeaderboardTable } from "./LeaderboardTable";
import { RunningClock } from "./RunningClock";
import type { GameView, Snapshot } from "@/lib/queries";

const TABS = ["Playing", "Queue", "Results"] as const;
type Tab = (typeof TABS)[number];

const POLL_MS = 10_000;

function Team({
  names,
  winner,
  sep = " & ",
}: {
  names: [string, string];
  winner?: boolean;
  sep?: string;
}) {
  return (
    <span className={winner ? "font-semibold" : ""}>
      {names[0]}
      {sep}
      {names[1]}
    </span>
  );
}

function Vs({ g }: { g: GameView }) {
  return (
    <span>
      <Team names={g.team1.names} sep="/" />{" "}
      <span className="font-serif italic text-faint">vs</span>{" "}
      <Team names={g.team2.names} sep="/" />
    </span>
  );
}

function GameNo({ seq }: { seq: number }) {
  return (
    <span className="mr-2 text-xs uppercase tracking-[0.14em] text-faint">
      No. {seq}
    </span>
  );
}

export function SpectatorApp({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("Playing");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/public/${token}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as Snapshot;
        if (alive) {
          setSnapshot(json);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token]);

  if (!snapshot) {
    return (
      <p className="p-8 text-center text-muted">
        {failed ? "Session not found." : "Loading…"}
      </p>
    );
  }

  // Finished bracket games get their own section above regular history.
  const bracketHistory = snapshot.history.filter((g) => g.label !== null);
  const historySections = [
    ...(bracketHistory.length > 0
      ? [
          {
            title: "Tournament",
            note: "Bracket results stay off the leaderboard.",
            games: bracketHistory,
          },
        ]
      : []),
    {
      title: "History",
      note: null,
      games: snapshot.history.filter((g) => g.label === null),
    },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="border-b-2 border-ink px-5 pt-6 pb-3">
        <h1 className="font-display text-3xl leading-tight">
          {snapshot.session.name}
        </h1>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">
            {snapshot.session.courtCount} courts · cap {snapshot.session.gameCap}{" "}
            games
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
            {snapshot.session.status === "ended" ? "Final results" : "In play"}
          </p>
        </div>
      </header>

      <nav className="sticky top-0 z-10 flex border-b border-line bg-card">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 p-3.5 text-[13px] uppercase tracking-[0.1em] ${
              tab === t
                ? "border-clay font-bold text-ink"
                : "border-transparent font-medium text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-4">
        {tab === "Playing" && (
          <div className="space-y-3.5">
            {snapshot.playing.length === 0 && (
              <p className="p-6 text-center text-sm text-muted">
                No games in progress.
              </p>
            )}
            {snapshot.playing
              .slice()
              .sort((a, b) => (a.court ?? 0) - (b.court ?? 0))
              .map((g) => (
                <div
                  key={g.id}
                  className="rounded-md border border-line bg-card p-4 shadow-[0_1px_0_#d9d2c2]"
                >
                  <div className="flex items-baseline justify-between border-b border-rule pb-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-clay">
                      {courtName(g.court ?? 0)}
                      {g.label && (
                        <span className="ml-2 rounded-full border border-[#d89a7c] bg-[#f9e9df] px-2 py-0.5 tracking-[0.12em]">
                          {g.label}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted">
                      No. {g.seq}
                      {g.startedAt && (
                        <>
                          {" · "}
                          <span className="font-semibold text-clay">
                            <RunningClock since={g.startedAt} />
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="flex-1 font-display text-xl leading-snug">
                      {g.team1.names[0]}
                      <br />
                      {g.team1.names[1]}
                    </div>
                    <div className="font-serif text-xs italic tracking-wide text-muted">
                      versus
                    </div>
                    <div className="flex-1 text-right font-display text-xl leading-snug">
                      {g.team2.names[0]}
                      <br />
                      {g.team2.names[1]}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}

        {tab === "Queue" && (
          <ol className="space-y-2.5">
            {snapshot.queue.length === 0 && (
              <p className="p-6 text-center text-sm text-muted">
                Nothing queued.
              </p>
            )}
            {snapshot.queue.map((g, i) => (
              <li
                key={g.id}
                className={`rounded-md border bg-card p-3 text-sm shadow-[0_1px_0_#d9d2c2] ${
                  i === 0 ? "border-clay" : "border-line"
                }`}
              >
                {i === 0 && (
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-clay">
                    Up next
                  </p>
                )}
                <GameNo seq={g.seq} />
                <Vs g={g} />
                {g.label && (
                  <span
                    className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                      g.stage === null
                        ? "border-line bg-paper text-muted"
                        : "border-[#d89a7c] bg-[#f9e9df] font-bold text-clay"
                    }`}
                  >
                    {g.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {tab === "Results" && (
          <div className="space-y-6">
            {snapshot.podium.length > 0 && (
              <section>
                <h2 className="mb-2 font-display text-xl">
                  Championship ladder
                </h2>
                <ChampionshipLadder podium={snapshot.podium} />
              </section>
            )}
            <section>
              <h2 className="mb-2 font-display text-xl">Leaderboard</h2>
              {snapshot.session.tournament ? (
                <div className="space-y-5">
                  <div>
                    <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.16em] text-muted">
                      Male - top {snapshot.session.maleSlots} make the playoffs
                    </h3>
                    <LeaderboardTable
                      rows={snapshot.leaderboard.filter(
                        (r) => r.gender === "M",
                      )}
                      qualifyCount={snapshot.session.maleSlots ?? 0}
                    />
                  </div>
                  <div>
                    <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.16em] text-muted">
                      Female - top {snapshot.session.femaleSlots} make the
                      playoffs
                    </h3>
                    <LeaderboardTable
                      rows={snapshot.leaderboard.filter(
                        (r) => r.gender === "F",
                      )}
                      qualifyCount={snapshot.session.femaleSlots ?? 0}
                    />
                  </div>
                </div>
              ) : (
                <LeaderboardTable rows={snapshot.leaderboard} />
              )}
            </section>
            {historySections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-2 font-display text-xl">{section.title}</h2>
              {section.note && (
                <p className="-mt-1 mb-2 text-xs text-muted">{section.note}</p>
              )}
              <ul className="space-y-2.5">
                {section.games.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted">
                    No completed games yet.
                  </p>
                )}
            {section.games.map((g) => (
              <li
                key={g.id}
                className="rounded-md border border-line bg-card p-3 text-sm shadow-[0_1px_0_#d9d2c2]"
              >
                <div className="flex items-center justify-between">
                  <span>
                    <GameNo seq={g.seq} />
                    {g.label && (
                      <span
                        className={`mr-2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                          g.stage === null
                            ? "border-line bg-paper text-muted"
                            : "border-[#d89a7c] bg-[#f9e9df] font-bold text-clay"
                        }`}
                      >
                        {g.label}
                      </span>
                    )}
                    <Team
                      names={g.team1.names}
                      winner={(g.score1 ?? 0) > (g.score2 ?? 0)}
                    />{" "}
                    <span className="font-display">
                      {g.score1}–{g.score2}
                    </span>{" "}
                    <Team
                      names={g.team2.names}
                      winner={(g.score2 ?? 0) > (g.score1 ?? 0)}
                    />
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-faint tabular-nums">
                    {g.durationMs !== null ? formatDuration(g.durationMs) : ""}
                  </span>
                </div>
                {g.uncounted.length > 0 && (
                  <p className="mt-1.5 border-t border-rule pt-1.5 text-xs text-muted">
                    <span className="font-bold uppercase tracking-[0.12em] text-faint">
                      Not counted
                    </span>{" "}
                    - {g.uncounted.join(", ")} already at the game cap; this
                    result stays off their leaderboard record.
                  </p>
                )}
              </li>
            ))}
              </ul>
            </section>
            ))}
          </div>
        )}
      </main>

      <footer className="p-3.5 text-center text-[11px] uppercase tracking-[0.12em] text-faint">
        Scores update automatically
      </footer>
    </div>
  );
}
