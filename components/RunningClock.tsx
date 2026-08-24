"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";

/**
 * Live elapsed time since `since` ("5m 32s"), ticking every second.
 * Renders nothing until mounted so server and client HTML match.
 */
export function RunningClock({ since }: { since: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  return (
    <span className="tabular-nums">
      {formatDuration(now - new Date(since).getTime())}
    </span>
  );
}
