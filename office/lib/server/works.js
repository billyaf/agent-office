import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./root";

// Output lives outside the studio, in each client's work folder (studio/config.json clients.<id>.workDir):
//   klien-demo (floor 1, konten):        <workDir>/<project slug>/*.png, canva/*.pptx (+ storyboard/*.png, video/*.mp4 for konten-motion)
//   kanaldemo (floor 2, tiktok):  <workDir>/<NNN-slug>/storyboard.png, qc/*.png, *.mp4
//     (the folder name comes from projects/<slug>/video.json, written by the scriptwriter)
//   explainer (floor 3):              <workDir>/<epNNN-slug>/04_preview/*.jpg, 05_render/*.mp4
//   adobestock / magnific (ground):   <workDir>/<NN-slug>/preview/*.jpg
//     (for these three the folder name comes from projects/<slug>/work.json { "folder": … }, written by the first maker)
const CLIENT_OF = { konten: "klien-demo", "konten-motion": "klien-demo", tiktok: "kanaldemo", explainer: "explainer", stock: "adobestock", magnific: "magnific" };
export const CLIENTS = [...new Set(Object.values(CLIENT_OF))];
// sub-folders that hold previews / videos for the newer clients
const LAYOUT = {
  explainer: { images: "04_preview", videos: "05_render" },
  adobestock: { images: "preview" },
  magnific: { images: "preview" },
};
function workDir(client) {
  try {
    const d = JSON.parse(readFileSync(path.join(ROOT, "studio/config.json"), "utf8")).clients?.[client]?.workDir;
    const abs = String(d ?? "").replace(/^~(?=\/)/, os.homedir());
    return path.isAbsolute(abs) && existsSync(abs) ? abs : null;
  } catch { return null; }
}
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IMG = /^[\w.-]+\.(png|jpe?g|webp)$/i;
const MEDIA = /^((qc|preview|04_preview|05_render|storyboard|video)\/)?[\w.-]+\.(png|jpe?g|webp|mp4)$/i;
const isPreview = (n) => /pratinjau|preview|masker|strip/i.test(n);
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

// Which client folder holds a project's output.
function locate(slug) {
  if (!SLUG.test(slug)) return null;
  const type = readJson(path.join(ROOT, "projects", slug, "status.json"))?.type ?? "konten";
  const client = CLIENT_OF[type] ?? "klien-demo";
  const base = workDir(client);
  if (!base) return null;
  if (client === "kanaldemo") {
    const folder = readJson(path.join(ROOT, "projects", slug, "video.json"))?.slug;
    return { client, base, folder: SLUG.test(folder ?? "") ? folder : null };
  }
  if (LAYOUT[client]) {
    const folder = readJson(path.join(ROOT, "projects", slug, "work.json"))?.folder;
    return { client, base, folder: SLUG.test(folder ?? "") ? folder : null };
  }
  return { client, base, folder: slug };
}

const imagesIn = (dir, prefix = "") => {
  try {
    return readdirSync(dir).filter((n) => IMG.test(n) && !n.endsWith(".masker.png"))
      .map((n) => ({ name: prefix + n, mtime: statSync(path.join(dir, n)).mtimeMs, preview: isPreview(n) }));
  } catch { return []; }
};

function listFolder(client, base, folder) {
  const dir = path.join(base, folder);
  if (!existsSync(dir)) return { exists: false, images: [], pptx: [], videos: [] };
  let images = imagesIn(dir);
  let videos = [];
  let pptx = [];
  if (LAYOUT[client]) {
    const L = LAYOUT[client];
    images = imagesIn(path.join(dir, L.images), L.images + "/").sort((a, b) => (a.name.includes("contact") ? -1 : 0) - (b.name.includes("contact") ? -1 : 0) || a.name.localeCompare(b.name));
    if (L.videos) {
      try { videos = readdirSync(path.join(dir, L.videos)).filter((n) => /\.mp4$/i.test(n) && !/nomusic/i.test(n)).sort().reverse().map((n) => ({ name: `${L.videos}/${n}`, size: statSync(path.join(dir, L.videos, n)).size })); } catch {}
    }
  } else if (client === "kanaldemo") {
    // storyboard first, then the three QC stills in story order
    const order = { "storyboard.png": 0, "qc/awal.png": 1, "qc/tengah.png": 2, "qc/akhir.png": 3 };
    images = [...images, ...imagesIn(path.join(dir, "qc"), "qc/")].sort((a, b) => (order[a.name] ?? 9) - (order[b.name] ?? 9));
    videos = readdirSync(dir).filter((n) => /\.mp4$/i.test(n)).map((n) => ({ name: n, size: statSync(path.join(dir, n)).size }));
  } else {
    images.sort((a, b) => b.mtime - a.mtime);
    try { pptx = readdirSync(path.join(dir, "canva")).filter((n) => n.endsWith(".pptx")); } catch {}
    // Reels motion (kit instagram/motion): storyboard/adegan-NN.png and video/<slug>_vN.mp4
    const sb = imagesIn(path.join(dir, "storyboard"), "storyboard/").sort((a, b) => a.name.localeCompare(b.name));
    if (sb.length) images = [...sb, ...images];
    try { videos = readdirSync(path.join(dir, "video")).filter((n) => /\.mp4$/i.test(n)).sort().reverse().map((n) => ({ name: `video/${n}`, size: statSync(path.join(dir, "video", n)).size })); } catch {}
  }
  return { exists: true, dir, images, pptx, videos };
}

export function listWork(slug) {
  const loc = locate(slug);
  if (!loc) return null;
  if (!loc.folder) return { slug, exists: false, images: [], pptx: [], videos: [], client: loc.client };
  return { slug, client: loc.client, folder: loc.folder, ...listFolder(loc.client, loc.base, loc.folder) };
}

export function recentWorks(client = "klien-demo", limit = 6) {
  const base = workDir(client);
  if (!base) return [];
  return readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory() && SLUG.test(d.name))
    .map((d) => ({ folder: d.name, ...listFolder(client, base, d.name) })).filter((w) => w.images.length)
    .map((w) => ({
      slug: w.folder, client,
      cover: (w.images.find((i) => i.name === "qc/tengah.png") ?? w.images.find((i) => /contact/i.test(i.name)) ?? w.images.find((i) => !i.preview) ?? w.images[0]).name,
      count: w.images.filter((i) => !i.preview).length, pptx: w.pptx.length, videos: w.videos.length,
      mtime: Math.max(...w.images.map((i) => i.mtime)),
    }))
    .sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

// GET by project slug, or by client + folder (gallery of folders without a project).
export function readMedia({ slug, client, folder, file, layanan }) {
  let base, dirName;
  // Output of a help request: projects/<slug>/layanan/<id>-<layanan>/<file>
  if (slug && layanan) {
    if (!SLUG.test(slug) || !/^b\d{1,3}-[a-z0-9-]{1,40}$/.test(layanan)) return null;
    base = path.join(ROOT, "projects", slug, "layanan"); dirName = layanan;
  } else if (slug) { const loc = locate(slug); if (!loc?.folder) return null; base = loc.base; dirName = loc.folder; }
  else { if (!CLIENTS.includes(client) || !SLUG.test(folder ?? "")) return null; base = workDir(client); dirName = folder; }
  if (!base || !MEDIA.test(file ?? "")) return null;
  const root = path.join(base, dirName);
  const abs = path.join(root, file);
  if (!abs.startsWith(root + path.sep) || !existsSync(abs)) return null;
  const type = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : /\.mp4$/i.test(file) ? "video/mp4" : "image/jpeg";
  return { abs, type, size: statSync(abs).size };
}
