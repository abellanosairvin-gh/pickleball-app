"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { submitScore } from "@/lib/actions";
import { ScoreForm } from "./ScoreForm";

/** Pencil icon button that opens a dialog for editing a completed game's score. */
export function ScoreEditPopup({
  sessionId,
  gameId,
  seq,
  team1,
  team2,
  score1,
  score2,
  winningScore = 11,
}: {
  sessionId: number;
  gameId: number;
  seq: number;
  team1: [string, string];
  team2: [string, string];
  score1: number | null;
  score2: number | null;
  winningScore?: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={`Edit score of game No. ${seq}`}
        onClick={() => setOpen(true)}
        className="flex items-center justify-center rounded-md border border-line p-1.5 text-ink hover:bg-paper"
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
        >
          <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-md border border-line bg-card p-5 shadow-[0_2px_0_#d9d2c2]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display text-xl leading-snug">
                Edit score - No. {seq}
              </h3>
              <ScoreForm
                action={submitScore}
                onValid={() => setOpen(false)}
                className="mt-4"
                winningScore={winningScore}
              >
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="gameId" value={gameId} />
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-display text-lg leading-snug">
                      {team1[0]}
                      <br />
                      {team1[1]}
                    </p>
                    <div className="mt-2 flex justify-start">
                      <input
                        name="score1"
                        type="number"
                        min={0}
                        max={winningScore}
                        required
                        defaultValue={score1 ?? 0}
                        className="w-16 rounded-md border border-line bg-paper p-2 text-center tabular-nums"
                      />
                    </div>
                  </div>
                  <span className="font-serif italic text-faint">–</span>
                  <div className="flex-1 text-right">
                    <p className="font-display text-lg leading-snug">
                      {team2[0]}
                      <br />
                      {team2[1]}
                    </p>
                    <div className="mt-2 flex justify-end">
                      <input
                        name="score2"
                        type="number"
                        min={0}
                        max={winningScore}
                        required
                        defaultValue={score2 ?? 0}
                        className="w-16 rounded-md border border-line bg-paper p-2 text-center tabular-nums"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-paper"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-card hover:bg-ink-deep"
                  >
                    Save
                  </button>
                </div>
              </ScoreForm>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
