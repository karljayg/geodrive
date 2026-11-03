// Where a car may be above or below what the map shows on the ground: on or beside a bridge or tunnel, or on a highway's lanes, from the free tiles. Nothing about a hit looks at height, so things on the
// ground mustn't stop a car there. The road match can't say, as it can pick the road below, or none. Pure, tested in node.
import { GAME } from './gameConfig.js';
import { decodeLines, readLayer, tileToGeo, VECTOR_ZOOM } from './vector.js';

const METRES_PER_DEGREE = 111320;
const CELL = 40; // m to a side of the grid. A cell lists only the lines close enough to matter

// Lines through a grid, packed into typed arrays, so a tile's lines cost little memory. near(x, y, within): whether a line is that close. x and y are metres from the corner the lines are measured from.
class LineGrid {
  constructor(lines, reach) {
    let count = 0;
    for (const line of lines) count += Math.max(0, line.length - 1);
    this.ends = new Float32Array(count * 4);
    this.reach = reach;
    const cells = new Map();
    let at = 0;
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const [x0, y0] = line[i - 1], [x1, y1] = line[i], number = at / 4;
        this.ends.set([x0, y0, x1, y1], at);
        at += 4;
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (CELL / 2)));
        for (let s = 0; s <= steps; s++) { // along the line, adding every cell within reach of it
          const px = x0 + ((x1 - x0) * s) / steps, py = y0 + ((y1 - y0) * s) / steps;
          for (let cx = Math.floor((px - reach) / CELL); cx <= Math.floor((px + reach) / CELL); cx++) {
            for (let cy = Math.floor((py - reach) / CELL); cy <= Math.floor((py + reach) / CELL); cy++) {
              const key = cx * 4096 + cy;
              let list = cells.get(key);
              if (!list) cells.set(key, list = []);
              if (list[list.length - 1] !== number) list.push(number);
            }
          }
        }
      }
    }
    this.cells = new Map();
    for (const [key, list] of cells) this.cells.set(key, Uint32Array.from(list));
  }

  near(x, y) {
    const list = this.cells.get(Math.floor(x / CELL) * 4096 + Math.floor(y / CELL));
    if (!list) return false;
    const ends = this.ends;
    for (let i = 0; i < list.length; i++) {
      const at = list[i] * 4, x0 = ends[at], y0 = ends[at + 1], dx = ends[at + 2] - x0, dy = ends[at + 3] - y0;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - x0 - dx * t, y - y0 - dy * t) < this.reach) return true;
    }
    return false;
  }
}

// One tile's bridges, tunnels and highways, and for a tile with water, every road. Lines of [lng, lat].
export class TileLevels {
  constructor({ bridges = [], highways = [], roads = [] }, config = GAME.levels) {
    const all = [...bridges, ...highways, ...roads];
    this.west = Infinity;
    this.south = Infinity;
    for (const line of all) for (const [lng, lat] of line) { if (lng < this.west) this.west = lng; if (lat < this.south) this.south = lat; }
    this.east = METRES_PER_DEGREE * Math.cos(((all.length ? this.south : 0) * Math.PI) / 180);
    const inMetres = (line) => line.map(([lng, lat]) => [(lng - this.west) * this.east, (lat - this.south) * METRES_PER_DEGREE]);
    this.bridges = bridges.length ? new LineGrid(bridges.map(inMetres), config.bridgeClear) : null;
    this.highways = highways.length ? new LineGrid(highways.map(inMetres), config.highwayClear) : null;
    this.roads = roads.length ? new LineGrid(roads.map(inMetres), config.waterRoadClear) : null;
  }

  // On or beside a bridge or tunnel: others on the ground can't be hit.
  nearBridge(lat, lng) {
    return !!this.bridges?.near((lng - this.west) * this.east, (lat - this.south) * METRES_PER_DEGREE);
  }

  // Where buildings and water stop nothing: a bridge or tunnel, or a highway's lanes and shoulders, which run under and between things, a long way from its mapped line.
  overGround(lat, lng) {
    return this.nearBridge(lat, lng) || !!this.highways?.near((lng - this.west) * this.east, (lat - this.south) * METRES_PER_DEGREE);
  }

  // Close to any road, driveway or aisle: water stops nothing here. Docks, piers and causeways are often mapped with water all round them and no bridge tag.
  nearRoad(lat, lng) {
    return !!this.roads?.near((lng - this.west) * this.east, (lat - this.south) * METRES_PER_DEGREE);
  }
}

// hasWater: keep every road as well, as only water needs them.
export function levelsFromTile(bytes, tx, ty, hasWater, zoom = VECTOR_ZOOM) {
  const bridges = [], highways = [], roads = [], layer = readLayer(bytes, 'transportation');
  if (layer) {
    const { toLat, toLng } = tileToGeo(tx, ty, layer.extent, zoom);
    for (const { tags, type, geometry } of layer.features) {
      if (type !== 2 || tags.class === 'path') continue;
      const raised = tags.brunnel === 'bridge' || tags.brunnel === 'tunnel', highway = tags.class === 'motorway' || tags.class === 'trunk';
      if (!raised && !highway && !hasWater) continue;
      for (const line of decodeLines(geometry)) {
        const points = line.map(([x, y]) => [toLng(x), toLat(y)]);
        if (raised) bridges.push(points);
        if (highway) highways.push(points);
        if (hasWater) roads.push(points);
      }
    }
  }
  return new TileLevels({ bridges, highways, roads });
}

// The tiles a car wants ready: the one it's in, and those it'll reach within lookAhead metres. A tile takes about half a second to arrive.
export function tilesAhead(lat, lng, heading, lookAhead, tileAt) {
  const r = (heading * Math.PI) / 180, north = (Math.cos(r) * lookAhead) / METRES_PER_DEGREE, east = (Math.sin(r) * lookAhead) / (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  const found = new Map();
  for (const t of [0, 0.5, 1]) {
    const tile = tileAt(lat + north * t, lng + east * t);
    found.set(`${tile.x}_${tile.y}`, tile);
  }
  return [...found.values()];
}
