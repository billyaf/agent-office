import { guard } from "../../../lib/server/root";
import { allowAlways, loadPermissions } from "../../../lib/server/runner";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  const { allow, deny } = loadPermissions();
  return Response.json({ allow, deny });
}

// Body: { rule } — adds a rule to studio/web-permissions.json so it is allowed from now on.
export async function POST(req) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  const { rule } = await req.json().catch(() => ({}));
  if (typeof rule !== "string" || !rule.trim() || rule.length > 500) return Response.json({ error: "Aturan tidak valid" }, { status: 400 });
  if (/^Bash\((rm|sudo)\b/.test(rule)) return Response.json({ error: "Perintah ini tidak bisa diizinkan permanen." }, { status: 400 });
  allowAlways(rule.trim());
  return Response.json(loadPermissions());
}
