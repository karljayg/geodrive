// Makes public/furniture.bin from the GLB models in assets/kenney-furniture, keeping only what the catalogue uses, so the
// browser never has to read a GLB. Run it after changing the models in public/js/furniture.js: node scripts/build-furniture.mjs
// The kit is y up with fronts towards +z. Here, as everywhere in the game, it becomes z up with fronts towards +y: x = -x, y = z, z = y.
// That is a rotation, not a mirror, so faces keep their winding.
import { readFileSync, writeFileSync } from 'node:fs';
import { KIT_SCALE, MODEL_SCALE, MODEL_TURNED, usedModels } from '../public/js/furniture.js';

const SOURCE = new URL('../assets/kenney-furniture/', import.meta.url), TARGET = new URL('../public/furniture.bin', import.meta.url);
const MM = 1000;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1], [sx, sy, sz] = node.scale || [1, 1, 1], [tx, ty, tz] = node.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

// A GLB as triangles by material: { name: [x, y, z, ...] }, and the colour of each material.
function readGlb(file) {
  const bytes = readFileSync(file), jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()), bin = bytes.subarray(20 + jsonLength + 8);
  const read = (index) => {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView], count = { SCALAR: 1, VEC3: 3 }[a.type];
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType], stride = view.byteStride || size * count, start = (view.byteOffset || 0) + (a.byteOffset || 0), out = [];
    const value = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE', 5121: 'readUInt8' }[a.componentType];
    for (let e = 0; e < a.count; e++) for (let c = 0; c < count; c++) out.push(bin[value](start + e * stride + c * size));
    return out;
  };
  const parts = {}, colours = {};
  const visit = (index, parent) => {
    const node = gltf.nodes[index], m = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const material = gltf.materials[primitive.material], name = material.name;
        colours[name] = (material.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1]).slice(0, 3);
        const position = read(primitive.attributes.POSITION), order = primitive.indices !== undefined ? read(primitive.indices) : position.filter((_, i) => i % 3 === 0).map((_, i) => i);
        const list = parts[name] ||= [];
        for (const i of order) {
          const [px, py, pz] = [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]];
          list.push(m[0] * px + m[4] * py + m[8] * pz + m[12], m[1] * px + m[5] * py + m[9] * pz + m[13], m[2] * px + m[6] * py + m[10] * pz + m[14]);
        }
      }
    }
    for (const child of node.children || []) visit(child, m);
  };
  for (const index of gltf.scenes[gltf.scene || 0].nodes) visit(index, IDENTITY);
  return { parts, colours };
}

const index = { colours: {}, models: {} }, chunks = [];
for (const name of usedModels()) {
  const { parts, colours } = readGlb(new URL(`${name}.glb`, SOURCE)), scale = (MODEL_SCALE[name] ?? KIT_SCALE) * MM;
  Object.assign(index.colours, colours);
  const flat = Object.values(parts).flat(), kitX = flat.filter((_, i) => i % 3 === 0), kitY = flat.filter((_, i) => i % 3 === 1), kitZ = flat.filter((_, i) => i % 3 === 2);
  const middleX = (Math.min(...kitX) + Math.max(...kitX)) / 2, middleZ = (Math.min(...kitZ) + Math.max(...kitZ)) / 2, floor = Math.min(...kitY, 0);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], modelParts = [];
  for (const [mat, list] of Object.entries(parts)) {
    const out = new Int16Array(list.length);
    for (let i = 0; i < list.length; i += 3) {
      const across = -(list[i] - middleX) * scale, along = (list[i + 2] - middleZ) * scale, up = (list[i + 1] - floor) * scale;
      const point = MODEL_TURNED.has(name) ? [-along, across, up] : [across, along, up];
      for (let k = 0; k < 3; k++) {
        out[i + k] = Math.round(point[k]);
        min[k] = Math.min(min[k], out[i + k]);
        max[k] = Math.max(max[k], out[i + k]);
      }
    }
    chunks.push(out);
    modelParts.push({ mat, tris: list.length / 9 });
  }
  index.models[name] = { parts: modelParts, min, max };
}

let json = JSON.stringify(index);
if ((4 + json.length) % 2) json += ' '; // the numbers that follow must start on an even byte
const head = Buffer.alloc(4);
head.writeUInt32LE(json.length);
const body = Buffer.concat([head, Buffer.from(json), ...chunks.map((c) => Buffer.from(c.buffer))]);
writeFileSync(TARGET, body);
const triangles = chunks.reduce((sum, c) => sum + c.length / 9, 0);
console.log(`${Object.keys(index.models).length} models, ${triangles} triangles, ${(body.length / 1024).toFixed(0)} KB`);
for (const [name, { min, max }] of Object.entries(index.models)) console.log(`${name.padEnd(28)} ${((max[0] - min[0]) / MM).toFixed(2)} × ${((max[1] - min[1]) / MM).toFixed(2)} × ${(max[2] / MM).toFixed(2)}${min[2] > 20 ? `  lifted ${min[2]}` : ''}`);
