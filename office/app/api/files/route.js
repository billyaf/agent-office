import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ROOT, guard, inside } from "../../../lib/server/root";

export const dynamic = "force-dynamic";

// Files the web may show and edit. Each group lists a folder and which files in it count.
const GROUPS = [
  { id: "agents", label: "Agen", dir: ".claude/agents", match: /\.md$/ },
  { id: "commands", label: "Perintah", dir: ".claude/commands", match: /\.md$/ },
  { id: "taste", label: "Selera & studio", dir: "studio", match: /^(taste-profile\.md|config\.json|web-permissions\.json)$/ },
  { id: "client-klien-demo", label: "Klien: Klien Demo", dir: "studio/clients/klien-demo", match: /\.md$/ },
  { id: "templates", label: "Template", dir: "studio/templates", match: /\.md$/ },
  { id: "career", label: "Profil karier", dir: "career/profile", match: /\.(md|txt|json)$/ },
  { id: "career-misc", label: "Career Center", dir: "career", match: /^(config\.json|tracker\.md|README\.md)$/ },
];
const TEXT = /\.(md|txt|json)$/;
const READ_ONLY = /(^|\/)status\.json$/; // status.json changes only through scripts/status.mjs

function allowed(rel) {
  const norm = path.posix.normalize(rel.replaceAll("\\", "/"));
  if (norm.startsWith("..") || path.isAbsolute(norm) || !TEXT.test(norm)) return false;
  if (GROUPS.some((g) => path.posix.dirname(norm) === g.dir && g.match.test(path.posix.basename(norm)))) return true;
  return /^projects\/[a-z0-9][a-z0-9-]*\//.test(norm) || /^career\/(shortlist|linkedin)\//.test(norm) || /^studio\/trends\//.test(norm);
}

async function walk(rel, depth = 0) {
  const out = [];
  let entries = [];
  try { entries = await readdir(inside(rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = `${rel}/${e.name}`;
    if (e.isDirectory() && depth < 3) out.push(...(await walk(p, depth + 1)));
    else if (e.isFile() && TEXT.test(e.name)) out.push(p);
  }
  return out;
}

export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const rel = url.searchParams.get("path");
  if (!rel) {
    const groups = [];
    for (const g of GROUPS) {
      let names = [];
      try { names = (await readdir(inside(g.dir))).filter((n) => g.match.test(n)).sort(); } catch {}
      groups.push({ id: g.id, label: g.label, files: names.map((n) => `${g.dir}/${n}`) });
    }
    const slug = url.searchParams.get("project");
    if (slug && /^[a-z0-9][a-z0-9-]*$/.test(slug)) groups.push({ id: "project", label: `Proyek ${slug}`, files: (await walk(`projects/${slug}`)).sort() });
    groups.push({ id: "shortlist", label: "Shortlist lowongan", files: (await walk("career/shortlist")).sort().reverse() });
    return Response.json({ groups });
  }
  if (!allowed(rel)) return Response.json({ error: "File ini tidak bisa dibuka dari web." }, { status: 403 });
  try {
    const abs = inside(rel);
    const s = await stat(abs);
    if (s.size > 1_000_000) return Response.json({ error: "File terlalu besar." }, { status: 413 });
    return Response.json({ path: rel, content: await readFile(abs, "utf8"), readOnly: READ_ONLY.test(rel), modified: s.mtime });
  } catch {
    return Response.json({ error: "File tidak ditemukan." }, { status: 404 });
  }
}

export async function PUT(req) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  const { path: rel, content } = await req.json().catch(() => ({}));
  if (typeof rel !== "string" || typeof content !== "string") return Response.json({ error: "Data tidak lengkap." }, { status: 400 });
  if (!allowed(rel) || READ_ONLY.test(rel)) return Response.json({ error: "File ini tidak bisa diubah dari web." }, { status: 403 });
  if (rel.endsWith(".json")) { try { JSON.parse(content); } catch (e) { return Response.json({ error: `JSON tidak valid: ${e.message}` }, { status: 400 }); } }
  const abs = inside(rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
  return Response.json({ ok: true, path: rel, root: path.basename(ROOT) });
}
