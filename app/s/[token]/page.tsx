import { SpectatorApp } from "@/components/SpectatorApp";

export const dynamic = "force-dynamic";

export default async function SpectatorPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SpectatorApp token={token} />;
}
