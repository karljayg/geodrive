// Writes public/assets/car.glb: a low-poly car built from code, so no third-party asset or licence.
// Built with y up and the nose along +z, then written the way Model3DElement reads models: x east, y north, z up.
// Units are metres. Run: node scripts/make-car.mjs
import { writeFileSync } from 'node:fs';

const COLORS = {
  body: [0.05, 0.75, 0.55, 1],
  glass: [0.04, 0.09, 0.13, 1],
  tyre: [0.03, 0.03, 0.03, 1],
  head: [1, 0.95, 0.6, 1],
  tail: [0.9, 0.05, 0.05, 1],
};
const groups = Object.fromEntries(Object.keys(COLORS).map((k) => [k, { pos: [], nor: [] }]));

function tri(g, a, b, c) {
  const u = a.map((v, i) => b[i] - v), w = a.map((v, i) => c[i] - v);
  let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const len = Math.hypot(...n) || 1;
  n = n.map((v) => v / len);
  const out = ([x, y, z]) => [-x, z, y];
  for (const p of [a, b, c]) { g.pos.push(...out(p)); g.nor.push(...out(n)); }
}
const quad = (g, a, b, c, d) => { tri(g, a, b, c); tri(g, a, c, d); };

// A box whose top face can be smaller than its bottom face (w/l are half sizes), for the cabin slope.
function box(name, cx, cz, y0, y1, w0, l0, w1 = w0, l1 = l0, topShift = 0) {
  const g = groups[name];
  const b = [[cx - w0, y0, cz - l0], [cx + w0, y0, cz - l0], [cx + w0, y0, cz + l0], [cx - w0, y0, cz + l0]];
  const t = [[cx - w1, y1, cz - l1 + topShift], [cx + w1, y1, cz - l1 + topShift], [cx + w1, y1, cz + l1 + topShift], [cx - w1, y1, cz + l1 + topShift]];
  quad(g, t[0], t[3], t[2], t[1]);
  quad(g, b[0], b[1], b[2], b[3]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(g, b[i], t[i], t[j], b[j]);
  }
}

function wheel(x, z, r = 0.34, width = 0.24, sides = 12) {
  const g = groups.tyre;
  const ring = (dx) => Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [x + dx, r + Math.cos(a) * r, z + Math.sin(a) * r];
  });
  const L = ring(-width / 2), R = ring(width / 2);
  const cl = [x - width / 2, r, z], cr = [x + width / 2, r, z];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tri(g, cl, L[i], L[j]);
    tri(g, cr, R[j], R[i]);
    quad(g, L[i], R[i], R[j], L[j]);
  }
}

box('body', 0, 0, 0.3, 0.82, 0.9, 2.2, 0.86, 2.15);
box('glass', 0, -0.25, 0.82, 1.32, 0.8, 1.25, 0.66, 0.72, -0.05);
box('body', 0, -0.3, 1.32, 1.36, 0.66, 0.72);
box('head', 0.58, 2.19, 0.55, 0.72, 0.2, 0.03);
box('head', -0.58, 2.19, 0.55, 0.72, 0.2, 0.03);
box('tail', 0.58, -2.19, 0.58, 0.74, 0.22, 0.03);
box('tail', -0.58, -2.19, 0.58, 0.74, 0.22, 0.03);
for (const x of [-0.84, 0.84]) for (const z of [-1.4, 1.4]) wheel(x, z);

// glTF binary container.
const names = Object.keys(groups);
const chunks = [], views = [], accessors = [], primitives = [];
let offset = 0;
for (const [m, name] of names.entries()) {
  const { pos, nor } = groups[name];
  const count = pos.length / 3;
  const min = [0, 1, 2].map((a) => Math.min(...pos.filter((_, i) => i % 3 === a)));
  const max = [0, 1, 2].map((a) => Math.max(...pos.filter((_, i) => i % 3 === a)));
  primitives.push({ attributes: { POSITION: accessors.length, NORMAL: accessors.length + 1 }, material: m, mode: 4 });
  for (const [data, extra] of [[pos, { min, max }], [nor, {}]]) {
    const buf = Buffer.from(new Float32Array(data).buffer);
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target: 34962 });
    accessors.push({ bufferView: views.length - 1, componentType: 5126, count, type: 'VEC3', ...extra });
    chunks.push(buf);
    offset += buf.length;
  }
}
const gltf = {
  asset: { version: '2.0', generator: 'geodrive make-car' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives }],
  materials: names.map((n) => ({
    name: n,
    pbrMetallicRoughness: { baseColorFactor: COLORS[n], metallicFactor: 0, roughnessFactor: n === 'glass' ? 0.2 : 0.6 },
    ...(n === 'head' || n === 'tail' ? { emissiveFactor: COLORS[n].slice(0, 3) } : {}),
  })),
  buffers: [{ byteLength: offset }], bufferViews: views, accessors,
};
const pad = (b, c) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, c)]);
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20);
const bin = pad(Buffer.concat(chunks), 0);
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const chunkHead = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
const out = new URL('../public/assets/car.glb', import.meta.url);
writeFileSync(out, Buffer.concat([head, chunkHead(json.length, 0x4e4f534a), json, chunkHead(bin.length, 0x004e4942), bin]));
console.log('car.glb', 12 + 16 + json.length + bin.length, 'bytes');
