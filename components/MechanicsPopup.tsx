"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** How games are played, shown to spectators. */
const MECHANICS: { title: string; note: string }[] = [
  {
    title: "Fixed matchups",
    note: "Teams and opponents are set in advance. Every game is a pre-arranged matchup.",
  },
  {
    title: "Sudden death to 11",
    note: "First team to 11 wins the game. No win-by-two, 11 ends it. Take note of your scores, since they are logged and count toward the playoffs and tournament.",
  },
  {
    title: "Games are spread out",
    note: "Matches are spaced through the event so everyone gets time to socialize, enjoy, and eat between games.",
  },
];

/** Spectator header button that opens the game mechanics in a dialog. */
export function MechanicsPopup() {
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
        onClick={() => setOpen(true)}
        className="rounded-md border border-line bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink hover:bg-paper"
      >
        View mechanics
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
              aria-labelledby="mechanics-title"
              className="w-full max-w-sm rounded-md border border-line bg-card p-5 shadow-[0_2px_0_#d9d2c2]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="mechanics-title"
                className="font-display text-xl leading-snug"
              >
                Mechanics
              </h3>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
                How the games are played
              </p>
              <ol className="mt-4 divide-y divide-line border-y border-line">
                {MECHANICS.map((item, i) => (
                  <li key={item.title} className="flex items-baseline gap-3 py-3">
                    <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted">
                      {i + 1}.
                    </span>
                    <span>
                      <span className="block font-display text-lg leading-tight">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {item.note}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-paper"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
