"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Submit button that opens a Club Paper confirmation dialog before letting
 * the form action run. `danger` styles the confirm button in terracotta for
 * destructive actions.
 */
export function ConfirmSubmit({
  message,
  title,
  confirmLabel,
  danger,
  className,
  children,
}: {
  message: string;
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const confirm = () => {
    setOpen(false);
    // requestSubmit runs the form's action without re-firing this click handler.
    btnRef.current?.form?.requestSubmit(btnRef.current);
  };

  return (
    <>
      <button
        type="submit"
        ref={btnRef}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
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
              className="w-full max-w-sm rounded-md border border-line bg-card p-5 shadow-[0_2px_0_#d9d2c2]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display text-xl leading-snug">
                {title ?? "Are you sure?"}
              </h3>
              <p className="mt-2 text-sm text-muted">{message}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-card ${
                    danger
                      ? "bg-clay hover:bg-clay-deep"
                      : "bg-ink hover:bg-ink-deep"
                  }`}
                >
                  {confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
