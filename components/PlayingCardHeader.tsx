import { courtName } from "@/lib/format";
import type { Game } from "@/lib/schema";
import { BracketChip } from "./BracketChip";
import { RunningClock } from "./RunningClock";

/**
 * Header of an on-court game card: "COURT ONE" on the left, game number and
 * running clock on the right, bracket badge on its own line beneath.
 * Shared by the organizer Courts grid and the spectator Playing tab so both
 * wrap identically on narrow phones (the court name may wrap; the number +
 * clock never splits).
 */
export function PlayingCardHeader({
  court,
  seq,
  startedAt,
  label,
  stage,
}: {
  court: number;
  seq: number;
  /** ISO timestamp; null before the game has started. */
  startedAt: string | null;
  label: string | null;
  stage: Game["stage"];
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-clay">
          {courtName(court)}
        </span>
        <span className="whitespace-nowrap text-xs text-muted">
          No. {seq}
          {startedAt && (
            <>
              {" · "}
              <span className="font-semibold text-clay">
                <RunningClock since={startedAt} />
              </span>
            </>
          )}
        </span>
      </div>
      {label && <BracketChip block label={label} stage={stage} className="mt-2" />}
    </>
  );
}
