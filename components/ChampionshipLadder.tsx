import type { PodiumEntry } from "@/lib/tournament";

/**
 * Final tournament placements, shared by the organizer console and the
 * spectator view: champions on top, runners-up laddered underneath.
 */
export function ChampionshipLadder({ podium }: { podium: PodiumEntry[] }) {
  if (podium.length === 0) return null;
  const [champions, ...runnersUp] = podium;
  return (
    <div className="overflow-hidden rounded-md border border-ink bg-card shadow-[0_1px_0_#d9d2c2]">
      <div className="border-b-2 border-ink bg-[#eef2e4] p-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-clay">
          {champions.title}
        </p>
        <p className="mt-1 font-display text-2xl leading-snug">
          {champions.names[0]} &amp; {champions.names[1]}
        </p>
      </div>
      <ul>
        {runnersUp.map((e, i) => (
          <li
            key={e.title}
            className={`flex items-baseline justify-between gap-3 px-4 py-2.5 ${
              i > 0 ? "border-t border-rule" : ""
            }`}
          >
            <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {e.title}
            </span>
            <span className="text-right text-sm font-medium">
              {e.names[0]} &amp; {e.names[1]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
