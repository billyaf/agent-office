import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { ROOT, guard } from "../../../lib/server/root";
import { activeRun, isProject, listRuns, publicRun, startRun } from "../../../lib/server/runner";

export const dynamic = "force-dynamic";

const status = (...args) => execFileSync("node", [path.join(ROOT, "scripts/status.mjs"), ...args], { cwd: ROOT, encoding: "utf8", timeout: 8000 });
const readStatus = (slug) => { try { return JSON.parse(readFileSync(path.join(ROOT, "projects", slug, "status.json"), "utf8")); } catch { return null; } };

// Paid / heavy commands come from studio/roster.json: gerbangBiaya[type] names the approval that unlocks them
// (setelahSetuju = how many approvals came before it) and biaya[id].perintah the Bash rules granted to that
// one run only. An empty perintah list means the owner has not chosen the account yet: nothing is granted
// and the orchestrator is told to stop and ask.
const TYPES = ["konten", "konten-motion", "tiktok", "explainer", "stock", "magnific"];
function paidGate(type) {
  const r = readJson(path.join(ROOT, "studio/roster.json")) ?? {};
  const g = r.gerbangBiaya?.[type];
  if (!g) return null;
  const b = r.biaya?.[g.biaya] ?? {};
  const allow = (b.perintah ?? []).map((x) => String(x).replace(/~(?=\/)/g, homedir())).filter((x) => /^Bash\(.+\)$/.test(x));
  return { after: Number(g.setelahSetuju), cp: g.cp, label: b.label ?? g.biaya, allow, note: b.catatan };
}
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

// Answers from the CP fakta form → projects/<slug>/jawaban-fakta.md, read by the PM (research) and the copywriter.
function writeAnswers(slug, st, answers) {
  const qs = readJson(path.join(ROOT, "projects", slug, "pertanyaan.json"));
  if (!Array.isArray(qs) || !answers || typeof answers !== "object") return null;
  const when = new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" });
  let search = 0, answered = 0;
  const parts = qs.filter((q) => q?.id && q?.tanya).map((q, i) => {
    const a = answers[q.id] ?? {};
    const text = String(a.text ?? "").trim().slice(0, 2000);
    const cari = !!a.cari;
    if (text) answered++;
    if (cari) search++;
    const next = text && cari ? "pakai jawaban pemilik; PM boleh melengkapi dari internet" : text ? "pakai jawaban pemilik" : cari ? "**cari di internet** (project-manager)" : "belum ada data → placeholder";
    return `## ${i + 1}. ${q.tanya}\n- **Jawaban pemilik:** ${text ? text.split("\n").map((l) => l.trim()).join(" / ") : "(kosong)"}\n- **Boleh cari di internet:** ${cari ? "ya" : "tidak"}\n- **Tindak lanjut:** ${next}\n`;
  });
  const md = `# Jawaban CP fakta: ${st.name}\n\nDiisi pemilik lewat formulir web, ${when} WIB. Jawaban pemilik mengalahkan brief. Hasil riset PM ditulis di bawah pertanyaannya.\n\n${parts.join("\n")}`;
  writeFileSync(path.join(ROOT, "projects", slug, "jawaban-fakta.md"), md);
  return { search, answered, total: parts.length };
}

export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  return Response.json({ runs: listRuns() });
}

// Body: { prompt, label?, resume?: sessionId, project?: slug, allow?: [rule], chrome?: bool, newProject?: { slug, name } }
// With `project` (and no `resume`) the run continues that project's saved Claude session.
export async function POST(req) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  let prompt = String(body.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "Perintah kosong." }, { status: 400 });
  if (prompt.length > 20000) return Response.json({ error: "Perintah terlalu panjang." }, { status: 400 });

  const busy = activeRun();
  if (busy) return Response.json({ error: `Agen masih bekerja di "${busy.label}". Tunggu sampai selesai atau hentikan dulu di tab Chat.` }, { status: 409 });

  // New project from the web form: open its status first, so the office shows the PM working from the first minute.
  if (body.newProject) {
    const { slug, name } = body.newProject;
    const type = TYPES.includes(body.newProject.type) ? body.newProject.type : "konten";
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug ?? "") || !String(name ?? "").trim()) return Response.json({ error: "Nama proyek tidak valid." }, { status: 400 });
    if (existsSync(path.join(ROOT, "projects", slug, "status.json"))) return Response.json({ error: `Proyek "${slug}" sudah ada. Pakai nama lain, atau lanjutkan proyek itu dari tab Studio.` }, { status: 409 });
    try { status(slug, "init", type, String(name).trim().slice(0, 120), "meeting-1"); }
    catch (e) { return Response.json({ error: `Gagal membuka proyek: ${e.stderr || e.message}` }, { status: 500 }); }
    // Brand and guest crew (collaboration across floors), read by the panel and the agents.
    const r = readJson(path.join(ROOT, "studio/roster.json")) ?? {};
    const merek = (r.brands ?? []).some((b) => b.id === body.newProject.merek) ? body.newProject.merek : null;
    const layanan = (r.layanan ?? []).find((l) => l.id === body.newProject.layanan && l.status === "aktif");
    if (merek || layanan) writeFileSync(path.join(ROOT, "projects", slug, "proyek.json"), JSON.stringify({ merek, layanan: layanan?.id ?? null, tamu: layanan?.agents ?? [] }, null, 2) + "\n");
    body.project = slug;
  }

  // A checkpoint answer is recorded here, before the orchestrator starts, so the card disappears at once
  // and a second click cannot approve the same checkpoint twice.
  let paidAllow = [];
  const cp = prompt.match(/^\/checkpoint\s+([a-z0-9][a-z0-9-]*)\s+(setuju|revisi)\b\s*([\s\S]*)$/);
  if (cp) {
    const [, slug, decision, note] = cp;
    const st = readStatus(slug);
    if (!st) return Response.json({ error: `Proyek ${slug} tidak ditemukan.` }, { status: 404 });
    if (st.phase !== "checkpoint") return Response.json({ error: "Checkpoint ini sudah dijawab. Lihat kemajuannya di tab Chat." }, { status: 409 });
    // TikTok: approving CP script (the 2nd approval) is the owner's go-ahead for the paid ElevenLabs voice over,
    // so this one run may call vo/produce. Every other run still gets those commands denied.
    const approvals = (st.history ?? []).filter((h) => h.event === "decision" && h.decision === "setuju").length;
    const gate = paidGate(st.type);
    if (gate && decision === "setuju" && approvals === gate.after) {
      paidAllow = gate.allow;
      prompt += gate.allow.length
        ? `\n\nGerbang biaya ${gate.cp} disetujui: run ini boleh memakai ${gate.label}.`
        : `\n\nGerbang biaya ${gate.cp}: ${gate.label} belum bisa dipakai. ${gate.note ?? ""} Kerjakan tahap berikutnya TANPA layanan berbayar itu bila alurnya mengizinkan, dan sebutkan di laporan bahwa pemilik perlu memutuskannya.`;
    }
    let summary = null;
    try { summary = writeAnswers(slug, st, body.answers); }
    catch (e) { return Response.json({ error: `Gagal menyimpan jawaban: ${e.message}` }, { status: 500 }); }
    try { status(slug, "decision", decision, [note.trim(), summary ? `(${summary.answered}/${summary.total} pertanyaan dijawab, ${summary.search} dicari di internet)` : ""].filter(Boolean).join(" ")); }
    catch (e) { return Response.json({ error: `Gagal mencatat keputusan: ${e.stderr || e.message}` }, { status: 500 }); }
    if (summary) prompt = `${prompt}\n\nJawaban formulir CP fakta tersimpan di projects/${slug}/jawaban-fakta.md: ${summary.answered} dari ${summary.total} pertanyaan dijawab pemilik, ${summary.search} boleh dicari di internet${summary.search ? " (panggil project-manager untuk meriset pertanyaan itu sebelum copywriter)" : ""}.`;
  }

  const resume = body.resume && /^[0-9a-f-]{36}$/i.test(body.resume) ? body.resume : undefined;
  const allow = [...(Array.isArray(body.allow) ? body.allow.filter((r) => typeof r === "string" && r.length < 500) : []), ...paidAllow];
  const project = isProject(body.project) ? body.project : undefined;
  const run = startRun({ prompt, label: body.label, resume, project, extraAllow: allow, chrome: !!body.chrome });
  return Response.json(publicRun(run));
}
