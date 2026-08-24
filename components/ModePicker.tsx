"use client";

import { useState } from "react";

const SLOT_CHOICES = [2, 4, 8, 16, 32];

const LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-[0.14em] text-muted";
const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-line bg-card p-2 text-base font-normal normal-case tracking-normal text-ink";

/**
 * Matchup-mode select plus the Tournament on/off option for the
 * create-session form. Ticking Tournament reveals the per-gender roster
 * slots (powers of two — clean brackets).
 */
export function ModePicker() {
  const [tournament, setTournament] = useState(false);
  return (
    <>
      <label className={`col-span-2 ${LABEL_CLASS}`}>
        Matchup mode
        <select name="defaultMode" className={FIELD_CLASS}>
          <option value="random">Random · Fair Rotation</option>
          <option value="rating">Rating-Based · Even Matches</option>
          <option value="fixed">Manual · Hand-Picked Games</option>
          <option value="ladder">Winners · Losers · Genderless</option>
        </select>
      </label>
      <label className="col-span-2 flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-paper p-3">
        <input
          type="checkbox"
          name="tournament"
          checked={tournament}
          onChange={(e) => setTournament(e.target.checked)}
          className="h-4 w-4 accent-[#22382b]"
        />
        <span className={LABEL_CLASS}>Tournament</span>
        <span className="text-xs normal-case tracking-normal text-muted">
          knockout brackets · games to 15
        </span>
      </label>
      {tournament && (
        <>
          <label className={LABEL_CLASS}>
            Male slots
            <select name="maleSlots" defaultValue="8" className={FIELD_CLASS}>
              {SLOT_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Female slots
            <select name="femaleSlots" defaultValue="4" className={FIELD_CLASS}>
              {SLOT_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <p className="col-span-2 -mt-2 text-xs normal-case tracking-normal text-muted">
            If one gender outnumbers the other, it plays same-gender knockout
            rounds until the counts match; then every round draws fresh random
            mixed pairs (MF vs MF) until one pair remains — the champions.
          </p>
        </>
      )}
    </>
  );
}
