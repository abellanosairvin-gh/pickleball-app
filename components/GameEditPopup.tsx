"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { updateGame } from "@/lib/actions";
import { GamePlayerPicker } from "./GamePlayerPicker";

type Option = { id: number; label: string };

/** Pencil icon button that opens a dialog for editing a queued game's players. */
export function GameEditPopup({
  sessionId,
  gameId,
  seq,
  options,
  defaults,
}: {
  sessionId: number;
  gameId: number;
  seq: number;
  options: Option[];
  defaults: [number, number, number, number];
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
        aria-label={`Edit game No. ${seq}`}
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
                Edit game No. {seq}
              </h3>
              <p className="mt-1 text-xs text-muted">
                Saving pins the game — regeneration won’t touch it.
              </p>
              <form
                action={updateGame}
                onSubmit={() => setOpen(false)}
                className="mt-4 flex flex-col gap-2"
              >
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="gameId" value={gameId} />
                <GamePlayerPicker
                  options={options}
                  defaults={defaults}
                  submitLabel="Save"
                  onCancel={() => setOpen(false)}
                />
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
