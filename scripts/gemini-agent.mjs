#!/usr/bin/env node
// Runs one studio agent on Google Gemini (Gemini CLI, headless) instead of a Claude subagent.
// The orchestrator calls this for agents whose frontmatter says `provider: gemini`:
//   node scripts/gemini-agent.mjs <agent-id> <slug> "<tugas lengkap>"
//   node scripts/gemini-agent.mjs <agent-id> <slug> "<tugas>" --dry-run   (show the command, run nothing)
// It marks the agent working/done in status.json, gives Gemini the agent's role file as instructions,
// limits tools with a policy built from studio/web-permissions.json, and prints the agent's final report.
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = path.join(ROOT, "studio/runs/gemini");
const die = (m) => { console.error(`gemini-agent: ${m}`); process.exit(1); };
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const [agent, slug, ...rest] = args.filter((a) => a !== "--dry-run");
const task = rest.join(" ").trim();
if (!agent || !slug || !task) die('pemakaian: gemini-agent.mjs <agent-id> <slug> "<tugas>"');
if (!/^[a-z0-9-]+$/.test(agent) || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) die("agent-id atau slug tidak valid");

// ---- agent file: frontmatter + role instructions ----
const file = path.join(ROOT, ".claude/agents", `${agent}.md`);
if (!existsSync(file)) die(`agen tidak dikenal: ${agent}`);
const src = readFileSync(file, "utf8");
const fm = Object.fromEntries((src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "").split("\n").map((l) => l.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const role = src.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
const model = fm["gemini-model"] || "gemini-flash-latest";
if (!/^[\w.-]+$/.test(model)) die(`gemini-model tidak valid: ${model}`);

// ---- tool policy from the same allow/deny list the Claude agents use ----
const perms = readJson(path.join(ROOT, "studio/web-permissions.json"), { allow: [], deny: [] });
const prefixOf = (rule) => {
  const m = rule.match(/^Bash\((.*)\)$/);
  if (!m) return null;
  return m[1].replace(/:\*$/, "").replace(/\*$/, "").replace(/^~(?=\/)/, os.homedir());
};
const q = (s) => JSON.stringify(s);
const lines = ["# Dibuat otomatis oleh scripts/gemini-agent.mjs dari studio/web-permissions.json. Jangan diedit."];
const rule = (o) => lines.push("[[rule]]", ...Object.entries(o).map(([k, v]) => `${k} = ${typeof v === "number" ? v : q(v)}`), "");
for (const t of ["read_file", "read_many_files", "list_directory", "glob", "search_file_content", "grep_search", "write_file", "replace", "web_fetch", "google_web_search", "save_memory", "write_todos"]) rule({ toolName: t, decision: "allow", priority: 100 });
for (const r of perms.allow) { const p = prefixOf(r); if (p) rule({ toolName: "run_shell_command", commandPrefix: p, decision: "allow", priority: 200 }); }
for (const r of perms.deny) { const p = prefixOf(r); if (p) rule({ toolName: "run_shell_command", commandPrefix: p.split(" * ")[0], decision: "deny", priority: 900 }); }
rule({ toolName: "run_shell_command", decision: "deny", priority: 10, denyMessage: "Perintah ini belum diizinkan di studio/web-permissions.json." });
mkdirSync(RUNS, { recursive: true });
const policy = path.join(RUNS, "policy.toml");
writeFileSync(policy, lines.join("\n") + "\n");

// ---- extra folders (client work folders, user skills) ----
const cfg = readJson(path.join(ROOT, "studio/config.json"), {}).web ?? {};
const dirs = (cfg.addDirs ?? []).map((d) => String(d).replace(/^~(?=\/)/, os.homedir())).filter((d) => path.isAbsolute(d) && existsSync(d));

// ---- auth: Google login from `gemini` (~/.gemini) or a key in .env.local ----
const env = { ...process.env };
for (const k of Object.keys(env)) if (/^(CLAUDE|CLAUDECODE|ANTHROPIC_)/.test(k)) delete env[k];
try {
  for (const l of readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = l.match(/^\s*(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*"?([^"\s]+)"?/);
    if (m) env[m[1]] = m[2];
  }
} catch {}
// Google ended Gemini CLI sign-in for personal Google accounts (Code Assist for individuals), so an API key
// from Google AI Studio is the working route. With a key, workspace settings force the API-key auth type,
// because the user-level ~/.gemini/settings.json may still say oauth-personal.
const hasKey = !!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
if (hasKey) {
  if (!env.GEMINI_API_KEY) env.GEMINI_API_KEY = env.GOOGLE_API_KEY;
  mkdirSync(path.join(ROOT, ".gemini"), { recursive: true });
  writeFileSync(path.join(ROOT, ".gemini/settings.json"), JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }, null, 2) + "\n");
}
const loggedIn = hasKey;

const prompt = `Anda dijalankan oleh orkestrator Kantor Virtual Agen sebagai agen **${agent}** (model Gemini).
Folder studio: ${ROOT}. Proyek: ${slug} (projects/${slug}/).
Baca dulu ${ROOT}/CLAUDE.md (aturan studio) dan ikuti peran Anda di bawah.
"Skill <nama>" berarti: baca dan ikuti ${os.homedir()}/.claude/skills/<nama>/SKILL.md.
Anda bekerja tanpa layar: tidak ada yang bisa menjawab pertanyaan di tengah tugas. Jika butuh keputusan pemilik, tulis di laporan akhir.

# Peran Anda
${role}

# Tugas dari orkestrator
${task}`;

const cli = ["-p", prompt, "-m", model, "--output-format", "json", "--approval-mode", "default", "--policy", policy, "--skip-trust"];
for (const d of dirs) cli.push("--include-directories", d);

if (dry) {
  console.log(JSON.stringify({ agent, slug, model, loggedIn: !!loggedIn, dirs, policy, args: cli.map((a) => (a === prompt ? `<prompt ${prompt.length} karakter>` : a)) }, null, 2));
  process.exit(0);
}
if (!loggedIn) die("Gemini belum siap. Isi GEMINI_API_KEY di .env.local (buat key di https://aistudio.google.com/apikey).");

const status = (state, note) => { try { execFileSync("node", [path.join(ROOT, "scripts/status.mjs"), slug, agent, state, note], { cwd: ROOT, stdio: "ignore" }); } catch {} };
const short = (s, n = 90) => { const t = String(s ?? "").replace(/[*`#>]+/g, "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
status("working", `(Gemini) ${short(task)}`);

// ---- run over a model chain before giving up to Claude ----
// Gemini CLI already retries a 503 ten times with backoff (about six minutes) before it fails, and the
// orchestrator's Bash call times out at ten minutes. So: watch stderr, and on the second 503 retry stop
// that model and move to the next one; 429 or an unavailable model also moves on. A hard limit ends
// everything before the orchestrator's timeout so it still gets the "CADANGAN" line and can use Claude.
const chain = [...new Set([model, "gemini-flash-latest", "gemini-flash-lite-latest"])];
const HARD = 9 * 60 * 1000;
const started = Date.now();
const LABEL = { busy: "model Gemini sedang penuh (503)", net: "koneksi ke Google putus", quota: "kuota Gemini habis (429)", model: "model Gemini tidak tersedia", time: "batas waktu 9 menit habis" };
const kindOf = (why) =>
  /high demand|overloaded|503|UNAVAILABLE/i.test(why) ? "busy"
  : /fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|socket hang up/i.test(why) ? "net"
  : /quota|429|RESOURCE_EXHAUSTED|rate limit/i.test(why) ? "quota"
  : /no longer available|not found|404|not supported for|is not available/i.test(why) ? "model"
  : "other";

function once(m) {
  return new Promise((resolve) => {
    const argv = cli.map((a, k) => (cli[k - 1] === "-m" ? m : a));
    const child = spawn("gemini", argv, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", cut = null;
    const stop = (why) => { if (!cut) { cut = why; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 3000); } };
    const timer = setTimeout(() => stop("time"), Math.max(5000, HARD - (Date.now() - started)));
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => {
      err += d;
      const n = [...err.matchAll(/Attempt (\d+) failed with status (503|429)/g)].pop();
      if (n && Number(n[1]) >= 2) stop(n[2] === "429" ? "quota" : "busy");
    });
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, out, err: `tidak bisa menjalankan gemini: ${e.message}`, cut }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out, err, cut }); });
  });
}

const tried = [];
let last = null;
for (const m of chain) {
  if (Date.now() - started > HARD - 20000) break;
  if (tried.length) status("working", `(Gemini ${m}) ${short(task, 70)}`);
  let r = await once(m);
  let res = null;
  const parse = () => { res = null; try { res = JSON.parse(r.out); } catch {} };
  parse();
  let why = r.cut ? LABEL[r.cut] : res?.error?.message ?? r.err.trim().split("\n").slice(-3).join(" ");
  let kind = r.cut ?? kindOf(why);
  if (!(r.code === 0 && !res?.error) && kind === "net" && Date.now() - started < HARD - 60000) {
    await new Promise((ok) => setTimeout(ok, 10000)); // one retry for a dropped connection
    r = await once(m); parse();
    why = r.cut ? LABEL[r.cut] : res?.error?.message ?? r.err.trim().split("\n").slice(-3).join(" ");
    kind = r.cut ?? kindOf(why);
  }
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  writeFileSync(path.join(RUNS, `${stamp}-${agent}.json`), JSON.stringify({ agent, slug, model: m, task, code: r.code, cut: r.cut, stdout: r.out, stderr: r.err.slice(-4000) }, null, 2));
  const report = res?.response ?? r.out.trim();
  if (r.code === 0 && !res?.error && report && !r.cut) {
    const first = report.split("\n").map((l) => l.replaceAll(ROOT + "/", "").replace(/[*`#>]+/g, "").trim()).find((l) => l && !/^-+$/.test(l));
    status("done", short(first || "Selesai"));
    if (tried.length) console.log(`(Gemini berhasil dengan ${m} setelah: ${tried.join("; ")})\n`);
    console.log(report);
    process.exit(0);
  }
  last = { m, why, kind };
  tried.push(`${m}: ${LABEL[kind] ?? short(why, 50)}`);
  if (!["busy", "net", "quota", "model"].includes(kind)) break; // tool, policy or auth errors: another model will not help
}

const reason = LABEL[last?.kind] ?? short(last?.why ?? LABEL.time, 60);
status("idle", `Gemini gagal: ${reason}. Dialihkan ke Claude.`);
const hint = /no longer supported|Antigravity/i.test(last?.why ?? "") && !hasKey ? " Login akun Google pribadi sudah tidak didukung Gemini CLI; isi GEMINI_API_KEY di .env.local (https://aistudio.google.com/apikey)." : "";
console.error(`gemini-agent: ${agent} gagal (${tried.join("; ") || reason}).${hint}`);
console.error(`CADANGAN: jalankan ${agent} sebagai subagent Claude dengan tugas yang sama, lalu sebut di laporan bahwa Gemini gagal (${reason}).`);
process.exit(1);
