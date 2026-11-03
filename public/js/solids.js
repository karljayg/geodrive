// What stops a car that nothing draws: the rows of a parking lot and woods, the lumps of the 3D map. Nobody can read where the map's own cars and trees stand, so these come from the free tiles: a
// row of parking is where one should be beside a mapped aisle. They're only numbers, with no models, and a car asks only about the few grid cells along its own path. Pure, tested in node.
import { GAME } from './gameConfig.js';
import { FootprintIndex } from './collide.js';
import { decodeLines, readLayer, tileToGeo, VECTOR_ZOOM } from './vector.js';

const METRES_PER_DEGREE = 111320;
const CELL = 40; // m to a side of the grid. A cell lists only the lines close enough to matter

// Lines through a grid, packed into typed arrays, so a tile's lines cost little memory and nothing for the garbage collector to walk.
class LineGrid {
  // lines: arrays of [x, y] in metres from the corner. reach: metres either side of a line a test can care about.
  constructor(lines, reach) {
    let count = 0;
    for (const line of lines) count += Math.max(0, line.length - 1);
    this.ends = new Float32Array(count * 4);
    const cells = new Map();
    let at = 0;
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const [x0, y0] = line[i - 1], [x1, y1] = line[i], number = at / 4;
        this.ends.set([x0, y0, x1, y1], at);
        at += 4;
        const length = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(length / (CELL / 2)));
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

  // Calls see(distance, alongIt) for each line near a point, alongIt being whether the point is level with the line rather than off its end. Stops when see returns true, and says so.
  near(x, y, see) {
    const list = this.cells.get(Math.floor(x / CELL) * 4096 + Math.floor(y / CELL));
    if (!list) return false;
    const ends = this.ends;
    for (let i = 0; i < list.length; i++) {
      const at = list[i] * 4, x0 = ends[at], y0 = ends[at + 1], dx = ends[at + 2] - x0, dy = ends[at + 3] - y0, square = dx * dx + dy * dy || 1;
      const t = ((x - x0) * dx + (y - y0) * dy) / square, clamped = Math.max(0, Math.min(1, t));
      if (see(Math.hypot(x - x0 - dx * clamped, y - y0 - dy * clamped), t >= 0 && t <= 1)) return true;
    }
    return false;
  }
}

// One tile's solid things. contains(lat, lng): whether a car can't be there.
export class TileSolids {
  // aisles and roads: lines of [lng, lat]. woods: rings of [lng, lat]. Everything drivable clears a way, so a driveway through a wood or a cross aisle through a row stays open.
  constructor({ aisles, roads, woods }, config = GAME.solids) {
    const all = [...aisles, ...roads, ...woods];
    this.config = config;
    this.west = Infinity;
    this.south = Infinity;
    for (const line of all) for (const [lng, lat] of line) { if (lng < this.west) this.west = lng; if (lat < this.south) this.south = lat; }
    this.east = METRES_PER_DEGREE * Math.cos(((all.length ? this.south : 0) * Math.PI) / 180);
    const inMetres = (line) => line.map(([lng, lat]) => [(lng - this.west) * this.east, (lat - this.south) * METRES_PER_DEGREE]);
    this.aisles = aisles.length ? new LineGrid(aisles.map(inMetres), config.rowTo) : null;
    this.roads = roads.length || aisles.length ? new LineGrid(roads.map(inMetres), config.roadClear) : null;
    this.woods = woods.length ? new FootprintIndex(woods) : null;
  }

  contains(lat, lng) {
    if (!this.aisles && !this.woods) return false;
    const x = (lng - this.west) * this.east, y = (lat - this.south) * METRES_PER_DEGREE, { rowFrom, rowTo, roadClear } = this.config;
    let inRow = false, inAisle = false;
    if (this.aisles) {
      this.aisles.near(x, y, (distance, alongIt) => {
        if (distance < rowFrom) return (inAisle = true);
        if (alongIt && distance <= rowTo) inRow = true;
        return false;
      });
    }
    if (inAisle) return false;
    if (!inRow && !this.woods?.contains(lat, lng)) return false;
    return !this.roads?.near(x, y, (distance) => distance < roadClear);
  }
}

// What's solid in one map tile, from the same free bytes as its roads.
export function solidsFromTile(bytes, tx, ty, zoom = VECTOR_ZOOM) {
  const aisles = [], roads = [], woods = [], roadLayer = readLayer(bytes, 'transportation'), landLayer = readLayer(bytes, 'landcover');
  if (roadLayer) {
    const { toLat, toLng } = tileToGeo(tx, ty, roadLayer.extent, zoom);
    for (const { tags, type, geometry } of roadLayer.features) {
      if (type !== 2 || tags.class === 'path' || tags.class === 'rail' || tags.brunnel === 'bridge' || tags.brunnel === 'tunnel') continue;
      for (const line of decodeLines(geometry)) (tags.service === 'parking_aisle' ? aisles : roads).push(line.map(([x, y]) => [toLng(x), toLat(y)]));
    }
  }
  if (landLayer) {
    const { toLat, toLng } = tileToGeo(tx, ty, landLayer.extent, zoom);
    for (const { tags, type, geometry } of landLayer.features) {
      if (type !== 3 || tags.class !== 'wood') continue;
      for (const line of decodeLines(geometry)) {
        let area = 0;
        for (let i = 0, j = line.length - 1; i < line.length; j = i++) area += line[j][0] * line[i][1] - line[i][0] * line[j][1];
        if (area > 0 && line.length >= 3) woods.push(line.map(([x, y]) => [toLng(x), toLat(y)])); // positive in tile pixels is an outer ring
      }
    }
  }
  return new TileSolids({ aisles, roads, woods });
}

// The tiles a car wants ready: the one it's in, and those it'll reach within lookAhead metres. A car at 500 mph crosses a tile in about 9 s, and one takes about half a second to arrive.
export function tilesAhead(lat, lng, heading, lookAhead, tileAt) {
  const r = (heading * Math.PI) / 180, north = (Math.cos(r) * lookAhead) / METRES_PER_DEGREE, east = (Math.sin(r) * lookAhead) / (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  const found = new Map();
  for (const t of [0, 0.5, 1]) {
    const tile = tileAt(lat + north * t, lng + east * t);
    found.set(`${tile.x}_${tile.y}`, tile);
  }
  return [...found.values()];
}
