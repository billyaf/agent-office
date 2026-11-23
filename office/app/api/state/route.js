import { readFile, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { guard } from "../../../lib/server/root";

export const dynamic = "force-dynamic";

// The office app lives in <studio>/office; studio data sits one level up.
const ROOT = resolve(process.cwd(), "..");

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

const ARSIP_LOG = join(homedir(), "work/design_project/arsip/log-arsip.csv");

// Minimal RFC 4180 reader for the archivist's log (quoted fields may hold commas and newlines).
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head = [], ...body] = rows;
  return body.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^\uFEFF/, ""), r[i] ?? ""])));
}
async function archiveRows() {
  try { return parseCsv(await readFile(ARSIP_LOG, "utf8")); } catch { return []; }
}

async function helpRequests(dir) {
  const list = await readJson(join(dir, "permintaan.json"), null);
  if (!Array.isArray(list)) return null;
  return list.slice(-12).map((x) => {
    const sub = `${x.id}-${x.layanan}`;
    const out = join(dir, "layanan", sub);
    let images = [];
    try { images = readdirSync(out).filter((n) => /\.(png|jpe?g)$/i.test(n)).slice(0, 6); } catch {}
    return { ...x, dir: sub, laporan: existsSync(join(out, "laporan.md")), images };
  });
}

// Files written by agents next to status.json: the PM's questions (shown as a form at CP fakta),
// the schedule (posting calendar) and which stage outputs exist.
async function extras(slug, rows) {
  const dir = join(ROOT, "projects", slug);
  const questions = await readJson(join(dir, "pertanyaan.json"), null);
  const jadwal = await readJson(join(dir, "jadwal.json"), null);
  const row = jadwal?.arsip_id ? rows.find((r) => r.id === jadwal.arsip_id) : null;
  return {
    questions: Array.isArray(questions) ? questions.filter((q) => q && q.id && q.tanya).slice(0, 12) : null,
    jadwal,
    video: await readJson(join(dir, "video.json"), null),
    proyek: await readJson(join(dir, "proyek.json"), null),
    // Help requested from other floors, with what the guest delivered (laporan.md + images in layanan/<id>-<layanan>/).
    permintaan: await helpRequests(dir),
    files: Object.fromEntries(["jawaban-fakta.md", "copy.md", "02_final.md", "03_qa.md", "04_pengajuan.md", "00_ide.md", "01_script.md", "02_storyboard.md", "02_render.md", "03_qc.md", "04_upload.md",
      "00_konsep.md", "01_naskah.md", "03_render.md", "04_review.md", "05_publish.md", "00_rencana.md", "02_produksi.md", "03_ekspor.md"].map((f) => [f, existsSync(join(dir, f))])),
    arsip: row ? { id: row.id, status: row.status, versi: row.versi, tayang: row.tanggal_tayang, tautan: row.tautan_post, rencana: row.tanggal_tayang_rencana } : null,
  };
}

export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  const roster = await readJson(join(ROOT, "studio/roster.json"), { divisions: {}, agents: [], meetingRooms: [] });
  const library = await readJson(join(ROOT, "studio/library.json"), { references: [], archivedProjects: [] });

  let slugs = [];
  try {
    slugs = (await readdir(join(ROOT, "projects"), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {}
  const rows = await archiveRows();
  const projects = (
    await Promise.all(slugs.map(async (s) => {
      const st = await readJson(join(ROOT, "projects", s, "status.json"), null);
      return st && { ...st, ...(await extras(s, rows)) };
    }))
  ).filter(Boolean);

  return Response.json(
    {
      roster,
      projects,
      archived: library.archivedProjects ?? [],
      references: (library.references ?? []).length,
      serverTime: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
