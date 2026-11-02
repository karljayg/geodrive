// What is on the ground around a parked car, for walking: buildings, land, water and roads out of the same OpenFreeMap
// tiles the drive uses. Pure, tested in node. Everything here is in metres from the car: x east, y north, z up.
import { decodeLines, readLayer, VECTOR_ZOOM } from './vector.js';

export const CELL = 80;         // m a side of one chunk of the world
export const LOW_ENOUGH = 2.2;  // m; a building part lifted higher than this is overhead, and you walk under it
const EARTH = 6371000;
const MIN_BUILDING = 6;         // m² of footprint
const UNMAPPED_HEIGHT = 5;      // m
const TOUCHING = 0.7;           // m between walls that makes two buildings one
const POI_REACH = 25;           // m outside a footprint that a place still belongs to it, as places are often mapped at the door or the car park
const SEAM_MATCH = 0.01;        // m; pieces of one building cut by a tile edge lie on the same line
const LOOK_PLACE = 15, LOOK_TREE = 3; // m that F outdoors will mention one
const ROAD_PAD = 6;    // m around a road that its cells also list it, for checks just beside it
const TREE_STEP = { dense: 8, sparse: 18 }; // m between trees
export const TRUNK_RADIUS = 0.3;

export const BASE_GROUND = '#8d9f70';
export const WATER = '#3a7aa6';
const LAND = {
  // colour, the order they paint in, and whether trees grow there
  residential: ['#a3a58b', 1], commercial: ['#b4a994', 1], retail: ['#b4a994', 1], industrial: ['#a0988a', 1],
  school: ['#bcb096', 1], university: ['#bcb096', 1], college: ['#bcb096', 1], hospital: ['#bcb096', 1], library: ['#bcb096', 1],
  railway: ['#9c9488', 1], military: ['#a3a58b', 1], bus_station: ['#a0988a', 1],
  farmland: ['#b0b56f', 2], sand: ['#d6c896', 2], rock: ['#9a968c', 2], wetland: ['#7d9a7a', 2], ice: ['#e8eef2', 2],
  grass: ['#7fa65a', 2], pitch: ['#74a358', 2], playground: ['#8cae62', 2], stadium: ['#74a358', 2],
  cemetery: ['#84a264', 2, 'sparse'], wood: ['#4f7a3e', 3, 'dense'], forest: ['#4f7a3e', 3, 'dense'],
};
const PARK = ['#6fa055', 2, 'sparse'];
const AEROWAY = { aerodrome: ['#a9ad92', 1], apron: ['#8b8b88', 4], runway: ['#66686b', 4], taxiway: ['#6f7174', 4], helipad: ['#7a7b7d', 4] };
const AEROWAY_WIDTH = { runway: 45, taxiway: 20 };
const ASPHALT = '#4a4f58', KERB = '#b4b1a8';
const ROAD = {
  // width in metres, colour, and whether it has a pavement edge
  motorway: [18, ASPHALT, true], trunk: [15, ASPHALT, true], primary: [13, ASPHALT, true], secondary: [11, ASPHALT, true],
  tertiary: [9, ASPHALT, true], minor: [7, ASPHALT, true], service: [4.5, '#585d66', false], track: [3, '#9c8d6b', false],
  path: [2, '#c9c0a8', false], rail: [2.5, '#6b5f55', false], transit: [2.5, '#6b5f55', false],
};

export function toLocal(origin, lat, lng) {
  const r = Math.PI / 180;
  return { x: (lng - origin.lng) * r * EARTH * Math.cos(origin.lat * r), y: (lat - origin.lat) * r * EARTH };
}

export function fromLocal(origin, x, y) {
  const r = Math.PI / 180;
  return { lat: origin.lat + y / (r * EARTH), lng: origin.lng + x / (r * EARTH * Math.cos(origin.lat * r)) };
}

// --- Rings ----------------------------------------------------------------------------------------------------

// Positive in tile pixels means an outer ring, as tile y points down. Positive in metres is anticlockwise from above.
export function signedArea(points, xOf = (p) => p.x, yOf = (p) => p.y) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) a += xOf(points[j]) * yOf(points[i]) - xOf(points[i]) * yOf(points[j]);
  return a / 2;
}

// A vector tile's rings in order: each outer ring, then its holes. One feature often holds many polygons.
export function polygonsOf(rings) {
  const polygons = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const area = signedArea(ring, (p) => p[0], (p) => p[1]);
    if (area === 0) continue;
    if (area > 0 || !polygons.length) polygons.push([ring]);
    else polygons.at(-1).push(ring);
  }
  return polygons;
}

// Cuts a ring to the tile's own square. A tile also holds what lies just over its edge, so a building by the edge
// arrives twice: cut like this, one copy vanishes, and one crossing the edge becomes two pieces that meet exactly.
export function clipRing(ring, extent) {
  const sides = [[0, 1], [0, -1], [1, 1], [1, -1]]; // axis, and which way is inside
  let out = ring;
  for (const [axis, sign] of sides) {
    const edge = sign > 0 ? 0 : extent, inside = (p) => (p[axis] - edge) * sign >= 0, kept = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      if (inside(a)) kept.push(a);
      if (inside(a) !== inside(b)) {
        const f = (edge - a[axis]) / (b[axis] - a[axis]);
        kept.push(axis === 0 ? [edge, a[1] + (b[1] - a[1]) * f] : [a[0] + (b[0] - a[0]) * f, edge]);
      }
    }
    out = kept;
    if (!out.length) return out;
  }
  return out;
}

const onSeam = (a, b, extent) => (a[0] === b[0] && (a[0] === 0 || a[0] === extent)) || (a[1] === b[1] && (a[1] === 0 || a[1] === extent));

// Even-odd over all of a polygon's rings, so holes come out by themselves.
export function inRings(rings, x, y) {
  let inside = false;
  for (const points of rings) {
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

export function distToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

function boundsOf(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

const within = (b, x, y) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;

// --- Triangles ------------------------------------------------------------------------------------------------

const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function crosses(a, b, c, d) {
  const d1 = turn(a, b, c), d2 = turn(a, b, d), d3 = turn(c, d, a), d4 = turn(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// Joins a hole to the outer ring with a two-way cut, so one outline remains for clipping.
function bridgeHole(outline, hole) {
  let m = 0;
  for (let i = 1; i < hole.length; i++) if (hole[i].x > hole[m].x) m = i;
  const from = hole[m];
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const to = outline[i], dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist >= bestDist) continue;
    let clear = true;
    for (let j = 0; j < outline.length && clear; j++) clear = !crosses(from, to, outline[j], outline[(j + 1) % outline.length]);
    for (let j = 0; j < hole.length && clear; j++) clear = !crosses(from, to, hole[j], hole[(j + 1) % hole.length]);
    if (clear) { best = i; bestDist = dist; }
  }
  if (best < 0) return outline; // no way through, which only a broken shape does; the hole is drawn filled
  const rotated = [...hole.slice(m), ...hole.slice(0, m), from];
  return [...outline.slice(0, best + 1), ...rotated, outline[best], ...outline.slice(best + 1)];
}

// Triangles of an anticlockwise outer ring with clockwise holes, as a list of points three at a time, each anticlockwise.
export function triangulate(rings) {
  let outline = rings[0].slice();
  for (const hole of rings.slice(1).sort((a, b) => boundsOf(b).maxX - boundsOf(a).maxX)) outline = bridgeHole(outline, hole);
  const triangles = [], left = outline.map((p) => p);
  let at = 0, tries = 0;
  while (left.length > 3 && tries <= left.length) {
    const n = left.length, a = left[(at + n - 1) % n], b = left[at % n], c = left[(at + 1) % n];
    let ear = turn(a, b, c) > 1e-9;
    if (ear) {
      for (const p of left) {
        if (p === a || p === b || p === c || (p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y) || (p.x === c.x && p.y === c.y)) continue;
        if (turn(a, b, p) >= 0 && turn(b, c, p) >= 0 && turn(c, a, p) >= 0) { ear = false; break; }
      }
    }
    if (ear) {
      triangles.push(a, b, c);
      left.splice(at % n, 1);
      tries = 0;
      at = (at % n) ? (at % n) - 1 : 0;
    } else if (Math.abs(turn(a, b, c)) <= 1e-9) {
      left.splice(at % n, 1); // a point on a straight line adds nothing
      tries = 0;
    } else {
      at = (at % n) + 1;
      tries++;
    }
  }
  if (left.length === 3 && turn(left[0], left[1], left[2]) > 0) triangles.push(left[0], left[1], left[2]);
  return triangles;
}

// --- Reading a tile -------------------------------------------------------------------------------------------

function hexColour(text, fallback) {
  const hex = /^#[0-9a-f]{6}$/i.test(text) ? text : fallback, n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// The features of one tile in metres from the car. Tiles have no building types, only heights and sometimes a colour.
export function parseTile(bytes, tx, ty, origin, zoom = VECTOR_ZOOM) {
  const n = 2 ** zoom;
  const place = (extent) => ([px, py]) => {
    const lng = ((tx + px / extent) / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + py / extent)) / n))) * 180) / Math.PI;
    return toLocal(origin, lat, lng);
  };
  const features = (name, use) => {
    const layer = readLayer(bytes, name);
    if (layer) for (const feature of layer.features) use(feature, decodeLines(feature.geometry), layer.extent, place(layer.extent));
  };
  const out = { buildings: [], lands: [], waters: [], roads: [], pois: [] };

  // Winding flips between tile pixels and metres, so each ring is reversed here and comes out with outer rings anticlockwise.
  features('building', ({ tags, type }, lines, extent, toMetres) => {
    if (type !== 3 || tags.hide_3d) return;
    const lift = Math.max(0, tags.render_min_height || 0);
    for (const polygon of polygonsOf(lines)) {
      const rings = [], across = new Set();
      for (const raw of polygon) {
        const cut = clipRing(raw, extent).reverse();
        if (cut.length < 3) continue;
        const seam = cut.map((p, i) => onSeam(p, cut[(i + 1) % cut.length], extent));
        seam.forEach((cutHere, i) => {
          if (!cutHere) return;
          const p = cut[i], q = cut[(i + 1) % cut.length], sideways = p[0] === q[0];
          const edge = sideways ? p[0] : p[1], step = edge === 0 ? -1 : 1;
          across.add(sideways ? `${tx + step}_${ty}` : `${tx}_${ty + step}`);
        });
        rings.push({ pts: cut.map(toMetres), seam });
      }
      if (!rings.length) continue;
      const area = Math.abs(signedArea(rings[0].pts));
      if (area < MIN_BUILDING) continue;
      const height = tags.render_height > 0 ? tags.render_height : area < 150 ? 6 : 10;
      // A render_height of 5 is what the tiles say when nobody has mapped the height, so it says nothing.
      const known = tags.render_height > 0 && tags.render_height !== UNMAPPED_HEIGHT;
      out.buildings.push({ rings, lift, height: Math.max(height, lift + 2.5), known, across: [...across], colour: hexColour(tags.colour, '#c9c2b6'), ground: lift <= LOW_ENOUGH, objects: [], ...boundsOf(rings[0].pts) });
    }
  });

  features('poi', ({ tags, type }, lines, extent, toMetres) => {
    if (type !== 1) return;
    for (const line of lines) for (const p of line) out.pois.push({ ...toMetres(p), cls: tags.class, sub: tags.subclass, name: tags['name:latin'] || tags.name || '' });
  });

  const addLand = (kind, name) => (lines, toMetres) => {
    for (const polygon of polygonsOf(lines)) {
      const rings = polygon.map((ring) => ring.map(toMetres));
      out.lands.push({ rings, name, colour: kind[0], rank: kind[1], trees: kind[2], ...boundsOf(rings[0]) });
    }
  };
  for (const name of ['landcover', 'landuse']) {
    features(name, ({ tags, type }, lines, extent, toMetres) => {
      const kind = LAND[tags.class];
      if (type === 3 && kind) addLand(kind, tags.class)(lines, toMetres);
    });
  }
  features('park', ({ tags, type }, lines, extent, toMetres) => {
    if (type === 3 && tags.class !== 'marine') addLand(PARK, 'park')(lines, toMetres);
  });
  features('aeroway', ({ tags, type }, lines, extent, toMetres) => {
    const kind = AEROWAY[tags.class];
    if (type === 3 && kind) addLand(kind, tags.class)(lines, toMetres);
    if (type === 2 && AEROWAY_WIDTH[tags.class]) for (const line of lines) out.roads.push({ line: line.map(toMetres), width: AEROWAY_WIDTH[tags.class], colour: kind[0], kerb: false });
  });
  features('water', ({ tags, type }, lines, extent, toMetres) => {
    if (type !== 3 || tags.brunnel === 'tunnel') return;
    for (const polygon of polygonsOf(lines)) {
      const rings = polygon.map((ring) => ring.map(toMetres));
      out.waters.push({ rings, ...boundsOf(rings[0]) });
    }
  });
  features('transportation', ({ tags, type }, lines, extent, toMetres) => {
    // A parking aisle mapped inside a building says that building is a parking garage, so it counts as a point there.
    if (type === 2 && tags.service === 'parking_aisle') for (const line of lines) for (const p of line) out.pois.push({ ...toMetres(p), cls: 'parking', sub: 'parking' });
    const road = ROAD[tags.class];
    if (type !== 2 || !road || tags.brunnel === 'bridge' || tags.brunnel === 'tunnel' || tags.indoor) return;
    for (const line of lines) if (line.length > 1) out.roads.push({ line: line.map(toMetres), width: road[0], colour: road[1], kerb: road[2] });
  });
  return out;
}

// --- The place ------------------------------------------------------------------------------------------------

const seamEdges = (building) => building.rings.flatMap(({ pts, seam }) => pts.flatMap((a, i) => (seam[i] ? [[a, pts[(i + 1) % pts.length]]] : [])));

const overlap = (a0, a1, b0, b1) => Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1)) > SEAM_MATCH;

// True if two pieces meet along an edge that a tile cut. A tile edge is a straight line north-south or east-west in metres.
function cutFrom(p, q) {
  const near = (a, b) => Math.abs(a - b) < SEAM_MATCH, theirs = seamEdges(q);
  return seamEdges(p).some(([a, b]) => theirs.some(([c, d]) => (
    (near(a.x, b.x) && near(a.x, c.x) && near(c.x, d.x) && overlap(a.y, b.y, c.y, d.y))
    || (near(a.y, b.y) && near(a.y, c.y) && near(c.y, d.y) && overlap(a.x, b.x, c.x, d.x))
  )));
}

function hash(a, b) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// Everything known so far, filed by cell, so each question only looks at what is close by. Tiles can arrive in any order.
export class Place {
  constructor(origin) {
    this.origin = origin;
    this.cells = new Map();
    this.tiles = new Set();
    this.poisSeen = new Set();
    this.roadsAdded = 0;
    this.revision = 0;
  }

  cell(cx, cy) {
    const key = `${cx}_${cy}`;
    let cell = this.cells.get(key);
    if (!cell) this.cells.set(key, cell = { buildings: [], lands: [], waters: [], roads: [], pois: [], trees: null, treesAt: -1 });
    return cell;
  }

  cellAt(x, y) {
    return this.cell(Math.floor(x / CELL), Math.floor(y / CELL));
  }

  file(kind, item, b, pad = 0) {
    for (let cx = Math.floor((b.minX - pad) / CELL); cx <= Math.floor((b.maxX + pad) / CELL); cx++) {
      for (let cy = Math.floor((b.minY - pad) / CELL); cy <= Math.floor((b.maxY + pad) / CELL); cy++) this.cell(cx, cy)[kind].push(item);
    }
  }

  // True if the tile was new.
  addTile(key, parsed) {
    if (this.tiles.has(key)) return false;
    this.tiles.add(key);
    for (const building of parsed.buildings) {
      building.owner = `${Math.floor((building.minX + building.maxX) / 2 / CELL)}_${Math.floor((building.minY + building.maxY) / 2 / CELL)}`;
      this.file('buildings', building, building, 2);
    }
    for (const land of parsed.lands) this.file('lands', land, land);
    for (const water of parsed.waters) this.file('waters', water, water);
    for (const poi of parsed.pois || []) {
      // A tile also holds what lies just over its edge, so the same place can arrive from up to four tiles, and must count once.
      const same = `${Math.round(poi.x)}_${Math.round(poi.y)}_${poi.cls}_${poi.sub}_${poi.name || ''}`;
      if (this.poisSeen.has(same)) continue;
      this.poisSeen.add(same);
      this.file('pois', poi, { minX: poi.x, maxX: poi.x, minY: poi.y, maxY: poi.y });
    }
    for (const road of parsed.roads) {
      for (let i = 1; i < road.line.length; i++) {
        const a = road.line[i - 1], b = road.line[i];
        const segment = { ax: a.x, ay: a.y, bx: b.x, by: b.y, width: road.width, colour: road.colour, kerb: road.kerb };
        this.file('roads', segment, boundsOf([a, b]), road.width / 2 + ROAD_PAD);
      }
    }
    if (parsed.roads.length) this.roadsAdded++;
    this.revision++;
    return true;
  }

  // Places from another source, which needs no tile of its own here. True if they were new.
  addPlaces(key, pois) {
    if (this.tiles.has(key)) return false;
    this.tiles.add(key);
    for (const poi of pois) this.file('pois', poi, { minX: poi.x, maxX: poi.x, minY: poi.y, maxY: poi.y });
    return true;
  }

  inWater(x, y) {
    return this.cellAt(x, y).waters.some((water) => within(water, x, y) && inRings(water.rings, x, y));
  }

  // The building whose ground floor is here, if any.
  // What's here for someone outdoors to remark on: the water, the road, a named place, a tree, or the land. kind and, for a place, its name.
  whatsAround(x, y) {
    if (this.inWater(x, y)) return { kind: 'water' };
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cell = this.cellAt(x, y);
    if (cell.roads.some((r) => distToSegment(x, y, r.ax, r.ay, r.bx, r.by) < r.width / 2 + 1)) return { kind: 'road' };
    let place = null, bestPlace = LOOK_PLACE;
    for (const poi of cell.pois) {
      const away = Math.hypot(poi.x - x, poi.y - y);
      if (poi.name && away < bestPlace) { place = poi; bestPlace = away; }
    }
    if (place) return { kind: 'place', name: place.name };
    if (this.treesIn(cx, cy).some((tree) => Math.hypot(tree.x - x, tree.y - y) < LOOK_TREE)) return { kind: 'tree' };
    const land = cell.lands.filter((l) => within(l, x, y) && inRings(l.rings, x, y)).sort((a, b) => b.rank - a.rank)[0];
    return { kind: 'land', name: land?.name };
  }

  footprintAt(x, y) {
    return this.cellAt(x, y).buildings.find((b) => b.ground && within(b, x, y) && inRings(b.rings.map((r) => r.pts), x, y)) || null;
  }

  // The solid wall pieces of a building.
  walls(building) {
    if (!building.ground) return [];
    if (building.wallList) return building.wallList;
    const list = [];
    for (const { pts, seam } of building.rings) {
      for (let i = 0; i < pts.length; i++) {
        if (!seam[i]) list.push({ ax: pts[i].x, ay: pts[i].y, bx: pts[(i + 1) % pts.length].x, by: pts[(i + 1) % pts.length].y });
      }
    }
    return building.wallList = list;
  }

  // Every cell a box touches.
  cellsOver(b) {
    const cells = [];
    for (let cx = Math.floor(b.minX / CELL); cx <= Math.floor(b.maxX / CELL); cx++) {
      for (let cy = Math.floor(b.minY / CELL); cy <= Math.floor(b.maxY / CELL); cy++) cells.push(this.cell(cx, cy));
    }
    return cells;
  }

  // All the pieces of the building this one belongs to, as a tile edge can cut one in two, and the tiles still to come that may hold more.
  wholeOf(piece) {
    const pieces = [piece], missing = new Set();
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      for (const key of p.across || []) if (!this.tiles.has(key)) missing.add(key);
      for (const cell of this.cellsOver(p)) {
        for (const other of cell.buildings) {
          if (other.ground && !pieces.includes(other) && cutFrom(p, other)) pieces.push(other);
        }
      }
    }
    return { pieces, missing: [...missing] };
  }

  // The footprint a place belongs to: the one it's in, or the nearest within reach if it's in none. A car park stays outside, so parking must be inside.
  footprintOfPlace(poi, parking) {
    const inside = this.cellAt(poi.x, poi.y).buildings.find((b) => within(b, poi.x, poi.y) && inRings(b.rings.map((r) => r.pts), poi.x, poi.y));
    if (inside || parking) return inside || null;
    let best = null, bestDistance = POI_REACH;
    for (const cell of this.cellsOver({ minX: poi.x - POI_REACH, maxX: poi.x + POI_REACH, minY: poi.y - POI_REACH, maxY: poi.y + POI_REACH })) {
      for (const building of cell.buildings) {
        if (!building.ground) continue;
        for (const w of this.walls(building)) {
          const d = distToSegment(poi.x, poi.y, w.ax, w.ay, w.bx, w.by);
          if (d < bestDistance) { bestDistance = d; best = building; }
        }
      }
    }
    return best;
  }

  // What the map says about a whole building, for working out what it is. typeOf turns a point of interest into a building type, or null.
  cluesFor(pieces, bounds, typeOf) {
    const openMap = [], overture = [], names = {}, seen = new Set(), all = new Set(pieces);
    for (const piece of pieces) {
      const box = { minX: piece.minX - POI_REACH, maxX: piece.maxX + POI_REACH, minY: piece.minY - POI_REACH, maxY: piece.maxY + POI_REACH };
      for (const cell of this.cellsOver(box)) {
        for (const poi of cell.pois) {
          if (seen.has(poi) || !within(box, poi.x, poi.y)) continue;
          seen.add(poi);
          const type = typeOf(poi);
          if (!type || !all.has(this.footprintOfPlace(poi, type === 'parking'))) continue;
          (poi.overture ? overture : openMap).push(type);
          if (poi.name && !names[type]) names[type] = poi.name;
        }
      }
    }
    // Overture knows far more, and both listing a place would count it twice. OpenStreetMap's parking comes from its roads, so that stays.
    const pois = overture.length ? [...overture, ...openMap.filter((type) => type === 'parking')] : openMap;
    const x = (bounds.minX + bounds.maxX) / 2, y = (bounds.minY + bounds.maxY) / 2;
    const lands = this.cellAt(x, y).lands.filter((land) => within(land, x, y) && inRings(land.rings, x, y)).map((land) => land.name);
    const tallest = pieces.reduce((best, p) => (p.height > best.height ? p : best));
    return { area: pieces.reduce((sum, p) => sum + Math.abs(signedArea(p.rings[0].pts)), 0), height: tallest.height, known: !!tallest.known, pois, names, lands };
  }

  // The other buildings these pieces touch, wall to wall.
  joinedTo(pieces) {
    const out = new Set(), own = new Set(pieces), segments = pieces.flatMap((piece) => this.walls(piece));
    for (const piece of pieces) {
      for (const cell of this.cellsOver({ minX: piece.minX - 1, maxX: piece.maxX + 1, minY: piece.minY - 1, maxY: piece.maxY + 1 })) {
        for (const other of cell.buildings) {
          if (own.has(other) || out.has(other) || !other.ground || other.minX > piece.maxX + TOUCHING || other.maxX < piece.minX - TOUCHING || other.minY > piece.maxY + TOUCHING || other.maxY < piece.minY - TOUCHING) continue;
          const close = this.walls(other).some((w) => segments.some((s) => distToSegment(w.ax, w.ay, s.ax, s.ay, s.bx, s.by) < TOUCHING || distToSegment(s.ax, s.ay, w.ax, w.ay, w.bx, w.by) < TOUCHING));
          if (close) out.add(other);
        }
      }
    }
    return [...out];
  }

  // Trees for a chunk, placed from a hash of where they stand, so they don't move when more tiles arrive; a tree only goes if something now covers its spot.
  treesIn(cx, cy) {
    const cell = this.cell(cx, cy);
    if (cell.trees && cell.treesAt === this.revision) return cell.trees;
    cell.treesAt = this.revision;
    cell.trees = [];
    const woods = cell.lands.filter((land) => land.trees);
    if (!woods.length) return cell.trees;
    for (const [kind, step] of Object.entries(TREE_STEP)) {
      const growing = woods.filter((land) => land.trees === kind);
      if (!growing.length) continue;
      const across = Math.floor(CELL / step);
      for (let i = 0; i < across; i++) {
        for (let j = 0; j < across; j++) {
          const h = hash(cx * across + i, cy * across + j);
          const x = (cx + (i + 0.5 + ((h % 1000) / 1000 - 0.5) * 0.7) / across) * CELL;
          const y = (cy + (j + 0.5 + (((h >>> 10) % 1000) / 1000 - 0.5) * 0.7) / across) * CELL;
          if (!growing.some((land) => within(land, x, y) && inRings(land.rings, x, y))) continue;
          if (Math.hypot(x, y) < 6 || this.inWater(x, y)) continue; // not on top of the car
          if (cell.buildings.some((b) => within(b, x, y) && inRings(b.rings.map((r) => r.pts), x, y))) continue;
          if (cell.roads.some((r) => distToSegment(x, y, r.ax, r.ay, r.bx, r.by) < r.width / 2 + 1.2)) continue;
          cell.trees.push({ x, y, height: 5 + ((h >>> 20) % 60) / 10 });
        }
      }
    }
    return cell.trees;
  }
}
