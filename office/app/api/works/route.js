import { guard } from "../../../lib/server/root";
import { CLIENTS, listWork, recentWorks } from "../../../lib/server/works";

export const dynamic = "force-dynamic";

// GET ?slug=x → output files of one project; no slug → recent output folders of a client (?client=klien-demo|kanaldemo)
export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const slug = q.get("slug");
  if (!slug) return Response.json({ recent: recentWorks(CLIENTS.includes(q.get("client")) ? q.get("client") : "klien-demo") }, { headers: { "Cache-Control": "no-store" } });
  const w = listWork(slug);
  if (!w) return Response.json({ error: "slug tidak valid" }, { status: 400 });
  const { dir, ...pub } = w;
  return Response.json(pub, { headers: { "Cache-Control": "no-store" } });
}
