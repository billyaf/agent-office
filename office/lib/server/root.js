import path from "node:path";

// The studio root (one level above office/).
export const ROOT = path.resolve(process.cwd(), "..");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// The control API runs Claude Code and writes files, so it only answers the browser on this machine.
// Checks Host (blocks DNS rebinding) and, for writes, Origin (blocks other sites posting to localhost).
export function guard(req, { write = false } = {}) {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!LOCAL_HOSTS.has(host)) return Response.json({ error: "Hanya bisa diakses dari komputer ini." }, { status: 403 });
  if (write) {
    const origin = req.headers.get("origin");
    let ok = false;
    try { ok = origin && LOCAL_HOSTS.has(new URL(origin).hostname); } catch {}
    if (!ok) return Response.json({ error: "Permintaan ditolak (origin tidak dikenal)." }, { status: 403 });
  }
  return null;
}

// Resolves a path inside ROOT, refusing anything that escapes it.
export function inside(rel) {
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) throw new Error("Path di luar folder studio");
  return abs;
}
