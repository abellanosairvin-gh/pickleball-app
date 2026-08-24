"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Header button that opens the spectator QR code in a dialog. */
export function QrPopup({
  qrDataUrl,
  publicUrl,
}: {
  qrDataUrl: string;
  publicUrl: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-line bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-paper"
      >
        QR code
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-md border border-line bg-card p-5 text-center shadow-[0_2px_0_#d9d2c2]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display text-xl leading-snug">
                Spectator view
              </h3>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
                Scan to follow live
              </p>
              <div className="mt-4 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="QR code to the spectator view"
                  className="rounded-md border border-line"
                />
              </div>
              <a
                href={publicUrl}
                className="mt-3 inline-block break-all text-sm text-clay underline"
              >
                {publicUrl}
              </a>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-paper"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
