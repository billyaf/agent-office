import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { guard, inside } from "../../../lib/server/root";

export const dynamic = "force-dynamic";
const MAX = 200 * 1024 * 1024;

export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  const dir = inside(new URL(req.url).searchParams.get("target") === "career" ? "career/profile/sumber" : "inbox");
  let files = [];
  try {
    files = await Promise.all((await readdir(dir)).filter((n) => !n.startsWith(".")).map(async (n) => {
      const s = await stat(path.join(dir, n));
      return { name: n, size: s.size, modified: s.mtime, dir: s.isDirectory() };
    }));
  } catch {}
  return Response.json({ files: files.sort((a, b) => (a.modified < b.modified ? 1 : -1)) });
}

// multipart form: file (one or more), folder? (subfolder name inside inbox),
// target? = "career" saves into career/profile/sumber/ (CV, portfolio PDF; stays local, never committed)
const CAREER_TYPES = /\.(pdf|png|jpe?g|webp|md|txt)$/i;
export async function POST(req) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  const form = await req.formData();
  const career = form.get("target") === "career";
  const folder = String(form.get("folder") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const dir = inside(career ? "career/profile/sumber" : folder ? `inbox/${folder}` : "inbox");
  await mkdir(dir, { recursive: true });
  const saved = [];
  for (const f of form.getAll("file")) {
    if (typeof f === "string") continue;
    if (f.size > MAX) return Response.json({ error: `${f.name} lebih dari 200 MB.` }, { status: 413 });
    if (career && !CAREER_TYPES.test(f.name)) return Response.json({ error: `${f.name}: gunakan PDF, gambar, atau teks (Word: simpan sebagai PDF dulu).` }, { status: 415 });
    const name = path.basename(f.name).replace(/[^\w.\- ()]+/g, "_");
    await writeFile(path.join(dir, name), Buffer.from(await f.arrayBuffer()));
    saved.push(career ? `career/profile/sumber/${name}` : folder ? `${folder}/${name}` : name);
  }
  return Response.json({ saved });
}
