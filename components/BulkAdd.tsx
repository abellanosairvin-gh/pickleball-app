"use client";

import { useMemo, useState, useTransition } from "react";
import { addPlayersBulk } from "@/lib/actions";
import { parseRoster } from "@/lib/roster";

const RATING_LABEL = { beginner: "Beginner", mid: "Mid", advanced: "Advanced" };

export function BulkAdd({ sessionId }: { sessionId: number }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const parsed = useMemo(() => parseRoster(text), [text]);
  const valid = parsed.filter((l) => l.ok);
  const invalid = parsed.filter((l) => !l.ok);

  const submit = () => {
    startTransition(async () => {
      await addPlayersBulk(
        sessionId,
        JSON.stringify(valid.flatMap((l) => (l.ok ? [l.player] : []))),
      );
      setText("");
    });
  };

  return (
    <div className="rounded-md border border-line bg-card p-4 shadow-[0_1px_0_#d9d2c2]">
      <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
        Add players
      </h3>
      <p className="mt-1 mb-2 text-xs text-muted">
        One per line: <code>Name, gender, rating</code> - e.g.{" "}
        <code>Sarah, F, mid</code> or <code>Marc, M, b</code>. Paste from a
        spreadsheet works too.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"Sarah, F, mid\nMarc, M, beginner\nAna, F, a"}
        className="w-full rounded-md border border-line bg-card p-2 font-mono text-sm"
      />
      {parsed.length > 0 && (
        <div className="mt-2 text-sm">
          {valid.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1">
              {valid.map(
                (l, i) =>
                  l.ok && (
                    <li
                      key={i}
                      className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs text-ink"
                    >
                      {l.player.name} · {l.player.gender} ·{" "}
                      {RATING_LABEL[l.player.rating]}
                    </li>
                  ),
              )}
            </ul>
          )}
          {invalid.map(
            (l, i) =>
              !l.ok && (
                <p key={i} className="text-xs text-clay-deep">
                  ✗ “{l.line}” - {l.error}
                </p>
              ),
          )}
        </div>
      )}
      <button
        onClick={submit}
        disabled={pending || valid.length === 0}
        className="mt-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-card hover:bg-ink-deep disabled:opacity-40"
      >
        {pending
          ? "Adding…"
          : `Add ${valid.length} player${valid.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
