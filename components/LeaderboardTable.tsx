import { Fragment } from "react";
import type { LeaderboardRow } from "@/lib/queries";

/**
 * Standings table shared by the organizer console and the spectator view.
 * With `qualifyCount`, the top N rows are tinted green (qualified for the
 * playoffs) and a "Playoff cut" rule separates them from the rest.
 */
export function LeaderboardTable({
  rows,
  qualifyCount,
}: {
  rows: LeaderboardRow[];
  qualifyCount?: number;
}) {
  const cut = qualifyCount ?? 0;
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-card shadow-[0_1px_0_#d9d2c2]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.14em] text-muted">
            <th className="p-2.5 font-semibold">Player</th>
            <th className="p-2.5 text-center font-semibold">W</th>
            <th className="p-2.5 text-center font-semibold">L</th>
            <th className="p-2.5 text-center font-semibold">PF</th>
            <th className="p-2.5 text-center font-semibold">PA</th>
            <th className="p-2.5 text-center font-semibold">+/−</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r, i) => {
            const qualified = cut > 0 && i < cut;
            return (
              <Fragment key={r.playerId}>
                <tr
                  className={`border-b border-rule ${
                    qualified ? "bg-[#eef2e4]" : ""
                  }`}
                >
                  <td className="p-2.5 font-medium">
                    <span className="mr-1.5 text-faint">{i + 1}.</span>
                    {r.name}
                    {r.out && (
                      <span className="ml-2 rounded-full border border-[#c94f4f] bg-[#fbe9e7] px-1.5 py-px align-middle text-[9px] font-bold uppercase tracking-[0.12em] text-[#9b2c2c]">
                        Out
                      </span>
                    )}
                    {r.results.length > 0 && (
                      <span
                        title={r.results.join(" ")}
                        className="ml-2 inline-flex items-center gap-0.5 align-middle"
                      >
                        {r.results.map((res, j) => (
                          <span
                            key={j}
                            className={`inline-block h-1.5 w-2.5 rounded-full ${
                              res === "W" ? "bg-ink" : "bg-clay"
                            }`}
                          />
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-center">{r.wins}</td>
                  <td className="p-2.5 text-center">{r.losses}</td>
                  <td className="p-2.5 text-center">{r.pointsFor}</td>
                  <td className="p-2.5 text-center">{r.pointsAgainst}</td>
                  <td className="p-2.5 text-center">
                    {r.diff > 0 ? `+${r.diff}` : r.diff}
                  </td>
                </tr>
                {cut > 0 && i === cut - 1 && i < rows.length - 1 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="border-b-2 border-dashed border-dash bg-paper p-1 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-clay"
                    >
                      Playoff cut
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
