"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flowOf } from "../lib/flows";

// ---------- runner hook: starts Claude Code runs and follows the active one ----------
export function useRunner() {
  const [runs, setRuns] = useState([]);
  const [active, setActive] = useState(null); // full run incl. events
  const [error, setError] = useState(null);
  const activeId = active?.id;
  const activeRunning = active?.status === "running";
  // Any run on the server counts (e.g. after a page reload), so buttons can't start a second, parallel run.
  const running = activeRunning || runs.some((r) => r.status === "running");
  const countRef = useRef(0);
  countRef.current = active?.events?.length ?? 0;

  const refreshList = useCallback(async () => {
    try { const r = await fetch("/api/runs", { cache: "no-store" }); if (r.ok) setRuns((await r.json()).runs); } catch {}
  }, []);
  useEffect(() => { refreshList(); const t = setInterval(refreshList, 5000); return () => clearInterval(t); }, [refreshList]);

  const open = useCallback(async (id) => {
    const r = await fetch(`/api/runs/${id}`, { cache: "no-store" });
    if (r.ok) setActive(await r.json());
  }, []);

  // Poll the active run while it is going.
  useEffect(() => {
    if (!activeId || !activeRunning) return;
    let alive = true, timer;
    // One request at a time; each response carries `total`, so events are merged by index, never appended twice.
    const poll = async () => {
      try {
        const since = countRef.current;
        const r = await fetch(`/api/runs/${activeId}?since=${since}`, { cache: "no-store" });
        if (r.ok && alive) {
          const next = await r.json();
          setActive((cur) => (cur?.id === next.id ? { ...next, events: [...cur.events.slice(0, since), ...next.events] } : cur));
          if (next.status !== "running") { refreshList(); return; }
        }
      } catch {}
      if (alive) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 800);
    return () => { alive = false; clearTimeout(timer); };
  }, [activeId, activeRunning, refreshList]);

  const start = useCallback(async ({ prompt, label, resume, project, allow, chrome, newProject, answers }) => {
    setError(null);
    const r = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, label, resume, project, allow, chrome, newProject, answers }) });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) { setError(json.error ?? `Gagal (${r.status})`); return null; }
    setActive(json);
    refreshList();
    return json;
  }, [refreshList]);

  const stop = useCallback(async () => {
    if (!activeId) return;
    await fetch(`/api/runs/${activeId}`, { method: "DELETE" });
    setTimeout(() => open(activeId), 600);
  }, [activeId, open]);

  return { runs, active, setActive, start, stop, open, error, running, activeRunning, refreshList };
}

// ---------- chat / run console ----------
function Event({ e }) {
  if (e.t === "prompt") return <div className="ev prompt">{e.text}</div>;
  if (e.t === "text") return <div className={`ev text${e.sub ? " sub" : ""}`}>{e.text}</div>;
  if (e.t === "tool") return <div className={`ev tool${e.sub ? " sub" : ""}`}><b>{e.name}</b> <span>{e.detail}</span></div>;
  if (e.t === "stderr") return <div className="ev stderr">{e.text}</div>;
  if (e.t === "error") return <div className="ev err">{e.text}</div>;
  if (e.t === "result") return e.isError ? <div className="ev err">{e.text}</div> : <div className="ev done">Selesai{e.cost != null ? ` · biaya $${e.cost.toFixed(3)}` : ""}</div>;
  return null;
}

export function Chat({ runner }) {
  const { active, runs, start, stop, open, running, activeRunning, error, setActive } = runner;
  const [text, setText] = useState("");
  const [busyAllow, setBusyAllow] = useState(false);
  const log = useRef();
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [active?.events?.length]);

  const send = async (e) => {
    e.preventDefault();
    const prompt = text.trim();
    if (!prompt || running) return;
    setText("");
    await start({ prompt, resume: active?.sessionId ?? undefined, project: active?.project ?? undefined, chrome: active?.chrome });
  };
  const allow = async (d, always) => {
    setBusyAllow(true);
    await fetch(`/api/runs/${active.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolve: d.rule }) });
    if (always) await fetch("/api/permissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rule: d.rule }) });
    await start({
      prompt: `Pemilik studio mengizinkan: ${d.name} (${d.detail}). Lanjutkan tugas sebelumnya dari titik yang tertunda.`,
      label: `Izin: ${d.name}`, resume: active.sessionId, project: active.project ?? undefined, allow: [d.rule], chrome: active.chrome,
    });
    setBusyAllow(false);
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <select aria-label="Riwayat percakapan" value={active?.id ?? ""} onChange={(e) => (e.target.value ? open(e.target.value) : setActive(null))}>
          <option value="">Percakapan baru</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>{r.status === "running" ? "● " : ""}{r.label}</option>
          ))}
        </select>
        {activeRunning ? (
          <button type="button" className="btn ghost" onClick={stop}>Hentikan</button>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setActive(null)}>Baru</button>
        )}
      </div>

      {active?.project && <p className="muted small">Proyek <b>{active.project}</b>{active.resumedFrom ? " · melanjutkan percakapan proyek ini" : ""}</p>}
      <div className="log" ref={log} aria-live="polite">
        {!active && (
          <div className="empty">
            <p>Beri perintah ke orkestrator studio, sama seperti di Claude Code. Contoh:</p>
            <ul>
              <li><code>/proyek-baru konten Konten 4 Literasi Data</code></li>
              <li><code>/lanjut toko-kopi</code></li>
              <li>Minta Copywriter membuat 5 opsi tagline untuk proyek toko-kopi</li>
            </ul>
          </div>
        )}
        {active?.events?.map((e, i) => <Event key={i} e={e} />)}
        {activeRunning && <div className="ev working"><span className="spinner" aria-hidden /> Agen sedang bekerja…</div>}
        {active?.needsLogin && (
          <div className="ev err">
            Claude Code di komputer ini belum login. Buka Terminal, jalankan <code>claude</code>, ketik <code>/login</code>, lalu coba lagi.
          </div>
        )}
        {!activeRunning && active?.denials?.some((d) => !d.resolved) && (
          <div className="denials">
            <b>Agen butuh izin Anda:</b>
            {active.denials.filter((d) => !d.resolved).map((d) => (
              <div key={d.rule} className="denial">
                <div><b>{d.name}</b> <code>{d.detail}</code></div>
                <div className="row">
                  <button type="button" className="btn" disabled={busyAllow} onClick={() => allow(d, false)}>Izinkan sekali</button>
                  <button type="button" className="btn ghost" disabled={busyAllow} onClick={() => allow(d, true)}>Selalu izinkan</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="form-err">{error}</p>}
      <form className="composer" onSubmit={send}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(e); }}
          placeholder={active?.sessionId ? "Balas di percakapan ini…" : "Tulis perintah…"}
          rows={2}
          aria-label="Perintah untuk orkestrator"
        />
        <button type="submit" className="btn" disabled={running || !text.trim()}>Kirim</button>
      </form>
    </div>
  );
}

// ---------- new project ----------
const KONTEN_FORMATS = {
  feed: "feed 4:5 (1080×1350)",
  carousel: "carousel 4:5 (slide 1080×1350)",
  reels: "thumbnail/cover reels 1080×1920 + grid 3:4",
  story: "story 1080×1920",
  thumbnail3: "thumbnail 3 ukuran: 4:5, 9:16, lanskap 16:9",
};
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function NewProject({ runner, onStarted, type = "konten" }) {
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [tech, setTech] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [format, setFormat] = useState("carousel");
  const [mode, setMode] = useState("jadi");
  const [tayang, setTayang] = useState("");
  // Lantai 1 makes still designs (konten) or reels motion with a guest motion team (konten-motion).
  const [jenis, setJenis] = useState("statis");
  const [gaya, setGaya] = useState("2d");
  const motion = type === "konten" && jenis === "motion";
  const kind = motion ? "konten-motion" : type;
  const konten = kind === "konten";
  const tiktok = kind === "tiktok";
  const F = flowOf(kind);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    const folder = slugify(name);
    try {
      if (files.length) {
        const form = new FormData();
        form.set("folder", folder);
        for (const f of files) form.append("file", f);
        const r = await fetch("/api/inbox", { method: "POST", body: form });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Gagal mengunggah referensi");
      }
      const prompt = [
        `/proyek-baru ${kind} ${name.trim()}\nSlug: ${folder} (proyek sudah dibuka oleh web)`,
        F && `\nKlien: ${F.client} (baca ${F.read}). Satu proyek = satu ${F.noun}. Jalankan ${F.firstAgent} dulu.${tayang ? `\nTarget tayang/upload: ${tayang}.` : ""}`,
        motion && `\nMerek: demo (studio/brands/demo). Kolaborasi: layanan motion-2d, tamu Cometa (tiktok-motion-designer) dan Argus (tiktok-qc) dari Lantai 2 dalam mode tamu (CLAUDE.md, "Kolaborasi antarlantai"). Hasil di contoh-konten/${folder}/.`,
        tiktok && `\nKlien: kanaldemo (baca studio/clients/kanaldemo/README.md, skill produksi-video-kanaldemo, content/catatan-revisi.md). Satu video. Jalankan tiktok-strategist dulu.${tayang ? `\nRencana tayang: ${tayang}.` : ""}`,
        konten && `\nKlien: klien-demo (baca studio/clients/klien-demo/README.md, gaya.md, log-revisi.md).\nFormat: ${KONTEN_FORMATS[format]}.\nJenis hasil: ${mode === "template" ? "template Canva untuk PIC lain (data diisi mereka) + PNG" : "desain jadi (PNG)"}.${tayang ? `\nRencana tayang: ${tayang}.` : ""}`,
        brief.trim() && `\nBrief dari pemilik:\n${brief.trim()}`,
        tech.trim() && `\nKetentuan teknis: ${tech.trim()}`,
        files.length ? `\nReferensi sudah diunggah ke inbox/${folder}/ (${files.length} file).` : "",
      ].filter(Boolean).join("\n");
      const run = await runner.start({ prompt, label: `${F ? F.newLabel : tiktok ? "Video baru" : "Proyek baru"}: ${name.trim()}`, newProject: { slug: folder, name: name.trim(), type: kind, ...(type === "konten" ? { merek: "demo" } : {}), ...(motion ? { layanan: "motion-2d" } : {}) } });
      if (run) { setName(""); setBrief(""); setTech(""); setFiles([]); onStarted(); }
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{F ? F.title : tiktok ? "Video TikTok baru" : "Konten baru"}</h2>
      {type === "konten" && (
        <div className="seg" role="radiogroup" aria-label="Jenis konten">
          <button type="button" role="radio" aria-checked={!motion} className={!motion ? "on" : ""} onClick={() => setJenis("statis")}>Desain statis</button>
          <button type="button" role="radio" aria-checked={motion} className={motion ? "on" : ""} onClick={() => setJenis("motion")}>Reels motion</button>
        </div>
      )}
      {motion && (
        <fieldset className="gaya">
          <legend>Gaya motion</legend>
          <label className="opt"><input type="radio" name="gaya" checked={gaya === "2d"} onChange={() => setGaya("2d")} /> <span><b>2D motion graphic</b> · tim tamu Cometa + Argus dari TikTok Studio</span></label>
          <label className="opt off"><input type="radio" name="gaya" disabled /> <span><b>3D</b> · tim tamu Sirius + Rigel dari Explainer3D Studio <em>(menyusul)</em></span></label>
          <p className="muted small">Merek: <b>Merek Demo</b>. Tampilan mengikuti merek Demo; tim tamu hanya membawa tekniknya.</p>
        </fieldset>
      )}
      {F && <p className="muted small">Tim: {F.team} {F.note}</p>}
      {!F && <p className="muted small">{tiktok ? "Satu video @kanal.demo. Tim: Nova (ide) → Fabula (script) → Cometa (storyboard, VO, render) → Argus (QC) → Mercurius (upload). VO baru dibuat setelah Anda menyetujui script." : "Konten Instagram klien Klien Demo dalam gaya rumah. Tim: PM → Copywriter → Designer → Visual QA → Arsip."}</p>}
      {(tiktok || F) && (
        <label>{F?.noun === "campaign" ? "Upload paling lambat (opsional)" : "Rencana tayang (opsional)"}
          <input type="date" value={tayang} onChange={(e) => setTayang(e.target.value)} />
        </label>
      )}
      {konten && (
        <div className="row wrap">
          <label>Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {Object.entries(KONTEN_FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Hasil
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="jadi">Desain jadi (PNG)</option>
              <option value="template">Template Canva untuk PIC + PNG</option>
            </select>
          </label>
          <label>Rencana tayang
            <input type="date" value={tayang} onChange={(e) => setTayang(e.target.value)} />
          </label>
        </div>
      )}
      <label>Nama proyek
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={F ? F.namePlaceholder : tiktok ? "Video 013" : "Konten 4 Literasi Data"} required />
      </label>
      <label>Brief
        <textarea rows={5} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={F ? F.briefPlaceholder : tiktok ? "Opsional: topik, ide dari bank ide (nomor), momen, atau kosongkan agar Nova memilih 3–5 ide" : "Tempel brief dari tim apa adanya. Tim akan mengecek fakta yang kurang dan riset dulu sebelum desain."} />
      </label>
      {konten && <label>Ketentuan teknis
        <input value={tech} onChange={(e) => setTech(e.target.value)} placeholder="opsional, mis. 4 slide · ada foto dokumentasi · lanskap juga" />
      </label>}
      <label>Referensi (png, jpg, pdf, video)
        <input type="file" multiple onChange={(e) => setFiles([...e.target.files])} />
      </label>
      {files.length > 0 && <p className="muted small">{files.length} file akan diunggah ke <code>inbox/{slugify(name) || "…"}/</code></p>}
      {err && <p className="form-err">{err}</p>}
      <button className="btn" type="submit" disabled={busy || runner.running || !name.trim()}>{busy ? "Memulai…" : "Mulai proyek"}</button>
      <p className="muted small">Tim akan bekerja sampai checkpoint pertama, lalu menunggu persetujuan Anda di tab Kantor.</p>
    </form>
  );
}

// ---------- file editor ----------
export function Files({ want, project }) {
  const [groups, setGroups] = useState([]);
  const [path, setPath] = useState(want ?? null);
  const [doc, setDoc] = useState(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch(`/api/files${project ? `?project=${project}` : ""}`).then((r) => r.json()).then((j) => setGroups(j.groups ?? [])).catch(() => {});
  }, [project]);
  useEffect(() => { if (want) setPath(want); }, [want]);
  useEffect(() => {
    if (!path) return;
    setMsg(null);
    fetch(`/api/files?path=${encodeURIComponent(path)}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) { setDoc(null); setMsg(j.error); return; }
      setDoc(j); setDraft(j.content);
    });
  }, [path]);

  const save = async () => {
    const r = await fetch("/api/files", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, content: draft }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setDoc({ ...doc, content: draft }); setMsg("Tersimpan."); } else setMsg(j.error ?? "Gagal menyimpan");
  };
  const dirty = doc && draft !== doc.content;

  return (
    <div className="files">
      <select aria-label="Pilih file" value={path ?? ""} onChange={(e) => setPath(e.target.value || null)}>
        <option value="">Pilih file…</option>
        {groups.filter((g) => g.files.length).map((g) => (
          <optgroup key={g.id} label={g.label}>
            {g.files.map((f) => <option key={f} value={f}>{f.split("/").slice(-2).join("/")}</option>)}
          </optgroup>
        ))}
        {path && !groups.some((g) => g.files.includes(path)) && <option value={path}>{path}</option>}
      </select>
      {doc && (
        <>
          <textarea className="editor" value={draft} onChange={(e) => setDraft(e.target.value)} readOnly={doc.readOnly} spellCheck={false} aria-label={`Isi ${path}`} />
          <div className="row-between">
            <span className="muted small">{doc.readOnly ? "Hanya baca (diubah lewat scripts/status.mjs)" : dirty ? "Belum disimpan" : msg ?? " "}</span>
            {!doc.readOnly && <button type="button" className="btn" onClick={save} disabled={!dirty}>Simpan</button>}
          </div>
        </>
      )}
      {!doc && msg && <p className="form-err">{msg}</p>}
      {!path && <p className="muted small">Edit definisi agen, profil selera, template, dan profil karier langsung dari sini. Perubahan agen berlaku untuk tugas berikutnya.</p>}
    </div>
  );
}
