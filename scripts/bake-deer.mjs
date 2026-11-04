// Bakes Agecraft's Quaternius deer into still frames the map can show. The map's model has no animation of its own.
// Source glbs are not in this repo: pass the Agecraft public3d/models directory.
//   NODE_PATH=/tmp/deer-bake/node_modules node scripts/bake-deer.mjs /tmp/deer-src
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function readGlb(file) {
  const { readFileSync } = await import('node:fs');
  const buf = readFileSync(file);
  return new Promise((ok, bad) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, bad));
}

// Posed triangles in map axes: x right, y forward, z up, feet on z = 0, nose toward +y.
function bake(scene, scale, lift) {
  scene.updateMatrixWorld(true);
  const groups = new Map();
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const geo = obj.geometry, pos = geo.attributes.position, idx = geo.index;
    const color = obj.material?.color ? [obj.material.color.r, obj.material.color.g, obj.material.color.b, 1] : [0.4, 0.26, 0.14, 1];
    const key = color.map((c) => c.toFixed(4)).join(',');
    const g = groups.get(key) || { color, pos: [], nor: [] };
    groups.set(key, g);
    const count = idx ? idx.count : pos.count;
    const points = [];
    for (let i = 0; i < count; i++) {
      const vi = idx ? idx.getX(i) : i;
      v.fromBufferAttribute(pos, vi);
      if (obj.isSkinnedMesh) obj.applyBoneTransform(vi, v);
      v.applyMatrix4(obj.matrixWorld);
      points.push([v.x * scale, v.z * scale, v.y * scale + lift]);
    }
    for (let i = 0; i + 2 < points.length; i += 3) {
      const a = points[i], b = points[i + 1], c = points[i + 2];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      n.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (n.lengthSq() < 1e-12) continue;
      n.normalize();
      for (const p of [a, b, c]) { g.pos.push(...p); g.nor.push(n.x, n.y, n.z); }
    }
  });
  return [...groups.values()].filter((g) => g.pos.length);
}

function glbOf(groups) {
  const views = [], accessors = [], primitives = [], chunks = [];
  let offset = 0;
  groups.forEach((g, m) => {
    const count = g.pos.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.pos.length; i++) { min[i % 3] = Math.min(min[i % 3], g.pos[i]); max[i % 3] = Math.max(max[i % 3], g.pos[i]); }
    primitives.push({ attributes: { POSITION: accessors.length, NORMAL: accessors.length + 1 }, material: m, mode: 4 });
    for (const [data, extra] of [[g.pos, { min, max }], [g.nor, {}]]) {
      const bytes = new Uint8Array(new Float32Array(data).buffer);
      views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: 34962 });
      accessors.push({ bufferView: views.length - 1, componentType: 5126, count, type: 'VEC3', ...extra });
      chunks.push(bytes);
      offset += bytes.length;
    }
  });
  const gltf = {
    asset: { version: '2.0', generator: 'geodrive' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives }],
    materials: groups.map((g) => ({ pbrMetallicRoughness: { baseColorFactor: g.color, metallicFactor: 0, roughnessFactor: 0.6 } })),
    buffers: [{ byteLength: offset }], bufferViews: views, accessors,
  };
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const pad = (n) => (4 - (n % 4)) % 4;
  const jsonLen = json.length + pad(json.length);
  const glb = new Uint8Array(12 + 8 + jsonLen + 8 + offset);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.length, true);
  view.setUint32(12, jsonLen, true); view.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + jsonLen); glb.set(json, 20);
  view.setUint32(20 + jsonLen, offset, true); view.setUint32(24 + jsonLen, 0x004e4942, true);
  let at = 28 + jsonLen;
  for (const c of chunks) { glb.set(c, at); at += c.length; }
  return glb;
}

function restBox(scene) {
  const posed = bake(scene, 1, 0);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const g of posed) for (let i = 0; i < g.pos.length; i++) {
    min[i % 3] = Math.min(min[i % 3], g.pos[i]);
    max[i % 3] = Math.max(max[i % 3], g.pos[i]);
  }
  return { min, max };
}

// Deer and stag use exact clip names. Chicken and rabbit match by name; they have no gallop.
const SPECIES = [
  { file: 'deer.glb', kind: 'deer', length: 1.45, clips: { idle: ['Idle', 4], walk: ['Walk', 6], gallop: ['Gallop', 4] } },
  { file: 'stag.glb', kind: 'stag', length: 1.65, clips: { idle: ['Idle', 4], walk: ['Walk', 6], gallop: ['Gallop', 4] } },
  { file: 'chicken.glb', kind: 'chicken', length: 0.42, clips: { idle: [/idle/i, 4], walk: [/walk/i, 4] } },
  { file: 'rabbit.glb', kind: 'rabbit', length: 0.45, clips: { idle: [/idle/i, 4], walk: [/walk/i, 4] } },
];

function findClip(animations, spec) {
  const [name, frames] = spec;
  const clip = animations.find((a) => (name instanceof RegExp ? name.test(a.name) : a.name === name));
  return clip ? [clip, frames] : null;
}

const srcDir = process.argv[2];
if (!srcDir) throw new Error('pass the directory with the glbs');
const root = process.argv[3] || join(import.meta.dirname, '../public/models');

for (const species of SPECIES) {
  const src = join(srcDir, species.file);
  if (!existsSync(src)) continue;
  const gltf = await readGlb(src);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const box = restBox(scene);
  // bake() already swapped three's y-up z-forward into y-forward z-up, so length is along y.
  const length = box.max[1] - box.min[1], height = box.max[2] - box.min[2];
  const scale = species.length / length, lift = -box.min[2] * scale;
  console.log(species.kind, 'rest length', length.toFixed(3), 'height', height.toFixed(3), 'scale', scale.toFixed(3));
  const dest = species.kind === 'stag' ? join(root, 'deer') : join(root, species.kind);
  mkdirSync(dest, { recursive: true });
  const mixer = new THREE.AnimationMixer(scene);
  for (const [gait, spec] of Object.entries(species.clips)) {
    const found = findClip(gltf.animations, spec);
    if (!found) throw new Error(`${species.kind} has no ${gait}`);
    const [clip, frames] = found;
    const action = mixer.clipAction(clip);
    action.play();
    for (let i = 0; i < frames; i++) {
      action.time = (i / frames) * clip.duration;
      mixer.update(0);
      writeFileSync(join(dest, `${species.kind}-${gait}-${i}.glb`), glbOf(bake(scene, scale, lift)));
    }
    action.stop();
    mixer.uncacheAction(clip);
    console.log(' ', gait, clip.name, clip.duration.toFixed(3), frames);
  }
}
console.log('wrote', root);
