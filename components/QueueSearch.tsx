"use client";

import { useState } from "react";

export type QueueSearchEntry = {
  id: number;
  /** The four player names in the game - what the search matches against. */
  names: string[];
  /** The server-rendered queue card (keeps its forms and queue position). */
  node: React.ReactNode;
};

/**
 * Search box over the queue (organizer and spectator): type a player's name
 * and only the queued games they're in stay visible. Cards are rendered by
 * the caller so the filter just hides the rest - ordinals and move buttons
 * keep referring to the real queue positions.
 */
export function QueueSearch({
  entries,
  listClassName = "space-y-2.5",
}: {
  entries: QueueSearchEntry[];
  /** Spacing between cards; the spectator list breathes a little more. */
  listClassName?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? entries.filter((e) => e.names.some((n) => n.toLowerCase().includes(q)))
    : entries;
  return (
    <div>
      <div className="relative mb-3">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a player's games"
          aria-label="Search queued games by player"
          className="w-full rounded-md border border-line bg-card py-2 pl-8 pr-3 text-sm text-ink placeholder:text-faint"
        />
        {q && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
            {shown.length} of {entries.length}
          </span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed border-dash p-4 text-sm text-faint">
          No queued games for &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <ol className={listClassName}>{shown.map((e) => e.node)}</ol>
      )}
    </div>
  );
}
