// Builds a low-poly car as a glTF binary from its body type and colour, and the matching side-view picture for
// Settings. Made from code, so there's no asset licence and any colour works. Pure, tested in node.
// Built with y up and the nose along +z, then written the way Model3DElement reads models: x east, y north, z up.

// Half width, half length, body height, then the cabin: bottom-to-top height, half length, and how far back it sits.
// bed: an open load bed behind the cabin. wheel: radius.
export const BODY_SHAPES = {
  sport: { w: 0.95, l: 2.2, body: 0.72, cabin: 0.42, cabinL: 0.95, cabinZ: -0.35, topL: 0.55, wheel: 0.33 },
  muscle: { w: 0.95, l: 2.45, body: 0.88, cabin: 0.48, cabinL: 0.95, cabinZ: -0.7, topL: 0.62, wheel: 0.36 },
  hatch: { w: 0.88, l: 2.05, body: 0.85, cabin: 0.62, cabinL: 1.3, cabinZ: -0.5, topL: 0.95, wheel: 0.32 },
  truck: { w: 1.02, l: 2.85, body: 1.15, cabin: 0.72, cabinL: 0.85, cabinZ: 0.35, topL: 0.68, wheel: 0.46, bed: true },
  electric: { w: 0.92, l: 2.3, body: 0.8, cabin: 0.58, cabinL: 1.55, cabinZ: -0.1, topL: 0.85, wheel: 0.34 },
};
export const DEFAULT_COLOR = '#0dbf8c';

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function colorFactor(hex) {
  const n = parseInt(/^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : DEFAULT_COLOR.slice(1), 16);
  return [linear((n >> 16 & 255) / 255), linear((n >> 8 & 255) / 255), linear((n & 255) / 255), 1];
}

function geometry(shape) {
  const groups = { body: { pos: [], nor: [] }, glass: { pos: [], nor: [] }, tyre: { pos: [], nor: [] }, rim: { pos: [], nor: [] }, trim: { pos: [], nor: [] }, head: { pos: [], nor: [] }, tail: { pos: [], nor: [] } };
  const out = ([x, y, z]) => [-x, z, y];
  const tri = (g, a, b, c) => {
    const u = a.map((v, i) => b[i] - v), w = a.map((v, i) => c[i] - v);
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(...n) || 1;
    n = n.map((v) => v / len);
    for (const p of [a, b, c]) { g.pos.push(...out(p)); g.nor.push(...out(n)); }
  };
  const quad = (g, a, b, c, d) => { tri(g, a, b, c); tri(g, a, c, d); };
  // A box whose top can be smaller than its bottom (w/l are half sizes), for sloped cabins.
  const box = (name, cx, cz, y0, y1, w0, l0, w1 = w0, l1 = l0) => {
    const g = groups[name];
    const b = [[cx - w0, y0, cz - l0], [cx + w0, y0, cz - l0], [cx + w0, y0, cz + l0], [cx - w0, y0, cz + l0]];
    const t = [[cx - w1, y1, cz - l1], [cx + w1, y1, cz - l1], [cx + w1, y1, cz + l1], [cx - w1, y1, cz + l1]];
    quad(g, t[0], t[3], t[2], t[1]);
    quad(g, b[0], b[1], b[2], b[3]);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(g, b[i], t[i], t[j], b[j]); }
  };
  const wheel = (x, z, r, width = 0.26, sides = 12) => {
    const g = groups.tyre;
    const ring = (dx) => Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return [x + dx, r + Math.cos(a) * r, z + Math.sin(a) * r];
    });
    const L = ring(-width / 2), R = ring(width / 2), cl = [x - width / 2, r, z], cr = [x + width / 2, r, z];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      tri(g, cl, L[i], L[j]);
      tri(g, cr, R[j], R[i]);
      quad(g, L[i], R[i], R[j], L[j]);
    }
  };

  // A closed skin through rings of equal size. Faces turn away from each ring's middle, whichever way the rings are listed.
  const loft = (name, rings) => {
    const g = groups[name], middle = (ring) => ring[0].map((_, k) => ring.reduce((sum, p) => sum + p[k], 0) / ring.length);
    const away = (a, b, c, from) => {
      const u = a.map((v, i) => b[i] - v), v2 = a.map((v, i) => c[i] - v);
      const n = [u[1] * v2[2] - u[2] * v2[1], u[2] * v2[0] - u[0] * v2[2], u[0] * v2[1] - u[1] * v2[0]];
      if (n.reduce((sum, x, i) => sum + x * (a[i] - from[i]), 0) < 0) tri(g, a, c, b); else tri(g, a, b, c);
    };
    for (let s = 0; s < rings.length - 1; s++) {
      const A = rings[s], B = rings[s + 1], from = middle(A).map((x, k) => (x + middle(B)[k]) / 2);
      for (let i = 0; i < A.length; i++) {
        const j = (i + 1) % A.length;
        away(A[i], B[i], B[j], from);
        away(A[i], B[j], A[j], from);
      }
    }
    const whole = middle(rings.flat());
    for (const ring of [rings[0], rings[rings.length - 1]]) {
      const c = middle(ring);
      for (let i = 0; i < ring.length; i++) away(c, ring[i], ring[(i + 1) % ring.length], whole);
    }
  };

  const { w, l, body, cabin, cabinL, cabinZ, topL, wheel: r, bed } = shape;
  const floor = r * 0.7, roof = body + cabin;
  // The body, front to back: rounded across its top and pinched in at each end, with a lower bonnet and boot.
  const section = (z, width, top) => {
    const W = w * width, shoulder = floor + (top - floor) * 0.68;
    const right = [[W * 0.62, top], [W * 0.93, top - (top - shoulder) * 0.3], [W, shoulder], [W, floor + (shoulder - floor) * 0.3], [W * 0.9, floor]];
    return [...right.map(([x, y]) => [x, y, z]), ...right.slice().reverse().map(([x, y]) => [-x, y, z])];
  };
  loft('body', [
    section(l, 0.8, body * 0.76), section(l * 0.94, 0.92, body * 0.84), section(l * 0.6, 0.99, body * 0.95), section(cabinZ + cabinL, 1, body),
    section(cabinZ - cabinL, 1, body), section(-l * 0.72, 0.99, body * 0.98), section(-l * 0.95, 0.93, body * 0.94), section(-l, 0.84, body * 0.86),
  ]);
  // The cabin: glass all round, with a roof and pillars in the body's colour.
  const rect = (y, W, front, back) => [[W, y, front], [W, y, back], [-W, y, back], [-W, y, front]];
  const glassTop = roof - 0.05, base = rect(body - 0.02, w * 0.86, cabinZ + cabinL, cabinZ - cabinL), top = rect(glassTop, w * 0.7, cabinZ + topL, cabinZ - topL);
  loft('glass', [base, top]);
  loft('body', [rect(glassTop, w * 0.72, cabinZ + topL + 0.02, cabinZ - topL - 0.02), rect(roof, w * 0.66, cabinZ + topL - 0.05, cabinZ - topL + 0.05)]);
  const pillar = (a, b, size = 0.045) => {
    const ring = ([x, y, z]) => [[x + size, y, z + size], [x + size, y, z - size], [x - size, y, z - size], [x - size, y, z + size]];
    loft('body', [ring(a), ring(b)]);
  };
  for (let i = 0; i < 4; i++) pillar(base[i], top[i]);
  for (const side of [-1, 1]) {
    pillar([side * w * 0.87, body - 0.02, cabinZ], [side * w * 0.71, glassTop, cabinZ], 0.03);
    box('body', side * (w * 0.92), cabinZ + cabinL - 0.08, body - 0.02, body + 0.08, 0.09, 0.05); // door mirror
  }
  if (bed) {
    // Raised sides around an open bed behind the cabin, with its floor dark.
    const start = cabinZ - cabinL, end = -l * 0.98, mid = (start + end) / 2, half = (start - end) / 2;
    box('body', w * 0.92, mid, body - 0.1, body + 0.3, 0.06, half);
    box('body', -w * 0.92, mid, body - 0.1, body + 0.3, 0.06, half);
    box('body', 0, end + 0.06, body - 0.1, body + 0.3, w * 0.92, 0.06);
    box('trim', 0, mid, body - 0.02, body + 0.02, w * 0.86, half);
  }
  // Dark bumpers and grille, and lights set into each end.
  const lightY = body * 0.68;
  box('trim', 0, l - 0.02, floor, floor + 0.14, w * 0.78, 0.05);
  box('trim', 0, -l + 0.02, floor, floor + 0.14, w * 0.8, 0.05);
  box('trim', 0, l - 0.01, lightY - 0.06, lightY + 0.05, w * 0.34, 0.03);
  for (const side of [-1, 1]) {
    box('head', side * w * 0.56, l - 0.03, lightY - 0.03, lightY + 0.09, w * 0.17, 0.05);
    box('tail', side * w * 0.58, -l + 0.01, lightY, lightY + 0.13, w * 0.2, 0.04);
    for (const z of [-l * 0.64, l * 0.64]) {
      box('trim', side * (w + 0.002), z, 0.04, r * 2.12, 0.006, r * 1.12); // the wheel arch's shadow
      wheel(side * (w - 0.08), z, r);
      const x = side * (w + 0.055);
      for (let i = 0; i < 10; i++) { // the rim, a disc on the tyre's outer face
        const a = (i / 10) * Math.PI * 2, b = ((i + 1) / 10) * Math.PI * 2, rr = r * 0.62;
        const p = (t) => [x, r + Math.cos(t) * rr, z + Math.sin(t) * rr], c = [x, r, z];
        if (side > 0) tri(groups.rim, c, p(a), p(b)); else tri(groups.rim, c, p(b), p(a));
      }
    }
  }
  return groups;
}

const partColors = (color) => ({ body: colorFactor(color), glass: [0.04, 0.09, 0.13, 1], tyre: [0.03, 0.03, 0.03, 1], head: [1, 0.95, 0.6, 1], tail: [0.9, 0.05, 0.05, 1], rim: [0.55, 0.58, 0.62, 1], trim: [0.02, 0.02, 0.025, 1] });

// A glTF binary (.glb) as a Uint8Array.
export const buildCarGlb = (type, color) => glbOf(geometry(BODY_SHAPES[type] || BODY_SHAPES.sport), partColors(color));

// The person's parts in one pose. Their colours are by eye, so they are made linear for the model.
export function buildPersonGlb(parts) {
  const groups = {}, colors = {};
  parts.forEach(({ pos, nor, colour }, i) => {
    groups[`p${i}`] = { pos, nor };
    colors[`p${i}`] = [...colour.map(linear), 1];
  });
  return glbOf(groups, colors);
}

function glbOf(groups, COLORS) {
  const names = Object.keys(groups);
  const chunks = [], views = [], accessors = [], primitives = [];
  let offset = 0;
  names.forEach((name, m) => {
    const { pos, nor } = groups[name];
    const count = pos.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) { min[i % 3] = Math.min(min[i % 3], pos[i]); max[i % 3] = Math.max(max[i % 3], pos[i]); }
    primitives.push({ attributes: { POSITION: accessors.length, NORMAL: accessors.length + 1 }, material: m, mode: 4 });
    for (const [data, extra] of [[pos, { min, max }], [nor, {}]]) {
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
    materials: names.map((n) => ({
      name: n,
      pbrMetallicRoughness: { baseColorFactor: COLORS[n], metallicFactor: 0, roughnessFactor: n === 'glass' ? 0.2 : 0.6 },
      ...(n === 'head' || n === 'tail' ? { emissiveFactor: COLORS[n].slice(0, 3) } : {}),
    })),
    buffers: [{ byteLength: offset }], bufferViews: views, accessors,
  };
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const pad = (n) => (4 - (n % 4)) % 4;
  const jsonLen = json.length + pad(json.length);
  const total = 12 + 8 + jsonLen + 8 + offset;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLen, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + jsonLen);
  glb.set(json, 20);
  view.setUint32(20 + jsonLen, offset, true);
  view.setUint32(24 + jsonLen, 0x004e4942, true);
  let at = 28 + jsonLen;
  for (const c of chunks) { glb.set(c, at); at += c.length; }
  return glb;
}

// A side-view picture in the car's colour, drawn from the same proportions as the model. The nose faces right.
export function carPicture(type, color) {
  const s = BODY_SHAPES[type] || BODY_SHAPES.sport;
  const X = (z) => 120 + z * 32, Y = (h) => 86 - h * 32;
  const cabinBack = s.cabinZ - s.cabinL, cabinFront = s.cabinZ + s.cabinL, topBack = s.cabinZ - s.topL, topFront = s.cabinZ + s.topL;
  const roof = s.body + s.cabin, floor = s.wheel * 0.8;
  const wheel = (z) => `<circle cx="${X(z)}" cy="${Y(s.wheel)}" r="${s.wheel * 32}" fill="#111"/><circle cx="${X(z)}" cy="${Y(s.wheel)}" r="${s.wheel * 14}" fill="#8a97a3"/>`;
  const bed = s.bed ? `<rect x="${X(-s.l)}" y="${Y(s.body + 0.3)}" width="${X(cabinBack) - X(-s.l)}" height="${0.3 * 32}" fill="${color}" opacity=".75"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" role="img" aria-label="Car picture">
<polygon points="${X(cabinBack)},${Y(s.body)} ${X(topBack)},${Y(roof)} ${X(topFront)},${Y(roof)} ${X(cabinFront)},${Y(s.body)}" fill="#1b3442"/>
<polygon points="${X(topBack)},${Y(roof)} ${X(topFront)},${Y(roof)} ${X(topFront)},${Y(roof - 0.05)} ${X(topBack)},${Y(roof - 0.05)}" fill="${color}"/>
${bed}<rect x="${X(-s.l)}" y="${Y(s.body)}" width="${s.l * 64}" height="${(s.body - floor) * 32}" rx="7" fill="${color}"/>
<rect x="${X(s.l) - 7}" y="${Y(s.body - 0.14)}" width="7" height="6" fill="#ffe680"/><rect x="${X(-s.l)}" y="${Y(s.body - 0.14)}" width="6" height="6" fill="#e0221a"/>
${wheel(-s.l * 0.64)}${wheel(s.l * 0.64)}</svg>`;
}
