// Buildings, ground cover, water and roads out of the same OpenFreeMap tiles the drive uses for streets.
// Pure. Coordinates below are metres east and north of whatever origin the walk started at.
import { decodeLines, VECTOR_ZOOM, readLayer } from './vector.js';

export const CHUNK = 80; // metres. A chunk is meshed once and dropped when the walker leaves it.
const DOOR_WIDTH = 1.4;
const DOOR_ROAD = 40; // a door faces a road at most this far from the wall
const MIN_BUILDING = 8; // m². Smaller footprints are sheds the walker can step over.
const TREE_CAP = 40;
const TREE_STEP = 8;
const PARK_STEP = 14;

export const COLOR = {
  ground: 0x6c8c58,
  road: 0x3e4450,
  water: 0x2d6d90,
  residential: 0x7d9168,
  commercial: 0x8a8478,
  industrial: 0x7a736a,
  grass: 0x5f9a48,
  wood: 0x3f6b38,
  park: 0x4e8a44,
  farmland: 0x8aa356,
  sand: 0xc2b48a,
};

const LAND = {
  residential: [COLOR.residential, 1, false],
  commercial: [COLOR.commercial, 1, false],
  industrial: [COLOR.industrial, 1, false],
  retail: [COLOR.commercial, 1, false],
  farmland: [COLOR.farmland, 1, false],
  sand: [COLOR.sand, 1, false],
  grass: [COLOR.grass, 2, false],
  park: [COLOR.park, 2, true],
  wood: [COLOR.wood, 3, true],
  forest: [COLOR.wood, 3, true],
};

const ROAD_WIDTH = {
  motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 7, minor: 5.5,
  service: 4, living_street: 4, pedestrian: 3, footway: 2, path: 1.6, track: 2.5,
};

const pos = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Metres, from the tile's height, else storeys, else a short default for the class.
export function buildingHeight(tags) {
  const drawn = pos(tags.render_height);
  if (drawn) return drawn;
  const levels = pos(tags.levels) || pos(tags['building:levels']);
  if (levels) return levels * 3;
  const cls = tags.class || tags.building || '';
  if (cls === 'commercial' || cls === 'industrial' || cls === 'public' || cls === 'retail' || cls === 'office') return 12;
  if (cls === 'house' || cls === 'residential' || cls === 'apartments' || cls === 'detached' || cls === 'semidetached_house' || cls === 'terrace') return 6;
  return 8;
}

export function buildingColor(cls) {
  if (cls === 'commercial' || cls === 'retail' || cls === 'office' || cls === 'public') return 0xc4b8a5;
  if (cls === 'industrial') return 0x9a938a;
  if (cls === 'house' || cls === 'residential' || cls === 'apartments' || cls === 'detached') return 0xd9cbb8;
  return 0xc8c2b8;
}

const EARTH = 6371000;

export function toLocal(origin, lat, lng) {
  const lat0 = origin.lat * Math.PI / 180;
  return {
    x: (lng - origin.lng) * Math.PI / 180 * EARTH * Math.cos(lat0),
    z: (lat - origin.lat) * Math.PI / 180 * EARTH,
  };
}

export function fromLocal(origin, x, z) {
  const lat0 = origin.lat * Math.PI / 180;
  return {
    lat: origin.lat + (z / EARTH) * (180 / Math.PI),
    lng: origin.lng + (x / (EARTH * Math.cos(lat0))) * (180 / Math.PI),
  };
}

export function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

function clean(ring) {
  const out = [];
  for (const p of ring) {
    const q = out.at(-1);
    if (!q || Math.hypot(p.x - q.x, p.z - q.z) > 0.05) out.push({ x: p.x, z: p.z });
  }
  if (out.length > 2 && Math.hypot(out[0].x - out.at(-1).x, out[0].z - out.at(-1).z) < 0.05) out.pop();
  return out;
}

export function pointInRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

export function contains(feature, x, z) {
  if (feature.minX != null && (x < feature.minX || x > feature.maxX || z < feature.minZ || z > feature.maxZ)) return false;
  if (!pointInRing(feature.ring, x, z)) return false;
  for (const hole of feature.holes || []) if (pointInRing(hole, x, z)) return false;
  return true;
}

export function distToSeg(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

function boundsOf(points) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

function asCCW(ring) {
  return signedArea(ring) < 0 ? ring.slice().reverse() : ring;
}

// One outer ring per polygon. A hole belongs to the outer ring that contains it.
function splitPolygons(rings) {
  const cleaned = rings.map(clean).filter((r) => r.length >= 3);
  let outers = cleaned.filter((r) => signedArea(r) >= 0);
  let holes = cleaned.filter((r) => signedArea(r) < 0);
  if (!outers.length && holes.length) {
    holes = holes.slice().sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
    outers = [holes.shift().slice().reverse()];
  }
  return outers.map((ring) => ({
    ring,
    holes: holes.filter((h) => pointInRing(h[0], ring)),
  }));
}

function nearestRoad(x, z, roads) {
  let best = null;
  for (const road of roads) {
    if (road.minX != null && (x < road.minX - DOOR_ROAD || x > road.maxX + DOOR_ROAD || z < road.minZ - DOOR_ROAD || z > road.maxZ + DOOR_ROAD)) continue;
    for (let i = 1; i < road.line.length; i++) {
      const a = road.line[i - 1], b = road.line[i];
      const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const px = a.x + dx * t, pz = a.z + dz * t;
      const dist = Math.hypot(x - px, z - pz);
      if (!best || dist < best.dist) best = { dist, dx: px - x, dz: pz - z };
    }
  }
  return best;
}

// The door sits on the wall that faces the nearest road, or the longest wall when no road is close.
export function placeDoor(ring, roads) {
  const edges = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < DOOR_WIDTH) continue;
    edges.push({ i, a, b, len, nx: dz / len, nz: -dx / len, mx: (a.x + b.x) / 2, mz: (a.z + b.z) / 2 });
  }
  if (!edges.length) return null;
  let best = null, bestScore = -Infinity;
  for (const edge of edges) {
    const hit = nearestRoad(edge.mx, edge.mz, roads);
    if (!hit || hit.dist > DOOR_ROAD) continue;
    const dot = (edge.nx * hit.dx + edge.nz * hit.dz) / hit.dist;
    if (dot < 0.15) continue;
    const score = dot * 3 - hit.dist / DOOR_ROAD;
    if (score > bestScore) { bestScore = score; best = edge; }
  }
  const edge = best || edges.reduce((won, edge) => (edge.len > won.len ? edge : won));
  const half = Math.min(DOOR_WIDTH / 2, edge.len * 0.35);
  const ux = (edge.b.x - edge.a.x) / edge.len, uz = (edge.b.z - edge.a.z) / edge.len;
  return {
    edge: edge.i,
    ax: edge.mx - ux * half, az: edge.mz - uz * half,
    bx: edge.mx + ux * half, bz: edge.mz + uz * half,
    nx: edge.nx, nz: edge.nz, mx: edge.mx, mz: edge.mz, half,
  };
}

// Wall pieces, with the door gap left out so the walker can cross it.
export function wallSegments(ring, door) {
  const segs = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (!door || door.edge !== i) { segs.push([a, b]); continue; }
    segs.push([a, { x: door.ax, z: door.az }], [{ x: door.bx, z: door.bz }, b]);
  }
  return segs.filter(([a, b]) => Math.hypot(b.x - a.x, b.z - a.z) > 0.05);
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function pointInTri(p, a, b, c) {
  const c1 = cross(a, b, p), c2 = cross(b, c, p), c3 = cross(c, a, p);
  return !((c1 < 0 || c2 < 0 || c3 < 0) && (c1 > 0 || c2 > 0 || c3 > 0));
}

// Ear clipping. `tris` indexes `verts`. A ring that will not clip falls back to a fan.
export function triangulate(ring) {
  const verts = asCCW(clean(ring));
  const idx = verts.map((_, i) => i);
  const tris = [];
  let guard = verts.length * verts.length;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      if (cross(verts[ia], verts[ib], verts[ic]) <= 1e-8) continue;
      let ear = true;
      for (const k of idx) {
        if (k === ia || k === ib || k === ic) continue;
        if (pointInTri(verts[k], verts[ia], verts[ib], verts[ic])) { ear = false; break; }
      }
      if (!ear) continue;
      tris.push(ia, ib, ic);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  else if (idx.length > 3) for (let i = 1; i < idx.length - 1; i++) tris.push(idx[0], idx[i], idx[i + 1]);
  return { verts, tris };
}

function projectRing(origin, ring) {
  return ring.map((p) => toLocal(origin, p.lat, p.lng));
}

function layerRings(layer, tx, ty, zoom) {
  if (!layer) return [];
  const { extent } = layer, n = 2 ** zoom;
  const toLng = (px) => (((tx + px / extent) / n) * 360) - 180;
  const toLat = (py) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + py / extent)) / n))) * 180) / Math.PI;
  const out = [];
  for (const feature of layer.features) {
    const lines = decodeLines(feature.geometry).map((line) => line.map(([x, y]) => ({ lat: toLat(y), lng: toLng(x) })));
    if (lines.length) out.push({ tags: feature.tags, type: feature.type, lines });
  }
  return out;
}

function landKind(tags) {
  const cls = tags.class || '';
  return LAND[cls] || null;
}

// Geographic features in one tile, before they are moved into the walk's metre grid.
export function placesFromTile(bytes, tx, ty, zoom = VECTOR_ZOOM) {
  const buildings = [], lands = [], waters = [], roads = [];
  for (const feature of layerRings(readLayer(bytes, 'building'), tx, ty, zoom)) {
    if (feature.type !== 3) continue;
    const { tags } = feature;
    if (tags.hide_3d === true || tags.hide_3d === 1 || tags.indoor) continue;
    const height = buildingHeight(tags);
    const lift = pos(tags.render_min_height);
    buildings.push({ cls: tags.class || tags.building || '', height: Math.max(height, lift + 2.5), lift, rings: feature.lines });
  }
  const takeLand = (bytes2, name, force) => {
    for (const feature of layerRings(readLayer(bytes2, name), tx, ty, zoom)) {
      if (feature.type !== 3) continue;
      const kind = force || landKind(feature.tags);
      if (!kind) continue;
      lands.push({ cls: feature.tags.class || name, color: kind[0], rank: kind[1], trees: kind[2], rings: feature.lines });
    }
  };
  takeLand(bytes, 'landcover');
  takeLand(bytes, 'landuse');
  takeLand(bytes, 'park', [COLOR.park, 2, true]);
  for (const feature of layerRings(readLayer(bytes, 'water'), tx, ty, zoom)) {
    if (feature.type === 3) waters.push({ rings: feature.lines });
  }
  for (const feature of layerRings(readLayer(bytes, 'transportation'), tx, ty, zoom)) {
    if (feature.type !== 2) continue;
    const { tags } = feature;
    if (tags.brunnel === 'bridge' || tags.brunnel === 'tunnel' || tags.indoor) continue;
    const width = ROAD_WIDTH[tags.class];
    if (!width) continue;
    for (const line of feature.lines) if (line.length >= 2) roads.push({ width, line });
  }
  return { buildings, lands, waters, roads };
}

export function newArea() {
  return { buildings: [], waters: [], lands: [], woods: [], roads: [], tiles: new Set(), revision: 0 };
}

function finishBuilding(raw, id) {
  const ring = asCCW(clean(raw.ring));
  if (ring.length < 3 || Math.abs(signedArea(ring)) < MIN_BUILDING) return null;
  return {
    id, cls: raw.cls || '', height: raw.height, lift: raw.lift || 0, ring, holes: raw.holes || [],
    door: null, objects: [], floorY: 0, ...boundsOf(ring),
  };
}

function refreshDoors(area) {
  for (const building of area.buildings) building.door = placeDoor(building.ring, area.roads);
}

// Add one tile's geographic features. The same tile is ignored the second time.
export function mergeTile(area, bytes, tx, ty, origin, zoom = VECTOR_ZOOM) {
  const key = `${zoom}/${tx}/${ty}`;
  if (area.tiles.has(key)) return false;
  const geo = placesFromTile(bytes, tx, ty, zoom);
  const local = {
    buildings: geo.buildings.map((b) => ({ cls: b.cls, height: b.height, lift: b.lift, rings: b.rings.map((ring) => projectRing(origin, ring)) })),
    lands: geo.lands.map((land) => ({ ...land, rings: land.rings.map((ring) => projectRing(origin, ring)) })),
    waters: geo.waters.map((w) => ({ rings: w.rings.map((ring) => projectRing(origin, ring)) })),
    roads: geo.roads.map((road) => ({ width: road.width, line: projectRing(origin, road.line) })),
  };
  return absorb(area, key, local);
}

// Features already in metres. Used by tests and by mergeTile.
export function absorb(area, tileKey, local) {
  if (area.tiles.has(tileKey)) return false;
  area.tiles.add(tileKey);
  let n = 0;
  for (const raw of local.buildings || []) {
    for (const poly of splitPolygons(raw.rings || [raw.ring])) {
      const building = finishBuilding({ ...raw, ...poly }, `${tileKey}/${n++}`);
      if (building) area.buildings.push(building);
    }
  }
  for (const raw of local.lands || []) {
    for (const poly of splitPolygons(raw.rings || [raw.ring])) {
      const feature = { ...poly, cls: raw.cls, color: raw.color, rank: raw.rank, sparse: raw.cls === 'park', ...boundsOf(poly.ring) };
      area.lands.push(feature);
      if (raw.trees) area.woods.push(feature);
    }
  }
  for (const raw of local.waters || []) {
    for (const poly of splitPolygons(raw.rings || [raw.ring])) area.waters.push({ ...poly, ...boundsOf(poly.ring) });
  }
  for (const raw of local.roads || []) {
    const line = clean(raw.line);
    if (line.length < 2) continue;
    area.roads.push({ line, width: raw.width, ...boundsOf(line) });
  }
  refreshDoors(area);
  area.revision++;
  return true;
}

function hash2(a, b) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function onRoad(roads, x, z) {
  for (const road of roads) {
    if (x < road.minX - road.width || x > road.maxX + road.width || z < road.minZ - road.width || z > road.maxZ + road.width) continue;
    for (let i = 1; i < road.line.length; i++) if (distToSeg(x, z, road.line[i - 1], road.line[i]) < road.width / 2 + 1.2) return true;
  }
  return false;
}

// Seeded trees for one chunk. The same area always gives the same trees. Trunks only; the canopy is not a wall.
export function treesForChunk(key, area) {
  const [ix, iz] = key.split('_').map(Number);
  const x0 = ix * CHUNK, z0 = iz * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK;
  const trees = [];
  for (let w = 0; w < area.woods.length && trees.length < TREE_CAP; w++) {
    const wood = area.woods[w];
    if (wood.maxX < x0 || wood.minX > x1 || wood.maxZ < z0 || wood.minZ > z1) continue;
    const step = wood.sparse ? PARK_STEP : TREE_STEP;
    for (let x = x0 + step / 2; x < x1 && trees.length < TREE_CAP; x += step) {
      for (let z = z0 + step / 2; z < z1 && trees.length < TREE_CAP; z += step) {
        const h = hash2(w * 4096 + Math.round(x), Math.round(z));
        const jx = x + ((h % 1000) / 1000 - 0.5) * step * 0.65;
        const jz = z + (((h >>> 10) % 1000) / 1000 - 0.5) * step * 0.65;
        if (jx < x0 || jz < z0 || jx >= x1 || jz >= z1) continue;
        if (!contains(wood, jx, jz)) continue;
        if (area.buildings.some((b) => contains(b, jx, jz))) continue;
        if (area.waters.some((b) => contains(b, jx, jz))) continue;
        if (onRoad(area.roads, jx, jz)) continue;
        trees.push({ x: jx, z: jz, h: 4 + (h % 50) / 12, r: 0.28 });
      }
    }
  }
  return trees;
}

function overlaps(feature, x, z, pad) {
  return feature.minX == null || (x >= feature.minX - pad && x <= feature.maxX + pad && z >= feature.minZ - pad && z <= feature.maxZ + pad);
}

export function coverAt(area, x, z) {
  for (const water of area.waters) if (contains(water, x, z)) return COLOR.water;
  for (const road of area.roads) {
    if (!overlaps(road, x, z, road.width)) continue;
    for (let i = 1; i < road.line.length; i++) if (distToSeg(x, z, road.line[i - 1], road.line[i]) < road.width / 2) return COLOR.road;
  }
  let best = null, rank = 0;
  for (const land of area.lands) {
    if ((land.rank || 1) < rank || !contains(land, x, z)) continue;
    best = land;
    rank = land.rank || 1;
  }
  return best ? best.color : COLOR.ground;
}
