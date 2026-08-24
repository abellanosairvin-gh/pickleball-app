import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSession, deleteSession, logout } from "@/lib/actions";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { ModePicker } from "@/components/ModePicker";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireAuth();
  const all = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.createdAt));
  const active = all.find((s) => s.status === "active");
  if (active) redirect(`/session/${active.id}`);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-8 flex items-end justify-between border-b-2 border-ink pb-4">
        <h1 className="font-display text-3xl leading-tight">
          Pickleball Session Tracker
        </h1>
        <form action={logout}>
          <button className="rounded-md border border-line bg-card px-3 py-2 text-sm font-medium text-muted hover:bg-paper">
            Sign out
          </button>
        </form>
      </div>

      <section className="mb-10 rounded-md border border-line bg-card p-5 shadow-[0_1px_0_#d9d2c2]">
        <h2 className="mb-4 font-display text-xl">New Session</h2>
        <form action={createSession} className="grid grid-cols-2 gap-4">
          <label className="col-span-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Session name
            <input
              name="name"
              placeholder="Tuesday Night Open Play"
              className="mt-1 w-full rounded-md border border-line bg-card p-2 text-base font-normal normal-case tracking-normal text-ink"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Courts
            <input
              name="courtCount"
              type="number"
              min={1}
              max={20}
              defaultValue={2}
              className="mt-1 w-full rounded-md border border-line bg-card p-2 text-base font-normal text-ink"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Game Cap (games per player)
            <input
              name="gameCap"
              type="number"
              min={1}
              max={30}
              defaultValue={6}
              className="mt-1 w-full rounded-md border border-line bg-card p-2 text-base font-normal text-ink"
            />
          </label>
          <ModePicker />
          <button
            type="submit"
            className="col-span-2 rounded-md bg-ink p-3 font-semibold text-card hover:bg-ink-deep"
          >
            Create Session
          </button>
        </form>
      </section>

      {all.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl">Past sessions</h2>
          <ul className="divide-y divide-rule rounded-md border border-line bg-card shadow-[0_1px_0_#d9d2c2]">
            {all.map((s) => (
              <li key={s.id} className="flex items-center">
                <Link
                  href={`/session/${s.id}`}
                  className="flex flex-1 items-center justify-between p-4 hover:bg-paper"
                >
                  <span className="font-display text-lg">{s.name}</span>
                  <span className="text-sm text-muted">
                    {s.createdAt.toLocaleDateString()}
                  </span>
                </Link>
                <form action={deleteSession} className="pr-4">
                  <input type="hidden" name="sessionId" value={s.id} />
                  <ConfirmSubmit
                    title={`Delete “${s.name}” forever?`}
                    message="All its players, games, and scores are permanently removed, and its spectator link stops working."
                    confirmLabel="Delete forever"
                    danger
                    className="rounded-md border border-[#e3c4b0] px-2.5 py-1.5 text-xs text-clay-deep hover:bg-[#f9e9df]"
                  >
                    Delete
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
