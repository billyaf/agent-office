import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { guard } from "../../../../lib/server/root";
import { readMedia } from "../../../../lib/server/works";

export const dynamic = "force-dynamic";

// ?w=<px>: a small JPEG thumbnail made once with macOS sips and cached by file + mtime. Galleries show
// 2000 px previews and 2 MB PNGs in 100 px tiles; decoding those froze the page for a second or two.
const THUMBS = path.join(tmpdir(), "kantor-thumbs");
const run = promisify(execFile);
async function thumb(m, w) {
  const key = createHash("sha1").update(`${m.abs}|${statSync(m.abs).mtimeMs}|${w}`).digest("hex");
  const out = path.join(THUMBS, `${key}.jpg`);
  if (!existsSync(out)) {
    mkdirSync(THUMBS, { recursive: true });
    await run("sips", ["-Z", String(w), "-s", "format", "jpeg", "-s", "formatOptions", "78", m.abs, "--out", out], { timeout: 20000 });
  }
  return { abs: out, type: "image/jpeg", size: statSync(out).size };
}

// Images and MP4 from a client's work folder: ?slug=<project>&file=… or ?client=…&folder=…&file=…
// Supports Range so the browser can seek in videos.
export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const m = readMedia({ slug: q.get("slug"), client: q.get("client"), folder: q.get("folder"), file: q.get("file"), layanan: q.get("layanan") });
  if (!m) return new Response("Tidak ditemukan", { status: 404 });
  const w = Number(q.get("w"));
  if (w && m.type !== "video/mp4") {
    try {
      const t = await thumb(m, Math.max(64, Math.min(960, Math.round(w))));
      return new Response(Readable.toWeb(createReadStream(t.abs)), { headers: { "Content-Type": t.type, "Content-Length": String(t.size), "Cache-Control": "private, max-age=86400" } });
    } catch { /* fall back to the original */ }
  }
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range && m.type === "video/mp4") {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), m.size - 1) : Math.min(start + 4 * 1024 * 1024, m.size - 1);
    return new Response(Readable.toWeb(createReadStream(m.abs, { start, end })), {
      status: 206,
      headers: { "Content-Type": m.type, "Content-Range": `bytes ${start}-${end}/${m.size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(m.abs)), { headers: { "Content-Type": m.type, "Content-Length": String(m.size), "Accept-Ranges": "bytes", "Cache-Control": "no-cache" } });
}
