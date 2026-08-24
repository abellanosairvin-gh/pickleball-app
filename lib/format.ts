const COURT_WORDS = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

/** Club Paper spells court numbers out: "Court One" … "Court Twelve", then digits. */
export function courtName(n: number): string {
  return `Court ${COURT_WORDS[n - 1] ?? n}`;
}

export const GENDER_LABEL: Record<string, string> = {
  M: "Male",
  F: "Female",
};

export const RATING_ABBR: Record<string, string> = {
  beginner: "BEG",
  mid: "MID",
  advanced: "ADV",
};

/** "45s", "23m 14s", "1h 02m 05s" — durations always show seconds. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

/** Display names for matchup modes ("fixed" is shown as Manual). */
export const MODE_LABEL: Record<string, string> = {
  random: "Random · Fair Rotation",
  rating: "Rating-Based · Even Matches",
  fixed: "Manual · Hand-Picked Games",
  ladder: "Winners · Losers · Genderless",
};
