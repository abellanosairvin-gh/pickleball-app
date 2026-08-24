import type { PodiumEntry } from "@/lib/tournament";

const MEDALS = [
  { name: "Gold", fill: "#e3b341", rim: "#b8891e", ribbon: "#c2410c" },
  { name: "Silver", fill: "#cfd3d8", rim: "#8e959e", ribbon: "#475569" },
  { name: "Bronze", fill: "#d59a63", rim: "#9a5f2e", ribbon: "#7c3f16" },
] as const;

/** Medal icon by podium rank (0 = gold, 1 = silver, 2 = bronze); nothing past that. */
function Medal({ rank, size = 22 }: { rank: number; size?: number }) {
  const m = MEDALS[rank];
  if (!m) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label={`${m.name} medal`}
      role="img"
      className="inline-block shrink-0 align-[-0.2em]"
    >
      <path d="M8 1h3.5l-2.5 8H5.5z" fill={m.ribbon} />
      <path d="M16 1h-3.5l2.5 8h3.5z" fill={m.ribbon} opacity="0.8" />
      <circle cx="12" cy="15" r="7" fill={m.fill} stroke={m.rim} strokeWidth="1.5" />
      <circle cx="12" cy="15" r="4.2" fill="none" stroke={m.rim} strokeWidth="0.9" opacity="0.7" />
    </svg>
  );
}

/**
 * Final tournament placements, shared by the organizer console and the
 * spectator view: champions on top, runners-up laddered underneath. The top
 * three placements carry gold, silver and bronze medals.
 */
export function ChampionshipLadder({ podium }: { podium: PodiumEntry[] }) {
  if (podium.length === 0) return null;
  const [champions, ...runnersUp] = podium;
  return (
    <div className="overflow-hidden rounded-md border border-ink bg-card shadow-[0_1px_0_#d9d2c2]">
      <div className="border-b-2 border-ink bg-[#eef2e4] p-4 text-center">
        <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-clay">
          <Medal rank={0} size={26} />
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
            className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
              i > 0 ? "border-t border-rule" : ""
            }`}
          >
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              <Medal rank={i + 1} />
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
