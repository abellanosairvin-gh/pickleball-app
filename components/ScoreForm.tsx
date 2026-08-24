"use client";

import { useState } from "react";

/**
 * Score-entry form that validates before submitting: no ties, and the
 * winning score must be exactly `winningScore` (11 by default; tournaments
 * play to 15). Shows an inline message on failure.
 */
export function ScoreForm({
  action,
  className,
  children,
  onValid,
  winningScore = 11,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
  /** Called when a submit passes validation (e.g. to close a popup). */
  onValid?: () => void;
  winningScore?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        const form = e.currentTarget;
        const val = (name: string) =>
          Number((form.elements.namedItem(name) as HTMLInputElement).value);
        const s1 = val("score1");
        const s2 = val("score2");
        if (s1 === s2) {
          e.preventDefault();
          setError("No ties - one side has to win.");
        } else if (Math.max(s1, s2) !== winningScore) {
          e.preventDefault();
          setError(
            `Games go to ${winningScore} - the winning score must be ${winningScore}.`,
          );
        } else {
          setError(null);
          onValid?.();
        }
      }}
    >
      {children}
      {error && (
        <p className="mt-2 text-xs font-medium normal-case tracking-normal text-clay-deep">
          {error}
        </p>
      )}
    </form>
  );
}
