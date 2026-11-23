import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./root";

// Each agent's model lives in the frontmatter of .claude/agents/<id>.md:
//   provider: claude | gemini     who runs the agent
//   model: opus | sonnet | haiku  Claude model (used when provider is claude)
//   gemini-model: gemini-2.5-pro  Gemini model (used when provider is gemini)
const DIR = path.join(ROOT, ".claude", "agents");
export const CLAUDE_MODELS = ["opus", "sonnet", "haiku"];
export const GEMINI_MODELS = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-pro-latest"]; // Pro: 0 kuota di paket gratis (Nov 2026)

function split(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  return { head: m ? m[1] : "", body: m ? src.slice(m[0].length) : src };
}
const field = (head, k) => head.match(new RegExp(`^${k}:\\s*(.*)$`, "m"))?.[1].trim() ?? null;

export function agentConfig(id) {
  const file = path.join(DIR, `${id}.md`);
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(file)) return null;
  const { head } = split(readFileSync(file, "utf8"));
  return { provider: field(head, "provider") ?? "claude", model: field(head, "model") ?? "sonnet", geminiModel: field(head, "gemini-model") ?? GEMINI_MODELS[0] };
}
export function allAgentConfigs() {
  const out = {};
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".md"))) out[f.slice(0, -3)] = agentConfig(f.slice(0, -3));
  return out;
}
export function setAgentConfig(id, { provider, model, geminiModel }) {
  const file = path.join(DIR, `${id}.md`);
  if (!agentConfig(id)) throw new Error("agen tidak dikenal");
  if (!["claude", "gemini"].includes(provider)) throw new Error("provider harus claude atau gemini");
  if (!CLAUDE_MODELS.includes(model)) throw new Error("model Claude tidak valid");
  if (!/^gemini-[\w.-]+$/.test(geminiModel ?? "")) throw new Error("model Gemini tidak valid");
  let { head, body } = split(readFileSync(file, "utf8"));
  const put = (k, v) => { head = new RegExp(`^${k}:`, "m").test(head) ? head.replace(new RegExp(`^${k}:.*$`, "m"), `${k}: ${v}`) : `${head}\n${k}: ${v}`; };
  put("model", model); put("provider", provider); put("gemini-model", geminiModel);
  writeFileSync(file, `---\n${head}\n---\n${body}`);
  return agentConfig(id);
}
// Personal Google sign-in no longer works for Gemini CLI, so only an API key in .env.local counts as ready.
export const geminiReady = () => (() => { try { return /^\s*(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*\S/m.test(readFileSync(path.join(ROOT, ".env.local"), "utf8")); } catch { return false; } })();
