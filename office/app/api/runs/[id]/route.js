import { guard } from "../../../../lib/server/root";
import { getRun, publicRun, resolveDenial, stopRun } from "../../../../lib/server/runner";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await params;
  const run = getRun(id);
  if (!run) return Response.json({ error: "Tidak ditemukan" }, { status: 404 });
  const since = Math.max(0, Number(new URL(req.url).searchParams.get("since")) || 0);
  return Response.json(publicRun(run, since));
}

export async function DELETE(req, { params }) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  const { id } = await params;
  return Response.json({ stopped: stopRun(id) });
}

// Body: { resolve: rule } marks a permission request as answered.
export async function PATCH(req, { params }) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  const { id } = await params;
  const { resolve } = await req.json().catch(() => ({}));
  if (typeof resolve !== "string") return Response.json({ error: "Aturan tidak valid" }, { status: 400 });
  return Response.json({ ok: resolveDenial(id, resolve) });
}
