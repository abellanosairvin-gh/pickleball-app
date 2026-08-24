import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { login } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAuthed()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="font-display text-3xl leading-tight">
        Pickleball Session Tracker
      </h1>
      <p className="mt-1 mb-6 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Organizer sign-in
      </p>
      {error && (
        <p className="mb-4 rounded-md border border-[#e3c4b0] bg-[#f9e9df] p-3 text-sm text-clay-deep">
          Wrong username or password.
        </p>
      )}
      <form
        action={login}
        className="flex flex-col gap-3 rounded-md border border-line bg-card p-4 shadow-[0_1px_0_#d9d2c2]"
      >
        <input
          name="username"
          placeholder="Username"
          autoComplete="username"
          className="rounded-md border border-line bg-card p-3"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          className="rounded-md border border-line bg-card p-3"
        />
        <button
          type="submit"
          className="rounded-md bg-ink p-3 font-semibold text-card hover:bg-ink-deep"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
