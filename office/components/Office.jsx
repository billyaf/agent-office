"use client";
import { useEffect, useMemo, useState } from "react";
import StudioThree from "./StudioThree";
import { Chat, Files, NewProject, useRunner } from "./Control";
import { AGENT_TASKS, AgentLog, Calendar, EmptyFlow, OwnerInbox, ProjectCard, RecentWorks, StyleLog, stagesFor, pendingDenials, reminders } from "./Workflow";

const POLL_MS = 2000;
const TABS = [
  { id: "office", label: "Studio" },
  { id: "chat", label: "Chat" },
  { id: "new", label: "Baru" },
  { id: "files", label: "File" },
];
const FALLBACK_FLOORS = [{ id: "design", label: "Lantai 1", name: "Design Studio", type: "konten", client: "klien-demo" }];
const NEW_LABEL = { konten: "Konten baru", tiktok: "Video baru", explainer: "Episode baru", stock: "Campaign baru", magnific: "Campaign baru" };

// floor = whose projects the panel shows; focus = what the 3D camera looks at (null = whole building)
function useFloor(floors) {
  const [floor, setFloor] = useState("design");
  const [focus, setFocus] = useState(null);
  useEffect(() => {
    try {
      const f = localStorage.getItem("kantor.floor"); if (f) setFloor(f);
      const v = localStorage.getItem("kantor.focus"); if (v) setFocus(v === "gedung" ? null : v);
    } catch {}
  }, []);
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const pick = (id) => { setFloor(id); save("kantor.floor", id); };
  const look = (id) => { setFocus(id); save("kantor.focus", id ?? "gedung"); if (id) pick(id); };
  const cur = floors.find((f) => f.id === floor && f.type) ?? floors[0];
  return [cur, pick, focus, look];
}

// Per-agent model: Claude (opus/sonnet/haiku) or Gemini, saved in the agent file's frontmatter.
function useAgentModels() {
  const [data, setData] = useState(null);
  const load = () => fetch("/api/agents", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  const save = async (id, cfg) => {
    const r = await fetch("/api/agents", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...cfg }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Gagal menyimpan");
    setData((d) => ({ ...d, agents: { ...d.agents, [id]: j.config } }));
  };
  return { data, save };
}

function ModelPicker({ id, models }) {
  const cfg = models.data?.agents?.[id];
  const [err, setErr] = useState(null);
  if (!cfg) return null;
  const set = (patch) => { setErr(null); models.save(id, { ...cfg, ...patch }).catch((e) => setErr(e.message)); };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="eyebrow">Model agen</span>
      <div className="row">
        <div className="seg" role="group" aria-label="Penyedia model">
          <button type="button" aria-pressed={cfg.provider === "claude"} onClick={() => set({ provider: "claude" })}>Claude</button>
          <button type="button" aria-pressed={cfg.provider === "gemini"} onClick={() => set({ provider: "gemini" })}>Gemini</button>
        </div>
        {cfg.provider === "claude" ? (
          <select value={cfg.model} onChange={(e) => set({ model: e.target.value })} aria-label="Model Claude">
            {models.data.claudeModels.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <select value={cfg.geminiModel} onChange={(e) => set({ geminiModel: e.target.value })} aria-label="Model Gemini">
            {[...new Set([cfg.geminiModel, ...models.data.geminiModels])].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>
      {cfg.provider === "gemini" && !models.data.geminiReady && <p className="form-err small">Gemini belum siap: isi <code>GEMINI_API_KEY</code> di <code>.env.local</code> (key dari aistudio.google.com/apikey).</p>}
      {err && <p className="form-err small">{err}</p>}
    </div>
  );
}

function useStudioState() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (alive) { setData(json); setError(null); }
      } catch (e) {
        if (alive) setError(e.message);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return { data, error };
}

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export default function Office() {
  const { data, error } = useStudioState();
  const runner = useRunner();
  const [selected, setSelected] = useState(null);
  const models = useAgentModels();
  const [tab, setTab] = useState("office");
  const [fileWant, setFileWant] = useState(null);
  const [fileProject, setFileProject] = useState(null);
  const [task, setTask] = useState("");

  const fullRoster = data?.roster ?? { divisions: {}, agents: [] };
  const floors = fullRoster.building?.floors?.length ? fullRoster.building.floors : FALLBACK_FLOORS;
  const [floor, setFloor, focus, setFocus] = useFloor(floors);
  const allProjects = useMemo(() => (data?.projects ?? []).filter((p) => p.phase !== "archived"), [data]);
  const typeOf = (p) => p.type ?? "konten";
  // A floor may hold more than one project type (Lantai 1: konten + konten-motion).
  const typesOf = (f) => f.types ?? [f.type];
  const projects = useMemo(() => allProjects.filter((p) => typesOf(floor).includes(typeOf(p))), [allProjects, floor]);
  // Projects of other floors where this floor's agents work as guests (stage.tamu === floor.id), not finished yet.
  const svcFloor = useMemo(() => Object.fromEntries((fullRoster.layanan ?? []).map((l) => [l.id, l])), [fullRoster]);
  const openReqs = (p) => (p.permintaan ?? []).filter((r) => !r.laporan && svcFloor[r.layanan]?.floor === floor.id);
  const helping = useMemo(() => allProjects.filter((p) => !typesOf(floor).includes(typeOf(p)) && ((stagesFor(typeOf(p)).some((s) => s.tamu === floor.id) && !p.arsip) || openReqs(p).length)), [allProjects, floor, svcFloor]);
  const roster = useMemo(() => ({ ...fullRoster, agents: fullRoster.agents.filter((a) => (a.division ?? "design") === floor.id) }), [fullRoster, floor.id]);
  const byId = useMemo(() => Object.fromEntries(fullRoster.agents.map((a) => [a.id, a])), [fullRoster]);
  const STAGES = stagesFor(floor.type);

  const agentState = useMemo(() => {
    const out = {};
    for (const p of allProjects) {
      for (const [id, s] of Object.entries(p.agents ?? {})) {
        if (!out[id] || s.updatedAt > out[id].updatedAt) out[id] = { ...s, project: p.name, slug: p.slug };
      }
    }
    return out;
  }, [allProjects]);
  const waiting = projects.filter((p) => p.phase === "checkpoint" && p.checkpoint);
  const allWaiting = allProjects.filter((p) => p.phase === "checkpoint" && p.checkpoint);
  const waitingOn = (f) => allWaiting.filter((p) => typesOf(f).includes(typeOf(p))).length;
  const waitingByFloor = Object.fromEntries(floors.filter((f) => f.type).map((f) => [f.id, waitingOn(f)]));
  const asks = allWaiting.length + pendingDenials(runner).length + reminders(allProjects).length;
  const working = Object.values(agentState).filter((s) => s.state === "working").length;
  const providers = Object.fromEntries(Object.entries(models.data?.agents ?? {}).map(([id, c]) => [id, c?.provider]));

  const feed = useMemo(() => {
    const items = [];
    for (const p of projects) for (const h of p.history ?? []) items.push({ ...h, project: p.name });
    return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
  }, [projects]);
  const describe = (h) => {
    const who = h.agent ? (byId[h.agent]?.name ? `${byId[h.agent].name} (${byId[h.agent].title})` : byId[h.agent]?.title ?? h.agent) : "";
    switch (h.event) {
      case "init": return "Proyek dibuka";
      case "working": return `${who} mulai: ${h.note}`;
      case "done": return `${who} selesai: ${h.note}`;
      case "idle": return h.note ? `${who} berhenti: ${h.note}` : `${who} istirahat`;
      case "checkpoint": return `Menunggu persetujuan: ${h.note}`;
      case "decision": return `Keputusan ${h.decision}${h.note ? `: ${h.note}` : ""}`;
      default: return h.event;
    }
  };

  const go = async (prompt, label, chrome = false, project, extra = {}) => {
    const r = await runner.start({ prompt, label, chrome, project, ...extra });
    if (r) setTab("chat");
    return r;
  };
  const openFile = (path, project = null) => { setFileProject(project); setFileWant(path); setTab("files"); };

  const sel = selected ? byId[selected] : null;
  const selState = sel ? agentState[sel.id] : null;
  const selectAgent = (id) => {
    setSelected(id);
    if (!id) return;
    setTab("office");
    const div = byId[id]?.division ?? "design";
    if (div !== floor.id) { setFloor(div); if (focus) setFocus(div); }
  };

  return (
    <main className="office">
      <div className="stage">
        <div className="stage-bar">
          <div className="floors" role="tablist" aria-label="Lantai">
            <button type="button" role="tab" aria-selected={focus == null} title="Lihat seluruh gedung" onClick={() => setFocus(null)}>
              <b>Gedung</b>
              {allWaiting.length > 0 && focus != null && <i className="count">{allWaiting.length}</i>}
            </button>
            {floors.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={f.id === focus} className={f.id === floor.id && focus == null ? "cur" : ""} disabled={!f.type} title={f.type ? f.sub ?? f.name : "Belum dibangun"} onClick={() => setFocus(f.id)}>
                <span>{f.label}</span> <b>{f.name}</b>
                {waitingOn(f) > 0 && f.type && <i className="count">{waitingOn(f)}</i>}
              </button>
            ))}
          </div>
          <p className="stats">
            <span><b>{projects.length}</b> proyek</span>
            <span><b>{working}</b> bekerja</span>
            <span><b>{roster.agents.length}</b> agen</span>
            <span className={waiting.length ? "warn" : ""}><b>{waiting.length}</b> menunggu Anda</span>
            {runner.running && <span className="live"><span className="spinner" aria-hidden /> agen berjalan</span>}
          </p>
        </div>
        <div className="map-wrap">
          {data && (
            <StudioThree buildingName={fullRoster.building?.name ?? "Atrium"} buildingTagline={fullRoster.building?.tagline ?? "Menara kerja agen AI"} floors={floors} roster={fullRoster} agentState={agentState} providers={providers} waitingByFloor={waitingByFloor} focus={focus} onFocus={setFocus} selected={selected} onSelect={selectAgent} lite={runner.running} />
          )}
        </div>
        {error && <div className="offline">Tidak bisa membaca status studio ({error}). Mencoba lagi…</div>}
      </div>

      <aside className="panel">
        <header>
          <h1 className="brand">{fullRoster.building?.name ?? "Atrium"}<small>{fullRoster.building?.tagline ?? "Menara kerja agen AI"}</small></h1>
          <nav className="tabs" role="tablist" aria-label="Kontrol">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.id === "new" ? NEW_LABEL[floor.type] : t.label}
                {t.id === "office" && asks > 0 && <i className="count">{asks}</i>}
                {t.id === "chat" && runner.running && <i className="dot-live" aria-label="sedang berjalan" />}
              </button>
            ))}
          </nav>
        </header>

        <div className="panel-body">
          {tab === "office" && (
            <div className="stack">
              {runner.error && <p className="form-err">{runner.error}</p>}
              <OwnerInbox waiting={allWaiting} runner={runner} go={go} openFile={openFile} projects={allProjects} />

              {sel && (
                <section className="card">
                  <div className="row-between">
                    <span className="eyebrow">{fullRoster.divisions?.[sel.division]?.name ?? floor.name} · {sel.role}</span>
                    <button type="button" className="x" aria-label="Tutup" onClick={() => setSelected(null)}>×</button>
                  </div>
                  <h2>{sel.name ?? sel.title}</h2>
                  {sel.name && <p className="agent-role">{sel.title}</p>}
                  {sel.meaning && <p className="muted small"><i>{sel.meaning}</i></p>}
                  <p className="muted small">Tahap {STAGES.findIndex((s) => s.agent === sel.id) + 1} dari {STAGES.length} alur {{ tiktok: "video", explainer: "episode", stock: "campaign", magnific: "campaign" }[floor.type] ?? "konten"}: {STAGES.find((s) => s.agent === sel.id)?.label ?? sel.role}</p>
                  {selState ? (
                    <p><span className={`pill ${selState.state}`}>{selState.state === "working" ? "Bekerja" : selState.state === "done" ? "Selesai" : "Istirahat"}</span> {selState.note} <span className="muted small">· {selState.project} · {ago(selState.updatedAt)}</span></p>
                  ) : (
                    <p className="muted">{projects.length ? "Siaga di meja." : "Belum ada proyek, sedang santai di lounge."}</p>
                  )}
                  {AGENT_TASKS[sel.id] && (
                    <div className="chips" aria-label="Tugas cepat">
                      {AGENT_TASKS[sel.id].map((t) => <button key={t} type="button" className="chip" onClick={() => setTask(t)}>{t.trim()}{t.endsWith(" ") ? "…" : ""}</button>)}
                    </div>
                  )}
                  <form className="row" onSubmit={(e) => { e.preventDefault(); if (task.trim()) { go(`Gunakan subagent ${sel.id} untuk tugas ini: ${task.trim()}`, `${sel.short ?? sel.title}: ${task.trim().slice(0, 40)}`, false, selState?.slug); setTask(""); } }}>
                    <input value={task} onChange={(e) => setTask(e.target.value)} placeholder={`Beri tugas ke ${sel.short ?? sel.title}…`} aria-label="Tugas untuk agen" />
                    <button className="btn" type="submit" disabled={runner.running || !task.trim()}>Kirim</button>
                  </form>
                  <ModelPicker id={sel.id} models={models} />
                  <AgentLog id={sel.id} />
                  <button type="button" className="link" onClick={() => openFile(`.claude/agents/${sel.id}.md`)}>Edit peran agen</button>
                </section>
              )}

              <section className="card">
                <div className="row-between">
                  <h2>Proyek</h2>
                  <button type="button" className="btn ghost sm" onClick={() => setTab("new")}>+ {NEW_LABEL[floor.type]}</button>
                </div>
                {projects.length === 0 ? <EmptyFlow type={floor.type} onNew={() => setTab("new")} /> : (
                  <ul className="list">
                    {projects.map((p) => <ProjectCard key={p.slug} p={p} runner={runner} go={go} openFile={openFile} layanan={fullRoster.layanan ?? []} />)}
                  </ul>
                )}
              </section>

              {helping.length > 0 && (
                <section className="card">
                  <h2>Membantu lantai lain</h2>
                  <ul className="list helping">
                    {helping.map((p) => {
                      const home = floors.find((f) => typesOf(f).includes(typeOf(p)));
                      const guests = [...new Set([...(p.arsip ? [] : stagesFor(typeOf(p)).filter((s) => s.tamu === floor.id).map((s) => s.agent)), ...openReqs(p).flatMap((r) => svcFloor[r.layanan]?.agents ?? [])])];
                      const asked = openReqs(p).map((r) => svcFloor[r.layanan]?.name).filter(Boolean);
                      return (
                        <li key={p.slug}>
                          <b>{p.name}</b> <span className="muted small">· {home ? `${home.label} ${home.name}` : typeOf(p)}{asked.length ? ` · diminta: ${asked.join(", ")}` : ""}</span>
                          <p className="small">{guests.map((id) => {
                            const a = p.agents?.[id];
                            return <span key={id} className="guest-chip">{byId[id]?.name ?? id}: {a?.state === "working" ? "sedang bekerja" : a?.state === "done" ? "selesai tahapnya" : "menunggu giliran"}</span>;
                          })}</p>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="muted small">Persetujuan dan revisi proyek ini ada di panel lantai pemiliknya.</p>
                </section>
              )}

              <Calendar projects={projects} openFile={openFile} />

              <RecentWorks client={floor.client} />
              {floor.type === "konten" && <StyleLog openFile={openFile} />}

              <section className="card">
                <h2>Aktivitas</h2>
                {feed.length === 0 ? <p className="muted">Belum ada aktivitas.</p> : (
                  <ul className="list feed">
                    {feed.map((h, i) => (
                      <li key={`${h.at}${i}`} className={h.event}>
                        <span>{describe(h)}</span>
                        <span className="muted small">{h.project} · {ago(h.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(data?.archived?.length ?? 0) > 0 && (
                <section className="card">
                  <h2>Arsip di Drive</h2>
                  <ul className="list">
                    {data.archived.map((a) => (
                      <li key={a.slug}><b>{a.slug}</b><span className="muted small">{a.drive} · {a.files} file · {a.localDeleted ? "lokal sudah dihapus" : "lokal masih ada"}</span></li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
          {tab === "chat" && <Chat runner={runner} />}
          {tab === "new" && <NewProject key={floor.type} type={floor.type} runner={runner} onStarted={() => setTab("chat")} />}
          {tab === "files" && <Files want={fileWant} project={fileProject} />}
        </div>
      </aside>
    </main>
  );
}
