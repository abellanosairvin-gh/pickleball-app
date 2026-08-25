import type { ReactNode } from "react";

/**
 * Two serif name columns with "versus" between - the names row of every
 * game card (organizer Courts and Queue, spectator Playing and Queue).
 * Names are nodes so the organizer can colour over-cap players.
 */
export function MatchupNames({
  team1,
  team2,
  aside1,
  aside2,
  className,
}: {
  team1: [ReactNode, ReactNode];
  team2: [ReactNode, ReactNode];
  /** Sits between team 1 and "versus" (the organizer's score input). */
  aside1?: ReactNode;
  /** Sits between "versus" and team 2. */
  aside2?: ReactNode;
  className?: string;
}) {
  const gap = aside1 || aside2 ? "gap-2" : "gap-3";
  return (
    <div className={`flex items-center ${gap} ${className ?? ""}`.trim()}>
      <div className="min-w-0 flex-1 wrap-break-word hyphens-auto font-display text-xl leading-snug">
        {team1[0]}
        <br />
        {team1[1]}
      </div>
      {aside1}
      <div className="font-serif text-xs italic tracking-wide text-muted">
        versus
      </div>
      {aside2}
      <div className="min-w-0 flex-1 wrap-break-word hyphens-auto text-right font-display text-xl leading-snug">
        {team2[0]}
        <br />
        {team2[1]}
      </div>
    </div>
  );
}
