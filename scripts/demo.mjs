#!/usr/bin/env node
// Seeds a few fictional projects so the office has something to show without running any agent:
//   node scripts/demo.mjs          (then open http://localhost:3210)
// Remove them again with: node scripts/demo.mjs --clean
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const st = (...a) => execFileSync("node", [join(ROOT, "scripts/status.mjs"), ...a], { stdio: "ignore" });
const DEMO = ["demo-carousel-ai", "demo-video-tidur", "demo-ep-wifi", "demo-stock-batik"];

if (process.argv.includes("--clean")) {
  for (const s of DEMO) rmSync(join(ROOT, "projects", s), { recursive: true, force: true });
  console.log("demo: proyek contoh dihapus");
  process.exit(0);
}

const fresh = (slug) => !existsSync(join(ROOT, "projects", slug, "status.json"));

// Lantai 1: a carousel waiting at the facts checkpoint.
if (fresh(DEMO[0])) {
  st(DEMO[0], "init", "konten", "Carousel: 5 tips aman pakai AI", "meeting-1");
  st(DEMO[0], "project-manager", "done", "Brief dan cek fakta selesai");
  writeFileSync(join(ROOT, "projects", DEMO[0], "00_brief.md"), "# Brief · 5 tips aman pakai AI\n\nCarousel 5 slide untuk Klien Demo. Pesan utama: jangan tempel data pribadi ke chatbot.\n\n## Fakta yang perlu dikonfirmasi\n1. Angka survei di slide 2: sumbernya?\n");
  st(DEMO[0], "checkpoint", "CP fakta: angka survei di slide 2 boleh dipakai?");
}
// Lantai 2: a video in production.
if (fresh(DEMO[1])) {
  st(DEMO[1], "init", "tiktok", "Video: kenapa susah tidur cepat", "meeting-1");
  st(DEMO[1], "tiktok-strategist", "done", "Ide dipilih");
  st(DEMO[1], "tiktok-scriptwriter", "done", "Script 10 ketukan lolos cek-script");
  st(DEMO[1], "tiktok-motion-designer", "working", "Storyboard draf tanpa VO");
}
// Lantai 3: an episode being researched.
if (fresh(DEMO[2])) {
  st(DEMO[2], "init", "explainer", "Episode: kenapa wifi lemot", "meeting-1");
  st(DEMO[2], "explainer-researcher", "working", "Menyusun 3 konsep dan memverifikasi fakta");
}
// Lantai Dasar: a stock campaign done.
if (fresh(DEMO[3])) {
  st(DEMO[3], "init", "stock", "Campaign: motif batik geometris", "meeting-1");
  st(DEMO[3], "stock-researcher", "done", "Rencana 30 aset");
  st(DEMO[3], "stock-generator", "done", "30 SVG + preview");
  st(DEMO[3], "stock-curator", "done", "QC lolos, metadata.csv siap");
}
console.log("demo: 4 proyek contoh siap. Jalankan: npm --prefix office run dev");
