import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, guard } from "../../../lib/server/root";

export const dynamic = "force-dynamic";

const readJson = (f, fb) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return fb; } };
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

// A request for help from another floor ("Minta bantuan"): appended to projects/<slug>/permintaan.json.
// The panel then starts `/bantuan <slug> <id>`, which runs the guest agent (see .claude/commands/bantuan.md).
// Body: { slug, layanan, catatan }
export async function POST(req) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug ?? "");
  if (!SLUG.test(slug)) return Response.json({ error: "Proyek tidak valid." }, { status: 400 });
  const dir = path.join(ROOT, "projects", slug);
  const st = readJson(path.join(dir, "status.json"), null);
  if (!st) return Response.json({ error: `Proyek ${slug} tidak ditemukan.` }, { status: 404 });

  const roster = readJson(path.join(ROOT, "studio/roster.json"), {});
  const L = (roster.layanan ?? []).find((l) => l.id === body.layanan);
  if (!L) return Response.json({ error: "Layanan tidak dikenal." }, { status: 400 });
  if (L.status !== "aktif" || L.alur) return Response.json({ error: `${L.name} belum bisa diminta lewat tombol${L.catatan ? `: ${L.catatan}` : "."}` }, { status: 409 });
  if (!(L.untuk ?? []).includes(st.type ?? "konten")) return Response.json({ error: `${L.name} tidak tersedia untuk proyek jenis ini.` }, { status: 409 });

  const list = readJson(path.join(dir, "permintaan.json"), []);
  const open = list.find((x) => x.layanan === L.id && x.status !== "selesai" && !existsSync(path.join(dir, "layanan", `${x.id}-${x.layanan}`, "laporan.md")));
  if (open) return Response.json({ error: `Masih ada permintaan ${L.name} yang belum selesai (${open.id}).` }, { status: 409 });

  const id = `b${list.length + 1}`;
  const entry = { id, layanan: L.id, catatan: String(body.catatan ?? "").trim().slice(0, 2000), at: new Date().toISOString(), status: "diminta" };
  writeFileSync(path.join(dir, "permintaan.json"), JSON.stringify([...list, entry], null, 2) + "\n");
  return Response.json({ ...entry, name: L.name });
}
