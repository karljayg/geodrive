// Things left behind, which stay where they were put. Outdoors a drop is a place on the map; indoors it's a place in its building's own frame on one floor, as metres from the car change with every parking spot. Pure, tested in node.
import { MM } from './furniture.js';

const STORE = 'geodrive_drops_v1';
const METRES_PER_DEGREE = 111320;

export const PARCEL = { half: 0.24, height: 0.34, band: 0.05, colour: [0.72, 0.55, 0.33], tape: [0.52, 0.38, 0.2] };

export class Drops {
  constructor(storage) {
    this.list = [];
    this.nextId = 1;
    try {
      this.storage = storage === undefined ? localStorage : storage;
      const saved = JSON.parse(this.storage?.getItem(STORE) ?? 'null');
      if (Array.isArray(saved)) this.list = saved;
      this.nextId = this.list.reduce((most, drop) => Math.max(most, drop.id), 0) + 1;
    } catch (err) {
      console.warn('saved drops:', err);
    }
  }

  save() {
    try {
      this.storage?.setItem(STORE, JSON.stringify(this.list));
    } catch (err) {
      console.warn('saving drops:', err);
    }
  }

  // Leaves one. Outdoors: { name, lat, lng, facing }. Indoors: { name, buildingId, floor, axis, u, v, facing }. Returns its id.
  add(drop) {
    const id = this.nextId++;
    this.list.push({ ...drop, id });
    this.save();
    return id;
  }

  remove(id) {
    const before = this.list.length;
    this.list = this.list.filter((drop) => drop.id !== id);
    if (this.list.length === before) return false;
    this.save();
    return true;
  }

  inBuilding(buildingId, floor) {
    return this.list.filter((drop) => drop.buildingId === buildingId && drop.floor === floor);
  }

  // Outdoor ones around a place, the nearest first, up to a limit.
  around(lat, lng, within, most) {
    const east = METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
    return this.list
      .filter((drop) => drop.buildingId === undefined)
      .map((drop) => ({ drop, away: Math.hypot((drop.lat - lat) * METRES_PER_DEGREE, (drop.lng - lng) * east) }))
      .filter(({ away }) => away <= within)
      .sort((a, b) => a.away - b.away)
      .slice(0, most)
      .map(({ drop }) => drop);
  }
}

// A box as triangles for the map, faces pointing out.
function boxTriangles(hx, hy, z0, z1, colour) {
  const corner = (sx, sy, z) => [sx * hx, sy * hy, z];
  const faces = [
    [corner(-1, -1, z1), corner(1, -1, z1), corner(1, 1, z1), corner(-1, 1, z1), [0, 0, 1]],
    [corner(-1, -1, z0), corner(1, -1, z0), corner(1, -1, z1), corner(-1, -1, z1), [0, -1, 0]],
    [corner(1, -1, z0), corner(1, 1, z0), corner(1, 1, z1), corner(1, -1, z1), [1, 0, 0]],
    [corner(1, 1, z0), corner(-1, 1, z0), corner(-1, 1, z1), corner(1, 1, z1), [0, 1, 0]],
    [corner(-1, 1, z0), corner(-1, -1, z0), corner(-1, -1, z1), corner(-1, 1, z1), [-1, 0, 0]],
  ];
  const pos = [], nor = [];
  for (const [a, b, c, d, n] of faces) for (const p of [a, b, c, a, c, d]) { pos.push(...p); nor.push(...n); }
  return { pos, nor, colour };
}

// What to draw for a thing with no model of its own: a taped-up parcel.
export const parcelParts = () => [
  boxTriangles(PARCEL.half, PARCEL.half, 0, PARCEL.height, PARCEL.colour),
  boxTriangles(PARCEL.band, PARCEL.half + 0.005, PARCEL.height, PARCEL.height + 0.006, PARCEL.tape),
];

// A furniture model as parts for the map, one to a material, with normals from each triangle's winding.
export function thingParts(model, colourOf) {
  return model.parts.map(({ mat, points }) => {
    const pos = [], nor = [];
    for (let i = 0; i < points.length; i += 9) {
      const p = Array.from({ length: 9 }, (_, k) => points[i + k] / MM);
      const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2], vx = p[6] - p[0], vy = p[7] - p[1], vz = p[8] - p[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz) || 1;
      pos.push(...p);
      for (let k = 0; k < 3; k++) nor.push(nx / length, ny / length, nz / length);
    }
    return { pos, nor, colour: colourOf(mat) };
  });
}
