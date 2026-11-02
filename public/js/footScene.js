// Builds the meshes for walking: rooms. Pure, tested in node: it returns plain numbers.
// A mesh is a flat list of x, y, z, nx, ny, nz, r, g, b per vertex. A triangle's normal always comes from its winding,
// so a face that points the wrong way can't look right by accident.
import { triangulate } from './footData.js';
import { ROOM_HEIGHT } from './footWalker.js';

const FLOOR_COLOUR = [0.56, 0.47, 0.36];
const CEILING_COLOUR = [0.86, 0.84, 0.8];
const ROOM_WALL_COLOUR = [0.8, 0.77, 0.7];

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

// The ground floor of a building, seen from inside: the same footprint. building.objects is where later things go.
export function roomMesh(place, building, floor) {
  const mesh = new Mesh(), top = floor + ROOM_HEIGHT, roof = roofOf(building);
  for (let i = 0; i < roof.length; i += 3) {
    const [a, b, c] = [roof[i], roof[i + 1], roof[i + 2]];
    mesh.tri([a.x, a.y, floor + 0.02], [b.x, b.y, floor + 0.02], [c.x, c.y, floor + 0.02], FLOOR_COLOUR);
    mesh.tri([c.x, c.y, top], [b.x, b.y, top], [a.x, a.y, top], CEILING_COLOUR);
  }
  for (const w of place.walls(building)) {
    mesh.quad([w.bx, w.by, floor], [w.ax, w.ay, floor], [w.ax, w.ay, top], [w.bx, w.by, top], ROOM_WALL_COLOUR);
  }
  return mesh.floats();
}
