"use client";

import { useState } from "react";

type TabDef = { key: string; label: string };

/**
 * Client-side tabs for the organizer console. All panels stay mounted (hidden
 * via CSS) so open forms and typed values survive switching tabs.
 */
export function OrganizerTabs({
  tabs,
  panels,
}: {
  tabs: TabDef[];
  panels: Record<string, React.ReactNode>;
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div>
      <nav className="sticky top-0 z-10 mb-5 flex overflow-hidden rounded-md border border-line bg-card shadow-[0_1px_0_#d9d2c2]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`flex-1 border-b-2 p-3 text-[13px] uppercase tracking-[0.1em] ${
              active === t.key
                ? "border-clay font-bold text-ink"
                : "border-transparent font-medium text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tabs.map((t) => (
        <div key={t.key} className={active === t.key ? undefined : "hidden"}>
          {panels[t.key]}
        </div>
      ))}
    </div>
  );
}
