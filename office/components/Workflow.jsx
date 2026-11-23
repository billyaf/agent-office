"use client";
import { useEffect, useState } from "react";
import { FLOWS, FLOW_TASKS, flowOf } from "../lib/flows";

// Panel pieces that follow the Klien Demo content workflow:
// brief + fact check → [CP fakta] → copy → design → visual QA → [CP hasil] → submission package → archive.

export const STAGES = [
  { id: "brief", label: "Brief & riset", agent: "project-manager", before: 1 },
  { id: "cp1", label: "CP fakta", cp: 1 },
  { id: "copy", label: "Copy", agent: "copywriter" },
  { id: "design", label: "Desain", agent: "senior-graphic-designer" },
  { id: "qa", label: "Visual QA", agent: "visual-qa" },
  { id: "cp2", label: "CP hasil", cp: 2 },
  { id: "ajuan", label: "Paket ajuan", agent: "project-manager", after: 2, file: "04_pengajuan.md" },
  { id: "arsip", label: "Arsip", agent: "digital-asset-manager" },
];

// Floor 2, TikTok @kanal.demo: one video per project. The motion designer works twice
// (free draft storyboard before CP script, paid voice over + render after it).
export const TIKTOK_STAGES = [
  { id: "ide", label: "Ide", agent: "tiktok-strategist", before: 1 },
  { id: "cp1", label: "Pilih ide", cp: 1 },
  { id: "script", label: "Script", agent: "tiktok-scriptwriter", before: 2 },
  { id: "story", label: "Storyboard", agent: "tiktok-motion-designer", before: 2, file: "02_storyboard.md" },
  { id: "cp2", label: "CP script", cp: 2 },
  { id: "render", label: "VO & render", agent: "tiktok-motion-designer", after: 2, file: "02_render.md" },
  { id: "qc", label: "QC", agent: "tiktok-qc" },
  { id: "cp3", label: "CP hasil", cp: 3 },
  { id: "upload", label: "Upload", agent: "tiktok-publisher", done: (p) => !!p.jadwal?.tautan },
];
export const stagesFor = (type) => FLOWS[type]?.stages ?? (type === "tiktok" ? TIKTOK_STAGES : STAGES);
const CP_NAMES = { konten: ["Checkpoint fakta", "Checkpoint hasil"], tiktok: ["Pilih ide", "CP script", "CP hasil"] };

// done / now / wait (checkpoint waiting for the owner) / stuck (agent stopped before reporting) / todo
export const isStuck = (a) => a?.state === "idle" && /^Terhenti/.test(a.note ?? "");
export function stageStates(p) {
  const approvals = (p.history ?? []).filter((h) => h.event === "decision" && h.decision === "setuju").length;
  const cps = (p.history ?? []).filter((h) => h.event === "checkpoint").length;
  const out = {};
  for (const s of stagesFor(p.type)) {
    if (s.agent) {
      const a = p.agents?.[s.agent];
      let v = a?.state === "working" ? "now" : a?.state === "done" ? "done" : isStuck(a) ? "stuck" : "todo";
      // An agent that works in two stages (PM: brief + package; motion designer: storyboard + render) is told apart
      // by the number of approvals: `before` = only until that approval, `after` = only from it (done once its file exists).
      if (s.before != null) {
        if (approvals >= s.before || (v === "todo" && cps >= s.before) || (s.file && p.files?.[s.file] && v !== "now")) v = "done";
      }
      if (s.after != null) v = p.files?.[s.file] ? "done" : approvals >= s.after && v !== "done" ? v : "todo";
      if (s.id === "arsip" && p.arsip) v = "done";
      if (s.done?.(p)) v = "done";
      out[s.id] = v;
    } else {
      out[s.id] = approvals >= s.cp ? "done" : p.phase === "checkpoint" && cps === s.cp ? "wait" : "todo";
    }
  }
  return out;
}

export function useWork(slug) {
  const [w, setW] = useState(null);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    const load = () => fetch(`/api/works?slug=${encodeURIComponent(slug)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => alive && setW(j)).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [slug]);
  return w;
}

const imgUrl = (slug, file) => `/api/works/img?slug=${encodeURIComponent(slug)}&file=${encodeURIComponent(file)}`;
const galleryUrl = (w, file) => (w.client !== "klien-demo" ? `/api/works/img?client=${w.client}&folder=${encodeURIComponent(w.slug)}&file=${encodeURIComponent(file)}` : imgUrl(w.slug, file));
const TALL = new Set(["kanaldemo", "explainer"]);

function VideoPlayer({ slug, work }) {
  const v = work?.videos?.[0];
  if (!v) return null;
  const poster = work.images.find((i) => i.name === "qc/awal.png");
  return (
    <video className="vid" controls preload="none" playsInline src={imgUrl(slug, v.name)} poster={poster ? `${imgUrl(slug, poster.name)}&w=540` : undefined}>
      <track kind="captions" />
    </video>
  );
}

export function Thumbs({ slug, images, max = 6 }) {
  const shown = images.filter((i) => !i.preview).slice(0, max);
  if (!shown.length) return null;
  return (
    <div className="thumbs">
      {shown.map((i) => (
        <a key={i.name} href={imgUrl(slug, i.name)} target="_blank" rel="noreferrer" title={i.name}>
          <img src={`${imgUrl(slug, i.name)}&t=${Math.round(i.mtime)}&w=320`} alt={i.name} loading="lazy" decoding="async" />
        </a>
      ))}
    </div>
  );
}

const GUEST_FROM = { tiktok: "TikTok Studio", explainer: "Explainer3D Studio", design: "Design Studio", adobestock: "Adobe Stock", magnific: "Magnific" };
const STATE_WORD = { done: "selesai", now: "sedang dikerjakan", wait: "menunggu jawaban Anda", stuck: "terhenti", todo: "belum" };
function Pipeline({ p }) {
  const st = stageStates(p);
  const STAGES = stagesFor(p.type);
  const stuck = STAGES.filter((s) => st[s.id] === "stuck");
  return (
    <>
      <ol className="pipe" aria-label="Tahap alur konten">
        {STAGES.map((s) => (
          <li key={s.id} className={`${st[s.id]}${s.cp ? " cp" : ""}${s.tamu ? " tamu" : ""}`} title={`${s.label}: ${STATE_WORD[st[s.id]]}${s.tamu ? ` · tamu dari ${GUEST_FROM[s.tamu] ?? s.tamu}` : ""}`}>
            <i aria-hidden>{st[s.id] === "done" ? "✓" : st[s.id] === "wait" ? "?" : st[s.id] === "stuck" ? "!" : ""}</i>
            <span>{s.label}{s.tamu && <em className="tamu-tag">tamu</em>}</span>
          </li>
        ))}
      </ol>
      {p.phase === "checkpoint" && p.checkpoint && <p className="why wait small"><b>?</b> Menunggu jawaban Anda: {p.checkpoint.question} Jawab di kartu <b>Perlu Anda</b> di atas.</p>}
      {stuck.map((s) => <p key={s.id} className="why stuck small"><b>!</b> {s.label}: {p.agents[s.agent].note}</p>)}
    </>
  );
}

const SIZES = { "4:5 (1080×1350)": "4:5 1080×1350", "9:16 reels (1080×1920 + grid 3:4)": "9:16 1080×1920 dengan pratinjau grid 3:4", "16:9 lanskap (1920×1080)": "lanskap 16:9 1920×1080" };

export function ProjectCard(props) {
  return flowOf(props.p.type) ? <FlowCard {...props} /> : <ClassicCard {...props} />;
}

// Card for the data-driven floors (Explainer3D, Adobe Stock, Magnific).
function FlowCard({ p, runner, go, openFile, layanan }) {
  const F = flowOf(p.type);
  const work = useWork(p.slug);
  const [more, setMore] = useState(false);
  const [note, setNote] = useState("");
  const busy = runner.running;
  const ask = (text, label) => go(`Proyek ${p.type} ${p.slug}: ${text}`, `${p.name}: ${label}`, false, p.slug);
  return (
    <li className="proj wf">
      <div className="row-between">
        <b>{p.name}</b>
        <span className="muted small">{p.phase === "checkpoint" ? "menunggu Anda" : "berjalan"}</span>
      </div>
      <Collab p={p} F={F} />
      <Pipeline p={p} />
      <VideoPlayer slug={p.slug} work={work} />
      {work?.images?.length > 0 && <Thumbs slug={p.slug} images={work.images} max={6} />}
      <p className="muted small">{work?.exists ? F.folderHint(work) : `Folder ${F.noun} belum dibuat.`}</p>
      <Schedule p={p} />
      <Bantuan p={p} layanan={layanan} runner={runner} go={go} openFile={openFile} />
      <div className="row">
        <button type="button" className="btn ghost sm" disabled={busy || p.phase === "checkpoint"} onClick={() => go(`/lanjut ${p.slug}`, `Lanjut ${p.name}`, false, p.slug)}>Lanjutkan</button>
        <button type="button" className="btn ghost sm" onClick={() => openFile(`projects/${p.slug}/${F.mainFile(p)}`, p.slug)}>File proyek</button>
        {F.extraFiles.filter(([f]) => p.files?.[f]).map(([f, label]) => <button key={f} type="button" className="btn ghost sm" onClick={() => openFile(`projects/${p.slug}/${f}`, p.slug)}>{label}</button>)}
        <button type="button" className="btn ghost sm" onClick={() => setMore((m) => !m)} aria-expanded={more}>Aksi</button>
      </div>
      {more && (
        <div className="stack actions">
          <div className="row">
            {F.actions.map(([label, text]) => <button key={label} type="button" className="btn ghost sm" disabled={busy} onClick={() => (text.endsWith(": ") ? note.trim() && ask(text + note.trim(), label) : ask(text, label))}>{label}</button>)}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { ask(`revisi dari pemilik: "${note.trim()}". ${F.revise}`, "revisi"); setNote(""); } }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={F.revisePlaceholder} aria-label="Catatan revisi" />
            <button type="submit" className="btn sm" disabled={busy || !note.trim()}>Revisi</button>
          </form>
        </div>
      )}
    </li>
  );
}

// "Minta bantuan lantai lain": requests from studio/roster.json `layanan` (aktif, not tied to a full flow, offered
// for this project type and by another floor), their status, and what the guest delivered.
const FLOOR_OF_TYPE = { konten: "design", "konten-motion": "design", tiktok: "tiktok", explainer: "explainer", stock: "adobestock", magnific: "magnific" };
function Bantuan({ p, layanan = [], runner, go, openFile }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const type = p.type ?? "konten";
  const home = FLOOR_OF_TYPE[type];
  const offer = layanan.filter((l) => l.floor !== home && (l.untuk ?? []).includes(type) && !l.alur);
  const reqs = p.permintaan ?? [];
  if (!offer.length && !reqs.length) return null;
  const L = offer.find((l) => l.id === pick);
  const byId = Object.fromEntries(layanan.map((l) => [l.id, l]));
  const submit = async (e) => {
    e.preventDefault();
    if (!L) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/layanan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: p.slug, layanan: L.id, catatan: note }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Gagal mencatat permintaan");
      const ok = await go(`/bantuan ${p.slug} ${j.id}`, `${p.name}: bantuan ${L.name}`, false, p.slug);
      if (ok !== false) { setOpen(false); setPick(""); setNote(""); }
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const stateOf = (r) => {
    if (r.laporan) return ["done", "selesai"];
    const agents = byId[r.layanan]?.agents ?? [];
    if (agents.some((a) => p.agents?.[a]?.state === "working")) return ["now", "sedang dikerjakan"];
    return ["todo", "menunggu giliran"];
  };
  return (
    <div className="bantuan">
      {reqs.length > 0 && (
        <ul className="bantuan-list">
          {reqs.map((r) => {
            const [cls, word] = stateOf(r);
            const S = byId[r.layanan];
            return (
              <li key={r.id} className={cls}>
                <span><em className="tamu-tag">tamu</em> <b>{S?.name ?? r.layanan}</b> · {GUEST_FROM[S?.floor] ?? S?.floor} · {word}</span>
                {r.catatan && <span className="muted small">“{r.catatan}”</span>}
                {r.images?.length > 0 && (
                  <span className="bantuan-thumbs">
                    {r.images.map((n) => {
                      const src = `/api/works/img?slug=${encodeURIComponent(p.slug)}&layanan=${encodeURIComponent(r.dir)}&file=${encodeURIComponent(n)}`;
                      return <a key={n} href={src} target="_blank" rel="noreferrer"><img src={`${src}&w=240`} alt={n} loading="lazy" decoding="async" /></a>;
                    })}
                  </span>
                )}
                {r.laporan && <button type="button" className="link" onClick={() => openFile(`projects/${p.slug}/layanan/${r.dir}/laporan.md`, p.slug)}>Buka laporan</button>}
              </li>
            );
          })}
        </ul>
      )}
      {offer.length > 0 && !open && <button type="button" className="btn ghost sm" disabled={runner.running} onClick={() => setOpen(true)}>Minta bantuan lantai lain</button>}
      {open && (
        <form className="bantuan-form" onSubmit={submit}>
          <span className="eyebrow">Minta bantuan lantai lain</span>
          <div className="chips">
            {offer.map((l) => (
              <button key={l.id} type="button" className={`chip${pick === l.id ? " on" : ""}`} disabled={l.status !== "aktif"} title={l.status !== "aktif" ? l.catatan ?? "menyusul" : l.hasil} onClick={() => setPick(l.id)}>
                {l.name} · {GUEST_FROM[l.floor] ?? l.floor}{l.status !== "aktif" ? " (menyusul)" : ""}
              </button>
            ))}
          </div>
          {L && <p className="muted small">Hasil: {L.hasil}. Dikerjakan {L.agents.length > 1 ? "tim" : "agen"} {GUEST_FROM[L.floor]} dengan merek proyek ini.{L.opus ? " Agen ini memakai Opus (lebih mahal)." : ""}{L.keluaran ? ` Hasil disimpan di ${L.keluaran}` : ""}</p>}
          {L && <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={L.input ?? "Apa yang dibutuhkan"} aria-label="Catatan permintaan" />}
          {err && <p className="form-err">{err}</p>}
          <div className="row">
            <button type="submit" className="btn sm" disabled={!L || busy || runner.running}>{busy ? "Mengirim…" : "Kirim permintaan"}</button>
            <button type="button" className="btn ghost sm" onClick={() => { setOpen(false); setErr(null); }}>Batal</button>
            {runner.running && <span className="muted small">Tunggu agen selesai dulu.</span>}
          </div>
        </form>
      )}
    </div>
  );
}

// Brand + guest teams of a collaboration project (projects/<slug>/proyek.json and stage.tamu).
const BRAND_NAME = { demo: "Merek Demo", explainer: "Explainer3D", kanaldemo: "@kanal.demo" };
function Collab({ p, F }) {
  const from = [...new Set(F.stages.filter((s) => s.tamu).map((s) => GUEST_FROM[s.tamu] ?? s.tamu))];
  const merek = p.proyek?.merek;
  if (!from.length && !merek) return null;
  return (
    <p className="collab small">
      {merek && <span>Merek <b>{BRAND_NAME[merek] ?? merek}</b></span>}
      {from.length > 0 && <span>Kolaborasi dengan <b>{from.join(", ")}</b></span>}
    </p>
  );
}

function ClassicCard({ p, runner, go, openFile, layanan }) {
  const work = useWork(p.slug);
  const [more, setMore] = useState(false);
  const [size, setSize] = useState(Object.keys(SIZES)[1]);
  const [note, setNote] = useState("");
  const busy = runner.running;
  const tiktok = p.type === "tiktok";
  const ask = (text, label) => go(`Proyek ${tiktok ? "tiktok" : "konten"} ${p.slug}: ${text}`, `${p.name}: ${label}`, false, p.slug);
  const st = stageStates(p);
  const designed = tiktok ? (work?.videos?.length ?? 0) > 0 || st.story === "done" : st.design === "done" || (work?.images?.length ?? 0) > 0;
  const mainFile = tiktok ? (p.files?.["01_script.md"] ? "01_script.md" : "00_ide.md") : "00_brief.md";
  return (
    <li className="proj wf">
      <div className="row-between">
        <b>{p.name}</b>
        <span className="muted small">{p.phase === "checkpoint" ? "menunggu Anda" : "berjalan"}</span>
      </div>
      <Pipeline p={p} />
      {tiktok && <VideoPlayer slug={p.slug} work={work} />}
      {work?.images?.length > 0 && <Thumbs slug={p.slug} images={work.images} max={tiktok ? 4 : 6} />}
      <p className="muted small">
        {tiktok
          ? work?.exists ? <>Folder: <code>out/{work.folder}/</code> · {work.videos.length ? "MP4 ada" : "belum ada MP4"} · storyboard {work.images.some((i) => i.name === "storyboard.png") ? "ada" : "belum"}</> : p.video?.slug ? <>Script <code>{p.video.slug}</code>, belum dirender.</> : "Belum ada script."
          : work?.exists ? <>Folder kerja: <code>contoh-konten/{p.slug}/</code> · {work.images.filter((i) => !i.preview).length} PNG · {work.pptx.length} PPTX</> : "Folder kerja belum dibuat."}
      </p>
      <Schedule p={p} />
      <Bantuan p={p} layanan={layanan} runner={runner} go={go} openFile={openFile} />
      {p.arsip && !tiktok && <ClientStatus p={p} busy={busy} go={go} />}
      {tiktok && st.cp3 === "done" && !p.jadwal?.tautan && <UploadStatus p={p} busy={busy} go={go} />}
      <div className="row">
        <button type="button" className="btn ghost sm" disabled={busy || p.phase === "checkpoint"} onClick={() => go(`/lanjut ${p.slug}`, `Lanjut ${p.name}`, false, p.slug)}>Lanjutkan</button>
        {p.files?.["04_pengajuan.md"] && <button type="button" className="btn ghost sm" onClick={() => openFile(`projects/${p.slug}/04_pengajuan.md`, p.slug)}>Paket ajuan</button>}
        <button type="button" className="btn ghost sm" onClick={() => openFile(`projects/${p.slug}/${mainFile}`, p.slug)}>{tiktok ? "Script & file" : "Brief & file"}</button>
        {tiktok && p.files?.["04_upload.md"] && <button type="button" className="btn ghost sm" onClick={() => openFile(`projects/${p.slug}/04_upload.md`, p.slug)}>Paket upload</button>}
        {designed && <button type="button" className="btn ghost sm" onClick={() => setMore((m) => !m)} aria-expanded={more}>Aksi desain</button>}
      </div>
      {more && tiktok && (
        <div className="stack actions">
          <div className="row">
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => ask("jalankan tiktok-qc ulang untuk video terakhir (strip di hook, batas scene, momen hit) dan laporkan hasilnya.", "QC ulang")}>QC ulang</button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => ask("render ulang storyboard draf saja (tanpa VO, tanpa produce) setelah perubahan script, lalu tunjukkan.", "storyboard ulang")}>Storyboard ulang</button>
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { ask(`revisi dari pemilik: "${note.trim()}". Catat dulu di catatan-revisi.md (nomor lanjut), kerjakan semua poin sekaligus (script/storyboard gratis; jika VO berubah, sebutkan jumlah karakternya dan minta izin), lalu kembali ke checkpoint yang sesuai.`, "revisi"); setNote(""); } }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Revisi, mis. hook kurang nendang, transisi s3 kasar" aria-label="Catatan revisi" />
            <button type="submit" className="btn sm" disabled={busy || !note.trim()}>Revisi</button>
          </form>
        </div>
      )}
      {more && !tiktok && (
        <div className="stack actions">
          <div className="row">
            <select value={size} onChange={(e) => setSize(e.target.value)} aria-label="Ukuran tambahan">
              {Object.keys(SIZES).map((k) => <option key={k}>{k}</option>)}
            </select>
            <button type="button" className="btn sm" disabled={busy} onClick={() => ask(`buat versi ukuran ${SIZES[size]} dari desain terakhir (senior-graphic-designer, lalu visual-qa), lalu checkpoint hasil.`, `ukuran ${size.split(" ")[0]}`)}>Tambah ukuran</button>
          </div>
          <div className="row">
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => ask("buat PPTX Canva (susun_pptx --pisah) + PANDUAN_ISIAN.md / CATATAN_CANVA.md untuk semua ukuran desain terakhir. PNG tetap dipertahankan.", "PPTX Canva")}>Buat PPTX Canva</button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => ask("jalankan visual-qa ulang untuk semua PNG terbaru dan laporkan hasilnya.", "QA ulang")}>QA ulang</button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => go(`/arsip ${p.slug}`, `Arsip ${p.name}`, false, p.slug)}>Arsipkan</button>
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { ask(`revisi desain dari pemilik: "${note.trim()}". Catat di log-revisi, kerjakan (designer → visual-qa), naikkan versi, lalu checkpoint hasil.`, "revisi"); setNote(""); } }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Revisi cepat, mis. ganti foto latar, judul lebih besar" aria-label="Catatan revisi" />
            <button type="submit" className="btn sm" disabled={busy || !note.trim()}>Revisi</button>
          </form>
        </div>
      )}
    </li>
  );
}

// ---------- posting calendar ----------
const DAY = 86400000;
const dateOnly = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null);
const daysFrom = (d) => Math.round((d - new Date(new Date().toDateString())) / DAY);
const dayWord = (n) => (n === 0 ? "hari ini" : n === 1 ? "besok" : n === -1 ? "kemarin" : n > 0 ? `${n} hari lagi` : `${-n} hari lalu`);
const fmtDay = (d) => d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
const CLIENT_STATUS = { draf: "draf", diajukan: "diajukan", disetujui: "disetujui Klien Demo", ditolak: "ditolak Klien Demo", tayang: "tayang" };

// One entry per project with a date; `level` says how urgent it is.
export function calendarItems(projects) {
  const out = [];
  for (const p of projects) {
    const tayang = dateOnly(p.jadwal?.tayang);
    const ajukan = dateOnly(p.jadwal?.ajukan_paling_lambat);
    if (!tayang && !ajukan) continue;
    const st = stageStates(p);
    const status = p.arsip?.status ?? (p.jadwal?.tautan ? "tayang" : null);
    const lastCp = [...stagesFor(p.type)].reverse().find((s) => s.cp)?.id;
    const approved = st[lastCp] === "done";
    const sent = ["diajukan", "disetujui", "tayang"].includes(status);
    let level = "ok", why = "";
    const dT = tayang ? daysFrom(tayang) : null, dA = ajukan ? daysFrom(ajukan) : null;
    if (status === "tayang") { level = "done"; why = "sudah tayang"; }
    else if (dT !== null && dT < 0) { level = "late"; why = "tanggal tayang lewat: tandai tayang atau ubah jadwal"; }
    else if (dA !== null && dA <= 1 && !sent) { level = "urgent"; why = dA < 0 ? "lewat batas pengajuan ke Klien Demo" : `batas pengajuan ${dayWord(dA)}`; }
    else if (dT !== null && dT <= 3 && !approved) { level = "urgent"; why = `tayang ${dayWord(dT)}, hasil belum disetujui`; }
    else if (dT !== null && dT <= 3 && !sent && p.type !== "tiktok") { level = "urgent"; why = `tayang ${dayWord(dT)}, belum diajukan ke Klien Demo`; }
    out.push({ p, tayang, ajukan, dT, dA, status, level, why });
  }
  return out.sort((a, b) => (a.tayang ?? a.ajukan) - (b.tayang ?? b.ajukan));
}

function Schedule({ p }) {
  const t = dateOnly(p.jadwal?.tayang), a = dateOnly(p.jadwal?.ajukan_paling_lambat);
  if (!t && !a && !p.arsip) return null;
  return (
    <p className="muted small sched">
      {t && <>Tayang <b>{fmtDay(t)}</b> ({dayWord(daysFrom(t))})</>}
      {a && <> · ajukan paling lambat {fmtDay(a)}</>}
      {p.arsip && <> · arsip <b>{p.arsip.id}</b> v{p.arsip.versi}: <span className={`st-${p.arsip.status}`}>{CLIENT_STATUS[p.arsip.status] ?? p.arsip.status}</span>{p.arsip.tautan && <> · <a href={p.arsip.tautan} target="_blank" rel="noreferrer">lihat posting</a></>}</>}
    </p>
  );
}

// The owner sends to Klien Demo by hand; these buttons only tell Atlas to record what happened.
function ClientStatus({ p, busy, go }) {
  const [next, setNext] = useState("");
  const [text, setText] = useState("");
  const options = { draf: ["diajukan"], diajukan: ["disetujui", "ditolak"], disetujui: ["tayang"], ditolak: ["diajukan"], tayang: [] }[p.arsip.status] ?? ["diajukan", "disetujui", "ditolak", "tayang"];
  if (!options.length) return null;
  const need = next === "ditolak" ? "Alasan / masukan admin Klien Demo" : next === "tayang" ? "Tautan posting Instagram" : next ? "Catatan admin (opsional)" : "";
  const send = (e) => {
    e.preventDefault();
    const extra = next === "tayang" ? ` --tautan "${text.trim()}"` : text.trim() ? ` --catatan "${text.trim().replaceAll('"', "'")}"` : "";
    go(`Gunakan subagent digital-asset-manager: catat status Klien Demo untuk proyek ${p.slug}, arsip ${p.arsip.id} → ${next}. Jalankan arsip.py status ${p.arsip.id} ${next}${extra}. Ini dicatat atas laporan pemilik (pemilik yang mengirim ke Klien Demo secara manual). Laporkan ID, folder, dan kolom yang masih kosong.`, `${p.name}: Klien Demo ${next}`, false, p.slug);
    setNext(""); setText("");
  };
  return (
    <form className="klien-demo row" onSubmit={send}>
      <span className="eyebrow">Status Klien Demo</span>
      {options.map((o) => <button key={o} type="button" className={`chip${next === o ? " on" : ""}`} onClick={() => setNext(next === o ? "" : o)}>{o === "diajukan" ? "Sudah diajukan" : o === "tayang" ? "Sudah tayang" : o[0].toUpperCase() + o.slice(1)}</button>)}
      {next && <>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={need} aria-label={need} type={next === "tayang" ? "url" : "text"} required={next === "tayang" || next === "ditolak"} />
        <button type="submit" className="btn sm" disabled={busy}>Catat</button>
      </>}
    </form>
  );
}

// TikTok upload is always manual; the owner pastes the link and Mercurius records it.
function UploadStatus({ p, busy, go }) {
  const [link, setLink] = useState("");
  return (
    <form className="klien-demo row" onSubmit={(e) => { e.preventDefault(); go(`Gunakan subagent tiktok-publisher: pemilik sudah mengupload video proyek ${p.slug} ke TikTok, tautan ${link.trim()}. Catat status posted di bank_ide.json (hanya baris ide itu), jadwal.json (tayang hari ini, tautan), dan Status produksi di catatan-revisi.md.`, `${p.name}: sudah diupload`, false, p.slug); setLink(""); }}>
      <span className="eyebrow">Upload TikTok</span>
      <input type="url" required value={link} onChange={(e) => setLink(e.target.value)} placeholder="Tempel tautan video setelah Anda upload" aria-label="Tautan video TikTok" />
      <button type="submit" className="btn sm" disabled={busy || !link.trim()}>Sudah diupload</button>
    </form>
  );
}

export function Calendar({ projects, openFile }) {
  const items = calendarItems(projects);
  const noDate = projects.filter((p) => !p.jadwal?.tayang && p.arsip?.status !== "tayang");
  return (
    <section className="card">
      <h2>Kalender tayang</h2>
      {items.length === 0 ? <p className="muted small">Belum ada tanggal tayang. Polaris menulisnya di <code>jadwal.json</code> saat membaca brief.</p> : (
        <ul className="cal">
          {items.map(({ p, tayang, ajukan, level, why, status }) => (
            <li key={p.slug} className={level}>
              <span className="when">{tayang ? fmtDay(tayang) : "—"}</span>
              <span className="what">
                <button type="button" className="link" onClick={() => openFile(`projects/${p.slug}/jadwal.json`, p.slug)}>{p.name}</button>
                <span className="muted small">{why || (status ? CLIENT_STATUS[status] : "dalam proses")}{ajukan ? ` · ajukan ≤ ${fmtDay(ajukan)}` : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {noDate.length > 0 && <p className="muted small">Tanpa tanggal: {noDate.map((p) => p.name).join(", ")}.</p>}
    </section>
  );
}

export function CheckpointThumbs({ slug }) {
  const work = useWork(slug);
  return work?.images?.length ? <Thumbs slug={slug} images={work.images} max={4} /> : null;
}

// Typical tasks per agent, taken from the design session; a chip fills the task box so it can be edited first.
export const AGENT_TASKS = {
  "project-manager": ["Cek fakta brief terbaru dan susun pertanyaan untuk tim", "Susun paket pengajuan ke Klien Demo untuk konten yang sudah disetujui", "Riset sumber resmi untuk topik: ", "Rapikan brief dari tim ini: "],
  copywriter: ["Jalankan cek-copy-klien-demo pada copy terakhir", "Tulis ulang caption agar lebih singkat", "Buat 3 opsi judul untuk ", "Buat placeholder template dengan batas karakter untuk "],
  "senior-graphic-designer": ["Buat versi 9:16 reels dari desain terakhir", "Ganti foto latar agar beda dari desain sebelumnya", "Buat PPTX Canva untuk desain terakhir"],
  "visual-qa": ["Cek ulang semua PNG terbaru terhadap gaya rumah", "Cek data pribadi (cek_privasi) di desain terakhir", "Bandingkan desain terakhir dengan log revisi"],
  "tiktok-strategist": ["Beri 3–5 ide video berikutnya dari bank ide", "Riset tren minggu ini dan perbarui riset-tren.md", "Cek ulang fakta berwaktu di script terakhir"],
  "tiktok-scriptwriter": ["Padatkan script terakhir agar ≤ 70 detik", "Tulis 3 opsi hook baru untuk script terakhir", "Jalankan cek-script untuk script terakhir"],
  "tiktok-motion-designer": ["Render ulang storyboard draf (tanpa VO)", "Buat lembar komponen kit terbaru di out/_kit"],
  "tiktok-qc": ["QC ulang video terakhir terhadap catatan revisi"],
  "tiktok-publisher": ["Rekap status produksi semua video", "Siapkan caption dan checklist upload video terakhir"],
  ...FLOW_TASKS,
  "digital-asset-manager": ["Arsipkan konten yang sudah disetujui", "Indeks foto baru dan beri tag di katalog foto (katalog-foto-demo), per lembar kontak", "Rapikan inbox"],
};

export function RecentWorks({ client = "klien-demo" }) {
  const [items, setItems] = useState(null);
  useEffect(() => { fetch(`/api/works?client=${client}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setItems(j.recent ?? [])).catch(() => setItems([])); }, [client]);
  if (!items?.length) return null;
  return (
    <section className="card">
      <h2>Karya terbaru</h2>
      <div className="gallery">
        {items.map((w) => (
          <a key={w.slug} href={galleryUrl(w, w.cover)} target="_blank" rel="noreferrer" className={`work${TALL.has(w.client) ? " tall" : ""}`}>
            <img src={`${galleryUrl(w, w.cover)}&w=360`} alt={w.slug} loading="lazy" decoding="async" />
            <span className="small"><b>{w.slug}</b><br /><span className="muted">{w.client === "kanaldemo" ? (w.videos ? "MP4 + still QC" : "storyboard") : w.client === "explainer" ? (w.videos ? "MP4 + still" : `${w.count} still`) : w.client === "klien-demo" ? `${w.count} PNG${w.pptx ? ` · ${w.pptx} PPTX` : ""}` : `${w.count} preview`}</span></span>
          </a>
        ))}
      </div>
    </section>
  );
}

// Last entries of the client's revision log: what the owner approved or asked to change.
export function StyleLog({ openFile }) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    fetch("/api/files?path=studio/clients/klien-demo/log-revisi.md").then((r) => r.json()).then((j) => {
      const heads = (j.content ?? "").split("\n").filter((l) => /^##+ /.test(l) || /User reaction|reaksi/i.test(l));
      const out = [];
      for (const l of heads) {
        if (/^##+ /.test(l)) out.push({ title: l.replace(/^#+\s*/, ""), reaction: "" });
        else if (out.length) out.at(-1).reaction = l.replace(/^[-*\s]*\**User reaction[^:]*:\**\s*/i, "").replace(/\*\*/g, "");
      }
      setEntries(out.filter((e) => e.reaction).slice(-4).reverse());
    }).catch(() => {});
  }, []);
  return (
    <section className="card">
      <div className="row-between">
        <h2>Selera Klien Demo</h2>
        <span className="row">
          <button type="button" className="link" onClick={() => openFile("studio/clients/klien-demo/gaya.md")}>Gaya rumah</button>
          <button type="button" className="link" onClick={() => openFile("studio/clients/klien-demo/log-revisi.md")}>Log revisi</button>
        </span>
      </div>
      {entries.length === 0 ? <p className="muted small">Belum ada reaksi tercatat.</p> : (
        <ul className="list">
          {entries.map((e, i) => (
            <li key={i}><b className="small">{e.title}</b><span className="muted small">{e.reaction.slice(0, 160)}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EmptyFlow({ onNew, type = "konten" }) {
  const F = flowOf(type);
  if (F) return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="muted">Belum ada {F.noun} berjalan. Satu proyek = satu {F.noun}:</p>
      <ol className="steps small">{F.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      <button type="button" className="btn" onClick={onNew}>+ {F.newLabel}</button>
    </div>
  );
  if (type === "tiktok") return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="muted">Belum ada video berjalan. Satu proyek = satu video @kanal.demo:</p>
      <ol className="steps small">
        <li><b>Nova</b> memilih 3–5 ide dari bank ide → <b>Anda memilih</b></li>
        <li><b>Fabula</b> menulis script 10 ketukan + cek-script; <b>Cometa</b> membuat storyboard draf (gratis) → <b>CP script</b></li>
        <li>Setelah disetujui: <b>Cometa</b> membuat VO ElevenLabs (berbayar, ±Rp1.500) dan render MP4</li>
        <li><b>Argus</b> mengecek frame dan gerak → <b>CP hasil</b></li>
        <li><b>Mercurius</b> menyiapkan caption dan checklist upload; Anda upload sendiri</li>
      </ol>
      <button type="button" className="btn" onClick={onNew}>+ Video baru</button>
    </div>
  );
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="muted">Belum ada konten berjalan. Tempel brief dari tim, dan tim bekerja seperti ini:</p>
      <ol className="steps small">
        <li><b>PM</b> mengecek fakta yang kurang dan riset sumber resmi → <b>checkpoint fakta</b></li>
        <li><b>Copywriter</b> menulis teks per slide dan caption, lalu cek copy otomatis</li>
        <li><b>Designer</b> membuat PNG gaya rumah (+ PPTX Canva untuk template/thumbnail)</li>
        <li><b>Visual QA</b> memeriksa dengan pengawas-estetika → <b>checkpoint hasil</b></li>
        <li><b>Paket ajuan</b>: PNG, caption, dan pesan pengantar siap Anda kirim ke Klien Demo</li>
        <li><b>Arsip</b> menamai dan mencatat di log arsip; status Klien Demo Anda tandai dari kartu proyek</li>
      </ol>
      <button type="button" className="btn" onClick={onNew}>+ Konten baru</button>
    </div>
  );
}

// ---------- what the owner needs to answer ----------
const fmt = (iso) => { const d = new Date(iso); const today = new Date().toDateString() === d.toDateString(); return d.toLocaleString("id-ID", today ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };

// CP fakta: every question from the PM gets its own answer field and a "may search the internet" box.
function FactForm({ questions, answers, setAnswers }) {
  const set = (id, patch) => setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  return (
    <ol className="qform">
      {questions.map((q) => {
        const a = answers[q.id] ?? {};
        return (
          <li key={q.id}>
            <label htmlFor={`q-${q.id}`} className="q">{q.tanya}</label>
            {q.konteks && <span className="muted small">{q.konteks}</span>}
            {Array.isArray(q.opsi) && q.opsi.length > 0 && (
              <div className="opsi" role="radiogroup" aria-label={q.tanya}>
                {q.opsi.map((o) => (
                  <label key={o} className="check small">
                    <input type="radio" name={`q-${q.id}`} checked={a.text === o} onChange={() => set(q.id, { text: o })} /> {o}
                  </label>
                ))}
              </div>
            )}
            {!(Array.isArray(q.opsi) && q.opsi.length) && <textarea id={`q-${q.id}`} rows={1} value={a.text ?? ""} onChange={(e) => set(q.id, { text: e.target.value })} placeholder="Jawaban Anda (kosongkan jika belum ada datanya)" />}
            {!(Array.isArray(q.opsi) && q.opsi.length) && <label className="check small">
              <input type="checkbox" checked={!!a.cari} onChange={(e) => set(q.id, { cari: e.target.checked })} />
              Boleh cari di internet{q.bisa_dicari ? " (kemungkinan ada di sumber publik)" : ""}
            </label>}
            <span className="muted small hint">{Array.isArray(q.opsi) && q.opsi.length ? (a.text ? `Dipilih: ${a.text}` : "Pilih salah satu.") : a.text?.trim() ? (a.cari ? "Pakai jawaban Anda, Polaris boleh melengkapi." : "Pakai jawaban Anda.") : a.cari ? "Polaris mencari dari sumber resmi sebelum Lyra menulis." : "Jadi placeholder [kurung siku]."}</span>
          </li>
        );
      })}
    </ol>
  );
}

function CheckpointItem({ p, runner, go, openFile }) {
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(null);
  const first = !(p.history ?? []).some((h) => h.event === "decision");
  const approvals = (p.history ?? []).filter((h) => h.event === "decision" && h.decision === "setuju").length;
  const tiktok = p.type === "tiktok";
  const F = flowOf(p.type);
  const fcp = F?.cps[Math.min(approvals, F.cps.length - 1)];
  const cpName = fcp?.name ?? (CP_NAMES[p.type] ?? CP_NAMES.konten)[Math.min(approvals, (CP_NAMES[p.type] ?? CP_NAMES.konten).length - 1)];
  const paid = (tiktok && approvals === 1) || (F?.paidAt != null && approvals === F.paidAt);
  const questions = first ? p.questions ?? [] : [];
  const [answers, setAnswers] = useState(() => Object.fromEntries(questions.map((q) => [q.id, { text: "", cari: !!q.bisa_dicari }])));
  const answer = async (decision) => {
    setSent(decision);
    const extra = questions.length ? { answers } : {};
    const ok = await go(`/checkpoint ${p.slug} ${decision} ${note.trim()}`.trim(), `Checkpoint ${p.name}: ${decision}`, false, p.slug, extra);
    if (!ok) setSent(null);
  };
  const toSearch = questions.filter((q) => answers[q.id]?.cari && !answers[q.id]?.text?.trim()).length;
  return (
    <li className="ask cp-item">
      <span className="eyebrow">{cpName} · {p.name}</span>
      <p>{p.checkpoint.question}</p>
      <CheckpointThumbs slug={p.slug} />
      <div className="row">
        {F ? <button type="button" className="link" onClick={() => openFile(`projects/${p.slug}/${fcp.file}`, p.slug)}>{fcp.open}</button> : tiktok ? <>
          <button type="button" className="link" onClick={() => openFile(`projects/${p.slug}/${approvals === 0 ? "00_ide.md" : "01_script.md"}`, p.slug)}>{approvals === 0 ? "Buka pilihan ide" : "Buka script"}</button>
          {approvals === 1 && p.files?.["02_storyboard.md"] && <button type="button" className="link" onClick={() => openFile(`projects/${p.slug}/02_storyboard.md`, p.slug)}>Catatan storyboard</button>}
          {approvals >= 2 && <button type="button" className="link" onClick={() => openFile(`projects/${p.slug}/03_qc.md`, p.slug)}>Laporan QC</button>}
        </> : <>
          <button type="button" className="link" onClick={() => openFile(`projects/${p.slug}/00_brief.md`, p.slug)}>Buka brief</button>
          {!first && <button type="button" className="link" onClick={() => openFile(`projects/${p.slug}/03_qa.md`, p.slug)}>Laporan QA</button>}
        </>}
      </div>
      {paid && F?.paidNote && <p className="small cost">{F.paidNote}</p>}
      {paid && !F && <p className="small cost">Menyetujui berarti Cometa membuat voice over ElevenLabs (berbayar, sekitar Rp1.500 per 1.000 karakter) lalu merender MP4. Revisi script sebelum ini masih gratis.</p>}
      {sent ? (
        <p className="sent small"><span className="spinner" aria-hidden /> Jawaban <b>{sent}</b> terkirim. Tim melanjutkan, lihat di tab Chat.</p>
      ) : (
        <>
          {questions.length > 0 && <FactForm questions={questions} answers={answers} setAnswers={setAnswers} />}
          {toSearch > 0 && <p className="muted small">{toSearch} pertanyaan akan dicari Polaris di internet. Hasilnya ditandai "dari riset" dan ditunjukkan lagi di CP hasil.</p>}
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={questions.length ? "Catatan lain untuk tim (wajib untuk revisi)" : "Catatan untuk tim (wajib untuk revisi): apa yang disukai, apa yang diubah, jawaban atas pertanyaan PM"} aria-label={`Catatan untuk ${p.name}`} />
          <div className="row">
            <button type="button" className="btn" disabled={runner.running} onClick={() => answer("setuju")}>Setuju</button>
            <button type="button" className="btn ghost" disabled={runner.running || !note.trim()} onClick={() => answer("revisi")}>Minta revisi</button>
            {runner.running && <span className="muted small">Tunggu agen selesai dulu.</span>}
          </div>
        </>
      )}
    </li>
  );
}

function DenialItem({ run, d, runner }) {
  const [busy, setBusy] = useState(false);
  const act = async (mode) => {
    setBusy(true);
    await fetch(`/api/runs/${run.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolve: d.rule }) });
    if (mode !== "skip") {
      if (mode === "always") await fetch("/api/permissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rule: d.rule }) });
      await runner.start({ prompt: `Pemilik studio mengizinkan: ${d.name} (${d.detail}). Lanjutkan tugas sebelumnya dari titik yang tertunda.`, label: `Izin: ${d.name}`, resume: run.sessionId, project: run.project ?? undefined, allow: [d.rule], chrome: run.chrome });
    }
    runner.refreshList();
  };
  return (
    <li className="ask perm-item">
      <span className="eyebrow">Izin alat · {run.project ?? run.label}</span>
      <p className="small">Agen ingin menjalankan perintah di bawah, tetapi perintah itu belum ada di daftar izin web, jadi langkah ini dilewati. Izinkan jika Anda paham perintahnya.</p>
      <code className="cmd">{d.detail}</code>
      {busy ? <p className="sent small"><span className="spinner" aria-hidden /> Diproses…</p> : (
        <div className="row">
          <button type="button" className="btn sm" disabled={runner.running} onClick={() => act("once")}>Izinkan sekali</button>
          <button type="button" className="btn ghost sm" disabled={runner.running} onClick={() => act("always")}>Selalu izinkan</button>
          <button type="button" className="btn ghost sm" onClick={() => act("skip")}>Abaikan</button>
        </div>
      )}
    </li>
  );
}

// Everything that waits for the owner, in one place: checkpoints and permission requests.
export function pendingDenials(runner) {
  const last = runner.runs?.[0];
  if (!last || last.status === "running") return [];
  return (last.denials ?? []).filter((d) => !d.resolved).map((d) => ({ run: last, d }));
}
export const reminders = (projects) => calendarItems(projects).filter((c) => c.level === "urgent");
export function OwnerInbox({ waiting, runner, go, openFile, projects = [] }) {
  const denials = pendingDenials(runner);
  const due = reminders(projects);
  if (!waiting.length && !denials.length && !due.length) return null;
  return (
    <section className="card inbox-card">
      <h2>Perlu Anda</h2>
      <ul className="asks">
        {waiting.map((p) => <CheckpointItem key={p.slug + p.checkpoint.since} p={p} runner={runner} go={go} openFile={openFile} />)}
        {denials.map(({ run, d }) => <DenialItem key={run.id + d.rule} run={run} d={d} runner={runner} />)}
        {due.map(({ p, why }) => (
          <li key={`due-${p.slug}`} className="ask due-item">
            <span className="eyebrow">Pengingat tenggat · {p.name}</span>
            <p className="small">{why[0].toUpperCase() + why.slice(1)}.</p>
            {p.files?.["04_pengajuan.md"] && <button type="button" className="link" onClick={() => openFile(`projects/${p.slug}/04_pengajuan.md`, p.slug)}>Buka paket ajuan</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- per-agent log ----------
const KIND = { task: "Tugas", tool: "Alat", text: "Pesan", working: "Mulai", done: "Selesai", idle: "Berhenti", gemini: "Gemini", error: "Gagal" };
export function AgentLog({ id }) {
  const [entries, setEntries] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/agents/log?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => alive && setEntries(j.entries ?? [])).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);
  if (!entries) return null;
  const shown = all ? entries : entries.slice(0, 10);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row-between"><span className="eyebrow">Log agen</span>{entries.length > 10 && <button type="button" className="link" onClick={() => setAll((a) => !a)}>{all ? "Ringkas" : `Semua (${entries.length})`}</button>}</div>
      {entries.length === 0 ? <p className="muted small">Belum ada catatan kerja.</p> : (
        <ol className="alog">
          {shown.map((e, i) => (
            <li key={i} className={e.kind}>
              <span className="when">{fmt(e.at)}</span>
              <span className="kind">{e.kind === "tool" ? e.tool : KIND[e.kind] ?? e.kind}</span>
              <span className="what">{e.text}{e.project ? <span className="muted"> · {e.project}</span> : null}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
