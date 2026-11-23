#!/usr/bin/env node
// Alat baku HTML → PNG lewat Chrome headless, untuk hasil layanan antarlantai (mis. thumbnail dari Pictor).
//   node scripts/html-png.mjs <file.html> <keluar.png> [lebarxtinggi]      default 1080x1920
// Hanya untuk file di projects/<slug>/layanan/ (folder hasil bantuan), supaya tidak dipakai untuk hal lain.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const die = (m) => { console.error(`html-png: ${m}`); process.exit(1); };

const [src, out, size = "1080x1920"] = process.argv.slice(2);
if (!src || !out) die("pemakaian: html-png.mjs <file.html> <keluar.png> [lebarxtinggi]");
const html = path.resolve(src), png = path.resolve(out);
const area = path.join(ROOT, "projects");
const ok = (p) => p.startsWith(area + path.sep) && p.split(path.sep).includes("layanan");
if (!ok(html) || !ok(png)) die("file harus di dalam projects/<slug>/layanan/");
if (!html.endsWith(".html") || !existsSync(html)) die(`tidak ada ${html}`);
if (!png.endsWith(".png")) die("keluaran harus .png");
const m = size.match(/^(\d{2,4})x(\d{2,4})$/);
if (!m) die("ukuran harus lebarxtinggi, mis. 1080x1920");
if (!existsSync(CHROME)) die("Google Chrome tidak ditemukan");

mkdirSync(path.dirname(png), { recursive: true });
execFileSync(CHROME, ["--headless=new", "--allow-file-access-from-files", "--hide-scrollbars", `--window-size=${m[1]},${m[2]}`, "--virtual-time-budget=6000", `--screenshot=${png}`, `file://${html}`], { stdio: "ignore", timeout: 60000 });
if (!existsSync(png)) die("Chrome tidak menghasilkan PNG");
console.log(`✓ ${path.relative(ROOT, png)} (${m[1]}×${m[2]}, ${Math.round(statSync(png).size / 1024)} KB)`);
