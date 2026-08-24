import { NextResponse } from "next/server";
import { buildSnapshot, getSessionByToken, loadSessionData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const session = await getSessionByToken(token);
  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const data = await loadSessionData(session.id);
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(
    buildSnapshot(data.session, data.players, data.games),
    { headers: { "Cache-Control": "no-store" } },
  );
}
