// Reads roads out of OpenMapTiles vector tiles (Mapbox Vector Tile protobuf). Pure, no DOM, so test/road.test.mjs can run it.
import { FLAG_BRIDGE, FLAG_MINOR, FLAG_ONEWAY } from './road.js';

export const VECTOR_ZOOM = 14; // the highest zoom OpenFreeMap serves, and the only one with every road
const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']);
const SKIP_SERVICE = new Set(['parking_aisle', 'driveway', 'drive-through', 'emergency_access']);

export const vectorTileAt = (lat, lng, zoom = VECTOR_ZOOM) => {
  const n = 2 ** zoom, r = (lat * Math.PI) / 180;
  return { x: Math.floor(((lng + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) };
};

function reader(bytes) {
  let at = 0;
  const varint = () => {
    let value = 0, scale = 1, b;
    do {
      b = bytes[at++];
      value += (b & 0x7f) * scale;
      scale *= 128;
    } while (b & 0x80);
    return value;
  };
  return {
    more: () => at < bytes.length,
    varint,
    bytes: () => { const len = varint(); const part = bytes.subarray(at, at + len); at += len; return part; },
    skip: (wire) => {
      if (wire === 0) varint();
      else if (wire === 1) at += 8;
      else if (wire === 5) at += 4;
      else at += varint();
    },
  };
}

function packed(bytes) {
  const r = reader(bytes), out = [];
  while (r.more()) out.push(r.varint());
  return out;
}

function readValue(bytes) {
  const r = reader(bytes);
  let value = null;
  while (r.more()) {
    const head = r.varint(), field = head >> 3, wire = head & 7;
    if (field === 1) value = new TextDecoder().decode(r.bytes());
    else if (field === 4 || field === 5) value = r.varint();
    else if (field === 6) { const z = r.varint(); value = z % 2 ? -(z + 1) / 2 : z / 2; }
    else if (field === 7) value = !!r.varint();
    else if (field === 2) { value = new DataView(bytes.buffer, bytes.byteOffset + 1, 4).getFloat32(0, true); r.skip(wire); }
    else if (field === 3) { value = new DataView(bytes.buffer, bytes.byteOffset + 1, 8).getFloat64(0, true); r.skip(wire); }
    else r.skip(wire);
  }
  return value;
}

// The named layer as { extent, features: [{ type, tags, geometry }] }, or null if the tile hasn't got it.
export function readLayer(bytes, wanted) {
  const tile = reader(bytes);
  while (tile.more()) {
    const head = tile.varint();
    if (head >> 3 !== 3) { tile.skip(head & 7); continue; }
    const layer = reader(tile.bytes());
    let name = '', extent = 4096;
    const keys = [], values = [], raw = [];
    while (layer.more()) {
      const h = layer.varint(), field = h >> 3;
      if (field === 1) name = new TextDecoder().decode(layer.bytes());
      else if (field === 2) raw.push(layer.bytes());
      else if (field === 3) keys.push(new TextDecoder().decode(layer.bytes()));
      else if (field === 4) values.push(readValue(layer.bytes()));
      else if (field === 5) extent = layer.varint();
      else layer.skip(h & 7);
    }
    if (name !== wanted) continue;
    const features = raw.map((bytes2) => {
      const f = reader(bytes2), feature = { type: 0, tags: {}, geometry: [] };
      while (f.more()) {
        const h = f.varint(), field = h >> 3;
        if (field === 2) {
          const pairs = packed(f.bytes());
          for (let i = 0; i < pairs.length; i += 2) feature.tags[keys[pairs[i]]] = values[pairs[i + 1]];
        } else if (field === 3) feature.type = f.varint();
        else if (field === 4) feature.geometry = packed(f.bytes());
        else f.skip(h & 7);
      }
      return feature;
    });
    return { extent, features };
  }
  return null;
}

// Geometry commands to lines of [x, y] in tile pixels. A polygon is one line per ring, without the repeated last point.
export function decodeLines(commands) {
  const lines = [];
  let x = 0, y = 0, line = null;
  for (let i = 0; i < commands.length;) {
    const c = commands[i++], op = c & 7, count = c >> 3;
    if (op === 7) continue;
    for (let n = 0; n < count; n++) {
      const dx = commands[i++], dy = commands[i++];
      x += dx % 2 ? -(dx + 1) / 2 : dx / 2;
      y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
      if (op === 1) { line = [[x, y]]; lines.push(line); }
      else line.push([x, y]);
    }
  }
  return lines;
}

const tileToGeo = (tx, ty, extent, zoom) => {
  const n = 2 ** zoom;
  return {
    toLng: (px) => (((tx + px / extent) / n) * 360) - 180,
    toLat: (py) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + py / extent)) / n))) * 180) / Math.PI,
  };
};

// The named roads in one tile as [{ name, rank, c: [lat, lng, ...] }], lower ranks being bigger roads. Only roads the maps draw.
const NAME_RANKS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
export const SERVICE_RANK = NAME_RANKS.indexOf('service');
export function namesFromTile(bytes, tx, ty, zoom = VECTOR_ZOOM) {
  const layer = readLayer(bytes, 'transportation_name');
  if (!layer) return [];
  const { toLat, toLng } = tileToGeo(tx, ty, layer.extent, zoom), lines = [];
  for (const feature of layer.features) {
    const { tags } = feature, name = tags.name || tags.ref;
    if (feature.type !== 2 || !name || !DRIVABLE.has(tags.class) || tags.indoor) continue;
    for (const line of decodeLines(feature.geometry)) {
      if (line.length > 1) lines.push({ name, rank: NAME_RANKS.indexOf(tags.class), c: line.flatMap(([x, y]) => [toLat(y), toLng(x)]) });
    }
  }
  return lines;
}

// The roads in one tile. Lines joining at a junction share a pixel, and
// that shared pixel is their node id. Roads are cut at tile edges; road.js carries the look-ahead over the cut.
export function roadsFromTile(bytes, tx, ty, zoom = VECTOR_ZOOM) {
  const layer = readLayer(bytes, 'transportation');
  if (!layer) return [];
  const { extent } = layer, ways = [];
  const { toLat, toLng } = tileToGeo(tx, ty, extent, zoom);
  let serial = 0;
  for (const feature of layer.features) {
    const { tags } = feature;
    if (feature.type !== 2 || !DRIVABLE.has(tags.class) || SKIP_SERVICE.has(tags.service) || tags.access === 'private' || tags.indoor) continue;
    const flags = (tags.brunnel === 'bridge' ? FLAG_BRIDGE : 0) | (tags.oneway === 1 || tags.oneway === -1 ? FLAG_ONEWAY : 0) | (tags.class === 'service' ? FLAG_MINOR : 0);
    for (const line of decodeLines(feature.geometry)) {
      if (line.length < 2) continue;
      if (tags.oneway === -1) line.reverse();
      ways.push({
        id: `${zoom}/${tx}/${ty}/${serial++}`,
        f: flags,
        n: line.map(([x, y]) => `${tx * extent + x}_${ty * extent + y}`),
        c: line.flatMap(([x, y]) => [Math.round(toLat(y) * 1e6) / 1e6, Math.round(toLng(x) * 1e6) / 1e6]),
      });
    }
  }
  return ways;
}
