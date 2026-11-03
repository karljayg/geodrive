// Where to fill up, from the same free map tiles as the roads: real gas stations and public chargers. About half of the gas stations are out of order, by a hash of the place, so it's the same for
// everyone and nothing is stored. Those that work have a charger too, as most don't have one on the map. Pure, tested in node.
import { GAME } from './gameConfig.js';
import { decodeLines, readLayer, tileToGeo, VECTOR_ZOOM } from './vector.js';

const METRES_PER_DEGREE = 111320;

function chance(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// What's in one map tile: [{ lat, lng, kind: 'fuel' | 'charger', name }].
export function stationsFromTile(bytes, tx, ty, zoom = VECTOR_ZOOM) {
  const layer = readLayer(bytes, 'poi');
  if (!layer) return [];
  const { toLat, toLng } = tileToGeo(tx, ty, layer.extent, zoom), found = [];
  for (const { tags, type, geometry } of layer.features) {
    if (type !== 1 || tags.class !== 'fuel') continue;
    for (const [[x, y]] of decodeLines(geometry)) found.push({ lat: toLat(y), lng: toLng(x), kind: tags.subclass === 'charging_station' ? 'charger' : 'fuel', name: tags.name || null });
  }
  return found;
}

const keyOf = ({ lat, lng }) => `${Math.round(lat * 5000)}_${Math.round(lng * 5000)}`;
const apart = (a, b) => Math.hypot((a.lat - b.lat) * METRES_PER_DEGREE, (a.lng - b.lng) * METRES_PER_DEGREE * Math.cos((a.lat * Math.PI) / 180));

// Whether a gas station is working, the same for everyone.
export const stationWorks = (station, config = GAME.stations) => chance(`station:${keyOf(station)}`) < config.workingChance;

// The nearest place that could serve a car here, or null: { station, works, say }. electric: a charger is wanted, at a real one or at a gas station, where a charger is imagined beside it.
export function stationFor(at, stations, electric, config = GAME.stations) {
  const usable = stations.filter((station) => (electric ? true : station.kind === 'fuel')).map((station) => ({ station, away: apart(at, station) })).filter(({ away }) => away <= config.within).sort((a, b) => a.away - b.away);
  if (!usable.length) return null;
  const real = electric && usable.find(({ station }) => station.kind === 'charger');
  const { station } = real || usable[0];
  return { station, works: station.kind === 'charger' || stationWorks(station, config) };
}

// A tile's building outlines, for what cars can hit: rings of [lng, lat], only those standing on the ground, as something up on stilts can be driven under. Outer edges only: a courtyard is solid too.
export function footprintsFromTile(bytes, tx, ty, zoom = VECTOR_ZOOM) {
  const layer = readLayer(bytes, 'building');
  if (!layer) return [];
  const { toLat, toLng } = tileToGeo(tx, ty, layer.extent, zoom), rings = [];
  for (const { tags, type, geometry } of layer.features) {
    if (type !== 3 || tags.hide_3d || (tags.render_min_height ?? 0) > GAME.damage.buildingClearance) continue;
    for (const line of decodeLines(geometry)) {
      let area = 0;
      for (let i = 0, j = line.length - 1; i < line.length; j = i++) area += line[j][0] * line[i][1] - line[i][0] * line[j][1];
      if (area > 0 && line.length >= 3) rings.push(line.map(([x, y]) => [toLng(x), toLat(y)])); // positive in tile pixels is an outer ring
    }
  }
  return rings;
}

// A tile's water, for what cars can hit: rings of [lng, lat], outer edges only. Not pools, which a car can't tell from a yard, nor streams that run dry or go underground.
export function waterFromTile(bytes, tx, ty, zoom = VECTOR_ZOOM) {
  const layer = readLayer(bytes, 'water');
  if (!layer) return [];
  const { toLat, toLng } = tileToGeo(tx, ty, layer.extent, zoom), rings = [];
  for (const { tags, type, geometry } of layer.features) {
    if (type !== 3 || tags.class === 'swimming_pool' || tags.intermittent || tags.brunnel) continue;
    for (const line of decodeLines(geometry)) {
      let area = 0;
      for (let i = 0, j = line.length - 1; i < line.length; j = i++) area += line[j][0] * line[i][1] - line[i][0] * line[j][1];
      if (area > 0 && line.length >= 3) rings.push(line.map(([x, y]) => [toLng(x), toLat(y)]));
    }
  }
  return rings;
}
