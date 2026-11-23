#!/usr/bin/env node
// Claude Code hook: keeps projects/<slug>/status.json in sync whenever a studio agent is called,
// so the virtual office is right even if an agent forgets to run scripts/status.mjs itself.
//   PreToolUse (Task|Agent) -> agent "working" with the task description
//   SubagentStop            -> agent "done" with the first line of its final message
// It never blocks Claude: every failure exits 0 quietly (details go to studio/runs/hooks.log).
import { readFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOG = path.join(ROOT, "studio/runs/hooks.log");
const log = (msg) => { try { mkdirSync(path.dirname(LOG), { recursive: true }); appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`); } catch {} };
const short = (s, n = 90) => { const t = String(s ?? "").replace(/[*`#>]+/g, "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };

function activeProjects() {
  let slugs = [];
  try { slugs = readdirSync(path.join(ROOT, "projects"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
  return slugs
    .map((s) => ({ slug: s, st: readJson(path.join(ROOT, "projects", s, "status.json"), null) }))
    .filter((p) => p.st && p.st.phase !== "archived");
}

// Which project is this about? 1) a slug named in the task text, 2) the project this session is bound to, 3) the only active project.
function findSlug(text, sessionId) {
  const projects = activeProjects();
  const t = String(text ?? "");
  const named = projects.filter((p) => new RegExp(`(^|[^a-z0-9-])${p.slug}([^a-z0-9-]|$)`).test(t));
  if (named.length === 1) return named[0].slug;
  const bound = readJson(path.join(ROOT, "studio/sessions.json"), {}).bySession?.[sessionId];
  if (bound && projects.some((p) => p.slug === bound)) return bound;
  if (projects.length === 1) return projects[0].slug;
  return null;
}

function setStatus(slug, agent, state, note) {
  execFileSync("node", [path.join(ROOT, "scripts/status.mjs"), slug, agent, state, note], { cwd: ROOT, stdio: "ignore", timeout: 8000 });
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const roster = new Set((readJson(path.join(ROOT, "studio/roster.json"), { agents: [] }).agents ?? []).map((a) => a.id));
  let agent, slug, state, note;

  if (input.hook_event_name === "PreToolUse") {
    const ti = input.tool_input ?? {};
    agent = ti.subagent_type;
    if (!roster.has(agent)) process.exit(0);
    slug = findSlug(`${ti.description ?? ""}\n${ti.prompt ?? ""}`, input.session_id);
    state = "working";
    note = short(ti.description || ti.prompt);
  } else if (input.hook_event_name === "SubagentStop") {
    agent = input.agent_type;
    if (!roster.has(agent)) process.exit(0);
    let task = "";
    try { // the subagent's first message is the task it was given
      const first = JSON.parse(readFileSync(input.agent_transcript_path, "utf8").split("\n")[0]);
      const c = first?.message?.content;
      task = typeof c === "string" ? c : (c ?? []).map((x) => x.text ?? "").join(" ");
    } catch {}
    slug = findSlug(task, input.session_id);
    state = "done";
    // first meaningful line of the final message, minus labels like "File dibuat:" and absolute paths
    const line = String(input.last_assistant_message ?? "").split("\n").map((l) => l.replaceAll(ROOT + "/", "").replace(/[*`#>]+/g, "").trim()).find((l) => l && !/^-+$/.test(l)) ?? "";
    note = short(line || "Selesai");
  } else process.exit(0);

  if (!slug) { log(`${agent} ${state}: proyek tidak diketahui, dilewati`); process.exit(0); }
  setStatus(slug, agent, state, note || (state === "done" ? "Selesai" : "Bekerja"));
} catch (e) {
  log(`hook gagal: ${e.message}`);
}
process.exit(0);
