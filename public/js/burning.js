// What burns and for how long: a wrecked car, and a building shot at until it smokes and then burns. The same in the browser and on the
// world server, which decides in a shared world. Times are in ms, and msPerHour turns game hours into them. Pure, tested in node.
import { GAME } from './gameConfig.js';

export const FIRE_STORE = 'geodrive_fires_v1';
const RINGS_MOST = 6, POINTS_MOST = 120, REACH_MOST = 250; // m from its middle, for a building's outline
const BUILDING_ID = /^-?\d{1,9}_-?\d{1,9}$/;
const METRES_PER_DEGREE = 111320;

// Game hours in ms of the clock everyone shares: a shared world's rate, or the sandbox's on foot, where shooting happens.
export const msPerHour = (shared, game = GAME) => (shared ? 3600000 / Math.max(0.01, game.world.clockRate) : 60000 / Math.max(0.01, game.clock.onFootHoursPerMinute));

// A wreck burns for carFireHours after it went up, then stays a charred shell. A wreck from before fires were kept is charred already.
export function carFireStage(car, now, perHour, rules = GAME.burning) {
  if (!car?.wrecked) return null;
  if (!Number.isFinite(car.wreckedAt)) return 'charred';
  return now - car.wreckedAt < rules.carFireHours * perHour ? 'fire' : 'charred';
}

// When a building caught, from enough shots or from smoking long enough, or null.
export function fireStarted(fire, perHour, rules = GAME.burning) {
  const caught = [fire?.fireAt, Number.isFinite(fire?.smokeAt) ? fire.smokeAt + rules.smokeToFireHours * perHour : null].filter(Number.isFinite);
  return caught.length ? Math.min(...caught) : null;
}

// null, 'smoke', 'fire' or 'charred'. A building burns for buildingFireHours and then is a charred mess for good.
export function buildingStage(fire, now, perHour, rules = GAME.burning) {
  if (!fire) return null;
  const caught = fireStarted(fire, perHour, rules);
  if (caught !== null && now >= caught) return now - caught < rules.buildingFireHours * perHour ? 'fire' : 'charred';
  return Number.isFinite(fire.smokeAt) && now >= fire.smokeAt ? 'smoke' : null;
}

// One round into a building. Each counts its gun's damage; at smokeShots it smokes and at fireShots it burns. Once burning, shots do nothing.
// shape: { id, lat, lng, rings, height }, used the first time. Returns the new record, and whether what it looks like has changed.
export function shootBuilding(fire, shape, damage, now, perHour, rules = GAME.burning) {
  const before = buildingStage(fire, now, perHour, rules);
  if (before === 'fire' || before === 'charred') return { fire, changed: false };
  const next = { ...(fire ?? shape), shots: (fire?.shots ?? 0) + Math.max(1, Number(damage) || 1) };
  if (!Number.isFinite(next.smokeAt) && next.shots >= rules.smokeShots) next.smokeAt = now;
  if (!Number.isFinite(next.fireAt) && next.shots >= rules.fireShots) next.fireAt = now;
  return { fire: next, changed: buildingStage(next, now, perHour, rules) !== before };
}

const okNumber = (n, most) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= most;
const apart = (a, b) => Math.hypot((a.lat - b.lat) * METRES_PER_DEGREE, (a.lng - b.lng) * METRES_PER_DEGREE * Math.cos((a.lat * Math.PI) / 180));

// A building's shape as a game sent it, or null. rings: outer rings as [lat, lng] pairs, the whole of it within REACH_MOST of its middle.
export function cleanFireShape(shape) {
  if (!shape || typeof shape.id !== 'string' || !BUILDING_ID.test(shape.id) || !okNumber(shape.lat, 90) || !okNumber(shape.lng, 180)) return null;
  if (!okNumber(shape.height, 400) || shape.height < 2 || !Array.isArray(shape.rings) || !shape.rings.length || shape.rings.length > RINGS_MOST) return null;
  let points = 0;
  const rings = [];
  for (const ring of shape.rings) {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    points += ring.length;
    if (points > POINTS_MOST) return null;
    const clean = [];
    for (const point of ring) {
      if (!Array.isArray(point) || !okNumber(point[0], 90) || !okNumber(point[1], 180)) return null;
      if (apart({ lat: point[0], lng: point[1] }, shape) > REACH_MOST) return null;
      clean.push([point[0], point[1]]);
    }
    rings.push(clean);
  }
  return { id: shape.id, lat: shape.lat, lng: shape.lng, rings, height: Math.round(shape.height * 10) / 10 };
}

// How far its outline reaches from its middle, in m.
export function fireReach(fire) {
  return Math.max(...fire.rings.flat().map(([lat, lng]) => apart({ lat, lng }, fire)));
}

// Fewer points for a long outline, keeping its shape, so a record stays small: every n-th corner.
export function thinRing(points, most) {
  if (points.length <= most) return points;
  const step = points.length / most;
  return Array.from({ length: most }, (_, i) => points[Math.floor(i * step)]);
}

export function insideRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Where flames stand on a footprint: a grid over it, kept to the inside, spaced for about `most` of them. rings are [x, y] in metres.
export function flameSpots(rings, most = 9) {
  const all = rings.flat(), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const area = rings.reduce((sum, ring) => sum + Math.abs(ring.reduce((a, p, i) => a + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0) / 2), 0);
  const step = Math.max(2.5, Math.sqrt(area / most));
  const spots = [];
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let y = minY + step / 2; y < maxY; y += step) if (rings.some((ring) => insideRing(ring, x, y))) spots.push({ x, y });
  }
  if (!spots.length) spots.push({ x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length });
  return spots.slice(0, most * 2);
}

// The sandbox's fires, kept in this browser. A shared world's are the server's (sharedWorld.js).
export class LocalFires {
  constructor(storage) {
    this.list = new Map();
    try {
      this.storage = storage === undefined ? localStorage : storage;
      for (const fire of JSON.parse(this.storage?.getItem(FIRE_STORE) ?? '[]')) this.list.set(fire.id, fire);
    } catch (err) {
      console.warn('saved fires:', err);
    }
  }

  get(id) {
    return this.list.get(id) ?? null;
  }

  all() {
    return [...this.list.values()];
  }

  // A round into a building here. Returns { fire, changed } as shootBuilding does.
  shoot(shape, damage, now, perHour) {
    const out = shootBuilding(this.get(shape.id), shape, damage, now, perHour);
    this.list.set(shape.id, out.fire);
    try {
      this.storage?.setItem(FIRE_STORE, JSON.stringify(this.all()));
    } catch (err) {
      console.warn('saving fires:', err);
    }
    return out;
  }
}
