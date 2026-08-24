"use client";

import { useEffect, useState } from "react";

/**
 * Full-screen blocking overlay shown while a server action is in flight
 * (form submits and direct action calls both go through fetch with a
 * `next-action` header — background polling does not, so the spectator
 * view's refreshes never trigger it). Appears with a short delay so fast
 * actions don't flash.
 */
export function PendingOverlay() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const original = window.fetch;
    let active = 0;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      const isAction = headers.has("next-action");
      if (isAction) {
        active++;
        setPending(true);
      }
      const finish = () => {
        active--;
        // Linger so the overlay bridges into React committing the new UI.
        setTimeout(() => {
          if (active === 0) setPending(false);
        }, 350);
      };
      try {
        const res = await original(...args);
        if (isAction) {
          // Headers arriving isn't done — hold until the RSC payload has
          // fully streamed (a clone leaves the router's own read untouched).
          if (res.body) res.clone().arrayBuffer().then(finish, finish);
          else finish();
        }
        return res;
      } catch (err) {
        if (isAction) finish();
        throw err;
      }
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  return (
    <div
      aria-hidden={!pending}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-paper/70 backdrop-blur-[2px] transition-opacity duration-300 ${
        pending ? "opacity-100 delay-150" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-clay" />
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        One moment
      </p>
    </div>
  );
}
