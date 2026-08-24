"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { updatePlayer } from "@/lib/actions";

type EditablePlayer = {
  id: number;
  name: string;
  gender: "M" | "F";
  rating: "beginner" | "mid" | "advanced";
};

/** Pencil icon button that opens a dialog for editing a roster player. */
export function PlayerEditPopup({
  sessionId,
  player,
}: {
  sessionId: number;
  player: EditablePlayer;
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
        aria-label={`Edit ${player.name}`}
        onClick={() => setOpen(true)}
        className="flex items-center justify-center rounded-md border border-line p-2 text-ink hover:bg-paper"
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
                Edit {player.name}
              </h3>
              <form
                action={updatePlayer}
                onSubmit={() => setOpen(false)}
                className="mt-4 flex flex-col gap-3"
              >
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="playerId" value={player.id} />
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Name
                  <input
                    name="name"
                    defaultValue={player.name}
                    required
                    className="mt-1 w-full rounded-md border border-line bg-card p-2 text-base font-normal normal-case tracking-normal text-ink"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Gender
                    <select
                      name="gender"
                      defaultValue={player.gender}
                      className="mt-1 w-full rounded-md border border-line bg-card p-2 text-base font-normal normal-case tracking-normal text-ink"
                    >
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Rating
                    <select
                      name="rating"
                      defaultValue={player.rating}
                      className="mt-1 w-full rounded-md border border-line bg-card p-2 text-base font-normal normal-case tracking-normal text-ink"
                    >
                      <option value="beginner">Beginner</option>
                      <option value="mid">Mid</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </label>
                </div>
                <div className="mt-2 flex justify-end gap-2">
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
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
