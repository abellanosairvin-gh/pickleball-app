import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "pb_auth";

function expectedToken(): string {
  const secret = process.env.AUTH_SECRET ?? "dev-secret-change-me";
  return createHmac("sha256", secret).update("organizer-v1").digest("hex");
}

export async function isAuthed(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const expected = expectedToken();
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export async function requireAuth(): Promise<void> {
  if (!(await isAuthed())) redirect("/login");
}

export async function setAuthCookie(): Promise<void> {
  (await cookies()).set(COOKIE, expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function clearAuthCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export function checkCredentials(username: string, password: string): boolean {
  return (
    username === (process.env.ORGANIZER_USERNAME ?? "organizer") &&
    password.length > 0 &&
    password === process.env.ORGANIZER_PASSWORD
  );
}
