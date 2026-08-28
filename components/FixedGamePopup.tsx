"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createFixedGame } from "@/lib/actions";
import { GamePlayerPicker } from "./GamePlayerPicker";

type Option = { id: number; label: string; gender?: "M" | "F" };

/** Button that opens a dialog for hand-building a game. */
export function FixedGamePopup({
  sessionId,
  options,
  suggestions,
  usedPartners,
}: {
  sessionId: number;
  options: Option[];
  suggestions?: [number, number, number, number][];
  usedPartners?: Record<string, number>;
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
        onClick={() => setOpen(true)}
        className="rounded-md border border-line bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
      >
        + Fixed game
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
              <h3 className="font-display text-xl leading-snug">Fixed game</h3>
              <p className="mt-1 text-xs text-muted">
                Hand-picked and pinned - regeneration won&rsquo;t touch it.
              </p>
              <form
                action={createFixedGame}
                onSubmit={() => setOpen(false)}
                className="mt-4 flex flex-col gap-2"
              >
                <input type="hidden" name="sessionId" value={sessionId} />
                <GamePlayerPicker
                  options={options}
                  submitLabel="Queue"
                  suggestions={suggestions}
                  onCancel={() => setOpen(false)}
                  usedPartners={usedPartners}
                />
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
