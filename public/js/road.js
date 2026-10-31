// The road network: how to find the road the car is on, look along it, and find the next turn.
// Pure, no DOM, so test/road.test.mjs can run it in node. Tile loading is in tiles.js.

export const FLAG_BRIDGE = 1, FLAG_ONEWAY = 2, FLAG_MINOR = 4; // minor: service roads, which a signal won't turn into

const M_PER_DEG = 111320;
const CELL = 0.002; // degrees of the search grid, about 200 m
const EXIT_SPACING = 8; // m between checks for a side road
const EXIT_TOUCH = 4;   // m from the path that counts as a side road joining it
const rad = (d) => (d * Math.PI) / 180;
const bearingBetween = (lat1, lng1, lat2, lng2) => {
  const dx = (lng2 - lng1) * Math.cos(rad(lat1)), dy = lat2 - lat1;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
};
const meters = (lat1, lng1, lat2, lng2) => Math.hypot((lng2 - lng1) * Math.cos(rad(lat1)), lat2 - lat1) * M_PER_DEG;
export const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const signedTurn = (from, to) => ((to - from + 540) % 360) - 180;

export class RoadNet {
  constructor() {
    this.ways = new Map();
    this.atNode = new Map(); // node id -> [{ way, index }]
    this.grid = new Map();   // cell -> [{ way, i }]
    this.serial = 0;
  }

  // Forgets everything, to release memory on long drives. Nearby tiles load again straight after.
  clear() {
    this.ways.clear();
    this.atNode.clear();
    this.grid.clear();
  }

  add(list) {
    for (const way of list) {
      if (this.ways.has(way.id)) continue;
      this.ways.set(way.id, way);
      way.serial = this.serial++;
      way.n.forEach((node, index) => {
        if (!this.atNode.has(node)) this.atNode.set(node, []);
        this.atNode.get(node).push({ way, index });
      });
      for (let i = 0; i < way.n.length - 1; i++) {
        const lat1 = way.c[i * 2], lng1 = way.c[i * 2 + 1], lat2 = way.c[i * 2 + 2], lng2 = way.c[i * 2 + 3];
        // Long segments are entered in every cell they pass through.
        const steps = Math.ceil(Math.max(Math.abs(lat2 - lat1), Math.abs(lng2 - lng1)) / CELL) + 1;
        const seen = new Set();
        for (let s = 0; s <= steps; s++) {
          const key = this.cell(lat1 + ((lat2 - lat1) * s) / steps, lng1 + ((lng2 - lng1) * s) / steps);
          if (seen.has(key)) continue;
          seen.add(key);
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push({ way, i });
        }
      }
    }
  }

  cell(lat, lng) {
    return `${Math.floor(lat / CELL)}_${Math.floor(lng / CELL)}`;
  }

  project(lat, lng, way, i) {
    const lat1 = way.c[i * 2], lng1 = way.c[i * 2 + 1], lat2 = way.c[i * 2 + 2], lng2 = way.c[i * 2 + 3];
    const k = Math.cos(rad(lat));
    const dx = (lng2 - lng1) * k, dy = lat2 - lat1;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, (((lng - lng1) * k * dx) + ((lat - lat1) * dy)) / len)) : 0;
    const pLat = lat1 + (lat2 - lat1) * t, pLng = lng1 + (lng2 - lng1) * t;
    return { t, lat: pLat, lng: pLng, dist: meters(lat, lng, pLat, pLng), bearing: bearingBetween(lat1, lng1, lat2, lng2) };
  }

  // The road the car is on: near it and pointing the same way. `recent` is the ways the last look-ahead
  // crossed; favouring them keeps the car on its road where others run close by.
  match(lat, lng, heading, recent = null, radius = 30, exclude = null) {
    const cy = Math.floor(lat / CELL), cx = Math.floor(lng / CELL);
    let best = null;
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (const { way, i } of this.grid.get(`${y}_${x}`) || []) {
          if (way === exclude) continue;
          const p = this.project(lat, lng, way, i);
          if (p.dist > radius) continue;
          const oneway = way.f & FLAG_ONEWAY;
          const forward = angleDiff(heading, p.bearing), backward = angleDiff(heading, p.bearing + 180);
          const dir = oneway || forward <= backward ? 1 : -1;
          const diff = dir === 1 ? forward : backward;
          if (diff > 55) continue;
          const score = p.dist + diff * 0.4 - (recent && recent.has(way) ? 12 : 0);
          if (!best || score < best.score) {
            best = { score, way, i, t: p.t, dir, dist: p.dist, lat: p.lat, lng: p.lng, bearing: dir === 1 ? p.bearing : (p.bearing + 180) % 360, bridge: !!(way.f & FLAG_BRIDGE) };
          }
        }
      }
    }
    return best;
  }

  // Each point further along a road from a position on it, until `distance` metres have passed. At the end of
  // a way it carries on along the straightest connecting way; it stops at dead ends and sharp turns.
  *walk(start, distance) {
    let { way, dir, k, lat, lng, bearing } = start;
    let travelled = 0;
    for (let guard = 0; guard < 5000; guard++) {
      const vLat = way.c[k * 2], vLng = way.c[k * 2 + 1];
      const step = meters(lat, lng, vLat, vLng);
      if (step > 0.01) bearing = bearingBetween(lat, lng, vLat, vLng);
      travelled += step;
      yield { lat: vLat, lng: vLng, fromLat: lat, fromLng: lng, way, dir, k, bearing, step, travelled };
      if (travelled >= distance) return;
      lat = vLat; lng = vLng;
      const next = k + dir;
      if (next >= 0 && next < way.n.length) { k = next; continue; }
      const on = this.continuation(way, way.n[k], lat, lng, bearing);
      if (!on) return;
      ({ way, dir, k } = on);
    }
  }

  // The point `distance` metres further along the road.
  ahead(m, distance) {
    const ways = new Set([m.way]);
    let last = { lat: m.lat, lng: m.lng, bearing: m.bearing, way: m.way };
    for (const p of this.walk(this.startOf(m), distance)) {
      ways.add(p.way);
      last = p;
      if (p.travelled >= distance && p.step > 0) {
        const f = (distance - (p.travelled - p.step)) / p.step;
        return { lat: p.fromLat + (p.lat - p.fromLat) * f, lng: p.fromLng + (p.lng - p.fromLng) * f, bearing: p.bearing, ways, oneway: !!(p.way.f & FLAG_ONEWAY) };
      }
    }
    return { lat: last.lat, lng: last.lng, bearing: last.bearing, ways, oneway: !!(last.way.f & FLAG_ONEWAY) };
  }

  startOf(m) {
    return { way: m.way, dir: m.dir, k: m.dir === 1 ? m.i + 1 : m.i, lat: m.lat, lng: m.lng, bearing: m.bearing };
  }

  continuation(from, node, lat, lng, bearing) {
    let best = null;
    for (const { way, index } of this.atNode.get(node) || []) {
      if (way === from) continue;
      for (const dir of [1, -1]) {
        const k = index + dir;
        if (k < 0 || k >= way.n.length || (dir === -1 && way.f & FLAG_ONEWAY)) continue;
        const turn = angleDiff(bearing, bearingBetween(lat, lng, way.c[k * 2], way.c[k * 2 + 1]));
        if (turn <= 75 && (!best || turn < best.turn)) best = { turn, way, dir, k };
      }
    }
    if (best) return best;
    // No shared node: a road cut at a tile edge carries on in the next tile, passing through this same spot.
    const m = this.match(lat, lng, bearing, null, 4, from);
    return m && { way: m.way, dir: m.dir, k: m.dir === 1 ? m.i + 1 : m.i };
  }

  // The next road off to one side (-1 left, 1 right), at least `minAhead` metres on, so the car has room to
  // slow down, and within `reach`. Returns the points to drive: along this road, round the turn and a bit beyond.
  findTurn(m, side, reach, minAhead = 0, beyond = 200) {
    const points = [{ lat: m.lat, lng: m.lng }];
    for (const p of this.walk(this.startOf(m), reach)) {
      const pieces = Math.max(1, Math.ceil(p.step / EXIT_SPACING));
      for (let s = 1; s <= pieces; s++) {
        const f = s / pieces;
        const here = { lat: p.fromLat + (p.lat - p.fromLat) * f, lng: p.fromLng + (p.lng - p.fromLng) * f };
        const travelled = p.travelled - p.step * (1 - f);
        if (travelled > reach) return null;
        if (travelled < minAhead) continue;
        const exit = this.exitAt(here, p.way, p.bearing, side);
        if (!exit) continue;
        points.push(here, { lat: exit.lat, lng: exit.lng });
        for (const q of this.walk(exit, beyond)) points.push({ lat: q.lat, lng: q.lng });
        return { points, at: travelled };
      }
      points.push({ lat: p.lat, lng: p.lng });
    }
    return null;
  }

  // The road leaving this point on the given side, nearest to a square turn. Found by touching rather than by shared
  // nodes, because vector tiles drop the vertex where a side street meets a straight road.
  exitAt(here, along, bearing, side) {
    const cy = Math.floor(here.lat / CELL), cx = Math.floor(here.lng / CELL);
    let best = null;
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (const { way, i } of this.grid.get(`${y}_${x}`) || []) {
          if (way === along || way.f & FLAG_MINOR) continue;
          const p = this.project(here.lat, here.lng, way, i);
          if (p.dist > EXIT_TOUCH) continue;
          for (const dir of [1, -1]) {
            if (dir === -1 && way.f & FLAG_ONEWAY) continue;
            const k = dir === 1 ? i + 1 : i;
            const vLat = way.c[k * 2], vLng = way.c[k * 2 + 1];
            if (meters(p.lat, p.lng, vLat, vLng) < 1.5) continue; // at this segment's end; the next segment covers it
            const leaving = bearingBetween(p.lat, p.lng, vLat, vLng);
            const turn = signedTurn(bearing, leaving) * side;
            if (turn < 25 || turn > 155) continue;
            if (!best || Math.abs(turn - 90) < best.score) best = { score: Math.abs(turn - 90), way, dir, k, lat: p.lat, lng: p.lng, bearing: leaving };
          }
        }
      }
    }
    return best;
  }

  // Calls fn(way, segment) once for each road piece within about `distance` metres, for drawing.
  forEachSegmentNear(lat, lng, distance, fn) {
    const span = Math.ceil(distance / (M_PER_DEG * CELL));
    const spanLng = Math.ceil(span / Math.cos(rad(lat)));
    const cy = Math.floor(lat / CELL), cx = Math.floor(lng / CELL);
    const seen = new Set();
    for (let y = cy - span; y <= cy + span; y++) {
      for (let x = cx - spanLng; x <= cx + spanLng; x++) {
        for (const { way, i } of this.grid.get(`${y}_${x}`) || []) {
          const key = way.serial * 100000 + i; // a number: this runs thousands of times per draw
          if (seen.has(key)) continue;
          seen.add(key);
          fn(way, i);
        }
      }
    }
  }

  // The closest road point, for placing the car. Heading runs along the road, as near `prefer` as it can.
  nearest(lat, lng, prefer = null, maxDistance = 3000) {
    let best = null;
    for (const way of this.ways.values()) {
      for (let i = 0; i < way.n.length - 1; i++) {
        const p = this.project(lat, lng, way, i);
        if (p.dist <= maxDistance && (!best || p.dist < best.dist)) best = { ...p, way };
      }
    }
    if (!best) return null;
    let heading = best.bearing;
    if (!(best.way.f & FLAG_ONEWAY) && prefer !== null && angleDiff(prefer, heading) > 90) heading = (heading + 180) % 360;
    return { lat: best.lat, lng: best.lng, heading, dist: best.dist };
  }
}
