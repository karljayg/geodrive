// The cars of a shared world. Each is planted by a hash of its place in a car park, a driveway or at a quiet kerb, so everyone sees the same ones with nothing stored, until someone touches one.
// Pure, tested in node. Keeping them on the server is in sharedWorld.js, drawing them in peopleView.js.
import { GAME } from './gameConfig.js';

const METRES_PER_DEGREE = 111320;
const ID_GRID = 2e-5; // degrees, about 2 m, as buildings' ids
const TYPES = ['sport', 'muscle', 'hatch', 'hatch', 'hatch', 'truck', 'electric'];
const COLOURS = ['#c9ccd1', '#2b2e33', '#f2f2f0', '#8a1c1c', '#1f3f73', '#3d5a45', '#b8a06a', '#5c6670', '#d9772b', '#0dbf8c'];
export const CAR_REASONS = ['carNoKey', 'carFlatBattery', 'carNoFuel', 'carBroken'];

function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Rolls from 0 to 1, the same every time for the same text.
function rolls(text) {
  let s = hashOf(text);
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const metresBetween = (lat0, lng0, lat1, lng1) => Math.hypot((lat1 - lat0) * METRES_PER_DEGREE, (lng1 - lng0) * METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180));

// What a car is like, from its id.
function plantedAt(lat, lng, heading, config) {
  const id = `p_${Math.round(lat / ID_GRID)}_${Math.round(lng / ID_GRID)}`, roll = rolls(id);
  const runs = roll() < config.runningChance;
  const storage = roll() < config.hammerChance ? [{ id: GAME.hammer.item, name: GAME.hammer.item, count: 1 }] : [];
  return {
    id, lat, lng, heading, type: TYPES[Math.floor(roll() * TYPES.length)], colour: COLOURS[Math.floor(roll() * COLOURS.length)], runs,
    why: runs ? null : CAR_REASONS[Math.floor(roll() * CAR_REASONS.length)], fuel: Math.round(25 + roll() * 70), storage,
  };
}

// Steps along a line: calls at(lat, lng, heading, rightNorth, rightEast, cos) every `gap` metres, the first `first` metres in, where right* is a unit step to the right in metres.
function along(c, first, gap, at) {
  let walked = 0, next = first;
  for (let i = 0; i + 3 < c.length; i += 2) {
    const lat0 = c[i], lng0 = c[i + 1], lat1 = c[i + 2], lng1 = c[i + 3], length = metresBetween(lat0, lng0, lat1, lng1);
    const cos = Math.cos((lat0 * Math.PI) / 180), north = (lat1 - lat0) * METRES_PER_DEGREE, east = (lng1 - lng0) * METRES_PER_DEGREE * cos;
    while (length > 0 && next <= walked + length) {
      const t = (next - walked) / length;
      at(lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t, ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360, -east / length, north / length, cos);
      next += gap();
    }
    walked += length;
  }
  return walked;
}

const lengthOf = (c) => along(c, Infinity, () => 1, () => {});
const shifted = (lat, lng, cos, north, east) => [lat + north / METRES_PER_DEGREE, lng + east / (METRES_PER_DEGREE * cos)];

// The cars a map tile holds, all where a car is meant to be left: in the bays either side of a car park's aisles, at the top of driveways,
// and at the kerb of quiet streets, away from their ends, where junctions are. Never on a busy road. parking: what parkingFromTile reads.
// Which bays are taken comes from the line's own first point, so a tile is planted the same for everyone.
export function plantCars({ aisles = [], driveways = [], kerbs = [] }, config = GAME.worldCars) {
  const cars = new Map(), plant = (lat, lng, heading) => { const car = plantedAt(lat, lng, (heading + 360) % 360, config); cars.set(car.id, car); };
  for (const c of aisles) {
    if (c.length < 4) continue;
    const roll = rolls(`aisle:${c[0]},${c[1]}`);
    along(c, config.bay / 2, () => config.bay, (lat, lng, heading, rightN, rightE, cos) => {
      for (const side of [1, -1]) if (roll() < config.bayTaken) plant(...shifted(lat, lng, cos, rightN * config.bayOut * side, rightE * config.bayOut * side), heading + (roll() < 0.5 ? 90 : -90));
    });
  }
  for (const c of driveways) {
    if (c.length < 4) continue;
    const roll = rolls(`drive:${c[0]},${c[1]}`), length = lengthOf(c);
    if (length < config.driveMin || roll() >= config.driveTaken) continue;
    // Up the driveway, short of its far end, which is the garage or the house. Facing the house, as people pull in.
    along(c, Math.max(config.driveMin / 2, length - config.driveBack), () => Infinity, (lat, lng, heading) => plant(lat, lng, heading));
  }
  for (const c of kerbs) {
    if (c.length < 4) continue;
    const roll = rolls(`kerb:${c[0]},${c[1]}`), length = lengthOf(c), side = roll() < 0.5 ? 1 : -1;
    along(c, config.clearOfEnds + roll() * config.every, () => config.every * (0.6 + roll() * 0.8), (lat, lng, heading, rightN, rightE, cos) => {
      if (metresBetween(lat, lng, c[c.length - 2], c[c.length - 1]) < config.clearOfEnds || length < config.clearOfEnds * 2) return;
      // On the right, facing the way traffic goes on that side.
      plant(...shifted(lat, lng, cos, rightN * config.kerb * side, rightE * config.kerb * side), heading + (side < 0 ? 180 : 0));
    });
  }
  return [...cars.values()];
}

// A running car for someone with none in walking distance, near this place on the road.
// It's pulled in to the kerb on the right, not left in the lane.
export function rescueCar(lat, lng, heading, nonce, config = GAME.worldCars) {
  const r = (heading * Math.PI) / 180, [kLat, kLng] = shifted(lat, lng, Math.cos((lat * Math.PI) / 180), -Math.sin(r) * config.kerb, Math.cos(r) * config.kerb);
  return { ...plantedAt(kLat, kLng, heading, config), id: `x_${nonce}`, runs: true, why: null, fuel: 80 };
}

// A planted car over its server record, once someone has touched it: the record wins.
export const merged = (planted, record) => ({ ...planted, ...record });

// What the server keeps of a car, checked, as anyone can send anything. Null if it isn't one.
const okType = (type) => typeof type === 'string' && TYPES.includes(type), okColour = (colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour);
export function cleanCar(car) {
  if (!car || typeof car.id !== 'string' || !/^(p_-?\d{1,9}_-?\d{1,9}|x_[\w-]{1,40})$/.test(car.id)) return null;
  if (![car.lat, car.lng, car.heading, car.fuel].every(Number.isFinite) || Math.abs(car.lat) > 90 || Math.abs(car.lng) > 180) return null;
  if (!okType(car.type) || !okColour(car.colour) || typeof car.runs !== 'boolean') return null;
  return { id: car.id, lat: car.lat, lng: car.lng, heading: car.heading, fuel: Math.max(0, Math.min(100, car.fuel)), type: car.type, colour: car.colour, runs: car.runs, why: typeof car.why === 'string' ? car.why.slice(0, 40) : null, storage: cleanStorage(car.storage) ?? [], version: 0, driver: null };
}

// A car's storage, checked: 60 kinds of thing at most, each with a name and a count.
export function cleanStorage(storage) {
  if (!Array.isArray(storage) || storage.length > 60) return null;
  if (!storage.every((item) => typeof item?.id === 'string' && item.id.length <= 60 && Number.isInteger(item.count) && item.count > 0 && item.count < 100000)) return null;
  return storage.map(({ id, name, count }) => ({ id, name: typeof name === 'string' ? name.slice(0, 60) : id, count }));
}
