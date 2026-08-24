"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";

/**
 * Shows how long a player has been waiting since their last game finished
 * ("waiting 23m 14s"), that they're on court, or that they haven't played
 * yet. Re-renders every second so the clock stays live.
 */
export function WaitBadge({
  lastPlayedAt,
  onCourt,
}: {
  lastPlayedAt: string | null;
  onCourt: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  if (onCourt) {
    return (
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">
        on court
      </span>
    );
  }
  if (!lastPlayedAt) {
    return <span className="text-xs text-faint">no games yet</span>;
  }
  if (now === null) return <span className="text-xs text-faint">waiting</span>;
  const label = formatDuration(now - new Date(lastPlayedAt).getTime());
  return <span className="text-xs text-faint tabular-nums">waiting {label}</span>;
}
