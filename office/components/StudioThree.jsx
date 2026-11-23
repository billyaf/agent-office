"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// The building (Atrium) in three.js: floors stacked straight on one footprint under one roof, a lift core at the back
// corner, each floor a cut-away room behind a curved glass curtain wall. No model files; everything is low-poly geometry and canvas textures.
// Room coordinates (per floor): x 0..~19 to the right, z 0..~13 toward the viewer, y up. One unit ≈ a metre.
const W = 18, D = 12, WALL_H = 3;
const wx = (x) => x - W / 2;
const wz = (z) => z - D / 2;
const FLOOR_GAP = WALL_H + 0.45; // floor-to-floor: walls plus the slab of the floor above
const CORE = [-1.5, -1.5]; // lift core, behind the back-left corner (room coordinates)

const TOKENS = { paper: "#F4EDE0", ink: "#1D3557", steel: "#457B9D", aqua: "#A8DADC", mint: "#F1FAEE", red: "#E63946" };
const PS = 1.2; // person scale
const SKIN = ["#f1c9a5", "#d9a77e", "#b07a52", "#8a5a3c"];
const SHIRT = {
  "project-manager": "#14937a", copywriter: "#c2410c", "senior-graphic-designer": "#3b7fcd", "visual-qa": "#7c3aed", "digital-asset-manager": "#475569",
  "tiktok-strategist": "#457B9D", "tiktok-scriptwriter": "#E63946", "tiktok-motion-designer": "#1D3557", "tiktok-qc": "#2a9d8f", "tiktok-publisher": "#e9a23b",
};
const PALETTE = ["#3b7fcd", "#f2bd1f", "#14937a", "#e4572e", "#7c3aed", "#f28fad", "#1f2a44", "#9bd1e5", "#f4ece0", "#2fb896"];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerpAngle = (a, b, k) => { let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
const hashOf = (s) => [...s].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) >>> 0;

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------- floor plans ----------------
// solid: walls that carry decor; glass: curved curtain wall facing the viewer
function joinOutline(solid, glass) {
  const a = solid.getPoints(16), b = glass.getPoints(16);
  const pts = [...a, ...b.slice(1)];
  if (pts[pts.length - 1].distanceTo(pts[0]) < 1e-3) pts.pop();
  return { solidPts: a, glassPath: glass, outline: pts };
}
function designPlan() {
  const solid = new THREE.Path(); solid.moveTo(0, 12.3); solid.lineTo(0, 0); solid.lineTo(18, 0);
  const glass = new THREE.Path(); glass.moveTo(18, 0);
  glass.quadraticCurveTo(19.6, 2.6, 19.2, 6.5);
  glass.absellipse(13, 6.5, 6.2, 6.2, 0, Math.PI / 2, false);
  glass.quadraticCurveTo(6.5, 13.1, 0, 12.3);
  return joinOutline(solid, glass);
}
// every floor shares the building footprint (designPlan); the old rounded TikTok plan is kept for reference
const tiktokPlan = () => designPlan();
function tiktokPlanRounded() {
  const solid = new THREE.Path(); solid.moveTo(0, 6.5); solid.lineTo(0, 2.5);
  solid.absarc(2.5, 2.5, 2.5, Math.PI, 1.5 * Math.PI, false); solid.lineTo(15.5, 0);
  solid.absarc(15.5, 2.5, 2.5, 1.5 * Math.PI, 2 * Math.PI, false); solid.lineTo(18, 6.5);
  const glass = new THREE.Path(); glass.moveTo(18, 6.5);
  glass.absarc(12.5, 6.5, 5.5, 0, Math.PI / 2, false); glass.lineTo(5.5, 12);
  glass.absarc(5.5, 6.5, 5.5, Math.PI / 2, Math.PI, false);
  return joinOutline(solid, glass);
}

// Lantai 2 is laid out as a production line around the voice booth: ide → script → VO → render → QC → upload.
const BOOTH = [9, 5.4];
const RING_R = 4.4;
const ringAt = (deg, r = RING_R) => { const a = (deg * Math.PI) / 180; return [BOOTH[0] + r * Math.sin(a), BOOTH[1] - r * Math.cos(a)]; };
const ringStation = (deg, o) => { const [x, z] = ringAt(deg); return { x, z, rot: (-deg * Math.PI) / 180, w: 2.4, d: 1.2, ...o }; };
const roundSeats = (cx, cz, r, n) => Array.from({ length: n }, (_, i) => {
  const t = (i / n) * Math.PI * 2 + Math.PI / 6;
  const x = cx + r * Math.cos(t), z = cz + r * Math.sin(t);
  return { x, z, face: Math.atan2(cx - x, cz - z), sit: true, seatY: 0.48 };
});
const RECT_SEATS = [[3.3, 6.55, 0], [4.7, 6.55, 0], [6.1, 6.55, 0], [3.3, 9.65, Math.PI], [4.7, 9.65, Math.PI], [6.1, 9.65, Math.PI]]
  .map(([x, z, face]) => ({ x, z, face, sit: true, seatY: 0.48 }));
const LINE = [
  { deg: -105, n: "1", t: "IDE" }, { deg: -55, n: "2", t: "SCRIPT" }, { deg: -27, n: "3", t: "VO" },
  { deg: 0, n: "4", t: "RENDER" }, { deg: 55, n: "5", t: "QC" }, { deg: 105, n: "6", t: "UPLOAD" },
];

const FLOORS = {
  design: {
    plan: designPlan, build: buildDesign,
    stations: {
      "project-manager": { x: 2.2, z: 2.0, w: 2.4, d: 1.2, extra: "board" },
      copywriter: { x: 5.4, z: 2.0, w: 2.4, d: 1.2, extra: "books" },
      "senior-graphic-designer": { x: 9.1, z: 2.0, w: 3.4, d: 1.2, monitors: 2, extra: "tablet" },
      "visual-qa": { x: 12.6, z: 2.0, w: 2.4, d: 1.2, extra: "loupe" },
      "digital-asset-manager": { x: 15.0, z: 7.4, w: 2.4, d: 1.2, extra: "boxes" },
    },
    spots: [
      { id: "sofa1", x: 9.6, z: 11.0, face: Math.PI, sit: true, seatY: 0.45, stay: [8, 16] },
      { id: "sofa2", x: 10.6, z: 11.0, face: Math.PI, sit: true, seatY: 0.45, stay: [8, 16] },
      { id: "sofa3", x: 11.6, z: 11.0, face: Math.PI, sit: true, seatY: 0.45, stay: [8, 16] },
      { id: "coffee", x: 1.45, z: 10.5, face: -Math.PI / 2, stay: [3, 6] },
      { id: "window", x: 12.6, z: 4.4, face: Math.PI, stay: [3, 6] },
      { id: "mood", x: 0.95, z: 5.0, face: -Math.PI / 2, stay: [3, 7] },
      { id: "photo", x: 15.2, z: 4.7, face: Math.PI, stay: [3, 7] },
      { id: "easel", x: 7.4, z: 6.4, face: Math.PI, stay: [3, 7] },
      { id: "plotter", x: 15.2, z: 9.9, face: 0, stay: [3, 6] },
      { id: "bay", x: 17.6, z: 10.0, face: 0.7, stay: [3, 6] },
    ],
    meetSeats: RECT_SEATS,
  },
  tiktok: {
    plan: tiktokPlan, build: buildTiktok,
    stations: {
      "tiktok-strategist": ringStation(-105, { extra: "board" }),
      "tiktok-scriptwriter": ringStation(-55, { extra: "books" }),
      "tiktok-motion-designer": ringStation(0, { w: 3.0, monitors: 2, extra: "tablet" }),
      "tiktok-qc": ringStation(55, { extra: "loupe" }),
      "tiktok-publisher": ringStation(105, { extra: "phone" }),
    },
    spots: [
      { id: "sofa1", x: 8.2, z: 11.0, face: Math.PI, sit: true, seatY: 0.45, stay: [8, 16] },
      { id: "sofa2", x: 9.2, z: 11.0, face: Math.PI, sit: true, seatY: 0.45, stay: [8, 16] },
      { id: "sofa3", x: 10.2, z: 11.0, face: Math.PI, sit: true, seatY: 0.45, stay: [8, 16] },
      { id: "booth", x: 9.0, z: 6.0, face: Math.PI, stay: [3, 7] },
      { id: "coret", x: 6.8, z: 9.7, face: Math.PI, stay: [3, 7] },
      { id: "ring", x: 14.6, z: 8.5, face: 0, stay: [3, 6] },
      { id: "story", x: 4.6, z: 0.95, face: Math.PI, stay: [3, 7] },
      { id: "ideas", x: 0.95, z: 3.65, face: -Math.PI / 2, stay: [3, 7] },
      { id: "timeline", x: 13.1, z: 0.95, face: Math.PI, stay: [3, 6] },
    ],
    meetSeats: roundSeats(3.7, 9.2, 1.6, 6),
  },
};
FLOORS.adobestock = {
  plan: stockPlan, build: buildStock, center: [4.6, 6.4], camOff: [7.5, 10.5, 11.5], tagAt: [3.6, 13.0],
  stations: {
    "stock-researcher": { x: 2.0, z: 2.0, w: 2.4, d: 1.2, extra: "board" },
    "stock-generator": { x: 5.4, z: 2.0, w: 3.0, d: 1.2, monitors: 2, extra: "tablet" },
    "stock-curator": { x: 7.6, z: 5.4, w: 2.4, d: 1.2, extra: "books" },
  },
  spots: [
    { id: "swatch", x: 1.0, z: 4.9, face: -Math.PI / 2, stay: [3, 7] },
    { id: "calendar", x: 8.2, z: 3.3, face: Math.PI, stay: [3, 6] },
    { id: "rack", x: 7.6, z: 9.6, face: 0, stay: [3, 6] },
    { id: "coffee", x: 1.3, z: 10.7, face: -Math.PI / 2, stay: [3, 6] },
    { id: "door", x: 8.5, z: 8.5, face: Math.PI / 2, stay: [2, 4] },
    { id: "window", x: 4.6, z: 11.4, face: 0, stay: [3, 6] },
  ],
  meetSeats: roundSeats(3.3, 9.3, 1.3, 4),
};
FLOORS.magnific = {
  plan: magnificPlan, build: buildMagnific, center: [14.0, 6.4], camOff: [7.5, 10.5, 11.5], tagAt: [14.2, 13.0],
  stations: {
    "magnific-researcher": { x: 11.0, z: 2.0, w: 2.4, d: 1.2, extra: "board" },
    "magnific-artist": { x: 14.4, z: 2.0, w: 3.0, d: 1.2, monitors: 2, extra: "tablet" },
    "magnific-exporter": { x: 15.8, z: 6.2, w: 2.4, d: 1.2, extra: "boxes" },
  },
  spots: [
    { id: "neon", x: 16.9, z: 3.4, face: Math.PI, stay: [3, 6] },
    { id: "belt", x: 13.4, z: 11.1, face: Math.PI, stay: [3, 7] },
    { id: "rack", x: 16.8, z: 8.7, face: Math.PI / 2, stay: [3, 6] },
    { id: "window", x: 18.4, z: 4.6, face: Math.PI / 2, stay: [3, 6] },
    { id: "door", x: 10.0, z: 8.5, face: -Math.PI / 2, stay: [2, 4] },
    { id: "trends", x: 10.4, z: 4.6, face: -Math.PI / 2, stay: [3, 6] },
  ],
  meetSeats: roundSeats(12.2, 6.8, 1.3, 4),
};
FLOORS.explainer = {
  plan: designPlan, build: buildExplainer3D,
  stations: {
    "explainer-researcher": { x: 2.0, z: 2.0, w: 2.4, d: 1.2, extra: "books" },
    "explainer-scriptwriter": { x: 4.8, z: 2.0, w: 2.4, d: 1.2, extra: "board" },
    "explainer-3d-director": { x: 8.3, z: 2.0, w: 3.2, d: 1.2, monitors: 2, extra: "tablet" },
    "explainer-reviewer": { x: 12.0, z: 2.0, w: 2.4, d: 1.2, extra: "loupe" },
    "explainer-audio-engineer": { x: 2.4, z: 5.6, w: 2.4, d: 1.2, extra: "mixer" },
  },
  spots: [
    { id: "sofa1", x: 11.1, z: 11.0, face: Math.PI, sit: true, seatY: 0.45, stay: [8, 16] },
    { id: "sofa2", x: 12.1, z: 11.0, face: Math.PI, sit: true, seatY: 0.45, stay: [8, 16] },
    { id: "sofa3", x: 13.1, z: 11.0, face: Math.PI, sit: true, seatY: 0.45, stay: [8, 16] },
    { id: "turntable", x: 9.6, z: 8.4, face: Math.PI, stay: [3, 7] },
    { id: "coffee", x: 1.3, z: 10.1, face: -Math.PI / 2, stay: [3, 6] },
    { id: "led", x: 6.4, z: 4.4, face: Math.PI, stay: [3, 6] },
    { id: "story", x: 14.3, z: 3.4, face: Math.PI, stay: [3, 7] },
    { id: "racks", x: 16.6, z: 2.2, face: Math.PI, stay: [3, 6] },
  ],
  meetSeats: roundSeats(4.8, 9.6, 1.55, 6),
};
const deskSeat = (cfg, id) => {
  const s = cfg.stations[id], r = s.rot ?? 0, lz = s.d / 2 + 0.5;
  return { x: s.x + lz * Math.sin(r), z: s.z + lz * Math.cos(r), face: r + Math.PI, sit: true, seatY: 0.5 };
};

// ---------------- building kit (helpers bound to one floor group) ----------------
function kit(root) {
  const mats = new Map();
  const mat = (color, o = {}) => {
    const k = color + JSON.stringify(o);
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...o }));
    return mats.get(k);
  };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const obstacles = [];
  const block = (x, z, w, d) => obstacles.push([x, z, w, d]);
  const blockRot = (cx, cz, hw, hd, rot) => obstacles.push({ cx, cz, hw, hd, rot });
  const add = (m, shadow = true) => { m.castShadow = shadow; m.receiveShadow = true; root.add(m); return m; };
  const M = (c) => (typeof c === "string" ? mat(c) : c);
  // box with its min corner at (x, z) and its base at height y
  const box = (x, z, w, d, h, color, y = 0, shadow = true) => {
    const m = new THREE.Mesh(unit, M(color));
    m.scale.set(w, h, d);
    m.position.set(wx(x + w / 2), y + h / 2, wz(z + d / 2));
    return add(m, shadow);
  };
  const cyl = (x, z, r, h, color, y = 0, rTop = r, seg = 16) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), M(color));
    m.position.set(wx(x), y + h / 2, wz(z));
    return add(m);
  };
  const plane = (w, h, material, x, y, z, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(wx(x), y, wz(z));
    m.rotation.y = rotY;
    root.add(m);
    return m;
  };
  // flat decal lying on the floor (custom geometry optional)
  const decal = (geo, material, x, z, y = 0.012) => {
    const m = new THREE.Mesh(geo, material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(wx(x), y, wz(z));
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const rod = (from, to, r, color) => {
    const A = new THREE.Vector3(wx(from[0]), from[1], wz(from[2])), B = new THREE.Vector3(wx(to[0]), to[1], wz(to[2]));
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), M(color));
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, B.clone().sub(A).normalize());
    return add(m);
  };
  // three legs spread evenly from a hub down to the floor
  const tripodLegs = (x, z, hubY, spread, r, color, turn = 0) => {
    for (let k = 0; k < 3; k++) {
      const a = turn + (k * Math.PI * 2) / 3;
      rod([x, hubY, z], [x + Math.cos(a) * spread, 0.01, z + Math.sin(a) * spread], r, color);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 8, 6), mat("#111827"));
      foot.position.set(wx(x + Math.cos(a) * spread), r, wz(z + Math.sin(a) * spread));
      add(foot);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.2, r * 2.2, 0.07, 10), mat("#111827"));
    hub.position.set(wx(x), hubY, wz(z));
    add(hub);
  };
  const leaf = new THREE.MeshStandardMaterial({ color: "#3f9a5c", roughness: 0.9, flatShading: true });
  const plant = (x, z, s = 1, pot = "#c9b8a0") => {
    cyl(x, z, 0.2 * s, 0.42 * s, pot, 0, 0.24 * s, 10);
    const r = rng(Math.round(x * 13 + z * 7));
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry((0.22 + r() * 0.12) * s, 0), leaf);
      m.position.set(wx(x) + (r() - 0.5) * 0.3 * s, (0.62 + r() * 0.45) * s, wz(z) + (r() - 0.5) * 0.3 * s);
      add(m);
    }
    block(x - 0.3 * s, z - 0.3 * s, 0.6 * s, 0.6 * s);
  };

  // walls and glass follow a polyline; each segment's outward side is away from `center`
  const segs = (pts, center) => {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dz = b.y - a.y, len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      let nx = -dz / len, nz = dx / len;
      const mx = (a.x + b.x) / 2, mz = (a.y + b.y) / 2;
      if ((mx - center[0]) * nx + (mz - center[1]) * nz < 0) { nx = -nx; nz = -nz; }
      out.push({ a, b, dx, dz, len, nx, nz, mx, mz });
    }
    return out;
  };
  const pathLen = (pts) => segs(pts, [0, 0]).reduce((s, g) => s + g.len, 0);
  const wallAlong = (pts, { h, y = 0, thick = 0.2, color, center = [9, 6], overlap = 0.04, shadow = true }) => {
    for (const s of segs(pts, center)) {
      const m = new THREE.Mesh(unit, M(color));
      m.scale.set(s.len + overlap, h, thick);
      m.position.set(wx(s.mx + (s.nx * thick) / 2), y + h / 2, wz(s.mz + (s.nz * thick) / 2));
      m.rotation.y = Math.atan2(-s.dz, s.dx);
      add(m, shadow);
    }
  };
  // a continuous inner skin (texture runs along the whole wall), u in metres × uScale
  const stripAlong = (pts, { y0, y1, material, center = [9, 6], inset = 0.006, uScale = 1 }) => {
    const pos = [], uv = [];
    let u = 0;
    for (const s of segs(pts, center)) {
      const ax = wx(s.a.x - s.nx * inset), az = wz(s.a.y - s.nz * inset), bx = wx(s.b.x - s.nx * inset), bz = wz(s.b.y - s.nz * inset);
      const u0 = u * uScale, u1 = (u + s.len) * uScale;
      u += s.len;
      pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const glassMat = new THREE.MeshStandardMaterial({ color: "#d8ecf7", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  // spaced points along a Path, or along a polyline given as an array of Vector2
  const spaced = (path, step) => {
    if (!Array.isArray(path)) return path.getSpacedPoints(Math.max(4, Math.round(path.getLength() / step)));
    const len = pathLen(path), n = Math.max(2, Math.round(len / step)), out = [path[0]];
    let seg = 1, acc = 0;
    for (let i = 1; i < n; i++) {
      const want = (len * i) / n;
      while (seg < path.length - 1 && acc + path[seg].distanceTo(path[seg - 1]) < want) { acc += path[seg].distanceTo(path[seg - 1]); seg++; }
      const a = path[seg - 1], b = path[seg], l = a.distanceTo(b) || 1;
      out.push(a.clone().lerp(b, Math.min(1, (want - acc) / l)));
    }
    out.push(path[path.length - 1]);
    return out;
  };
  const glassAlong = (path, frame = "#2b3440") => {
    const pts = spaced(path, 1.15);
    wallAlong(pts, { h: 0.32, thick: 0.16, color: "#f4f3ef" });
    wallAlong(pts, { h: 0.07, y: 2.74, thick: 0.1, color: frame });
    wallAlong(pts, { h: WALL_H - 2.81, y: 2.81, thick: 0.16, color: "#f4f3ef" }); // spandrel up to the slab above
    stripAlong(pts, { y0: 0.32, y1: 2.74, material: glassMat, inset: -0.08 });
    for (const p of pts) cyl(p.x, p.y, 0.028, 2.81, frame, 0, 0.028, 6);
  };
  // floor surface + white slab with the floor's own outline
  const slab = (outline, floorMat) => {
    const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(wx(p.x), -wz(p.y))));
    const top = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), floorMat);
    top.geometry.rotateX(-Math.PI / 2);
    top.receiveShadow = true;
    root.add(top);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false, curveSegments: 1 }), [mat("#d9d4ca"), mat("#f5f3ee", { roughness: 0.6 })]);
    body.geometry.rotateX(-Math.PI / 2);
    body.position.y = -0.452;
    body.receiveShadow = true;
    root.add(body);
    return top;
  };

  // desk with chair; (x, z) is the desk centre, rot turns it (monitors on the local -z side, chair on +z)
  const screens = {};
  const deskAt = (id, s) => {
    const { x, z, w, d, rot = 0 } = s;
    const g = new THREE.Group();
    g.position.set(wx(x), 0, wz(z));
    g.rotation.y = rot;
    root.add(g);
    const lb = (lx, lz, bw, bd, h, color, y = 0) => { const m = new THREE.Mesh(unit, M(color)); m.scale.set(bw, h, bd); m.position.set(lx + bw / 2, y + h / 2, lz + bd / 2); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const lc = (lx, lz, r, h, color, y = 0, rTop = r, seg = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), M(color)); m.position.set(lx, y + h / 2, lz); m.castShadow = true; g.add(m); return m; };
    const X = -w / 2, Z = -d / 2;
    lb(X, Z, w, d, 0.06, "#f1e7d6", 0.7);
    for (const [lx, lz] of [[X + 0.05, Z + 0.05], [X + w - 0.1, Z + 0.05], [X + 0.05, Z + d - 0.1], [X + w - 0.1, Z + d - 0.1]]) lb(lx, lz, 0.05, 0.05, 0.7, "#8a8f98");
    const screen = new THREE.MeshStandardMaterial({ color: "#1f2733", emissive: "#6fb6ff", emissiveIntensity: 0.05, roughness: 0.35 });
    screens[id] = screen;
    const n = s.monitors ?? 1, mw = n > 1 ? 1.0 : 0.95, gap = (w - n * mw) / (n + 1);
    for (let i = 0; i < n; i++) {
      const mx = X + gap + i * (mw + gap);
      lb(mx + mw / 2 - 0.03, Z + 0.28, 0.06, 0.06, 0.24, "#4b5563", 0.76);
      lb(mx + mw / 2 - 0.15, Z + 0.22, 0.3, 0.18, 0.02, "#4b5563", 0.76);
      lb(mx, Z + 0.22, mw, 0.05, 0.56, screen, 0.98);
    }
    lb(X + w / 2 - 0.3, Z + 0.72, 0.6, 0.2, 0.025, "#d1d5db", 0.76);
    lc(X + w - 0.3, Z + 0.75, 0.05, 0.11, PALETTE[hashOf(id) % PALETTE.length], 0.76);
    if (s.extra === "tablet") { lb(X + 0.25, Z + 0.68, 0.5, 0.34, 0.02, "#111827", 0.76); lc(X + w - 0.55, Z + 0.4, 0.06, 0.16, "#e4572e", 0.76); for (let i = 0; i < 4; i++) lc(X + w - 0.58 + i * 0.02, Z + 0.4, 0.008, 0.26, PALETTE[i], 0.8); }
    if (s.extra === "books") for (let i = 0; i < 4; i++) lb(X + 0.18, Z + 0.3, 0.42, 0.3, 0.06, PALETTE[i + 2], 0.76 + i * 0.06);
    if (s.extra === "loupe") { lb(X + 0.2, Z + 0.62, 0.36, 0.46, 0.015, "#ffffff", 0.76); lc(X + 0.7, Z + 0.85, 0.08, 0.02, "#9ca3af", 0.78); }
    if (s.extra === "board") { lb(X + 0.15, Z + 0.55, 0.5, 0.42, 0.02, "#fde68a", 0.76); lb(X + 0.25, Z + 0.45, 0.3, 0.3, 0.02, "#f9a8d4", 0.785); }
    if (s.extra === "boxes") { lb(X + 0.15, Z + 0.3, 0.5, 0.4, 0.3, "#c8a47a", 0.76); lb(X + 0.2, Z + 0.35, 0.4, 0.3, 0.22, "#d6b48a", 1.06); }
    if (s.extra === "mixer") {
      lb(X + 0.2, Z + 0.5, 1.0, 0.5, 0.04, "#111827", 0.76);
      for (let i = 0; i < 8; i++) lb(X + 0.26 + i * 0.115, Z + 0.58 + (i % 3) * 0.1, 0.05, 0.05, 0.05, ["#E63946", "#A8DADC", "#457B9D"][i % 3], 0.8);
      lb(X + w - 0.45, Z + 0.2, 0.26, 0.26, 0.38, "#1f2937", 0.76);
    }
    if (s.extra === "phone") { lb(X + 0.3, Z + 0.5, 0.2, 0.12, 0.02, "#374151", 0.76); lb(X + 0.34, Z + 0.52, 0.12, 0.03, 0.24, "#111827", 0.78); lb(X + 0.7, Z + 0.55, 0.36, 0.26, 0.02, TOKENS.mint, 0.76); }
    // chair: the agent faces the desk, backrest toward the room
    const sz = d / 2 + 0.5;
    lb(-0.25, sz - 0.25, 0.5, 0.5, 0.08, "#3f4a5a", 0.42);
    lb(-0.25, sz + 0.2, 0.5, 0.07, 0.55, "#3f4a5a", 0.5);
    lc(0, sz, 0.035, 0.38, "#6b7280", 0.04);
    lc(0, sz, 0.26, 0.04, "#374151", 0, 0.26, 5);
    // desk + chair as one rotated obstacle
    blockRot(x + 0.4 * Math.sin(rot), z + 0.4 * Math.cos(rot), w / 2, d / 2 + 0.4, rot);
  };

  return { root, mat, unit, add, box, cyl, plane, decal, rod, tripodLegs, plant, block, blockRot, obstacles, wallAlong, stripAlong, glassAlong, slab, pathLen, deskAt, screens };
}

// ---------------- Lantai 1 · Design Studio ----------------
function buildDesign(k, plan) {
  const { root, mat, add, box, cyl, plane, rod, tripodLegs, plant, block } = k;
  const planks = canvasTexture(512, 512, (g, w) => {
    const r = rng(7);
    for (let row = 0; row < 8; row++) {
      const off = (row % 2) * 128 + r() * 60;
      for (let col = -1; col < 3; col++) {
        const v = 200 + r() * 26;
        g.fillStyle = `rgb(${v + 22},${v - 4},${v - 52})`;
        g.fillRect(off + col * 256, row * 64, 256, 64);
        g.fillStyle = "rgba(90,60,30,.18)";
        g.fillRect(off + col * 256, row * 64, 2, 64);
      }
      g.fillStyle = "rgba(90,60,30,.22)";
      g.fillRect(0, row * 64, w, 2);
    }
  });
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  planks.repeat.set(0.25, 0.25);
  const top = k.slab(plan.outline, new THREE.MeshStandardMaterial({ map: planks, roughness: 0.75 }));

  // walls: back and left solid, front and right a curved glass curtain
  k.wallAlong(plan.solidPts, { h: WALL_H, color: "#efe6d8" });
  k.wallAlong(plan.solidPts, { h: 0.08, y: WALL_H, thick: 0.24, color: "#cdbfa8" });
  k.wallAlong(plan.solidPts, { h: 0.14, thick: 0.04, color: "#d2c3aa", center: [-99, -99] }); // baseboard (inner side)
  k.glassAlong(plan.glassPath);
  // long ribbon windows on the back wall
  const glass = mat("#bfe0ff", { emissive: "#bfe0ff", emissiveIntensity: 0.45, roughness: 0.2 });
  const winBack = (x, w) => { box(x, 0, w, 0.06, 1.5, "#ffffff", 1.0); box(x + 0.08, 0.02, w - 0.16, 0.06, 1.34, glass, 1.08, false); box(x + w / 2 - 0.03, 0.04, 0.06, 0.06, 1.34, "#ffffff", 1.08); };
  winBack(0.7, 2.9);
  winBack(11.1, 3.3);
  box(0, 9.7, 0.06, 2.1, 1.5, "#ffffff", 1.0);
  box(0.02, 9.78, 0.06, 1.94, 1.34, glass, 1.08, false);

  // studio identity: neon sign + colour swatches on the back wall
  const neon = canvasTexture(1024, 192, (g, w) => {
    g.textAlign = "center"; g.textBaseline = "middle";
    const glow = (text, y, size, color, halo) => {
      g.font = `800 ${size}px 'Avenir Next', 'Helvetica Neue', system-ui, sans-serif`;
      g.fillStyle = color; g.shadowColor = halo;
      g.shadowBlur = 26; g.fillText(text, w / 2, y);
      g.shadowBlur = 7; g.fillText(text, w / 2, y);
    };
    glow("P U S D A T I N", 42, 44, "#ffe39a", "#f2bd1f");
    glow("DESIGN STUDIO", 128, 100, "#e6f2ff", "#5aa2ff");
  });
  plane(5.4, 1.0, new THREE.MeshBasicMaterial({ map: neon, transparent: true, toneMapped: false }), 7.6, 2.45, 0.03);
  PALETTE.forEach((c, i) => {
    box(4.75 + i * 0.58, 0.02, 0.48, 0.03, 0.5, "#ffffff", 1.48, false);
    box(4.79 + i * 0.58, 0.04, 0.40, 0.02, 0.34, c, 1.6, false);
  });
  // mood board on the left wall
  box(0, 3.6, 0.05, 2.8, 1.35, "#c49a6c", 1.0);
  {
    const r = rng(11);
    for (let i = 0; i < 14; i++) {
      const w = 0.32 + r() * 0.28, h = 0.24 + r() * 0.26;
      const z = 3.72 + r() * (2.56 - w), y = 1.08 + r() * (1.19 - h);
      box(0.05, z, 0.015, w, h, PALETTE[Math.floor(r() * PALETTE.length)], y, false);
      box(0.066, z + w / 2 - 0.02, 0.012, 0.04, 0.04, "#e4572e", y + h - 0.06, false);
    }
  }
  // framed poster on the left wall (original abstract artwork)
  const poster = canvasTexture(256, 340, (g, w, h) => {
    g.fillStyle = "#1f2a44"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#f2bd1f"; g.beginPath(); g.arc(w * 0.62, h * 0.34, 74, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#3b7fcd"; g.fillRect(24, h * 0.55, w * 0.72, 30);
    g.fillStyle = "#f28fad"; g.fillRect(24, h * 0.55 + 42, w * 0.48, 30);
    g.fillStyle = "#f4ece0"; g.font = "700 30px system-ui"; g.fillText("make it", 24, h - 56); g.fillText("simple.", 24, h - 22);
  });
  box(0, 1.25, 0.05, 1.1, 1.45, "#222222", 1.05);
  plane(0.96, 1.3, new THREE.MeshStandardMaterial({ map: poster, roughness: 0.6 }), 0.055, 1.775, 1.8, Math.PI / 2);

  for (const [id, s] of Object.entries(FLOORS.design.stations)) k.deskAt(id, s);

  // photo corner: paper backdrop, softboxes, camera on a tripod
  const paper = "#cfd9e6";
  box(14.8, 0.05, 3.0, 0.04, 2.6, paper, 0);
  box(14.8, 0.09, 3.0, 2.2, 0.015, paper, 0);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.3, 14), mat("#475569"));
  roll.rotation.z = Math.PI / 2; roll.position.set(wx(16.3), 2.72, wz(0.14)); add(roll);
  cyl(14.62, 0.14, 0.025, 2.75, "#9ca3af"); cyl(17.98, 0.14, 0.025, 2.75, "#9ca3af");
  cyl(16.3, 1.3, 0.2, 0.05, "#f2bd1f", 0.55); cyl(16.3, 1.3, 0.03, 0.55, "#6b7280");
  block(14.6, 0, 3.4, 2.4);
  const softGlow = mat("#ffffff", { emissive: "#fff6e0", emissiveIntensity: 0.9 });
  for (const [sx, sz] of [[14.95, 3.25], [17.65, 3.25]]) {
    tripodLegs(sx, sz, 0.55, 0.32, 0.018, "#374151", 0.4);
    rod([sx, 0.55, sz], [sx, 1.62, sz], 0.022, "#374151");
    const head = new THREE.Group();
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 0.35, 4, 1), mat("#111827"));
    back.rotation.x = Math.PI / 2; back.rotation.y = Math.PI / 4;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), softGlow);
    front.position.z = 0.18;
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), mat("#111827"));
    mount.position.z = -0.2;
    head.add(back, front, mount);
    head.position.set(wx(sx), 1.74, wz(sz));
    root.add(head);
    root.updateWorldMatrix(true, false);
    head.lookAt(root.localToWorld(new THREE.Vector3(wx(16.3), 1.2, wz(1.0)))); // aim at the backdrop
    head.traverse((o) => { o.castShadow = true; });
    block(sx - 0.35, sz - 0.35, 0.7, 0.7);
  }
  const studioLight = new THREE.PointLight("#fff1dc", 6, 6, 1.6);
  studioLight.position.set(wx(16.3), 2.0, wz(2.6));
  root.add(studioLight);
  const CX = 16.3, CZ = 4.1;
  tripodLegs(CX, CZ, 1.05, 0.42, 0.02, "#1f2937", Math.PI / 2);
  rod([CX, 1.05, CZ], [CX, 1.2, CZ], 0.025, "#1f2937");
  box(CX - 0.09, CZ - 0.09, 0.18, 0.18, 0.04, "#111827", 1.2);
  box(CX - 0.16, CZ - 0.11, 0.32, 0.22, 0.22, "#111827", 1.24);
  box(CX - 0.06, CZ - 0.05, 0.12, 0.1, 0.06, "#1f2937", 1.46);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.2, 16), mat("#374151"));
  lens.rotation.x = Math.PI / 2; lens.position.set(wx(CX), 1.35, wz(CZ - 0.21)); add(lens);
  const glassEye = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), mat("#0b1220", { roughness: 0.1, metalness: 0.4 }));
  glassEye.position.set(wx(CX), 1.35, wz(CZ - 0.312)); glassEye.rotation.y = Math.PI; root.add(glassEye);
  const rec = new THREE.MeshBasicMaterial({ color: "#ff3b30", toneMapped: false });
  const recDot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), rec);
  recDot.position.set(wx(CX + 0.11), 1.43, wz(CZ - 0.115)); root.add(recDot);
  block(CX - 0.45, CZ - 0.45, 0.9, 0.9);

  // easel (A-frame) with a painting in progress
  const painting = canvasTexture(256, 200, (g, w, h) => {
    g.fillStyle = "#f4ece0"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#9bd1e5"; g.fillRect(0, 0, w, h * 0.55);
    g.fillStyle = "#f2bd1f"; g.beginPath(); g.arc(w * 0.7, h * 0.3, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#14937a"; g.beginPath(); g.moveTo(0, h * 0.75); g.quadraticCurveTo(w * 0.4, h * 0.3, w, h * 0.7); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  });
  const EX = 7.4, EZ = 5.5, wood = "#a47148";
  rod([EX - 0.42, 0, EZ + 0.18], [EX - 0.07, 1.78, EZ], 0.025, wood);
  rod([EX + 0.42, 0, EZ + 0.18], [EX + 0.07, 1.78, EZ], 0.025, wood);
  rod([EX, 0, EZ - 0.55], [EX, 1.7, EZ - 0.02], 0.022, wood);
  rod([EX - 0.34, 0.9, EZ + 0.15], [EX + 0.34, 0.9, EZ + 0.15], 0.02, wood);
  box(EX - 0.42, EZ + 0.1, 0.84, 0.14, 0.04, wood, 0.92);
  const tilt = Math.atan2(0.18, 1.78);
  const board = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.72, 0.04), mat("#ffffff"));
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.66), new THREE.MeshStandardMaterial({ map: painting, roughness: 0.9 }));
  art.position.z = 0.021;
  board.add(frame, art);
  board.position.set(wx(EX), 0.96 + 0.36, wz(EZ + 0.12));
  board.rotation.x = -tilt;
  board.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.add(board);
  block(EX - 0.55, EZ - 0.6, 1.1, 0.9);

  // meeting table + chairs + wall screen
  const [mx, mz, mw, md] = [2.6, 7.2, 4.2, 1.8];
  const meetGlow = new THREE.MeshStandardMaterial({ color: "#9a7754", emissive: "#f2bd1f", emissiveIntensity: 0, roughness: 0.6 });
  box(mx, mz, mw, md, 0.07, meetGlow, 0.68);
  for (const [lx, lz] of [[mx + 0.2, mz + 0.2], [mx + mw - 0.3, mz + 0.2], [mx + 0.2, mz + md - 0.3], [mx + mw - 0.3, mz + md - 0.3]]) box(lx, lz, 0.1, 0.1, 0.68, "#6b4f35");
  block(mx, mz, mw, md);
  for (const s of RECT_SEATS) {
    box(s.x - 0.24, s.z - 0.24, 0.48, 0.48, 0.07, "#475569", 0.41);
    const bz = s.face === 0 ? s.z - 0.3 : s.z + 0.23;
    box(s.x - 0.24, bz, 0.48, 0.07, 0.5, "#475569", 0.48);
    for (const [lx, lz] of [[-0.2, -0.2], [0.17, -0.2], [-0.2, 0.17], [0.17, 0.17]]) box(s.x + lx, s.z + lz, 0.04, 0.04, 0.41, "#334155");
    block(s.x - 0.28, s.z - 0.28, 0.56, 0.56);
  }
  box(0, 7.25, 0.06, 1.7, 1.0, "#111827", 1.25);
  const tv = new THREE.MeshStandardMaterial({ color: "#0f172a", emissive: "#3b7fcd", emissiveIntensity: 0.08 });
  box(0.04, 7.32, 0.03, 1.56, 0.86, tv, 1.32, false);

  // lounge
  box(8.2, 8.5, 4.9, 3.0, 0.015, "#cfdff2", 0, false);
  box(8.6, 10.65, 3.9, 0.95, 0.42, "#3b7fcd");
  box(8.6, 11.35, 3.9, 0.28, 0.9, "#346fb4");
  box(8.45, 10.6, 0.22, 1.05, 0.6, "#346fb4");
  box(12.45, 10.6, 0.22, 1.05, 0.6, "#346fb4");
  [9.3, 11.5].forEach((px, i) => box(px, 11.1, 0.5, 0.2, 0.42, i ? "#f2bd1f" : "#f28fad", 0.42));
  block(8.45, 10.6, 4.25, 1.05);
  box(9.9, 9.35, 1.4, 0.7, 0.05, "#c8a47a", 0.32);
  for (const [lx, lz] of [[9.98, 9.43], [11.22, 9.43], [9.98, 9.87], [11.22, 9.87]]) box(lx, lz, 0.08, 0.08, 0.32, "#8b6b4a");
  box(10.1, 9.5, 0.4, 0.3, 0.02, "#e4572e", 0.37); box(10.6, 9.55, 0.35, 0.28, 0.02, "#f4ece0", 0.37);
  block(9.9, 9.35, 1.4, 0.7);
  cyl(13.0, 11.3, 0.18, 0.04, "#374151"); cyl(13.0, 11.3, 0.02, 1.55, "#374151");
  cyl(13.0, 11.3, 0.24, 0.3, mat("#fff4d6", { emissive: "#ffd58a", emissiveIntensity: 0.7 }), 1.5, 0.14);
  block(12.75, 11.05, 0.5, 0.5);

  // coffee counter
  box(0.05, 9.6, 0.8, 1.9, 0.95, "#e9e1d4");
  box(0.03, 9.58, 0.84, 1.94, 0.05, "#a47148", 0.95);
  box(0.15, 10.25, 0.45, 0.4, 0.5, "#2f2f2f", 1.0);
  cyl(0.5, 10.95, 0.05, 0.1, "#ffffff", 1.0); cyl(0.5, 11.15, 0.05, 0.1, "#f2bd1f", 1.0);
  block(0, 9.6, 0.9, 1.9);

  // large-format printer with a fresh print, archive cabinets
  box(14.4, 10.7, 1.8, 0.65, 0.9, "#e5e7eb");
  box(14.45, 10.68, 1.7, 0.1, 0.08, "#111827", 0.75);
  const print = canvasTexture(256, 128, (g, w, h) => { g.fillStyle = "#3b7fcd"; g.fillRect(0, 0, w, h); g.fillStyle = "#f2bd1f"; g.fillRect(16, 16, 120, 36); g.fillStyle = "#fff"; g.fillRect(16, 64, 200, 12); g.fillRect(16, 84, 150, 12); });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.55), new THREE.MeshStandardMaterial({ map: print, side: THREE.DoubleSide }));
  sheet.position.set(wx(15.3), 0.55, wz(10.64)); sheet.rotation.x = 0.25; root.add(sheet);
  block(14.3, 10.5, 2.0, 0.9);
  for (const cz of [6.0, 7.05, 8.1]) {
    box(17.05, cz, 0.9, 1.0, 1.5, "#94a3b8");
    for (const dy of [0.35, 0.8, 1.25]) box(16.98, cz + 0.4, 0.08, 0.2, 0.04, "#475569", dy);
  }
  block(16.95, 6.0, 1.05, 3.1);

  plant(0.5, 0.5); plant(10.95, 0.5, 0.85); plant(13.95, 11.4); plant(7.6, 11.4, 1.1); plant(0.5, 3.1, 0.8); plant(18.3, 9.4, 0.9);

  const warm = new THREE.PointLight("#ffd9a0", 4, 5, 1.8);
  warm.position.set(wx(10.6), 1.9, wz(9.7));
  root.add(warm);
  return { top, meetGlow, tv, rec };
}

// ---------------- Lantai 2 · TikTok Studio @kanal.demo ----------------
function timelineScreen() {
  const tex = canvasTexture(512, 288, (g, w, h) => {
    g.fillStyle = "#0f1b2d"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#16263d"; g.fillRect(0, 0, w, 40);
    g.fillStyle = TOKENS.aqua; g.font = "700 20px system-ui"; g.fillText("render · 00:58", 16, 27);
    const tracks = [[TOKENS.steel, [[90, 120], [220, 90], [320, 150]]], [TOKENS.aqua, [[90, 60], [160, 200], [370, 100]]], [TOKENS.red, [[90, 380]]], ["#e9c46a", [[90, 40], [140, 30], [250, 50], [420, 40]]]];
    tracks.forEach(([c, clips], i) => {
      const y = 62 + i * 52;
      g.fillStyle = "#22344f"; g.fillRect(84, y, w - 100, 38);
      g.fillStyle = "#8aa0b8"; g.font = "600 15px system-ui"; g.fillText(["V1", "V2", "VO", "SFX"][i], 20, y + 25);
      for (const [x, len] of clips) { g.fillStyle = c; g.fillRect(x, y + 3, len - 4, 32); }
    });
    g.fillStyle = "#ffffff"; g.fillRect(300, 46, 3, h - 50);
  });
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.08, roughness: 0.4 });
}

function buildTiktok(k, plan) {
  const { root, mat, add, box, cyl, plane, decal, rod, tripodLegs, plant, block } = k;
  const { paper, ink, steel, aqua, mint, red } = TOKENS;
  // floor: warm terrazzo with ink, aqua and red flecks
  const terrazzo = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = "#ece3d3"; g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = [ink, steel, aqua, red, "#d8ccb6", "#ffffff"][Math.floor(r() * 6)];
      g.globalAlpha = 0.35 + r() * 0.4;
      g.beginPath(); g.ellipse(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  });
  terrazzo.wrapS = terrazzo.wrapT = THREE.RepeatWrapping;
  terrazzo.repeat.set(1 / 3, 1 / 3);
  const top = k.slab(plan.outline, new THREE.MeshStandardMaterial({ map: terrazzo, roughness: 0.6 }));

  // the solid wall is one long notebook page: aqua lines, red margin at the start
  const len = k.pathLen(plan.solidPts);
  const lined = canvasTexture(Math.min(4096, Math.round(len * 110)), 330, (g, w, h) => {
    g.fillStyle = paper; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(168,218,220,.95)";
    for (let y = 44; y < h; y += 22) g.fillRect(0, y, w, 2);
    const m = (2.2 / len) * w;
    g.fillStyle = "rgba(230,57,70,.75)"; g.fillRect(m, 0, 3, h); g.fillRect(m + 8, 0, 3, h);
  });
  k.wallAlong(plan.solidPts, { h: WALL_H, color: "#e9dfcd" });
  k.wallAlong(plan.solidPts, { h: 0.08, y: WALL_H, thick: 0.24, color: ink });
  k.stripAlong(plan.solidPts, { y0: 0, y1: WALL_H, material: new THREE.MeshStandardMaterial({ map: lined, roughness: 0.95, side: THREE.DoubleSide }), uScale: 1 / len });
  k.glassAlong(plan.glassPath, ink);

  // neon sign
  const neon = canvasTexture(1024, 192, (g, w) => {
    g.textAlign = "center"; g.textBaseline = "middle";
    const glow = (text, y, size, color, halo, weight = "800") => {
      g.font = `${weight} ${size}px 'Avenir Next', 'Helvetica Neue', system-ui, sans-serif`;
      g.fillStyle = color; g.shadowColor = halo;
      g.shadowBlur = 26; g.fillText(text, w / 2, y);
      g.shadowBlur = 7; g.fillText(text, w / 2, y);
    };
    glow("HIDUP KOK GINI", 74, 104, "#ffd3d6", red);
    glow("@kanal.demo", 156, 46, "#e6fbfb", "#4fc3c8", "italic 600");
  });
  plane(4.6, 0.86, new THREE.MeshBasicMaterial({ map: neon, transparent: true, toneMapped: false }), 9, 2.5, 0.03);

  // storyboard wall: 9:16 frames on an ink board, joined by a red string (left to right = story order)
  const frame = (i) => canvasTexture(90, 160, (g, w, h) => {
    const night = i === 0 || i === 5;
    g.fillStyle = night ? ink : paper; g.fillRect(0, 0, w, h);
    if (!night) { g.fillStyle = "rgba(168,218,220,.9)"; for (let y = 20; y < h; y += 10) g.fillRect(0, y, w, 1); }
    g.strokeStyle = night ? aqua : ink; g.lineWidth = 2.5; g.fillStyle = night ? mint : ink;
    g.font = "800 15px system-ui"; g.textAlign = "center";
    if (i === 0) { g.fillText("KOK", w / 2, 60); g.fillStyle = aqua; g.fillText("GINI?", w / 2, 80); }
    if (i === 1) { g.font = "800 26px system-ui"; g.fillText("73%", w / 2, 78); g.strokeStyle = red; g.beginPath(); g.ellipse(w / 2, 70, 34, 18, 0, 0, Math.PI * 2); g.stroke(); }
    if (i === 2) { [[18, 70], [38, 50], [58, 30]].forEach(([x, bh]) => { g.fillStyle = steel; g.fillRect(x, 110 - bh, 14, bh); }); g.fillStyle = red; g.fillRect(14, 112, 62, 3); }
    if (i === 3) { g.fillStyle = mint; g.beginPath(); g.ellipse(w / 2, 64, 30, 20, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = ink; g.fillRect(28, 60, 34, 3); g.fillRect(28, 68, 22, 3); }
    if (i === 4) { g.strokeStyle = red; g.lineWidth = 4; g.beginPath(); g.moveTo(22, 56); g.lineTo(68, 96); g.moveTo(68, 56); g.lineTo(22, 96); g.stroke(); }
    if (i === 5) { g.fillStyle = mint; g.beginPath(); g.arc(w / 2, 82, 22, 0, Math.PI * 2); g.fill(); g.fillStyle = ink; g.beginPath(); g.arc(w / 2 - 8, 80, 2.5, 0, 7); g.arc(w / 2 + 8, 80, 2.5, 0, 7); g.fill(); }
    if (i !== 5) { g.fillStyle = mint; g.beginPath(); g.arc(w - 14, h - 14, 10, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.5; g.strokeStyle = ink; g.stroke(); }
  });
  box(2.9, 0, 3.4, 0.05, 1.25, ink, 1.0);
  for (let i = 0; i < 6; i++) {
    const x = 3.08 + i * 0.54;
    box(x - 0.02, 0.05, 0.4, 0.012, 0.7, "#ffffff", 1.26, false);
    plane(0.36, 0.64, new THREE.MeshStandardMaterial({ map: frame(i), roughness: 0.8 }), x + 0.18, 1.61, 0.064);
    box(x + 0.15, 0.06, 0.06, 0.012, 0.06, red, 1.94, false);
  }
  rod([3.2, 1.97, 0.075], [6.0, 1.97, 0.075], 0.006, red);

  // "bank ide" board with sticky notes on the left wall
  box(0, 3.0, 0.05, 1.3, 1.3, "#c49a6c", 1.05);
  {
    const r = rng(23);
    for (let i = 0; i < 9; i++) {
      const z = 3.08 + (i % 3) * 0.4, y = 1.12 + Math.floor(i / 3) * 0.38;
      box(0.05, z, 0.012, 0.3, 0.28, [mint, aqua, paper, "#ffe6a3"][Math.floor(r() * 4)], y + (r() - 0.5) * 0.05, false);
    }
  }
  // timeline screen on the back wall (glows during a checkpoint)
  box(11.75, 0, 2.7, 0.06, 1.5, "#111827", 0.95);
  const tv = timelineScreen();
  box(11.83, 0.02, 2.54, 0.05, 1.34, tv, 1.03, false);

  // production line painted on the floor: dashed red arc with numbered stops
  const dash = mat(red, { roughness: 0.7 });
  for (let a = -105; a <= 105; a += 7) {
    const [x, z] = ringAt(a, 2.45);
    const d = decal(new THREE.PlaneGeometry(0.2, 0.06), dash, x, z);
    d.rotation.z = (a * Math.PI) / 180;
  }
  for (const s of LINE) {
    const [x, z] = ringAt(s.deg, 2.45);
    const tex = canvasTexture(256, 128, (g) => {
      g.fillStyle = ink; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
      g.fillStyle = mint; g.font = "900 64px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s.n, 64, 68);
      g.fillStyle = ink; g.font = "800 34px system-ui"; g.textAlign = "left"; g.fillText(s.t, 124, 68);
    });
    decal(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), x + 0.25, z, 0.014);
  }

  // voice booth pod in the middle: foam panels in a ring, open to the front, ON AIR on the lintel
  const [BX, BZ] = BOOTH, BR = 1.5;
  decal(new THREE.CircleGeometry(BR, 40), new THREE.MeshStandardMaterial({ color: steel, roughness: 0.9 }), BX, BZ, 0.01);
  const open = 0.62; // half-width of the doorway (radians) toward +z
  for (let i = 0; i < 18; i++) {
    const t = Math.PI / 2 + open + (i / 17) * (Math.PI * 2 - open * 2);
    const x = BX + BR * Math.cos(t), z = BZ + BR * Math.sin(t);
    const m = new THREE.Mesh(k.unit, mat(i % 2 ? ink : "#2b4a75"));
    m.scale.set(0.5, 2.3, 0.16);
    m.position.set(wx(x), 1.15, wz(z));
    m.rotation.y = -t + Math.PI / 2;
    add(m);
    block(x - 0.22, z - 0.22, 0.44, 0.44);
  }
  const ringTop = new THREE.Mesh(new THREE.TorusGeometry(BR, 0.05, 6, 48), mat(red, { emissive: red, emissiveIntensity: 0.25 }));
  ringTop.rotation.x = Math.PI / 2; ringTop.position.set(wx(BX), 2.32, wz(BZ)); add(ringTop);
  const rec = new THREE.MeshBasicMaterial({ color: "#ff3b30", toneMapped: false });
  const doorZ = BZ + BR * Math.cos(open);
  box(BX - 0.5, doorZ - 0.05, 1.0, 0.1, 0.3, rec, 2.38, false);
  const onAir = canvasTexture(256, 84, (g, w, h) => { g.fillStyle = "#ffffff"; g.font = "900 54px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("ON AIR", w / 2, h / 2 + 2); });
  plane(0.92, 0.28, new THREE.MeshBasicMaterial({ map: onAir, transparent: true, toneMapped: false }), BX, 2.53, doorZ + 0.06);
  const MZ = BZ - 0.35;
  tripodLegs(BX, MZ, 0.3, 0.3, 0.016, "#1f2937", 0.3);
  rod([BX, 0.3, MZ], [BX, 1.4, MZ], 0.018, "#1f2937");
  rod([BX, 1.4, MZ], [BX, 1.5, MZ + 0.35], 0.014, "#1f2937");
  const mic = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.14, 4, 10), mat("#9ca3af", { metalness: 0.5, roughness: 0.35 }));
  mic.position.set(wx(BX), 1.52, wz(MZ + 0.4)); add(mic);
  const pop = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.01, 6, 24), mat("#111827"));
  pop.position.set(wx(BX), 1.52, wz(MZ + 0.6)); add(pop);
  const popMesh = new THREE.Mesh(new THREE.CircleGeometry(0.115, 24), new THREE.MeshStandardMaterial({ color: "#111827", transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  popMesh.position.copy(pop.position); root.add(popMesh);
  block(BX - 0.3, MZ - 0.3, 0.6, 0.6);
  const boothLight = new THREE.PointLight("#ffd0d4", 3, 4, 1.8);
  boothLight.position.set(wx(BX), 2.1, wz(BZ));
  root.add(boothLight);

  for (const [id, s] of Object.entries(FLOORS.tiktok.stations)) k.deskAt(id, s);

  // round meeting table
  const [TX, TZ] = [3.7, 9.2];
  const meetGlow = new THREE.MeshStandardMaterial({ color: "#f4ede0", emissive: "#E63946", emissiveIntensity: 0, roughness: 0.5 });
  cyl(TX, TZ, 1.05, 0.06, meetGlow, 0.68, 1.05, 40);
  cyl(TX, TZ, 0.08, 0.68, ink); cyl(TX, TZ, 0.45, 0.04, ink, 0, 0.45, 24);
  block(TX - 1.05, TZ - 1.05, 2.1, 2.1);
  for (const s of FLOORS.tiktok.meetSeats) {
    const g = new THREE.Group();
    g.position.set(wx(s.x), 0, wz(s.z)); g.rotation.y = s.face;
    const seat = new THREE.Mesh(k.unit, mat(steel)); seat.scale.set(0.46, 0.07, 0.46); seat.position.y = 0.445;
    const back = new THREE.Mesh(k.unit, mat(steel)); back.scale.set(0.46, 0.5, 0.07); back.position.set(0, 0.73, -0.24);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.41, 8), mat(ink)); leg.position.y = 0.2;
    g.add(seat, back, leg); g.traverse((o) => { o.castShadow = true; }); root.add(g);
    block(s.x - 0.28, s.z - 0.28, 0.56, 0.56);
  }

  // lounge: round rug, sofa, round coffee table
  decal(new THREE.CircleGeometry(2.2, 40), new THREE.MeshStandardMaterial({ color: "#d6eeee", roughness: 0.95 }), 9.2, 10.3, 0.011);
  box(7.3, 10.65, 3.8, 0.95, 0.42, steel);
  box(7.3, 11.35, 3.8, 0.28, 0.9, "#3d6d8c");
  box(7.15, 10.6, 0.22, 1.05, 0.6, "#3d6d8c");
  box(11.0, 10.6, 0.22, 1.05, 0.6, "#3d6d8c");
  [7.9, 10.2].forEach((px, i) => box(px, 11.1, 0.5, 0.2, 0.42, i ? aqua : red, 0.42));
  block(7.15, 10.6, 4.1, 1.05);
  cyl(9.2, 9.55, 0.5, 0.05, paper, 0.34, 0.5, 28); cyl(9.2, 9.55, 0.05, 0.34, ink);
  block(8.7, 9.05, 1.0, 1.0);

  // Coret the cat on a plinth (mint fill, ink outline via an inverted hull, steel belly, red cheeks and pen)
  const CX = 6.8, CZ = 8.6;
  cyl(CX, CZ, 0.42, 0.5, paper, 0, 0.38, 20);
  cyl(CX, CZ, 0.44, 0.04, ink, 0.5, 0.44, 20);
  const cat = new THREE.Group();
  const inkBack = new THREE.MeshBasicMaterial({ color: ink, side: THREE.BackSide });
  const part = (geo, color, x, y, z, sx = 1, sy = 1, sz = 1, outline = true) => {
    const m = new THREE.Mesh(geo, mat(color, { flatShading: true }));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; cat.add(m);
    if (outline) { const o = new THREE.Mesh(geo, inkBack); o.position.copy(m.position); o.scale.set(sx * 1.07, sy * 1.07, sz * 1.07); cat.add(o); }
    return m;
  };
  part(new THREE.IcosahedronGeometry(0.36, 1), mint, 0, 0.34, 0, 1, 0.92, 0.85);
  part(new THREE.SphereGeometry(0.2, 12, 8), steel, 0, 0.3, 0.2, 1, 1.1, 0.45, false);
  part(new THREE.IcosahedronGeometry(0.29, 1), mint, 0, 0.86, 0.02);
  for (const sx of [-1, 1]) {
    const ear = part(new THREE.ConeGeometry(0.09, 0.2, 4), mint, sx * 0.16, 1.12, 0);
    ear.rotation.z = -sx * 0.35;
    part(new THREE.SphereGeometry(0.03, 8, 6), ink, sx * 0.1, 0.9, 0.26, 1, 1.3, 1, false);
    part(new THREE.CircleGeometry(0.05, 12), red, sx * 0.18, 0.8, 0.25, 1, 0.6, 1, false);
  }
  const tail = part(new THREE.TorusGeometry(0.22, 0.045, 6, 14, Math.PI), mint, 0.18, 0.32, -0.28);
  tail.rotation.y = Math.PI / 2;
  const pen = part(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 8), red, 0.34, 0.48, 0.14, 1, 1, 1, false);
  pen.rotation.z = 0.6;
  cat.position.set(wx(CX), 0.54, wz(CZ));
  cat.scale.setScalar(1.25);
  root.add(cat);
  block(CX - 0.5, CZ - 0.5, 1.0, 1.0);

  // ring light with a vertical phone on a tripod
  const RX = 14.6, RZ = 9.4;
  tripodLegs(RX, RZ, 0.8, 0.34, 0.016, "#1f2937", 0.5);
  rod([RX, 0.8, RZ], [RX, 1.42, RZ], 0.018, "#1f2937");
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 40), mat("#ffffff", { emissive: "#fff4ea", emissiveIntensity: 1.1 }));
  ring.position.set(wx(RX), 1.72, wz(RZ)); add(ring);
  box(RX - 0.045, RZ - 0.03, 0.09, 0.02, 0.16, "#111827", 1.64);
  box(RX - 0.038, RZ - 0.042, 0.076, 0.004, 0.142, mat(ink, { emissive: aqua, emissiveIntensity: 0.5 }), 1.649, false);
  block(RX - 0.4, RZ - 0.4, 0.8, 0.8);

  plant(1.1, 1.6, 0.8, ink); plant(16.9, 4.3, 0.9, ink); plant(0.9, 5.8, 0.8, ink); plant(12.2, 11.2, 0.9, ink);
  const warm = new THREE.PointLight("#ffe0c0", 3, 6, 1.8);
  warm.position.set(wx(9.2), 2.0, wz(10.0));
  root.add(warm);
  return { top, meetGlow, tv, rec };
}

// ---------------- walkable grid + A* ----------------
const CELL = 0.3;
function makeGrid(obstacles, outline) {
  const maxX = Math.max(...outline.map((p) => p.x)), maxZ = Math.max(...outline.map((p) => p.y));
  const cols = Math.ceil(maxX / CELL), rows = Math.ceil(maxZ / CELL);
  const blocked = new Uint8Array(cols * rows);
  const inPoly = (x, z) => {
    let c = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const a = outline[i], b = outline[j];
      if ((a.y > z) !== (b.y > z) && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const m = 0.36, pad = 0.2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * CELL, z = (r + 0.5) * CELL;
    if (!(inPoly(x - m, z - m) && inPoly(x + m, z - m) && inPoly(x - m, z + m) && inPoly(x + m, z + m))) { blocked[r * cols + c] = 1; continue; }
    for (const o of obstacles) {
      let hit;
      if (Array.isArray(o)) { const [ox, oz, ow, od] = o; hit = x > ox - pad && x < ox + ow + pad && z > oz - pad && z < oz + od + pad; }
      else { const dx = x - o.cx, dz = z - o.cz, cs = Math.cos(o.rot), sn = Math.sin(o.rot); hit = Math.abs(dx * cs - dz * sn) < o.hw + pad && Math.abs(dx * sn + dz * cs) < o.hd + pad; }
      if (hit) { blocked[r * cols + c] = 1; break; }
    }
  }
  const cellOf = (x, z) => [Math.max(0, Math.min(cols - 1, Math.floor(x / CELL))), Math.max(0, Math.min(rows - 1, Math.floor(z / CELL)))];
  const free = [];
  for (let i = 0; i < blocked.length; i++) if (!blocked[i]) free.push(i);
  const isBlocked = (c, r, allow) => c < 0 || r < 0 || c >= cols || r >= rows || (blocked[r * cols + c] && !allow.has(r * cols + c));
  function clearLine(a, b, allow) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.12);
    for (let i = 1; i < n; i++) {
      const [c, r] = cellOf(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n);
      if (isBlocked(c, r, allow)) return false;
    }
    return true;
  }
  function path(from, to) {
    const [sc, sr] = cellOf(...from), [gc, gr] = cellOf(...to);
    const start = sr * cols + sc, goal = gr * cols + gc;
    const allow = new Set([start, goal]);
    const g = new Float32Array(cols * rows).fill(Infinity);
    const came = new Int32Array(cols * rows).fill(-1);
    const closed = new Uint8Array(cols * rows);
    const open = [start];
    g[start] = 0;
    const h = (i) => Math.hypot((i % cols) - gc, Math.floor(i / cols) - gr);
    const f = new Float32Array(cols * rows).fill(Infinity);
    f[start] = h(start);
    let found = false;
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % cols, cr = Math.floor(cur / cols);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = cc + dc, nr = cr + dr;
        if (isBlocked(nc, nr, allow)) continue;
        if (dr && dc && (isBlocked(cc + dc, cr, allow) || isBlocked(cc, cr + dr, allow))) continue;
        const ni = nr * cols + nc;
        const ng = g[cur] + (dr && dc ? 1.414 : 1);
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; f[ni] = ng + h(ni); open.push(ni); }
      }
    }
    if (!found) return [to];
    const cells = [];
    for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push([(i % cols + 0.5) * CELL, (Math.floor(i / cols) + 0.5) * CELL]);
    cells.reverse();
    cells[cells.length - 1] = to;
    const out = [];
    let anchor = from, i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !clearLine(anchor, cells[j], allow)) j--;
      out.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    return out;
  }
  const randomFree = (r) => { const i = free[Math.floor(r() * free.length)]; return [(i % cols + 0.5) * CELL, (Math.floor(i / cols) + 0.5) * CELL]; };
  return { path, randomFree };
}

// ---------------- people ----------------
function makePerson(a) {
  const hash = hashOf(a.id);
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[hash % 4], roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: SHIRT[a.id] ?? "#64748b", roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: hash & 4 ? "#334155" : "#3f3a35", roughness: 0.85 });
  const hairM = new THREE.MeshStandardMaterial({ color: hash & 8 ? "#2a1d14" : "#5b3b24", roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: "#1f2937" });
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const legs = [-0.09, 0.09].map((x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.45, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.16), pants);
    m.position.y = -0.21;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.22), shoe);
    s.position.set(0, -0.415, 0.03);
    p.add(m, s);
    body.add(p);
    return p;
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.26, 4, 12), shirt);
  torso.position.y = 0.73; torso.scale.z = 0.72;
  const arms = [-0.265, 0.265].map((x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.9, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.12), shirt);
    m.position.y = -0.19;
    const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin);
    hnd.position.y = -0.4;
    p.add(m, hnd);
    body.add(p);
    return p;
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), skin);
  head.position.y = 1.12;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.182, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM);
  hair.position.set(0, 1.135, -0.012); hair.rotation.x = -0.18;
  const eyeM = new THREE.MeshBasicMaterial({ color: "#1b1b1b" });
  const eyes = [-0.06, 0.06].map((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeM); e.position.set(x, 1.13, 0.155); return e; });
  body.add(torso, head, hair, ...eyes);
  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.agent = a.id; } });
  body.scale.setScalar(PS);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 36), new THREE.MeshBasicMaterial({ color: "#8a4fd1", transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015; ring.visible = false;
  g.add(ring);

  const el = document.createElement("button");
  el.type = "button";
  el.className = "ag-tag";
  el.innerHTML = `<span class="who"><span class="nm"></span><span class="rl"></span></span><b class="prov"></b><span class="st" aria-hidden="true"></span>`;
  el.querySelector(".nm").textContent = a.name ?? a.short ?? a.title;
  el.querySelector(".rl").textContent = a.title ?? "";
  const label = new CSS2DObject(el);
  label.position.set(0, 1.72 * PS, 0);
  g.add(label);
  return { id: a.id, a, g, body, legs, arms, ring, el, label, x: 0, z: 0, rot: 0, path: [], goal: null, goalKey: null, sitting: false, wait: 0, seatY: 0.5, placed: false };
}

// ---------------- building ----------------
function floorTag(f, built) {
  const el = document.createElement(built ? "button" : "span");
  if (built) el.type = "button";
  el.className = `floor-tag${built ? "" : " plan"}`;
  el.innerHTML = `<b></b><span></span><i class="count" hidden></i>`;
  el.querySelector("b").textContent = f.label ?? "";
  el.querySelector("span").textContent = built ? f.name : `${f.name} · segera dibangun`;
  return el;
}

function addLights(scene, center, shadow) {
  scene.add(new THREE.HemisphereLight("#fff6e8", "#b9a58a", 1.35));
  const sun = new THREE.DirectionalLight("#fff1dc", 2.3);
  sun.position.copy(center).add(new THREE.Vector3(-6, 16, 7));
  sun.target.position.copy(center);
  scene.add(sun, sun.target);
  if (shadow) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 11, bottom: -11, near: 1, far: 44 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
  }
}

// lift core with the building name, monument sign at the plaza
function buildBase(scene, roofY, name, tagline) {
  const top = roofY + 1.4; // lift overrun above the roof
  const [cx, cz] = [wx(CORE[0]), wz(CORE[1])];
  const concrete = new THREE.MeshStandardMaterial({ color: "#e8e4dc", roughness: 0.8 });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, top + 0.45, 32), concrete);
  core.position.set(cx, (top - 0.45) / 2, cz); scene.add(core);
  const glassTube = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, top + 0.45, 40, 1, true), new THREE.MeshStandardMaterial({ color: "#cfe6f5", transparent: true, opacity: 0.22, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  glassTube.position.copy(core.position); scene.add(glassTube);
  const ringMat = new THREE.MeshStandardMaterial({ color: "#2b3440", roughness: 0.5 });
  for (let i = 0; i * FLOOR_GAP < roofY; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.05, 6, 40), ringMat);
    r.rotation.x = Math.PI / 2; r.position.set(cx, i * FLOOR_GAP + 0.02, cz); scene.add(r);
  }
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.14, 40), ringMat);
  capTop.position.set(cx, top, cz); scene.add(capTop);
  // vertical name on the core, facing the viewer
  const signH = Math.min(top - 1.2, 10);
  const sign = canvasTexture(128, 1024, (g, w, h) => {
    g.fillStyle = "#1f2a44"; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = "#f4ede0"; g.font = "800 60px 'Avenir Next', system-ui"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(name.toUpperCase().split("").join(" "), 0, 4); g.restore();
  });
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(0.62, signH), new THREE.MeshBasicMaterial({ map: sign }));
  const dir = new THREE.Vector3(0.6, 0, 0.8).normalize();
  signM.position.set(cx + dir.x * 0.97, top / 2 + 0.2, cz + dir.z * 0.97);
  signM.lookAt(signM.position.clone().add(dir));
  scene.add(signM);
  // monument sign at the plaza entrance
  const mono = canvasTexture(1024, 256, (g, w, h) => {
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#1f2a44"; g.font = "800 150px 'Avenir Next', 'Helvetica Neue', system-ui"; g.fillText(name.toUpperCase(), w / 2, 108);
    g.fillStyle = "#6b7280"; g.font = "600 40px 'Avenir Next', system-ui"; g.fillText(tagline, w / 2, 212);
  });
  const signDir = new THREE.Vector3(0.6, 0, 0.8).normalize();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 0.7), concrete);
  plinth.position.set(-9.5, -0.21, 9.5); plinth.lookAt(plinth.position.clone().add(signDir)); scene.add(plinth);
  const letters = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: mono, transparent: true, side: THREE.DoubleSide }));
  letters.position.set(-9.5, 0.85, 9.5); letters.lookAt(letters.position.clone().add(signDir)); scene.add(letters);
}

// paved plaza with a lawn ring and a few trees, in the ground floor's scene so it receives that floor's shadows
function plaza(scene) {
  const tex = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = "#e6e0d4"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,110,95,.18)"; g.lineWidth = 2;
    for (let r = 30; r < 360; r += 30) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.stroke(); }
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.46; ground.receiveShadow = true;
  scene.add(ground);
  const grass = new THREE.Mesh(new THREE.RingGeometry(30, 34, 64), new THREE.MeshStandardMaterial({ color: "#9cc49a", roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.465; scene.add(grass);
  const leaf = new THREE.MeshStandardMaterial({ color: "#5c9e63", roughness: 0.9, flatShading: true });
  const trunk = new THREE.MeshStandardMaterial({ color: "#8b6b4a" });
  for (const [x, z, s] of [[24, 2, 1.2], [-6, 8, 1], [-7, 15, 1.3], [26, 14, 1], [-12, 0, 1.1], [27, 7, 0.9]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.4 * s, 8), trunk);
    t.position.set(wx(x), -0.46 + 0.7 * s, wz(z)); t.castShadow = true; scene.add(t);
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * s, 0), leaf);
    c.position.set(wx(x), -0.46 + 1.9 * s, wz(z)); c.castShadow = true; scene.add(c);
  }
}

// ---------------- Lantai Dasar · Adobe Stock (A) | Magnific (B), one floor split by a wall ----------------
const SPLIT = 9.3; // the partition wall runs along x = SPLIT
const V2 = (x, y) => new THREE.Vector2(x, y);
// keep the part of a closed polygon on one side of x = cut (Sutherland–Hodgman, one edge)
function clipPoly(pts, side, cut) {
  const inside = (p) => (side === "left" ? p.x <= cut : p.x >= cut);
  const cross = (a, b) => { const t = (cut - a.x) / (b.x - a.x); return V2(cut, a.y + (b.y - a.y) * t); };
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (inside(a)) { out.push(a); if (!inside(b)) out.push(cross(a, b)); }
    else if (inside(b)) out.push(cross(a, b));
  }
  return out;
}
// the contiguous run of an open polyline on one side of x = cut
function clipLine(pts, side, cut) {
  const inside = (p) => (side === "left" ? p.x <= cut + 1e-6 : p.x >= cut - 1e-6);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], prev = pts[i - 1];
    if (prev && inside(p) !== inside(prev)) { const t = (cut - prev.x) / (p.x - prev.x); out.push(V2(cut, prev.y + (p.y - prev.y) * t)); }
    if (inside(p)) out.push(p);
  }
  return out;
}
function halfPlan(side) {
  const full = designPlan();
  const outline = clipPoly(full.outline, side, SPLIT);
  const front = Math.max(...outline.filter((p) => Math.abs(p.x - SPLIT) < 1e-4).map((p) => p.y));
  return { side, outline, solidPts: clipLine(full.solidPts, side, SPLIT), glassPts: clipLine(full.glassPath.getSpacedPoints(80), side, SPLIT), splitFront: front };
}
function stockPlan() { return halfPlan("left"); }
function magnificPlan() { return halfPlan("right"); }

// a canvas screen material that brightens during meetings (stepFloor drives emissiveIntensity)
function screenMat(draw, w = 512, h = 288) {
  const tex = canvasTexture(w, h, draw);
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.08, roughness: 0.4 });
}
function speckleFloor(base, colors, seed) {
  const t = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = colors[Math.floor(r() * colors.length)]; g.globalAlpha = 0.25 + r() * 0.35;
      g.beginPath(); g.arc(r() * w, r() * h, 0.8 + r() * 2.6, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 0.18; g.strokeStyle = "#000000";
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 3, 1 / 3);
  return t;
}
function signTexture(lines, w = 1024, h = 256) {
  return canvasTexture(w, h, (g) => {
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const [text, y, size, color, halo] of lines) {
      g.font = `800 ${size}px 'Avenir Next', 'Helvetica Neue', system-ui, sans-serif`;
      g.fillStyle = color; g.shadowColor = halo ?? "transparent"; g.shadowBlur = halo ? 22 : 0; g.fillText(text, w / 2, y);
      if (halo) { g.shadowBlur = 6; g.fillText(text, w / 2, y); }
    }
  });
}
function roundTable(k, x, z, r, glow, legColor, seats, seatColor) {
  const { cyl, mat, root, block } = k;
  cyl(x, z, r, 0.06, glow, 0.68, r, 36);
  cyl(x, z, 0.07, 0.68, legColor); cyl(x, z, 0.4, 0.04, legColor, 0, 0.4, 20);
  block(x - r, z - r, 2 * r, 2 * r);
  for (const s of seats) {
    const g = new THREE.Group();
    g.position.set(wx(s.x), 0, wz(s.z)); g.rotation.y = s.face;
    const seat = new THREE.Mesh(k.unit, mat(seatColor)); seat.scale.set(0.46, 0.07, 0.46); seat.position.y = 0.445;
    const back = new THREE.Mesh(k.unit, mat(seatColor)); back.scale.set(0.46, 0.5, 0.07); back.position.set(0, 0.73, -0.24);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.41, 8), mat(legColor)); leg.position.y = 0.2;
    g.add(seat, back, leg); g.traverse((o) => { o.castShadow = true; }); root.add(g);
  }
}

function buildStock(k, plan) {
  const { mat, add, box, cyl, plane, plant, block } = k;
  const red = "#e4572e", ink = "#2b2a33";
  const top = k.slab(plan.outline, new THREE.MeshStandardMaterial({ map: speckleFloor("#ece6dc", ["#c9bfae", red, "#9a8f80", "#ffffff"], 21), roughness: 0.7 }));
  k.wallAlong(plan.solidPts, { h: WALL_H, color: "#f3ece2" });
  k.wallAlong(plan.solidPts, { h: 0.08, y: WALL_H, thick: 0.24, color: "#cdbfa8" });
  k.glassAlong(plan.glassPts);
  // the partition: a solid wall between the two rooms with a closed glass door, one floor, two offices
  const zf = plan.splitFront;
  const DOOR = [7.6, 9.4];
  const wallPts = (a, b) => [V2(SPLIT, a), V2(SPLIT, b)];
  k.wallAlong(wallPts(0, DOOR[0]), { h: WALL_H, thick: 0.24, color: "#e6ded2", center: [0, 6] });
  k.wallAlong(wallPts(DOOR[1], zf), { h: WALL_H, thick: 0.24, color: "#e6ded2", center: [0, 6] });
  box(SPLIT - 0.12, DOOR[0], 0.24, DOOR[1] - DOOR[0], WALL_H - 2.35, "#e6ded2", 2.35);
  const doorGlass = new THREE.MeshStandardMaterial({ color: "#cfe6f5", transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false });
  box(SPLIT - 0.03, DOOR[0] + 0.05, 0.06, DOOR[1] - DOOR[0] - 0.1, 2.3, doorGlass, 0.02, false);
  box(SPLIT - 0.06, DOOR[1] - 0.35, 0.12, 0.04, 0.3, "#9ca3af", 1.0);
  block(SPLIT - 0.4, DOOR[0], 0.8, DOOR[1] - DOOR[0]);
  // room sign on the partition, facing this room
  plane(3.6, 0.9, new THREE.MeshBasicMaterial({ map: signTexture([["ADOBE STOCK", 100, 120, red], ["contributor studio · ruang A", 200, 44, "#6b6257"]]), transparent: true }), SPLIT - 0.13, 2.25, 4.4, -Math.PI / 2);
  // upload calendar on the back wall: twelve campaigns, coloured by season
  const cal = canvasTexture(1024, 200, (g, w, h) => {
    g.fillStyle = "#fbf8f3"; g.fillRect(0, 0, w, h);
    g.fillStyle = ink; g.font = "800 30px system-ui"; g.fillText("KALENDER UPLOAD 2027", 24, 40);
    const cols = ["#d4a017", "#c0392b", "#e88aa6", "#7fb069", "#2a9d8f", "#d62828", "#f4a261", "#6a4c93", "#ff9f1c", "#2b7a4b", "#8d5524", "#5c4033"];
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(24 + i * 82, 64, 72, 92); g.fillStyle = "#ffffff"; g.font = "700 26px system-ui"; g.fillText(String(i + 1).padStart(2, "0"), 38 + i * 82, 120); });
    g.fillStyle = "#6b6257"; g.font = "600 20px system-ui"; g.fillText("Imlek · Ramadan · Valentine · Easter · Idul Adha · HUT RI · Mid-Autumn · Halloween · Diwali · Natal · Songket · Batik", 24, 186);
  });
  box(0.8, 0.02, 7.6, 0.04, 1.5, "#ffffff", 1.6, false);
  plane(7.4, 1.4, new THREE.MeshStandardMaterial({ map: cal, roughness: 0.7 }), 4.6, 2.35, 0.065);
  // pattern swatches on the left wall (batik, songket, ketupat…)
  const sw = canvasTexture(768, 384, (g, w, h) => {
    const tiles = [["#7a3e1d", "#e9c46a"], ["#1d3557", "#e9c46a"], ["#2b7a4b", "#f1faee"], ["#8d1b3d", "#f4a261"], ["#264653", "#e76f51"], ["#5c4033", "#f2cc8f"]];
    tiles.forEach(([bg, fg], i) => {
      const x0 = (i % 3) * 256, y0 = Math.floor(i / 3) * 192;
      g.fillStyle = bg; g.fillRect(x0 + 6, y0 + 6, 244, 180);
      g.strokeStyle = fg; g.fillStyle = fg; g.lineWidth = 4;
      for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) {
        const cx = x0 + 34 + a * 62, cy = y0 + 40 + b * 56;
        if (i % 3 === 0) { g.beginPath(); g.ellipse(cx, cy, 14, 22, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(cx, cy, 22, 14, 0, 0, Math.PI * 2); g.stroke(); }
        else if (i % 3 === 1) { g.beginPath(); g.moveTo(cx, cy - 20); g.lineTo(cx + 20, cy); g.lineTo(cx, cy + 20); g.lineTo(cx - 20, cy); g.closePath(); g.stroke(); g.fillRect(cx - 4, cy - 4, 8, 8); }
        else { g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4); g.strokeRect(-13, -13, 26, 26); g.beginPath(); g.moveTo(-13, 0); g.lineTo(13, 0); g.moveTo(0, -13); g.lineTo(0, 13); g.stroke(); g.restore(); }
      }
    });
  });
  box(0, 3.3, 0.05, 3.3, 1.7, "#ffffff", 1.0);
  plane(3.1, 1.55, new THREE.MeshStandardMaterial({ map: sw, roughness: 0.8 }), 0.06, 1.85, 4.95, Math.PI / 2);
  // upload-queue screen on the left wall by the meeting table
  const tv = screenMat((g, w, h) => {
    g.fillStyle = "#1f1d24"; g.fillRect(0, 0, w, h);
    g.fillStyle = red; g.font = "800 24px system-ui"; g.fillText("UPLOAD HARI INI · 8–10 file", 20, 36);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = "#34313c"; g.fillRect(20, 58 + i * 36, w - 40, 28);
      g.fillStyle = ["#7fb069", "#7fb069", "#f4a261", "#9a8f80", "#9a8f80", "#9a8f80"][i]; g.fillRect(20, 58 + i * 36, 8, 28);
      g.fillStyle = "#e9e4dc"; g.font = "600 17px system-ui"; g.fillText(`02-imlek-2027 / A${String(i + 7).padStart(2, "0")}.svg`, 40, 78 + i * 36);
      g.fillStyle = "#b8b0a4"; g.fillText(["diterima", "diterima", "review", "antre", "antre", "antre"][i], w - 120, 78 + i * 36);
    }
  });
  box(0, 8.0, 0.08, 2.3, 1.35, "#111827", 1.15);
  plane(2.14, 1.2, tv, 0.085, 1.825, 9.15, Math.PI / 2);
  // fabric-roll rack: printed pattern samples
  box(6.5, 10.25, 2.3, 0.6, 0.06, "#b08a5a", 0.9); box(6.5, 10.25, 2.3, 0.6, 0.06, "#b08a5a", 0.3);
  for (const [x, y] of [[6.5, 0], [8.74, 0]]) box(x, 10.25, 0.06, 0.6, 1.4, "#8a6a45", y);
  ["#7a3e1d", "#1d3557", "#2b7a4b", "#8d1b3d", "#e9c46a", "#264653"].forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.56, 14), mat(c));
    m.rotation.x = Math.PI / 2; m.position.set(wx(6.75 + (i % 3) * 0.32 + (i > 2 ? 0.95 : 0)), i > 2 ? 1.07 : 0.47, wz(10.55)); add(m);
  });
  block(6.4, 10.15, 2.5, 0.8);
  // coffee counter
  box(0.05, 10.0, 0.7, 1.4, 0.95, "#3f3a35"); box(0.12, 10.25, 0.4, 0.35, 0.45, "#1f2937", 0.95);
  block(0, 9.9, 0.9, 1.6);
  for (const [id, s] of Object.entries(FLOORS.adobestock.stations)) k.deskAt(id, s);
  const meetGlow = new THREE.MeshStandardMaterial({ color: "#f4efe7", emissive: red, emissiveIntensity: 0, roughness: 0.5 });
  roundTable(k, 3.3, 9.3, 0.85, meetGlow, ink, FLOORS.adobestock.meetSeats, "#c8bba8");
  const rec = new THREE.MeshBasicMaterial({ color: "#ff3b30", toneMapped: false });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), rec); led.position.set(wx(0.12), 2.62, wz(10.15)); k.root.add(led);
  plant(0.5, 0.5); plant(8.6, 0.55, 0.85); plant(0.55, 7.4, 0.8); plant(5.6, 11.6, 1.0);
  return { top, meetGlow, tv, rec };
}

function buildMagnific(k, plan) {
  const { mat, add, box, cyl, plane, plant, block } = k;
  const violet = "#7c3aed", lime = "#b6e83a", ink = "#1e1b2e";
  const top = k.slab(plan.outline, new THREE.MeshStandardMaterial({ map: speckleFloor("#e7e4ee", ["#c4bdd6", violet, lime, "#ffffff"], 33), roughness: 0.65 }));
  k.wallAlong(plan.solidPts, { h: WALL_H, color: "#ece8f3" });
  k.wallAlong(plan.solidPts, { h: 0.08, y: WALL_H, thick: 0.24, color: "#b9b0cf" });
  k.glassAlong(plan.glassPts);
  // this room's skin on the partition (the wall itself is built by room A)
  const zf = plan.splitFront;
  box(SPLIT + 0.12, 0, 0.03, 7.6, WALL_H, "#e3dcf0", 0, false);
  box(SPLIT + 0.12, 9.4, 0.03, zf - 9.4 - 0.15, WALL_H, "#e3dcf0", 0, false);
  block(SPLIT, 7.6, 0.45, 1.8);
  // neon sign on the back wall
  plane(5.2, 1.0, new THREE.MeshBasicMaterial({ map: signTexture([["M A G N I F I C", 92, 96, "#efe7ff", "#a78bfa"], ["contributor studio · ruang B", 196, 40, lime, "#7fb800"]]), transparent: true, toneMapped: false }), 13.9, 2.45, 0.03);
  // search-trends screen on the partition, facing this room
  const tv = screenMat((g, w, h) => {
    g.fillStyle = ink; g.fillRect(0, 0, w, h);
    g.fillStyle = lime; g.font = "800 24px system-ui"; g.fillText("SEARCH TRENDS · vector", 20, 36);
    const bars = [["batik", 0.92], ["songket", 0.71], ["lebaran", 0.66], ["imlek", 0.54], ["hut ri", 0.47], ["mid-autumn", 0.33]];
    bars.forEach(([t, v], i) => {
      g.fillStyle = "#d9d2f0"; g.font = "600 18px system-ui"; g.fillText(t, 20, 78 + i * 34);
      g.fillStyle = i === 0 ? lime : violet; g.fillRect(150, 62 + i * 34, (w - 190) * v, 22);
    });
  });
  box(SPLIT + 0.13, 3.3, 0.08, 2.3, 1.35, "#111827", 1.15);
  plane(2.14, 1.2, tv, SPLIT + 0.215, 1.825, 4.45, Math.PI / 2);
  // export line: SVG in, EPS + JPG out (tiles ride the belt; see tick)
  const BELT = [11.0, 15.8], BZ = 10.0;
  box(BELT[0], BZ - 0.35, BELT[1] - BELT[0], 0.7, 0.08, "#2d2a3a", 0.72);
  for (let x = BELT[0] + 0.2; x < BELT[1]; x += 1.1) { box(x, BZ - 0.3, 0.08, 0.08, 0.72, "#6b6580"); box(x, BZ + 0.22, 0.08, 0.08, 0.72, "#6b6580"); }
  box(BELT[1], BZ - 0.45, 0.9, 0.9, 1.0, violet); // the exporter box
  box(BELT[1] + 0.1, BZ - 0.46, 0.7, 0.02, 0.25, lime, 0.55, false);
  block(BELT[0] - 0.1, BZ - 0.5, BELT[1] - BELT[0] + 1.0, 1.0);
  const tiles = [];
  const tileCols = ["#e9c46a", "#2a9d8f", "#e76f51", "#8d1b3d", violet, lime];
  for (let i = 0; i < 6; i++) { const t = box(BELT[0], BZ - 0.18, 0.36, 0.36, 0.04, tileCols[i], 0.8); t.userData.noMerge = true; tiles.push(t); }
  // server rack (pipeline machine)
  box(17.3, 8.1, 0.7, 1.2, 2.0, "#1f2937");
  const leds = [];
  for (let i = 0; i < 6; i++) { const m = new THREE.MeshBasicMaterial({ color: lime, toneMapped: false }); leds.push(m); box(17.29, 8.25 + (i % 3) * 0.35, 0.02, 0.08, 0.05, m, 0.5 + Math.floor(i / 3) * 0.7, false); }
  block(17.2, 8.0, 0.9, 1.4);
  for (const [id, s] of Object.entries(FLOORS.magnific.stations)) k.deskAt(id, s);
  const meetGlow = new THREE.MeshStandardMaterial({ color: "#f3f0fa", emissive: violet, emissiveIntensity: 0, roughness: 0.5 });
  roundTable(k, 12.2, 6.8, 0.85, meetGlow, ink, FLOORS.magnific.meetSeats, "#b9aee0");
  const rec = new THREE.MeshBasicMaterial({ color: "#ff3b30", toneMapped: false });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), rec); led.position.set(wx(BELT[1] + 0.45), 1.08, wz(BZ)); k.root.add(led);
  plant(9.9, 0.55, 0.85); plant(17.8, 0.6); plant(18.0, 6.2, 0.9); plant(10.1, 11.4, 0.9);
  const tick = (t) => {
    tiles.forEach((m, i) => { const u = ((t * 0.35 + i / tiles.length) % 1); m.position.x = wx(BELT[0] + 0.2 + u * (BELT[1] - BELT[0] - 0.4)); });
    leds.forEach((m, i) => m.color.set(Math.sin(t * 5 + i * 1.7) > 0.2 ? lime : "#2f3a12"));
  };
  return { top, meetGlow, tv, rec, tick };
}

// ---------------- Lantai 3 · Explainer3D Studio ----------------
function buildExplainer3D(k, plan) {
  const { root, mat, add, box, cyl, plane, rod, plant, block } = k;
  const { red, ivory, teal, blue, navy } = { red: "#E63946", ivory: "#F1FAEE", teal: "#A8DADC", blue: "#457B9D", navy: "#1D3557" };
  const top = k.slab(plan.outline, new THREE.MeshStandardMaterial({ map: speckleFloor("#5b6470", ["#46505c", "#7a8591", teal, "#3a424c"], 47), roughness: 0.45, metalness: 0.1 }));
  k.wallAlong(plan.solidPts, { h: WALL_H, color: "#22344c" });
  k.wallAlong(plan.solidPts, { h: 0.08, y: WALL_H, thick: 0.24, color: "#162536" });
  k.glassAlong(plan.glassPath, navy);
  // LED wall: a cinematic still with the Explainer3D title (the meeting "screen")
  const tv = screenMat((g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#7fb3d5"); sky.addColorStop(0.62, "#dcefef"); sky.addColorStop(0.63, "#8aa66a"); sky.addColorStop(1, "#4f7a36");
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = "#e8eef2"; g.beginPath(); g.ellipse(w * 0.62, h * 0.36, 120, 16, -0.08, 0, Math.PI * 2); g.fill(); // jet body
    g.beginPath(); g.moveTo(w * 0.6, h * 0.36); g.lineTo(w * 0.5, h * 0.52); g.lineTo(w * 0.56, h * 0.37); g.fill();
    g.beginPath(); g.moveTo(w * 0.5, h * 0.33); g.lineTo(w * 0.47, h * 0.2); g.lineTo(w * 0.53, h * 0.33); g.fill();
    g.strokeStyle = red; g.lineWidth = 4; g.beginPath(); g.arc(w * 0.66, h * 0.36, 40, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "rgba(29,53,87,.85)"; g.fillRect(24, h - 78, 300, 54);
    g.fillStyle = ivory; g.font = "800 30px system-ui"; g.fillText("EXPLAINER3D", 40, h - 41);
    g.fillStyle = red; g.fillRect(w - 118, 18, 96, 30); g.fillStyle = "#fff"; g.font = "700 18px system-ui"; g.fillText("PART 03", w - 108, 40);
  }, 768, 288);
  box(3.4, 0.02, 7.0, 0.06, 1.75, "#0b1220", 1.2);
  plane(6.8, 1.6, tv, 6.9, 2.07, 0.085);
  // storyboard strip: ten stills pinned on the back wall
  const story = canvasTexture(1024, 200, (g, w, h) => {
    g.fillStyle = "#162536"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 10; i++) {
      const x = 12 + i * 101, c = ["#7fb3d5", "#9cc3a0", "#dcefef", "#e8d5b5", "#7fb3d5", "#c9d6df", "#9cc3a0", "#e8d5b5", "#7fb3d5", navy][i];
      g.fillStyle = c; g.fillRect(x, 26, 90, 150);
      g.fillStyle = i === 9 ? red : "rgba(29,53,87,.7)"; g.fillRect(x + 8, 140, 74, 22);
      g.fillStyle = "#fff"; g.font = "700 14px system-ui"; g.fillText(`S${String(i + 1).padStart(2, "0")}`, x + 30, 156);
    }
  });
  plane(4.6, 0.9, new THREE.MeshStandardMaterial({ map: story, roughness: 0.8 }), 13.0, 2.25, 0.065);
  // acoustic foam on the left wall by the audio desk
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const m = box(0.02, 3.7 + i * 0.95, 0.12, 0.85, 0.7, j % 2 === i % 2 ? "#33475f" : "#2b3d52", 0.75 + j * 0.75);
    m.castShadow = false;
  }
  // render farm: two racks with blinking LEDs
  const leds = [];
  for (const x of [15.6, 16.8]) {
    box(x, 0.3, 1.0, 1.0, 2.2, "#0f172a");
    for (let r = 0; r < 8; r++) { const m = new THREE.MeshBasicMaterial({ color: teal, toneMapped: false }); leds.push(m); box(x + 0.12, 1.29, 0.6, 0.02, 0.04, m, 0.3 + r * 0.24, false); }
  }
  block(15.5, 0.2, 2.4, 1.3);
  const rackSign = plane(2.2, 0.36, new THREE.MeshBasicMaterial({ map: signTexture([["RENDER FARM", 128, 130, teal]], 1024, 256), transparent: true, toneMapped: false }), 16.8, 2.75, 0.06);
  rackSign.renderOrder = 1;
  // turntable: a jet model rotating on a pedestal under two lamps (the 3D director's look-dev)
  const [TX, TZ] = [9.6, 6.8];
  cyl(TX, TZ, 0.95, 0.5, "#273449", 0, 0.9, 40);
  const spin = new THREE.Group(); spin.position.set(wx(TX), 0.52, wz(TZ)); spin.userData.noMerge = true; root.add(spin);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.04, 40), mat("#e5e7eb")); spin.add(disc);
  const jet = new THREE.Group(); jet.position.y = 0.45; jet.rotation.z = 0.12; spin.add(jet);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.9, 6, 14), mat("#f3f4f6", { metalness: 0.4, roughness: 0.35 })); body.rotation.z = Math.PI / 2; jet.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 1.15), mat("#d1d5db", { metalness: 0.4 })); wing.position.x = 0.04; jet.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.025), mat(red)); tail.position.set(-0.48, 0.15, 0); jet.add(tail);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.42), mat("#d1d5db")); stab.position.set(-0.5, 0.04, 0); jet.add(stab);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), mat("#9ca3af")); stand.position.y = 0.22; spin.add(stand);
  spin.traverse((o) => { o.castShadow = true; });
  block(TX - 1.0, TZ - 1.0, 2.0, 2.0);
  for (const [lx, lz] of [[TX - 1.6, TZ - 0.9], [TX + 1.6, TZ - 0.9]]) {
    k.tripodLegs(lx, lz, 0.5, 0.3, 0.018, "#111827");
    rod([lx, 0.5, lz], [lx, 1.9, lz], 0.022, "#111827");
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 16), mat("#111827")); head.position.set(wx(lx), 1.95, wz(lz));
    head.rotation.z = lx < TX ? 0.8 : -0.8; add(head);
  }
  const spot = new THREE.PointLight("#fff4e0", 4, 4.5, 1.6); spot.position.set(wx(TX), 2.3, wz(TZ - 0.4)); root.add(spot);
  // screening corner: a monitor on a stand and a sofa for the reviewer's "first view"
  box(11.2, 8.55, 1.8, 0.12, 1.05, "#0b1220", 0.75);
  const review = screenMat((g, w, h) => {
    g.fillStyle = "#0b1220"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1f2937"; g.fillRect(16, h - 70, w - 32, 50);
    for (let i = 0; i < 40; i++) { const v = 8 + Math.abs(Math.sin(i * 0.7)) * 34; g.fillStyle = teal; g.fillRect(24 + i * 11.6, h - 45 - v / 2, 6, v); }
    g.fillStyle = ivory; g.font = "700 22px system-ui"; g.fillText("−14,0 LUFS · TP −1,4 dBTP", 24, 40);
    g.fillStyle = "#9ca3af"; g.font = "600 18px system-ui"; g.fillText("uji suara dimatikan ✓", 24, 74);
  });
  plane(1.7, 0.95, review, 12.1, 1.275, 8.68);
  cyl(12.1, 8.6, 0.05, 0.75, "#374151"); cyl(12.1, 8.6, 0.32, 0.04, "#374151", 0, 0.32, 20);
  block(11.1, 8.4, 2.0, 0.4);
  box(10.6, 10.75, 3.0, 0.85, 0.42, "#2f4058"); box(10.6, 11.42, 3.0, 0.2, 0.85, "#2f4058");
  for (const x of [10.6, 13.45]) box(x, 10.75, 0.15, 0.85, 0.62, "#26364b");
  block(10.5, 10.7, 3.2, 1.0);
  // coffee counter
  box(0.05, 9.4, 0.7, 1.6, 0.95, "#1f2937"); box(0.12, 9.7, 0.4, 0.35, 0.45, "#475569", 0.95);
  block(0, 9.3, 0.9, 1.8);
  for (const [id, s] of Object.entries(FLOORS.explainer.stations)) k.deskAt(id, s);
  const meetGlow = new THREE.MeshStandardMaterial({ color: "#e8eef2", emissive: teal, emissiveIntensity: 0, roughness: 0.5 });
  roundTable(k, 4.8, 9.6, 0.95, meetGlow, navy, FLOORS.explainer.meetSeats, blue);
  const rec = new THREE.MeshBasicMaterial({ color: "#ff3b30", toneMapped: false });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), rec); led.position.set(wx(10.0), 2.78, wz(0.1)); root.add(led);
  plant(0.5, 0.5, 0.9, "#334155"); plant(14.6, 0.55, 0.85, "#334155"); plant(7.6, 11.6, 1.0, "#334155"); plant(18.3, 9.4, 0.9, "#334155");
  const tick = (t) => {
    spin.rotation.y = t * 0.45;
    leds.forEach((m, i) => m.color.set(Math.sin(t * 3.2 + i * 2.3) > 0.1 ? teal : "#0e3b44"));
  };
  return { top, meetGlow, tv, rec, tick };
}

// ---------------- performance ----------------
// Everything that never moves is merged into one mesh per material (thousands of boxes → a few dozen draw calls).
// Objects flagged userData.noMerge (and their children) stay as they are: people, moving parts, click targets.
function mergeStatic(node) {
  if (typeof location !== "undefined" && /[?&]nomerge\b/.test(location.search)) return { before: 0, after: 0 }; // dev: compare
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  const groups = new Map();
  const walk = (o) => {
    if (o !== node && o.userData.noMerge) return;
    if (o.isMesh && !Array.isArray(o.material) && !o.isInstancedMesh && !o.isSkinnedMesh) {
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    for (const c of [...o.children]) walk(c);
  };
  walk(node);
  let before = 0, after = 0;
  for (const list of groups.values()) {
    before += list.length;
    if (list.length < 2) { after += list.length; continue; }
    const geos = list.map((o) => {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.clearGroups();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) { after += list.length; continue; }
    const m = new THREE.Mesh(merged, list[0].material);
    m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.renderOrder = list[0].renderOrder;
    node.add(m);
    for (const o of list) { o.parent?.remove(o); o.geometry.dispose(); }
    after++;
  }
  return { before, after };
}

// ---------------- roof ----------------
// one roof over the top built floor: slab, parapet, skylight over the atrium, plant units; planned floors are tagged on it
function buildRoof(scene, outline, y, planned) {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(wx(p.x), -wz(p.y))));
  const white = new THREE.MeshStandardMaterial({ color: "#f5f3ee", roughness: 0.6 });
  const deckMat = new THREE.MeshStandardMaterial({ color: "#d9d4ca", roughness: 0.9 });
  const g = new THREE.Group();
  g.position.y = y;
  scene.add(g);
  const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false, curveSegments: 1 }), [deckMat, white]);
  slab.geometry.rotateX(-Math.PI / 2); slab.position.y = -0.45; slab.castShadow = true; slab.receiveShadow = true; g.add(slab);
  // parapet: the outline with a slightly smaller copy cut out
  const [mx, mz] = [9, 6.3];
  const ring = new THREE.Shape(outline.map((p) => new THREE.Vector2(wx(p.x), -wz(p.y))));
  ring.holes.push(new THREE.Path(outline.map((p) => new THREE.Vector2(wx(mx + (p.x - mx) * 0.965), -wz(mz + (p.y - mz) * 0.955)))));
  const parapet = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.55, bevelEnabled: false, curveSegments: 1 }), white);
  parapet.geometry.rotateX(-Math.PI / 2); parapet.castShadow = true; g.add(parapet);
  // skylight over the middle of the plan
  const frame = new THREE.MeshStandardMaterial({ color: "#2b3440", roughness: 0.5 });
  const sky = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 3.6), frame);
  sky.position.set(wx(9), 0.15, wz(5.6)); g.add(sky);
  const pane = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.06, 3.2), new THREE.MeshStandardMaterial({ color: "#bfe0ff", emissive: "#bfe0ff", emissiveIntensity: 0.25, roughness: 0.1 }));
  pane.position.set(wx(9), 0.33, wz(5.6)); g.add(pane);
  for (let i = 1; i < 4; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 3.2), frame); r.position.set(wx(9 - 3 + i * 1.5), 0.38, wz(5.6)); g.add(r); }
  // rooftop plant units
  const unitMat = new THREE.MeshStandardMaterial({ color: "#c9ccd1", roughness: 0.5 });
  for (const [x, z] of [[2.6, 2.4], [4.4, 2.4], [15.6, 2.2]]) {
    const u = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.1), unitMat);
    u.position.set(wx(x), 0.4, wz(z)); u.castShadow = true; g.add(u);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), frame);
    fan.position.set(wx(x), 0.82, wz(z)); g.add(fan);
  }
  const tags = planned.map((f, i) => {
    const tag = new CSS2DObject(floorTag(f, false));
    tag.position.set(wx(16.5), 0.9 + i * 0.9, wz(9.5)); g.add(tag);
    return tag;
  });
  return { group: g, tags };
}

// ---------------- component ----------------
export default function StudioThree({ buildingName = "Atrium", buildingTagline = "Menara kerja agen AI", floors = [], roster, agentState, providers, waitingByFloor = {}, focus = null, onFocus, selected, onSelect, lite = false }) {
  const wrap = useRef(null);
  const props = useRef({});
  props.current = { agentState, providers, waitingByFloor, selected, onSelect, onFocus, lite, focus };
  const api = useRef(null);
  const people = useRef([]);
  const tags = useRef({});
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const buildingRef = useRef({ name: buildingName, tagline: buildingTagline });
  buildingRef.current = { name: buildingName, tagline: buildingTagline };
  const floorsRef = useRef(floors);
  floorsRef.current = floors;
  const rosterKey = (roster.agents ?? []).map((a) => `${a.id}:${a.division ?? ""}:${a.name ?? ""}:${a.title ?? ""}`).join("|");
  const floorsKey = buildingName + "|" + buildingTagline + "|" + floors.map((f) => `${f.id}:${f.type ?? ""}`).join("|");

  useEffect(() => {
    const host = wrap.current;
    if (!host) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    const PR = Math.min(window.devicePixelRatio, 1.25); // retina at 2× costs 2.5× the pixels for little visible gain here
    renderer.setPixelRatio(PR);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false; // shadows are refreshed a few times a second, floor by floor (see tick)
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.autoClear = false;
    host.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.className = "ag-labels";
    host.appendChild(labels.domElement);

    // Each floor is its own scene with its own sun, so a floor's shadows never fall on the floor below.
    const levels = floorsRef.current.map((f, i) => ({ f, level: f.level ?? i, built: !!FLOORS[f.id] && !!f.type }));
    const base = new THREE.Scene();
    addLights(base, new THREE.Vector3(0, FLOOR_GAP, 0), false);
    const topBuilt = Math.max(0, ...levels.filter((L) => L.built).map((L) => L.level));
    const roofY = (topBuilt + 1) * FLOOR_GAP;
    buildBase(base, roofY, buildingRef.current.name, buildingRef.current.tagline);
    const roof = buildRoof(base, designPlan().outline, roofY, levels.filter((L) => !L.built).map((L) => L.f));
    mergeStatic(roof.group);
    roof.group.userData.noMerge = true; mergeStatic(base);
    const [cx, cz] = [wx(CORE[0]), wz(CORE[1])];
    const agents = rosterRef.current.agents ?? [];
    let plazaDone = false;
    const mergeStats = [];
    const built = levels.filter((L) => L.built).map((L) => {
      const scene = new THREE.Scene();
      const root = new THREE.Group();
      root.position.set(cx, L.level * FLOOR_GAP, cz);
      const content = new THREE.Group();
      content.position.set(-cx, 0, -cz);
      root.add(content);
      scene.add(root);
      if (L.level === 0 && !plazaDone) { plaza(scene); plazaDone = true; }
      const cfg = FLOORS[L.f.id];
      const plan = cfg.plan();
      const k = kit(content);
      const world = cfg.build(k, plan);
      world.screens = k.screens;
      world.top.userData.floor = L.f.id;
      world.top.userData.noMerge = true; // raycast target for "click a floor"
      const merged = mergeStatic(content);
      root.userData.noMerge = true; mergeStatic(scene); root.userData.noMerge = false; // plaza, trees
      mergeStats.push([L.f.id, merged.before, merged.after]);
      root.updateMatrixWorld(true);
      addLights(scene, content.localToWorld(new THREE.Vector3(wx(9), 0, wz(6))), true);
      const list = agents.filter((a) => (a.division ?? "design") === L.f.id).map(makePerson);
      list.forEach((p) => { content.add(p.g); p.el.addEventListener("click", () => props.current.onSelect?.(p.id)); });
      const tagEl = floorTag(L.f, true);
      tagEl.addEventListener("click", () => props.current.onFocus?.(L.f.id));
      const tag = new CSS2DObject(tagEl);
      const [tx, tz] = cfg.tagAt ?? [4.2, 13.0];
      tag.position.set(wx(tx), 0.35, wz(tz));
      content.add(tag);
      return { id: L.f.id, level: L.level, scene, root, content, cfg, world, k, plan, people: list, tag, tagEl };
    });
    for (const F of built) F.grid = makeGrid(F.k.obstacles, F.plan.outline);
    people.current = built.flatMap((F) => F.people);
    tags.current = Object.fromEntries(built.map((F) => [F.id, F.tagEl]));
    const levelOf = Object.fromEntries(built.map((F) => [F.id, F.level]));

    const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 7;
    controls.maxDistance = 80;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.42;
    controls.minAzimuthAngle = -0.5;
    controls.maxAzimuthAngle = 1.75;
    controls.screenSpacePanning = false;
    const topY = roofY;
    controls.addEventListener("change", () => {
      controls.target.x = Math.max(-18, Math.min(18, controls.target.x));
      controls.target.z = Math.max(-14, Math.min(14, controls.target.z));
      controls.target.y = Math.max(0, Math.min(topY, controls.target.y));
    });
    // camera homes: the whole building, or one floor seen like the old single-room view
    const homeOf = (id) => {
      const F = built.find((b) => b.id === id);
      if (!F) {
        const target = new THREE.Vector3(0.5, roofY * 0.45, 1.0);
        return { target, pos: target.clone().add(new THREE.Vector3(25, 9 + roofY * 0.6, 35)) };
      }
      const [hx, hz] = F.cfg.center ?? [9.4, 6.6];
      const target = F.content.localToWorld(new THREE.Vector3(wx(hx), 0.2, wz(hz)));
      const off = new THREE.Vector3(...(F.cfg.camOff ?? [10.6, 12.8, 14.0]));
      return { target, pos: target.clone().add(off) };
    };
    let fly = null;
    const goHome = (id, instant = false) => {
      const h = homeOf(id);
      if (instant) { camera.position.copy(h.pos); controls.target.copy(h.target); fly = null; }
      else fly = h;
    };
    controls.addEventListener("start", () => { fly = null; });
    goHome(props.current.focus, true);

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downAt = null;
    const onDown = (e) => { downAt = [e.clientX, e.clientY]; };
    const onUp = (e) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const vis = built.filter((F) => F.root.visible);
      const hit = ray.intersectObjects(vis.flatMap((F) => F.people.map((p) => p.body)), true).find((h) => h.object.userData.agent);
      if (hit) return props.current.onSelect?.(hit.object.userData.agent);
      if (props.current.focus == null) {
        const plate = ray.intersectObjects(vis.map((F) => F.world.top), false)[0];
        if (plate) return props.current.onFocus?.(plate.object.userData.floor);
      }
      props.current.onSelect?.(null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (!width || !height) return;
      renderer.setSize(width, height);
      labels.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    ro.observe(host);

    const rand = rng(Date.now() & 0xffff);
    const clock = new THREE.Clock();
    let raf = 0;
    // Power-saving mode while agents run: ~20 fps, pixel ratio 1, shadows refreshed once a second.
    let wasLite = false, acc = 0, shadowAt = 0, lastFocus = props.current.focus, frameNo = 0, shadowsDirty = 2;
    let interacting = false, onScreen = true;
    controls.addEventListener("start", () => { interacting = true; });
    controls.addEventListener("end", () => { interacting = false; });
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; });
    io.observe(host);
    const stepFloor = (F, t, dt, P) => {
      const { cfg, grid } = F;
      const SPOTS = cfg.spots;
      const meeting = (P.waitingByFloor?.[F.id] ?? 0) > 0;
      const list = F.people;
      const setGoal = (p, goal, key) => { p.goal = goal; p.goalKey = key; p.sitting = false; p.path = grid.path([p.x, p.z], [goal.x, goal.z]); p.wait = t; };
      list.forEach((p, i) => {
        const st = P.agentState?.[p.id]?.state;
        let goal = null, key = "roam";
        if (st === "working" && cfg.stations[p.id]) { goal = deskSeat(cfg, p.id); key = "desk"; }
        else if (meeting && st) { goal = cfg.meetSeats[i % cfg.meetSeats.length]; key = "meet"; }
        if (!p.placed) {
          if (!goal) goal = SPOTS[(i * 2) % SPOTS.length];
          p.x = goal.x; p.z = goal.z; p.rot = goal.face ?? 0; p.goal = goal; p.goalKey = key; p.path = [];
          p.sitting = !!goal.sit; p.seatY = goal.seatY ?? 0.5; p.wait = t + 2 + rand() * 4; p.placed = true;
        } else if (key !== "roam") {
          if (p.goalKey !== key) setGoal(p, goal, key);
        } else if (p.goalKey !== "roam") {
          p.goalKey = "roam"; p.wait = t + 0.4 + rand(); p.sitting = false; p.path = []; p.goal = null;
        } else if (!p.path.length && t > p.wait) {
          const taken = new Set(list.map((q) => q.goal?.id).filter(Boolean));
          const spots = SPOTS.filter((s) => !taken.has(s.id) && s !== p.goal);
          let g;
          if (spots.length && rand() < 0.6) g = spots[Math.floor(rand() * spots.length)];
          else { const [x, z] = grid.randomFree(rand); g = { x, z, stay: [1.5, 4] }; }
          setGoal(p, g, "roam");
        }
        let walking = false;
        if (p.path.length) {
          const [tx, tz] = p.path[0];
          const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
          const stepLen = 1.5 * dt;
          if (dist <= stepLen) {
            p.x = tx; p.z = tz; p.path.shift();
            if (!p.path.length && p.goal) {
              p.sitting = !!p.goal.sit; p.seatY = p.goal.seatY ?? 0.5;
              if (p.goalKey === "roam") { const [a, b] = p.goal.stay ?? [2, 5]; p.wait = t + a + rand() * (b - a); }
            }
          } else {
            p.x += (dx / dist) * stepLen; p.z += (dz / dist) * stepLen;
            p.rot = lerpAngle(p.rot, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
          }
          walking = true;
        } else if (p.goal?.face != null) p.rot = lerpAngle(p.rot, p.goal.face, 1 - Math.exp(-8 * dt));
        const k = 1 - Math.exp(-14 * dt);
        const swing = walking && !reduce ? Math.sin(t * 10 + i) * 0.6 : 0;
        const legX = p.sitting ? -Math.PI / 2 : 0;
        p.legs[0].rotation.x += (legX + swing - p.legs[0].rotation.x) * k;
        p.legs[1].rotation.x += (legX - swing - p.legs[1].rotation.x) * k;
        const typing = st === "working" && p.sitting && p.goalKey === "desk";
        const armX = typing ? -1.15 + (reduce ? 0 : Math.sin(t * 16 + i) * 0.07) : walking ? -swing * 0.8 : p.sitting ? -0.35 : 0;
        p.arms[0].rotation.x += (armX - p.arms[0].rotation.x) * k;
        p.arms[1].rotation.x += (armX + (typing && !reduce ? Math.sin(t * 16 + i + 1.5) * 0.12 : walking ? swing * 1.6 : 0) - p.arms[1].rotation.x) * k;
        const y = p.sitting ? p.seatY - 0.45 * PS + 0.02 : walking && !reduce ? Math.abs(Math.sin(t * 10 + i)) * 0.035 : 0;
        p.g.position.set(wx(p.x), p.g.position.y + (y - p.g.position.y) * k, wz(p.z));
        p.g.rotation.y = p.rot;
        p.ring.visible = P.selected === p.id;
      });
      const w = F.world;
      for (const [id, m] of Object.entries(w.screens)) m.emissiveIntensity += ((P.agentState?.[id]?.state === "working" ? 0.95 : 0.05) - m.emissiveIntensity) * 0.08;
      w.meetGlow.emissiveIntensity += ((meeting ? 0.35 + (reduce ? 0 : Math.sin(t * 3) * 0.1) : 0) - w.meetGlow.emissiveIntensity) * 0.08;
      w.tv.emissiveIntensity += ((meeting ? 0.9 : 0.08) - w.tv.emissiveIntensity) * 0.08;
      w.rec.color.set(Math.sin(t * 4) > 0 || reduce ? "#ff3b30" : "#5a1010");
      if (!reduce) w.tick?.(t, dt);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const P = props.current;
      const lite = !!P.lite;
      if (lite !== wasLite) {
        wasLite = lite;
        renderer.setPixelRatio(lite ? 1 : PR);
        renderer.setSize(host.clientWidth, host.clientHeight);
      }
      if (!onScreen) { clock.getDelta(); return; }
      acc += clock.getDelta();
      // 30 fps is plenty for walking figures; full rate only while the user drags or the camera flies
      const minDt = lite ? 1 / 20 : interacting || fly ? 1 / 60 : 1 / 30;
      if (acc < minDt - 0.002) return;
      const dt = Math.min(acc, 0.1);
      acc = 0;
      const t = clock.elapsedTime;
      if (P.focus !== lastFocus) { lastFocus = P.focus; goHome(P.focus); }
      if (fly) {
        const k = 1 - Math.exp(-4 * dt);
        camera.position.lerp(fly.pos, k);
        controls.target.lerp(fly.target, k);
        if (camera.position.distanceTo(fly.pos) < 0.05) fly = null;
      }
      // floors above the focused one are hidden so the camera can look down into it
      const fl = P.focus == null ? Infinity : levelOf[P.focus] ?? Infinity;
      for (const F of built) {
        const vis = F.level <= fl;
        F.root.visible = vis;
        const labelled = P.focus == null || F.id === P.focus; // labels only for the room in view
        F.tag.visible = labelled;
        for (const p of F.people) p.label.visible = labelled;
        stepFloor(F, t, dt, P);
      }
      roof.group.visible = P.focus == null; // the roof comes off when looking into a floor
      host.parentElement?.classList.toggle("far", camera.position.distanceTo(controls.target) > 30);

      controls.update();
      // shadows: the room in focus every other frame, the others one at a time in turn (lite: all once a second)
      frameNo++;
      const shown = built.filter((F) => F.root.visible);
      const liteTick = lite && clock.elapsedTime - shadowAt > 1;
      if (liteTick) shadowAt = clock.elapsedTime;
      const turn = shown.length ? frameNo % shown.length : 0;
      renderer.clear();
      renderer.render(base, camera);
      shown.forEach((F, i) => {
        const refresh = shadowsDirty > 0 || (lite ? liteTick : F.id === P.focus ? frameNo % 2 === 0 : i === turn);
        if (refresh) renderer.shadowMap.needsUpdate = true;
        renderer.render(F.scene, camera);
      });
      if (shadowsDirty > 0) shadowsDirty--;
      labels.render(base, camera);
      for (const F of built) labels.render(F.scene, camera);
    };
    tick();

    api.current = {
      rotate: (a) => { const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), a); camera.position.copy(controls.target).add(off); fly = null; },
      zoom: (f) => { const off = camera.position.clone().sub(controls.target).multiplyScalar(f); camera.position.copy(controls.target).add(off); fly = null; },
      reset: () => goHome(props.current.focus),
      // dev: average ms per frame for the whole building; allShadows = old behaviour (every floor's shadow map every frame)
      bench: (n = 40, allShadows = false) => {
        const gl = renderer.getContext(), px = new Uint8Array(4);
        const shown = built.filter((F) => F.root.visible);
        const run = () => { for (let i = 0; i < n; i++) {
          renderer.clear(); renderer.render(base, camera);
          shown.forEach((F, j) => { if (allShadows || i % shown.length === j) renderer.shadowMap.needsUpdate = true; renderer.render(F.scene, camera); });
        } gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
        run();
        const t0 = performance.now(); run();
        return +((performance.now() - t0) / n).toFixed(2);
      },
      debug: () => ({ merge: mergeStats, cam: camera.position.toArray(), target: controls.target.toArray(), floors: built.map((F) => [F.id, F.root.visible, F.people.length]), calls: renderer.info.render.calls, frame: renderer.info.render.frame }),
      // development only: look at a room point of a floor from an offset, for checking details
      lookAt: (floorId, x, y, z, dx, dy, dz) => {
        const F = built.find((b) => b.id === floorId) ?? built[0];
        const p = F.content.localToWorld(new THREE.Vector3(wx(x), y, wz(z)));
        controls.target.copy(p); camera.position.set(p.x + dx, p.y + dy, p.z + dz); fly = null;
      },
    };
    if (process.env.NODE_ENV === "development") window.__studio = api.current;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      for (const s of [base, ...built.map((F) => F.scene)]) s.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) { m.map?.dispose(); m.dispose(); }
      });
      renderer.dispose();
      host.replaceChildren();
    };
  }, [rosterKey, floorsKey]);

  // label contents follow props without rebuilding the scene
  useEffect(() => {
    for (const p of people.current) {
      const st = agentState[p.id]?.state;
      const prov = providers[p.id] ?? "claude";
      const b = p.el.querySelector(".prov");
      b.className = `prov ${prov}`;
      b.textContent = prov === "gemini" ? "G" : "C";
      const s = p.el.querySelector(".st");
      s.className = `st ${st ?? ""}`;
      s.textContent = st === "working" ? "•••" : st === "done" ? "✓" : "";
      p.el.classList.toggle("sel", selected === p.id);
      p.el.setAttribute("aria-label", `${p.a.name ?? ""} (${p.a.title}): ${st === "working" ? "bekerja" : st === "done" ? "selesai" : "santai"}`);
      p.el.setAttribute("aria-pressed", String(selected === p.id));
    }
    for (const [id, el] of Object.entries(tags.current)) {
      const n = waitingByFloor[id] ?? 0;
      const c = el.querySelector(".count");
      c.hidden = !n; c.textContent = String(n);
      el.classList.toggle("on", focus === id);
      el.setAttribute("aria-label", `${el.querySelector("b").textContent} ${el.querySelector("span").textContent}${n ? `, ${n} menunggu Anda` : ""}`);
    }
  });

  const focusFloor = floors.find((f) => f.id === focus);
  const waitingHere = focus ? waitingByFloor[focus] ?? 0 : Object.values(waitingByFloor).reduce((a, b) => a + b, 0);
  return (
    <div className="studio-gl">
      <div className="gl-host" ref={wrap} />
      {waitingHere > 0 && <p className="meet-note">{focusFloor ? `Tim ${focusFloor.name} berkumpul di meja meeting` : "Ada tim yang berkumpul di meja meeting"} · {waitingHere} menunggu Anda</p>}
      <div className="cam-ctl">
        <button type="button" onClick={() => api.current?.rotate(-0.3)} aria-label="Putar kiri">⟲</button>
        <button type="button" onClick={() => api.current?.reset()} aria-label="Atur ulang kamera">⌂</button>
        <button type="button" onClick={() => api.current?.rotate(0.3)} aria-label="Putar kanan">⟳</button>
        <button type="button" onClick={() => api.current?.zoom(0.85)} aria-label="Perbesar">+</button>
        <button type="button" onClick={() => api.current?.zoom(1.18)} aria-label="Perkecil">−</button>
      </div>
    </div>
  );
}
