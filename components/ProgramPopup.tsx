"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** The event's running order, shown to spectators. */
const PROGRAM: { title: string; time: string; note?: string }[] = [
  { title: "Prayer", time: "4:00 PM" },
  { title: "Warmup", time: "4:15 PM" },
  {
    title: "Open Play",
    time: "4:30 PM",
    note: "Standings seed the tournament bracket",
  },
  { title: "Tournament", time: "7:45 PM" },
];

/** Spectator header button that opens the event program in a dialog. */
export function ProgramPopup() {
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
        View program
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
              aria-labelledby="program-title"
              className="w-full max-w-sm rounded-md border border-line bg-card p-5 shadow-[0_2px_0_#d9d2c2]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="program-title"
                className="font-display text-xl leading-snug"
              >
                Program
              </h3>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
                Running order for the event
              </p>
              <ol className="mt-4 divide-y divide-line border-y border-line">
                {PROGRAM.map((item, i) => (
                  <li
                    key={item.title}
                    className="flex items-baseline justify-between gap-4 py-3"
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted">
                        {i + 1}.
                      </span>
                      <span>
                        <span className="block font-display text-lg leading-tight">
                          {item.title}
                        </span>
                        {item.note && (
                          <span className="mt-0.5 block text-xs text-muted">
                            {item.note}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                      {item.time}
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
