import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, guard } from "../../../../lib/server/root";

export const dynamic = "force-dynamic";

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const ls = (d) => { try { return readdirSync(d); } catch { return []; } };
const clip = (s, n = 400) => { const t = String(s ?? "").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

// GET ?id=<agent-id> → what that agent did: status changes, tasks it was given, its tool calls and messages
// (from studio/runs/*.jsonl), and Gemini runs (studio/runs/gemini/*.json). Newest first.
export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return Response.json({ error: "id tidak valid" }, { status: 400 });
  const out = [];

  for (const slug of ls(path.join(ROOT, "projects"))) {
    const st = readJson(path.join(ROOT, "projects", slug, "status.json"));
    for (const h of st?.history ?? []) if (h.agent === id) out.push({ at: h.at, kind: h.event, project: slug, text: h.note || "" });
  }

  const runsDir = path.join(ROOT, "studio", "runs");
  const ids = ls(runsDir).filter((f) => f.endsWith(".meta.json")).map((f) => f.replace(".meta.json", "")).sort().reverse().slice(0, 40);
  for (const rid of ids) {
    const meta = readJson(path.join(runsDir, `${rid}.meta.json`));
    let lines = [];
    try { lines = readFileSync(path.join(runsDir, `${rid}.jsonl`), "utf8").split("\n").filter(Boolean); } catch {}
    let current = null; // older runs have no `agent` field: attribute sub-events to the last agent called
    for (const l of lines) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      const call = e.t === "tool" && !e.sub && (e.name === "Agent" || e.name === "Task") ? String(e.detail).split(":")[0] : null;
      if (call) current = call;
      const who = e.agent ?? (call ?? (e.sub ? current : null));
      if (who !== id) continue;
      if (call) out.push({ at: e.at, kind: "task", project: meta?.project, text: clip(String(e.detail).slice(call.length + 1)) });
      else if (e.t === "tool") out.push({ at: e.at, kind: "tool", project: meta?.project, tool: e.name, text: clip(e.detail, 220) });
      else if (e.t === "text") out.push({ at: e.at, kind: "text", project: meta?.project, text: clip(e.text, 600) });
    }
  }

  const gdir = path.join(runsDir, "gemini");
  for (const f of ls(gdir).filter((f) => f.endsWith(`-${id}.json`))) {
    const g = readJson(path.join(gdir, f));
    if (!g) continue;
    const at = f.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d).*/, "$1-$2-$3T$4:$5:$6Z");
    let res = null; try { res = JSON.parse(g.stdout); } catch {}
    out.push({ at, kind: g.code === 0 ? "gemini" : "error", project: g.slug, text: clip(g.code === 0 ? `(${g.model}) ${res?.response ?? ""}` : `(${g.model}) gagal: ${res?.error?.message ?? g.stderr ?? ""}`, 600) });
  }

  out.sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1));
  return Response.json({ id, entries: out.slice(0, 80) });
}
