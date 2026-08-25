import type { Game } from "@/lib/schema";

/**
 * Tournament badge ("Championship", "Men battle for top 4"). Medal games
 * (final / bronze) read in clay; qualifier rounds stay muted. Hook-free so
 * the organizer (server) page and the spectator (client) app share one copy.
 *
 * `block` gives the chip its own line (a single `w-fit` element - no wrapper).
 * Inline chips never break mid-pill; wrap the row with `flex-wrap` instead.
 */
export function BracketChip({
  label,
  stage,
  block = false,
  className,
}: {
  label: string;
  stage: Game["stage"];
  block?: boolean;
  className?: string;
}) {
  const tone =
    stage === null
      ? "border-line bg-paper text-muted"
      : "border-clay-line bg-clay-tint font-bold text-clay-deep";
  return (
    <span
      className={`${block ? "block w-fit" : "inline-block"} whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${tone} ${className ?? ""}`.trim()}
    >
      {label}
    </span>
  );
}
