#!/usr/bin/env node
// Status agen per proyek. Kantor 3D membaca projects/<slug>/status.json.
//
//   node scripts/status.mjs <slug> init konten "<nama>" <meeting-1..meeting-4>
//   node scripts/status.mjs <slug> <agent-id> <working|done|idle> "<catatan>"
//   node scripts/status.mjs <slug> checkpoint "<pertanyaan untuk pemilik>"
//   node scripts/status.mjs <slug> decision <setuju|revisi> "<catatan>"
//   node scripts/status.mjs <slug> show

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const roster = JSON.parse(readFileSync(join(ROOT, "studio/roster.json"), "utf8"));
const AGENT_IDS = new Set(roster.agents.map((a) => a.id));
const TYPES = ["konten", "konten-motion", "tiktok", "explainer", "stock", "magnific"];
const STATES = ["working", "done", "idle"];

const die = (msg) => { console.error(`status: ${msg}`); process.exit(1); };
const now = () => new Date().toISOString();

const [slug, cmd, ...rest] = process.argv.slice(2);
if (!slug || !cmd) die("pemakaian: status.mjs <slug> <init|checkpoint|decision|show|agent-id> ...");
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) die(`slug tidak valid: ${slug}`);

const dir = join(ROOT, "projects", slug);
const file = join(dir, "status.json");

function load() {
  if (!existsSync(file)) die(`belum ada ${file}; jalankan init dulu`);
  return JSON.parse(readFileSync(file, "utf8"));
}
function save(s) {
  s.updatedAt = now();
  s.history = s.history.slice(-200);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n");
  renameSync(tmp, file); // atomic, so the office never reads a half-written file
}
function log(s, event, extra = {}) { s.history.push({ at: now(), event, ...extra }); }

if (cmd === "init") {
  const [type, name, room = "meeting-1"] = rest;
  if (!TYPES.includes(type)) die(`jenis harus salah satu dari: ${TYPES.join(", ")}`);
  if (!name) die("nama proyek wajib diisi");
  if (!roster.meetingRooms.includes(room)) die(`ruang meeting tidak dikenal: ${room}`);
  // The web opens the project before the orchestrator starts, so a second init is normal: keep the existing one.
  if (existsSync(file)) { console.log(`status: proyek ${slug} sudah terbuka, lanjut`); process.exit(0); }
  mkdirSync(dir, { recursive: true });
  const s = {
    slug, name, type, meetingRoom: room, phase: "active",
    createdAt: now(), updatedAt: now(), checkpoint: null, agents: {}, history: [],
  };
  log(s, "init", { note: name });
  save(s);
  console.log(`status: proyek ${slug} dibuat (${type}, ${room})`);
} else if (cmd === "checkpoint") {
  const s = load();
  const question = rest.join(" ").trim();
  if (!question) die("pertanyaan checkpoint wajib diisi");
  s.phase = "checkpoint";
  s.checkpoint = { question, since: now() };
  log(s, "checkpoint", { note: question });
  save(s);
  console.log(`status: ${slug} menunggu persetujuan di ${s.meetingRoom}`);
} else if (cmd === "decision") {
  const s = load();
  const [decision, ...note] = rest;
  if (!["setuju", "revisi"].includes(decision)) die("keputusan harus 'setuju' atau 'revisi'");
  // The web records the owner's answer the moment they click; the orchestrator's /checkpoint then finds it done.
  if (s.phase !== "checkpoint") { console.log(`status: ${slug} tidak sedang menunggu checkpoint; keputusan sudah tercatat`); process.exit(0); }
  log(s, "decision", { decision, note: note.join(" "), question: s.checkpoint?.question ?? null });
  s.phase = "active";
  s.checkpoint = null;
  save(s);
  console.log(`status: ${slug} keputusan ${decision} dicatat`);
} else if (cmd === "show") {
  console.log(JSON.stringify(load(), null, 2));
} else if (AGENT_IDS.has(cmd)) {
  const s = load();
  const [state, ...note] = rest;
  if (!STATES.includes(state)) die(`state harus salah satu dari: ${STATES.join(", ")}`);
  s.agents[cmd] = { state, note: note.join(" "), updatedAt: now() };
  log(s, state, { agent: cmd, note: note.join(" ") });
  save(s);
  console.log(`status: ${cmd} → ${state}`);
} else {
  die(`perintah atau agent-id tidak dikenal: ${cmd}`);
}
