import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ROOT } from "./root";

// Runs Claude Code headless (`claude -p`) in the studio folder and keeps a normalized event log
// per run in studio/runs/<id>.jsonl so the web can show progress and history.

const RUNS_DIR = path.join(ROOT, "studio", "runs");
const PERMS = path.join(ROOT, "studio", "web-permissions.json");
const CONFIG = path.join(ROOT, "studio", "config.json");
function webConfig() {
  try { return JSON.parse(readFileSync(CONFIG, "utf8")).web ?? {}; } catch { return {}; }
}
const g = globalThis;
g.__kantorRuns ??= new Map(); // id -> run (in memory while the server lives)
const runs = g.__kantorRuns;

const CLAUDE = [path.join(os.homedir(), ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find(existsSync) ?? "claude";

// When the office server is started from inside another Claude Code session (e.g. the desktop app),
// it inherits that session's variables, which point the child at the host's private proxy and hide the
// user's own login. Drop them so `claude -p` uses the login from `claude /login`.
function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(CLAUDE|CLAUDECODE|ANTHROPIC_|__CF|MCP_|OTEL_)/.test(k)) continue;
    env[k] = v;
  }
  env.FORCE_COLOR = "0";
  // Headless runs stop background subagents 10 minutes after the orchestrator's last turn, which killed long
  // design jobs. 0 = wait until they finish (the run can still be stopped from the web).
  env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = "0";
  return env;
}

export function loadPermissions() {
  try { const p = JSON.parse(readFileSync(PERMS, "utf8")); return { allow: p.allow ?? [], deny: p.deny ?? [], raw: p }; }
  catch { return { allow: [], deny: [], raw: {} }; }
}
export function allowAlways(rule) {
  const { raw } = loadPermissions();
  raw.allow = [...new Set([...(raw.allow ?? []), rule])];
  writeFileSync(PERMS, JSON.stringify(raw, null, 2) + "\n");
}

const short = (s, n = 160) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
function describeTool(name, input = {}) {
  if (name === "Bash") return input.command ?? "";
  if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"].includes(name)) return path.relative(ROOT, input.file_path ?? "") || input.file_path || "";
  if (name === "Task" || name === "Agent") return `${input.subagent_type ?? "agen"}: ${input.description ?? ""}`;
  if (name === "WebSearch") return input.query ?? "";
  if (name === "WebFetch") return input.url ?? "";
  if (name === "Glob" || name === "Grep") return input.pattern ?? "";
  if (name === "TodoWrite") return `${input.todos?.length ?? 0} tugas`;
  return short(JSON.stringify(input));
}
const ruleFor = (name, input = {}) => (name === "Bash" && input.command ? `Bash(${input.command})` : name);

function push(run, ev) {
  ev.at = new Date().toISOString();
  run.events.push(ev);
  try { appendFileSync(path.join(RUNS_DIR, `${run.id}.jsonl`), JSON.stringify(ev) + "\n"); } catch {}
}
function saveMeta(run) {
  const { events, child, buf, parents, ...meta } = run;
  try { writeFileSync(path.join(RUNS_DIR, `${run.id}.meta.json`), JSON.stringify(meta, null, 2)); } catch {}
}

function handleLine(run, line) {
  let j;
  try { j = JSON.parse(line); } catch { return; }
  const sub = !!j.parent_tool_use_id;
  run.parents ??= {};
  const owner = sub ? run.parents[j.parent_tool_use_id] ?? null : null; // which studio agent produced this event
  if (j.type === "system" && j.subtype === "init") {
    run.sessionId = j.session_id;
    if (run.project) bindSession(run.project, run.sessionId); // early, so the status hook can find the project
    saveMeta(run);
  } else if (j.type === "assistant") {
    for (const c of j.message?.content ?? []) {
      if (c.type === "text" && c.text?.trim()) push(run, { t: "text", text: c.text, sub, agent: owner });
      if (c.type === "tool_use") {
        const call = (c.name === "Agent" || c.name === "Task") && c.input?.subagent_type;
        if (call) run.parents[c.id] = c.input.subagent_type;
        push(run, { t: "tool", name: c.name, detail: short(describeTool(c.name, c.input)), sub, agent: call ? c.input.subagent_type : owner });
      }
    }
  } else if (j.type === "result") {
    run.cost = j.total_cost_usd ?? null;
    run.sessionId = j.session_id ?? run.sessionId;
    const denials = (j.permission_denials ?? []).map((d) => ({ name: d.tool_name, detail: short(describeTool(d.tool_name, d.tool_input), 300), rule: ruleFor(d.tool_name, d.tool_input) }));
    const unique = [...new Map(denials.map((d) => [d.rule, d])).values()];
    if (unique.length) { run.denials = unique; push(run, { t: "denied", tools: unique }); }
    // An error result usually repeats the last assistant text; show it once.
    const last = run.events.at(-1);
    const repeat = last?.t === "text" && last.text.trim() === String(j.result ?? "").trim();
    if (!(repeat && j.is_error)) push(run, { t: "result", text: j.result ?? "", isError: !!j.is_error, cost: run.cost });
    if (j.is_error) run.error = j.result;
  }
}

// ---------- one Claude session per project ----------
// studio/sessions.json: { byProject: { slug: sessionId }, bySession: { sessionId: slug } }
// Lets "Lanjutkan" and checkpoint answers continue the same conversation instead of starting cold,
// and tells the status hook which project a session is working on.
const SESSIONS = path.join(ROOT, "studio", "sessions.json");
const loadSessions = () => { try { const j = JSON.parse(readFileSync(SESSIONS, "utf8")); return { byProject: j.byProject ?? {}, bySession: j.bySession ?? {} }; } catch { return { byProject: {}, bySession: {} }; } };
function bindSession(slug, sessionId) {
  if (!slug || !sessionId) return;
  const s = loadSessions();
  const old = s.byProject[slug];
  if (old && old !== sessionId) delete s.bySession[old];
  s.byProject[slug] = sessionId;
  s.bySession[sessionId] = slug;
  try { writeFileSync(SESSIONS, JSON.stringify(s, null, 2) + "\n"); } catch {}
}
// Claude Code stores each session under ~/.claude/projects/<cwd with non-alphanumerics as "-">/<id>.jsonl.
const sessionExists = (id) => existsSync(path.join(os.homedir(), ".claude", "projects", ROOT.replace(/[^A-Za-z0-9]/g, "-"), `${id}.jsonl`));
const projectSlugs = () => { try { return readdirSync(path.join(ROOT, "projects"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
export const isProject = (slug) => typeof slug === "string" && /^[a-z0-9][a-z0-9-]*$/.test(slug) && projectSlugs().includes(slug);

export function startRun({ prompt, label, resume, project, extraAllow = [], chrome = false }) {
  mkdirSync(RUNS_DIR, { recursive: true });
  if (project && !resume) {
    const saved = loadSessions().byProject[project];
    if (saved && sessionExists(saved)) resume = saved;
  }
  const before = new Set(projectSlugs());
  const perms = loadPermissions();
  const id = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${randomUUID().slice(0, 6)}`;
  const run = {
    id, label: label ?? short(prompt, 80), prompt, project: project ?? null, resumedFrom: resume ?? null, sessionId: resume ?? null,
    status: "running", startedAt: new Date().toISOString(), endedAt: null, cost: null, denials: [], error: null, chrome,
    events: [], buf: "",
  };
  runs.set(id, run);
  const args = [
    "-p", prompt,
    "--output-format", "stream-json", "--verbose",
    "--permission-mode", "acceptEdits",
    "--allowedTools", [...perms.allow, ...extraAllow].join(","),
  ];
  if (perms.deny.length) args.push("--disallowedTools", perms.deny.join(","));
  if (resume) args.push("--resume", resume);
  // Extra folders agents may work in (e.g. a client's work folder outside the studio), from studio/config.json web.addDirs.
  for (const d of webConfig().addDirs ?? []) {
    const abs = String(d).replace(/^~(?=\/)/, os.homedir());
    if (path.isAbsolute(abs) && existsSync(abs)) args.push("--add-dir", abs);
  }
  const model = webConfig().orchestratorModel;
  if (model && /^[\w.-]+$/.test(model)) args.push("--model", model);
  args.push(chrome ? "--chrome" : "--no-chrome");

  push(run, { t: "prompt", text: prompt });
  let child;
  try {
    child = spawn(CLAUDE, args, { cwd: ROOT, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    run.status = "error"; run.error = e.message; push(run, { t: "error", text: e.message }); saveMeta(run);
    return run;
  }
  run.child = child;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    run.buf += d;
    let i;
    while ((i = run.buf.indexOf("\n")) >= 0) { handleLine(run, run.buf.slice(0, i)); run.buf = run.buf.slice(i + 1); }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => { const t = d.trim(); if (t) push(run, { t: "stderr", text: short(t, 600) }); });
  child.on("error", (e) => { run.status = "error"; run.error = e.message; push(run, { t: "error", text: `Tidak bisa menjalankan Claude Code: ${e.message}` }); saveMeta(run); });
  child.on("close", (code) => {
    if (run.buf.trim()) handleLine(run, run.buf);
    run.child = null;
    run.endedAt = new Date().toISOString();
    if (run.status === "running") run.status = run.error ? "error" : code === 0 ? "done" : "error";
    if (run.status === "error" && !run.error) run.error = `Claude Code berhenti (kode ${code})`;
    if (/not logged in|\/login/i.test(run.error ?? "")) run.needsLogin = true;
    // Bind the session to its project, including projects this run just created (e.g. /proyek-baru).
    const created = projectSlugs().filter((s) => !before.has(s));
    if (!run.project && created.length === 1) run.project = created[0];
    if (run.project && run.sessionId && !run.needsLogin) bindSession(run.project, run.sessionId);
    settleAgents(run);
    saveMeta(run);
  });
  saveMeta(run);
  return run;
}

// An agent still marked "working" when its run ends will never report back (stopped, crashed, killed).
// Mark it idle with a reason so the office and the pipeline don't show a ghost worker.
function settleAgents(run) {
  if (!run.project) return;
  try {
    const st = JSON.parse(readFileSync(path.join(ROOT, "projects", run.project, "status.json"), "utf8"));
    for (const [id, a] of Object.entries(st.agents ?? {})) {
      if (a.state !== "working") continue;
      const why = run.status === "stopped" ? "dihentikan dari web" : run.status === "error" ? "run gagal" : "run selesai sebelum agen melapor";
      execFileSync("node", [path.join(ROOT, "scripts/status.mjs"), run.project, id, "idle", `Terhenti: ${why}. Tekan Lanjutkan untuk mengulang.`], { cwd: ROOT, stdio: "ignore", timeout: 8000 });
    }
  } catch {}
}

// Only one run at a time: parallel runs on one project double the work, and two design jobs at once
// (Chrome renders + BiRefNet cut-outs) can freeze the laptop.
export function activeRun() {
  for (const r of runs.values()) if (r.status === "running" && r.child) return r;
  return null;
}

// The owner answered a permission request: hide it so it can't be answered twice.
export function resolveDenial(id, rule) {
  const run = getRun(id);
  if (!run) return false;
  run.denials = (run.denials ?? []).map((d) => (d.rule === rule ? { ...d, resolved: true } : d));
  if (runs.has(id)) runs.get(id).denials = run.denials;
  saveMeta(run);
  return true;
}

export function stopRun(id) {
  const run = runs.get(id);
  if (!run?.child) return false;
  run.status = "stopped";
  push(run, { t: "error", text: "Dihentikan dari web." });
  run.child.kill("SIGTERM");
  return true;
}

function fromDisk(id) {
  try {
    const meta = JSON.parse(readFileSync(path.join(RUNS_DIR, `${id}.meta.json`), "utf8"));
    const events = readFileSync(path.join(RUNS_DIR, `${id}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (meta.status === "running") meta.status = "stopped"; // server restarted mid-run
    return { ...meta, events };
  } catch { return null; }
}

export function getRun(id) {
  if (!/^[\w-]+$/.test(id)) return null;
  return runs.get(id) ?? fromDisk(id);
}

export function listRuns(limit = 30) {
  let ids = [];
  try { ids = readdirSync(RUNS_DIR).filter((f) => f.endsWith(".meta.json")).map((f) => f.replace(".meta.json", "")); } catch {}
  for (const id of runs.keys()) if (!ids.includes(id)) ids.push(id);
  return ids.sort().reverse().slice(0, limit).map((id) => {
    const r = runs.get(id) ?? fromDisk(id);
    if (!r) return null;
    const { events, child, buf, parents, ...meta } = r;
    if (meta.status === "running" && !child && runs.has(id)) meta.status = "stopped";
    return meta;
  }).filter(Boolean);
}

export function publicRun(run, since = 0) {
  const { child, buf, events, parents, ...meta } = run;
  return { ...meta, events: events.slice(since), total: events.length };
}
