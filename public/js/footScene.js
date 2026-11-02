// Builds the meshes for walking: rooms. Pure, tested in node: it returns plain numbers.
// A mesh is a flat list of x, y, z, nx, ny, nz, r, g, b per vertex. A triangle's normal always comes from its winding,
// so a face that points the wrong way can't look right by accident.
import { triangulate } from './footData.js';
import { colourFor, frameOf, hexColour, worldBearing } from './furnish.js';
import { ITEMS, bake } from './furniture.js';
import { ROOM_HEIGHT } from './footWalker.js';

const FLOOR_COLOUR = [0.56, 0.47, 0.36];
const CEILING_COLOUR = [0.86, 0.84, 0.8];
const ROOM_WALL_COLOUR = [0.8, 0.77, 0.7];
const INNER_WALL_COLOUR = [0.9, 0.88, 0.83];
const INNER_WALL_HEIGHT = 1.1; // m, waist high, so walls never hide the person from the camera above
const INNER_WALL_THICK = 0.12; // m
const ZONE_FLOOR_LIFT = 0.04;  // m
const CORE_SCHEME = { wood: 'a58a6c', fabric: '6f7a80', accent: '6f7a80', floor: 'a8a8a0' }; // stairs and lifts belong to no room

export class Mesh {
  constructor() {
    this.data = [];
  }

  tri(a, b, c, colour) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], nx, ny, nz, colour[0], colour[1], colour[2]);
  }

  quad(a, b, c, d, colour) {
    this.tri(a, b, c, colour);
    this.tri(a, c, d, colour);
  }

  // A box around (x, y), from z0 to z1, with half sizes hx and hy.
  box(x, y, z0, z1, hx, hy, colour) {
    const p = (sx, sy, z) => [x + sx * hx, y + sy * hy, z];
    this.quad(p(-1, -1, z1), p(1, -1, z1), p(1, 1, z1), p(-1, 1, z1), colour);
    this.quad(p(-1, 1, z0), p(1, 1, z0), p(1, -1, z0), p(-1, -1, z0), colour);
    this.quad(p(-1, -1, z0), p(1, -1, z0), p(1, -1, z1), p(-1, -1, z1), colour);
    this.quad(p(1, -1, z0), p(1, 1, z0), p(1, 1, z1), p(1, -1, z1), colour);
    this.quad(p(1, 1, z0), p(-1, 1, z0), p(-1, 1, z1), p(1, 1, z1), colour);
    this.quad(p(-1, 1, z0), p(-1, -1, z0), p(-1, -1, z1), p(-1, 1, z1), colour);
  }

  floats() {
    return new Float32Array(this.data);
  }
}

const roofOf = (building) => building.roof ||= triangulate(building.rings.map((r) => r.pts));

// A wall as a low box from a to b, with its top showing, so the person is never hidden behind it.
export function lowWall(mesh, ax, ay, bx, by, colour) {
  const length = Math.hypot(bx - ax, by - ay) || 1, nx = (-(by - ay) / length) * (INNER_WALL_THICK / 2), ny = ((bx - ax) / length) * (INNER_WALL_THICK / 2);
  const corners = [[ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax + nx, ay + ny]];
  const at = (p, z) => [p[0], p[1], z];
  mesh.quad(at(corners[0], INNER_WALL_HEIGHT), at(corners[1], INNER_WALL_HEIGHT), at(corners[2], INNER_WALL_HEIGHT), at(corners[3], INNER_WALL_HEIGHT), colour);
  corners.forEach((p, i) => {
    const q = corners[(i + 1) % 4];
    mesh.quad(at(p, 0), at(q, 0), at(q, INNER_WALL_HEIGHT), at(p, INNER_WALL_HEIGHT), colour);
  });
}

// The part of a triangle inside a rectangle of the frame, as a list of u, v points, or nothing.
export function clipToRect(points, { u0, v0, u1, v1 }) {
  let out = points;
  for (const [axis, edge, sign] of [['u', u0, 1], ['u', u1, -1], ['v', v0, 1], ['v', v1, -1]]) {
    const kept = [];
    out.forEach((a, i) => {
      const b = out[(i + 1) % out.length], inA = (a[axis] - edge) * sign >= 0, inB = (b[axis] - edge) * sign >= 0;
      if (inA) kept.push(a);
      if (inA !== inB) {
        const f = (edge - a[axis]) / (b[axis] - a[axis]);
        kept.push({ u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f });
      }
    });
    out = kept;
    if (!out.length) return out;
  }
  return out;
}

// Each room's floor, its inner walls and what stands in it. A thing no longer in the catalogue is left out.
function addFurnishing(mesh, pieces, record, { models, colours }) {
  const frame = frameOf(pieces, record.axis), inner = record.look?.wall ? hexColour(record.look.wall) : INNER_WALL_COLOUR;
  for (const [zone, u0, v0, u1, v1, scheme] of record.zones) {
    const colour = hexColour(scheme.floor);
    for (const piece of pieces) {
      const roof = roofOf(piece);
      for (let i = 0; i < roof.length; i += 3) {
        const clipped = clipToRect([roof[i], roof[i + 1], roof[i + 2]].map((p) => frame.toFrame(p.x, p.y)), { u0, v0, u1, v1 });
        const points = clipped.map(({ u, v }) => {
          const { x, y } = frame.toWorld(u, v);
          return [x, y, ZONE_FLOOR_LIFT];
        });
        for (let k = 1; k + 1 < points.length; k++) mesh.tri(points[0], points[k], points[k + 1], colour);
      }
    }
  }
  for (const [u0, v0, u1, v1] of record.walls) {
    const a = frame.toWorld(u0, v0), b = frame.toWorld(u1, v1);
    lowWall(mesh, a.x, a.y, b.x, b.y, inner);
  }
  for (const [item, name, u, v, z, rot, zoneIndex, shade] of record.items) {
    const model = models[name];
    if (!model || !ITEMS[item]) continue;
    const { x, y } = frame.toWorld(u, v), scheme = record.zones[zoneIndex]?.[5] ?? CORE_SCHEME;
    bake(mesh, model, x, y, z, worldBearing(rot, frame.axis), (mat) => colourFor(mat, scheme, shade, colours));
  }
}

// The floor of a building from inside, with all its pieces, as a tile edge can cut a building in two. furnishing: { record, furniture } if it has any.
export function roomMesh(place, building, floor, furnishing) {
  const mesh = new Mesh(), top = floor + ROOM_HEIGHT, pieces = building.pieces || [building], look = furnishing?.record.look;
  const outer = look?.outer ? hexColour(look.outer) : ROOM_WALL_COLOUR;
  for (const piece of pieces) {
    const roof = roofOf(piece);
    for (let i = 0; i < roof.length; i += 3) {
      const [a, b, c] = [roof[i], roof[i + 1], roof[i + 2]];
      mesh.tri([a.x, a.y, floor + 0.02], [b.x, b.y, floor + 0.02], [c.x, c.y, floor + 0.02], FLOOR_COLOUR);
      mesh.tri([c.x, c.y, top], [b.x, b.y, top], [a.x, a.y, top], CEILING_COLOUR);
    }
    for (const w of place.walls(piece)) {
      mesh.quad([w.bx, w.by, floor], [w.ax, w.ay, floor], [w.ax, w.ay, top], [w.bx, w.by, top], outer);
    }
  }
  if (furnishing) addFurnishing(mesh, pieces, furnishing.record, furnishing.furniture);
  return mesh.floats();
}
