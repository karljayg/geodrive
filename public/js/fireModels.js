// Models for fire and its aftermath, built from code as the cars are: the charred wreck, a burnt-out building, a swirling smoke column, the blast,
// a gun's flash and the bullet's streak. Each comes as a glTF binary, x east, y north, z up, standing on z = 0. Several are baked as frames, as the
// map's model doesn't play an animation: one frame is shown at a time. Pure, tested in node.
import { BODY_SHAPES, carGeometry, glbOf } from './carModel.js';

export const SMOKE_FRAMES = 12, SMOKE_HEIGHT = 20; // the column is baked SMOKE_HEIGHT m tall, and scaled to what's burning
export const BLAST_FRAMES = 14;
export const STREAK_LENGTH = 4;                    // m

// The same small numbers for the same inputs, so a model is the same each time it's built.
function hash(...ns) {
  let h = 2166136261;
  for (const n of ns) {
    h ^= Math.round(n * 1000) | 0;
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

class Mesh {
  constructor() {
    this.groups = {};
    this.colours = {};
    this.looks = {};
  }

  part(name, colour, look = {}) {
    if (!this.groups[name]) {
      this.groups[name] = { pos: [], nor: [] };
      this.colours[name] = [...colour, 1];
      this.looks[name] = { rough: 1, both: true, ...look };
    }
    return this.groups[name];
  }

  tri(g, a, b, c) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], len = Math.hypot(...n) || 1;
    for (const p of [a, b, c]) {
      g.pos.push(...p);
      g.nor.push(n[0] / len, n[1] / len, n[2] / len);
    }
  }

  quad(g, a, b, c, d) {
    this.tri(g, a, b, c);
    this.tri(g, a, c, d);
  }

  // A lumpy ball: lump is how far its surface wanders, as a share of r.
  ball(g, [cx, cy, cz], r, lump = 0, rings = 5, sides = 7, key = 0) {
    const at = (i, j) => {
      const a = (i / rings) * Math.PI, b = (j / sides) * Math.PI * 2, k = 1 + (i > 0 && i < rings ? (hash(key, i, j % sides) - 0.5) * 2 * lump : 0);
      return [cx + Math.sin(a) * Math.cos(b) * r * k, cy + Math.sin(a) * Math.sin(b) * r * k, cz + Math.cos(a) * r * k];
    };
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < sides; j++) this.quad(g, at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }

  box(g, [cx, cy, cz], [hx, hy, hz], turn = 0) {
    const c = Math.cos(turn), s = Math.sin(turn), p = (x, y, z) => [cx + x * c - y * s, cy + x * s + y * c, cz + z];
    const v = [p(-hx, -hy, -hz), p(hx, -hy, -hz), p(hx, hy, -hz), p(-hx, hy, -hz), p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, hy, hz), p(-hx, hy, hz)];
    for (const [a, b, cc, d] of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) this.quad(g, v[a], v[b], v[cc], v[d]);
  }

  glb() {
    for (const name of Object.keys(this.groups)) if (!this.groups[name].pos.length) delete this.groups[name];
    return glbOf(this.groups, this.colours, this.looks);
  }
}

// --- The burnt car -------------------------------------------------------------------------------------------------

const SOOT = [0.03, 0.027, 0.025], ASH = [0.11, 0.1, 0.095], RUST = [0.11, 0.05, 0.02];

// The car's own shape, burnt: no glass or tyres, sat down on its rims, its roof sagging and its panels buckled, black with patches of ash and rust.
export function buildWreckGlb(type) {
  const shape = BODY_SHAPES[type] || BODY_SHAPES.sport, groups = carGeometry(type), mesh = new Mesh();
  const sink = shape.wheel * 0.6, roofFrom = shape.body;
  const bent = (x, y, z) => {
    const k = hash(Math.round(x * 8), Math.round(y * 8), Math.round(z * 8));
    let nz = z - sink + (k - 0.5) * 0.12;
    if (z > roofFrom) nz -= (z - roofFrom) * 0.45 * (0.7 + k * 0.6);
    return [x + (hash(k, 1) - 0.5) * 0.1, y + (hash(k, 2) - 0.5) * 0.1, Math.max(0.02, nz)];
  };
  const parts = { body: null, trim: null, rim: null, head: null, tail: null };
  for (const name of Object.keys(parts)) {
    const { pos } = groups[name];
    for (let i = 0; i < pos.length; i += 9) {
      const tri = [0, 3, 6].map((o) => bent(pos[i + o], pos[i + o + 1], pos[i + o + 2]));
      const blotch = hash(Math.round(tri[0][0] * 2), Math.round(tri[0][1] * 2), Math.round(tri[0][2] * 2));
      const into = name === 'rim' ? mesh.part('rust', RUST) : name === 'body' && blotch > 0.78 ? mesh.part('ash', ASH) : name === 'body' && blotch < 0.06 ? mesh.part('rust', RUST) : mesh.part('soot', SOOT);
      mesh.tri(into, ...tri);
    }
  }
  // The scorched ground it stands on.
  const ground = mesh.part('scorch', [0.015, 0.013, 0.012], { alpha: 0.85 });
  const w = shape.w * 1.8, l = shape.l * 1.4, ring = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2, k = 0.75 + hash(String(type).length, i) * 0.4;
    return [Math.cos(a) * w * k, Math.sin(a) * l * k, 0.03];
  });
  for (let i = 0; i < ring.length; i++) mesh.tri(ground, [0, 0, 0.03], ring[i], ring[(i + 1) % ring.length]);
  return mesh.glb();
}

// --- Smoke ---------------------------------------------------------------------------------------------------------

// One frame of a smoke column that turns as it rises, as a vortex does: puffs leave the base, spiral up and out, swell and thin away.
// t is 0 to 1 round the loop. dark: the black smoke of a fire, lit from beneath by it; otherwise the grey of something starting to smoke.
export function buildSmokeGlb(t, dark = true) {
  const mesh = new Mesh(), count = 24, buckets = 4;
  for (let i = 0; i < count; i++) {
    const p = (i / count + t) % 1, rise = p ** 0.85;
    const turn = i * 2.39996 + p * Math.PI * 3.2, out = 0.5 + p * 3.4;
    const alpha = 0.92 * Math.min(1, p / 0.08) * (1 - p) ** 1.2;
    if (alpha < 0.04) continue;
    const bucket = Math.min(buckets - 1, Math.floor((1 - alpha) * buckets));
    const low = dark ? [0.05, 0.045, 0.045] : [0.42, 0.42, 0.43], high = dark ? [0.16, 0.15, 0.15] : [0.62, 0.62, 0.64];
    const look = { alpha: Math.max(0.08, (dark ? 0.8 : 0.55) - bucket * (dark ? 0.2 : 0.14)) };
    const ember = dark && p < 0.14;
    const g = ember ? mesh.part('ember', [0.3, 0.1, 0.03], { ...look, emissive: [0.5, 0.15, 0.03] }) : mesh.part(`s${bucket}`, mix(low, high, bucket / (buckets - 1)), look);
    mesh.ball(g, [Math.cos(turn) * out, Math.sin(turn) * out, 0.6 + rise * SMOKE_HEIGHT], 1 + p * 3.8, 0.22, 6, 9, i);
  }
  return mesh.glb();
}

export const smokeFrames = (dark) => Array.from({ length: SMOKE_FRAMES }, (_, i) => buildSmokeGlb(i / SMOKE_FRAMES, dark));

// --- The blast -----------------------------------------------------------------------------------------------------

// One frame of a car going up, t from 0 to 1 over about a second and a half: a white flash, a rolling fireball that darkens as it climbs,
// black smoke rising out of it, pieces thrown out and falling, and a ring of dust along the ground.
export function buildBlastGlb(t) {
  const mesh = new Mesh(), ease = 1 - (1 - t) ** 3, rand = seeded(7);
  if (t < 0.3) mesh.ball(mesh.part('flash', [1, 0.96, 0.8], { emissive: [1, 0.95, 0.75], alpha: Math.max(0.15, 1 - t / 0.3) }), [0, 0, 1], 1.4 + t * 9, 0.1, 6, 9, 1);
  const heat = t < 0.35 ? mix([1, 0.85, 0.3], [1, 0.45, 0.06], t / 0.35) : mix([1, 0.45, 0.06], [0.45, 0.07, 0.02], Math.min(1, (t - 0.35) / 0.55));
  const fire = mesh.part('fire', heat, { emissive: heat.map((c) => c * (1 - t * 0.75)), alpha: t < 0.7 ? 1 : Math.max(0.2, 1 - (t - 0.7) / 0.3) });
  for (let i = 0; i < 11; i++) {
    const a = rand() * Math.PI * 2, up = 0.2 + rand() * 0.8, far = 0.4 + ease * (2 + rand() * 2.2);
    const r = (0.6 + rand() * 0.6) * (0.6 + ease * 2.2) * (t > 0.75 ? 1 - (t - 0.75) * 1.6 : 1);
    mesh.ball(fire, [Math.cos(a) * far * Math.cos(up), Math.sin(a) * far * Math.cos(up), 1 + Math.sin(up) * far + t * 3], r, 0.25, 5, 8, i);
  }
  if (t > 0.25) {
    const s = (t - 0.25) / 0.75, smoke = mesh.part('smoke', [0.05, 0.045, 0.045], { alpha: 0.85 * (1 - s * 0.5) });
    for (let i = 0; i < 8; i++) {
      const a = i * 0.785 + s, far = 1 + s * 2.5;
      mesh.ball(smoke, [Math.cos(a) * far, Math.sin(a) * far, 2.5 + s * 9 + (i % 3)], 1.2 + s * 3.2, 0.3, 5, 7, 20 + i);
    }
  }
  const debris = mesh.part('debris', [0.04, 0.035, 0.03], { emissive: [0.2 * (1 - t), 0.06 * (1 - t), 0] });
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2, speed = 5 + rand() * 9, lift = 4 + rand() * 8, time = t * 1.5;
    const z = Math.max(0.1, 1 + lift * time - 4.9 * time * time);
    mesh.box(debris, [Math.cos(a) * speed * time, Math.sin(a) * speed * time, z], [0.12 + rand() * 0.2, 0.08 + rand() * 0.15, 0.05 + rand() * 0.08], a + t * 9);
  }
  const wave = mesh.part('wave', [0.55, 0.5, 0.45], { alpha: Math.max(0.05, 0.55 * (1 - t)) }), inner = 0.8 + ease * 11, outer = inner + 0.6 + t * 1.6;
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2, p = (r, a) => [Math.cos(a) * r, Math.sin(a) * r, 0.15];
    mesh.quad(wave, p(inner, a0), p(outer, a0), p(outer, a1), p(inner, a1));
  }
  return mesh.glb();
}

export const blastFrames = () => Array.from({ length: BLAST_FRAMES }, (_, i) => buildBlastGlb(i / (BLAST_FRAMES - 1)));

// --- Guns ----------------------------------------------------------------------------------------------------------

// A gun's flash, pointing along +y from its muzzle at the origin: a star of flame round a white-hot core, in a soft glow.
export function buildMuzzleGlb() {
  const mesh = new Mesh(), flame = mesh.part('flame', [1, 0.8, 0.35], { emissive: [1, 0.78, 0.3] });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI, side = (w) => [Math.cos(a) * w, 0, Math.sin(a) * w];
    const left = side(0.14), right = side(-0.14);
    mesh.quad(flame, [0, 0, 0], [left[0], 0.22, left[2]], [0, 0.62, 0], [right[0], 0.22, right[2]]);
  }
  mesh.ball(mesh.part('core', [1, 1, 0.9], { emissive: [1, 1, 0.85] }), [0, 0.08, 0], 0.1, 0, 4, 6);
  mesh.ball(mesh.part('glow', [1, 0.75, 0.3], { emissive: [1, 0.7, 0.25], alpha: 0.32 }), [0, 0.15, 0], 0.42, 0, 5, 8);
  return mesh.glb();
}

// The bullet's streak, STREAK_LENGTH m from its tail at the origin along +y, bright at the head.
export function buildStreakGlb() {
  const mesh = new Mesh();
  mesh.box(mesh.part('streak', [1, 0.9, 0.55], { emissive: [1, 0.88, 0.5] }), [0, STREAK_LENGTH * 0.5, 0], [0.03, STREAK_LENGTH * 0.5, 0.03]);
  mesh.box(mesh.part('haze', [1, 0.75, 0.35], { emissive: [1, 0.7, 0.3], alpha: 0.3 }), [0, STREAK_LENGTH * 0.6, 0], [0.09, STREAK_LENGTH * 0.4, 0.09]);
  return mesh.glb();
}

// A warm glow one metre across, for under flames: it flickers by its size.
export function buildGlowGlb() {
  const mesh = new Mesh();
  mesh.ball(mesh.part('glow', [1, 0.45, 0.1], { emissive: [1, 0.4, 0.08], alpha: 0.14 }), [0, 0, 0], 0.5, 0, 6, 10);
  return mesh.glb();
}

// --- The burnt building --------------------------------------------------------------------------------------------

const signedArea = (ring) => ring.reduce((sum, p, i) => sum + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0) / 2;

// The ring pushed out by `by` m, each corner along the mean of its two walls' outward normals. The ring runs anticlockwise.
function pushedOut(ring, by) {
  const n = ring.length, normal = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len];
  };
  return ring.map((p, i) => {
    const a = normal(ring[(i - 1 + n) % n], p), b = normal(p, ring[(i + 1) % n]);
    let nx = a[0] + b[0], ny = a[1] + b[1];
    const len = Math.hypot(nx, ny) || 1, cos = Math.max(0.35, (nx / len) * a[0] + (ny / len) * a[1]);
    nx /= len;
    ny /= len;
    return [p[0] + (nx * by) / cos, p[1] + (ny * by) / cos];
  });
}

// Triangles over an anticlockwise ring, by clipping ears. Fine for the few dozen corners an outline keeps.
export function capOf(ring) {
  const left = ring.map((_, i) => i), out = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (left.length > 3 && guard++ < 5000) {
    let clipped = false;
    for (let i = 0; i < left.length; i++) {
      const ia = left[(i - 1 + left.length) % left.length], ib = left[i], ic = left[(i + 1) % left.length];
      const a = ring[ia], b = ring[ib], c = ring[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      if (left.some((j) => j !== ia && j !== ib && j !== ic && inside(ring[j], a, b, c))) continue;
      out.push([ia, ib, ic]);
      left.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // a ring that crosses itself: what's left is fanned
  }
  for (let i = 1; i < left.length - 1; i++) out.push([left[0], left[i], left[i + 1]]);
  return out;
}

// A building gutted by fire, a little bigger than it so the map's own building is hidden inside: blackened walls with broken tops, empty
// windows on each floor, a collapsed roof and heaps at the foot. rings: outer rings as [x, y] m from where the model stands. burning: the
// windows glow with the fire inside.
export function buildRuinGlb(rings, height, burning = false) {
  const mesh = new Mesh(), soot = mesh.part('soot', SOOT), char = mesh.part('char', [0.05, 0.035, 0.028]), ash = mesh.part('ash', [0.02, 0.018, 0.017]), beam = mesh.part('beam', [0.012, 0.01, 0.009]);
  const holes = burning ? mesh.part('lit', [0.9, 0.22, 0.03], { emissive: [0.75, 0.18, 0.02] }) : mesh.part('hole', [0.004, 0.004, 0.004]);
  const rubble = mesh.part('rubble', [0.06, 0.05, 0.045]);
  const floor = 3, base = -0.3;
  rings.forEach((given, r) => {
    const ring = signedArea(given) < 0 ? [...given].reverse() : given, wall = pushedOut(ring, 0.6);
    // The walls, cut into pieces no wider than 2.5 m, each with a broken top above the building's own roof.
    for (let i = 0; i < wall.length; i++) {
      const a = wall[i], b = wall[(i + 1) % wall.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(len / 2.5));
      const nx = (b[1] - a[1]) / (len || 1), ny = -(b[0] - a[0]) / (len || 1);
      const top = (k) => height * (1.03 + hash(r, i, k) * 0.16);
      for (let k = 0; k < steps; k++) {
        const p = (s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
        const p0 = p(k / steps), p1 = p((k + 1) / steps), z0 = k === 0 ? top(0) : top(k), z1 = top(k + 1);
        mesh.quad(hash(r, i, k, 3) < 0.35 ? char : soot, [...p0, base], [...p1, base], [...p1, z1], [...p0, z0]);
        // A window on each floor of a piece wide enough for one, just proud of the wall.
        const across = len / steps;
        if (across < 1.6) continue;
        for (let level = 1; level * floor < height - 0.5; level++) {
          if (hash(r, i, k, level) < 0.18) continue; // some of it has fallen in
          const mid = p((k + 0.5) / steps), half = Math.min(0.5, across * 0.22), z = level * floor - 1.7, tall = 0.8 + hash(r, i, k, level, 2) * 0.5;
          const q = (s, h) => [mid[0] + ((b[0] - a[0]) / len) * s + nx * 0.06, mid[1] + ((b[1] - a[1]) / len) * s + ny * 0.06, h];
          // Broken, not square: the top corners are knocked about.
          mesh.quad(holes, q(-half, z), q(half, z), q(half * 0.8, z + tall * (0.8 + hash(r, i, k, level, 5) * 0.3)), q(-half, z + tall));
        }
      }
    }
    // The roof, fallen in to just above where it was, so nothing of the old building shows from above.
    for (const [ia, ib, ic] of capOf(wall)) mesh.tri(ash, [...wall[ia], height * 1.02], [...wall[ib], height * 1.02], [...wall[ic], height * 1.02]);
    // What's left of the rafters, black beams across the top at odd angles.
    const xs = wall.map((p) => p[0]), ys = wall.map((p) => p[1]), cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), rafters = seeded(r * 31 + wall.length);
    for (let k = 0; k < Math.min(9, 2 + Math.round(span / 3)); k++) {
      const turn = rafters() * Math.PI, off = (rafters() - 0.5) * span * 0.6;
      mesh.box(beam, [cx + Math.cos(turn + Math.PI / 2) * off, cy + Math.sin(turn + Math.PI / 2) * off, height * (1.04 + rafters() * 0.08)], [span * (0.2 + rafters() * 0.2), 0.12, 0.12], turn);
    }
    // Heaps of rubble along the foot of the walls.
    const rand = seeded(r * 97 + wall.length);
    for (let h = 0; h < Math.min(14, wall.length * 2); h++) {
      const i = Math.floor(rand() * wall.length), a = wall[i], b = wall[(i + 1) % wall.length], s = rand();
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / len, ny = -(b[0] - a[0]) / len, out = 0.6 + rand() * 1.2;
      mesh.box(rubble, [a[0] + (b[0] - a[0]) * s + nx * out, a[1] + (b[1] - a[1]) * s + ny * out, 0.15], [0.3 + rand() * 0.6, 0.2 + rand() * 0.4, 0.15 + rand() * 0.3], rand() * Math.PI);
    }
  });
  return mesh.glb();
}

// --- Flames --------------------------------------------------------------------------------------------------------

export const FLAME_FRAMES = 6;

// One frame of flames standing at each spot ({ x, y, z, size }, size the tallest tongue in m), all in one model so a whole fire is one
// model a frame. Each spot is a few tongues that sway and leap from frame to frame: red and see-through outside, orange, then a yellow core.
export function buildFlamesGlb(spots, frame) {
  const mesh = new Mesh(), phase = (frame / FLAME_FRAMES) * Math.PI * 2;
  const layers = [
    { name: 'red', colour: [0.85, 0.12, 0.02], look: { emissive: [0.9, 0.14, 0.02], alpha: 0.5 }, wide: 1, tall: 1 },
    { name: 'orange', colour: [1, 0.42, 0.05], look: { emissive: [1, 0.4, 0.04], alpha: 0.85 }, wide: 0.72, tall: 0.78 },
    { name: 'yellow', colour: [1, 0.85, 0.3], look: { emissive: [1, 0.85, 0.3] }, wide: 0.42, tall: 0.48 },
  ];
  const sides = 6, levels = 6;
  spots.forEach((spot, s) => {
    const tongues = spot.size > 6 ? 4 : 3;
    for (let k = 0; k < tongues; k++) {
      const seed = hash(s, k) * Math.PI * 2, around = (k / tongues) * Math.PI * 2 + seed, off = k ? spot.size * 0.14 : 0;
      const bx = spot.x + Math.cos(around) * off, by = spot.y + Math.sin(around) * off;
      const leap = 0.78 + 0.28 * Math.sin(phase * 2 + seed) + 0.1 * Math.sin(phase * 3 + seed * 2);
      const tall = spot.size * (k ? 0.7 : 1) * leap, wide = spot.size * 0.26 * (k ? 0.8 : 1);
      for (const layer of layers) {
        const g = mesh.part(layer.name, layer.colour, layer.look), H = tall * layer.tall, R = wide * layer.wide;
        const ring = (level) => {
          const f = level / levels, sway = Math.sin(phase + seed + f * 2.4) * spot.size * 0.12 * f * f;
          const r = R * Math.sin(Math.PI * Math.min(1, 0.18 + f * 0.82)) ** 0.8 * (1 - f) ** 0.25;
          return Array.from({ length: sides }, (_, i) => {
            const a = (i / sides) * Math.PI * 2 + f * 0.6, wob = 1 + (hash(s, k, level, i, frame) - 0.5) * 0.3;
            return [bx + Math.cos(a) * r * wob + sway * Math.cos(seed), by + Math.sin(a) * r * wob + sway * Math.sin(seed), spot.z + f * H];
          });
        };
        const rings = Array.from({ length: levels + 1 }, (_, level) => ring(level));
        for (let level = 0; level < levels; level++) {
          for (let i = 0; i < sides; i++) mesh.quad(g, rings[level][i], rings[level][(i + 1) % sides], rings[level + 1][(i + 1) % sides], rings[level + 1][i]);
        }
      }
    }
  });
  return mesh.glb();
}
