import type { Gender, Rating } from "./schema";

export type ParsedPlayer = { name: string; gender: Gender; rating: Rating };
export type ParsedLine =
  | { ok: true; line: string; player: ParsedPlayer }
  | { ok: false; line: string; error: string };

const GENDERS: Record<string, Gender> = {
  m: "M",
  male: "M",
  f: "F",
  female: "F",
};

const RATINGS: Record<string, Rating> = {
  b: "beginner",
  beg: "beginner",
  beginner: "beginner",
  m: "mid",
  mid: "mid",
  i: "mid",
  int: "mid",
  intermediate: "mid",
  a: "advanced",
  adv: "advanced",
  advanced: "advanced",
};

/**
 * Parses a pasted roster: one player per line, `Name, gender, rating`.
 * Fields split on commas or tabs (so spreadsheet paste works); names may
 * contain spaces. Gender accepts M/F/male/female; rating accepts
 * b/beg/beginner, m/mid/i/intermediate, a/adv/advanced (case-insensitive).
 */
export function parseRoster(text: string): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((line) => line.length > 0)
    .map((line): ParsedLine => {
      const parts = line
        .split(/[,\t]/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length !== 3) {
        return { ok: false, line, error: "expected: Name, gender, rating" };
      }
      const [name, genderRaw, ratingRaw] = parts;
      const gender = GENDERS[genderRaw.toLowerCase()];
      if (!gender) return { ok: false, line, error: `bad gender "${genderRaw}"` };
      const rating = RATINGS[ratingRaw.toLowerCase()];
      if (!rating) return { ok: false, line, error: `bad rating "${ratingRaw}"` };
      return { ok: true, line, player: { name, gender, rating } };
    });
}
