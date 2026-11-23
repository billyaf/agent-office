import { guard } from "../../../lib/server/root";
import { allAgentConfigs, setAgentConfig, geminiReady, CLAUDE_MODELS, GEMINI_MODELS } from "../../../lib/server/agents";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  return Response.json({ agents: allAgentConfigs(), geminiReady: geminiReady(), claudeModels: CLAUDE_MODELS, geminiModels: GEMINI_MODELS }, { headers: { "Cache-Control": "no-store" } });
}

// body: { id, provider: "claude"|"gemini", model, geminiModel }
export async function PUT(req) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  try { return Response.json({ id: b.id, config: setAgentConfig(String(b.id ?? ""), b) }); }
  catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
}
