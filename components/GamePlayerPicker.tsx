"use client";

import { useState } from "react";

type Option = { id: number; label: string; gender?: "M" | "F" };

/**
 * The four player slots of a game (Team 1 = first two, Team 2 = last two),
 * with live validation: defaults to four different players (the first legal
 * suggestion when one exists), blocks submitting while any player occupies
 * more than one slot, and - when `enforceGender` is on - while the Gender
 * Balance Rule is broken (an all-male team may only face an all-male team).
 */
export function GamePlayerPicker({
  options,
  defaults,
  submitLabel,
  suggestions,
  onCancel,
  enforceGender = false,
}: {
  options: Option[];
  defaults?: [number, number, number, number];
  submitLabel: string;
  /** Ranked rule-respecting matchups the Suggest button cycles through. */
  suggestions?: [number, number, number, number][];
  /** When set, renders a Cancel button to the left of the submit button. */
  onCancel?: () => void;
  /** Apply the Gender Balance Rule to manual picks (off for ladder mode). */
  enforceGender?: boolean;
}) {
  const [vals, setVals] = useState<string[]>(() =>
    (defaults ?? suggestions?.[0] ?? options.slice(0, 4).map((o) => o.id)).map(
      String,
    ),
  );
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const duplicated = new Set(vals).size !== 4;

  const genderOf = new Map(options.map((o) => [String(o.id), o.gender]));
  const allMale = (a: string, b: string) =>
    genderOf.get(a) === "M" && genderOf.get(b) === "M";
  const genderViolation =
    enforceGender &&
    !duplicated &&
    options.some((o) => o.gender !== undefined) &&
    allMale(vals[0], vals[1]) !== allMale(vals[2], vals[3]);

  const select = (i: number) => {
    // Players occupying the other three slots are hidden from this dropdown.
    const taken = new Set(vals.filter((_, j) => j !== i));
    return (
      <select
        name={`p${i + 1}`}
        value={vals[i]}
        onChange={(e) =>
          setVals((v) => v.map((x, j) => (j === i ? e.target.value : x)))
        }
        className="min-w-0 flex-1 rounded-md border border-line bg-card p-2 text-sm"
      >
        {options
          .filter((o) => String(o.id) === vals[i] || !taken.has(String(o.id)))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
      </select>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
            Team 1
          </span>
          {select(0)}
          {select(1)}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
            Team 2
          </span>
          {select(2)}
          {select(3)}
        </div>
      </div>
      {duplicated && (
        <p className="text-xs text-clay-deep">
          Each slot needs a different player.
        </p>
      )}
      {genderViolation && (
        <p className="text-xs text-clay-deep">
          An all-male team can only face another all-male team - legal
          matchups are MM vs MM, MF vs MF, FF vs FF, and MF vs FF.
        </p>
      )}
      <div className="mt-1 flex items-center gap-2">
        {suggestions && suggestions.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setVals(
                suggestions[suggestionIdx % suggestions.length].map(String),
              );
              setSuggestionIdx((i) => i + 1);
            }}
            className="flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-paper"
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
              <path d="M21 12a9 9 0 1 1-2.6-6.4" />
              <path d="M21 3v6h-6" />
            </svg>
            Suggest
          </button>
        )}
        <div className="flex-1" />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-paper"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={duplicated || genderViolation}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-card hover:bg-ink-deep disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </>
  );
}
