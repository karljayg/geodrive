// The cars of a shared world. Each is planted by a hash of its place on the road, so everyone sees the same ones with nothing stored, until someone touches one.
// Pure, tested in node. Keeping them on the server is in sharedWorld.js, drawing them in peopleView.js.
import { GAME } from './gameConfig.js';
import { FLAG_BRIDGE } from './road.js';

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

// The cars along these road ways, from one map tile. Bridges have none. Which side, and how far along, come from the way's own first point, so a way is planted the same for everyone.
export function plantCars(ways, config = GAME.worldCars) {
  const cars = new Map();
  for (const { c, f } of ways) {
    if (f & FLAG_BRIDGE || c.length < 4) continue;
    const roll = rolls(`way:${c[0]},${c[1]}`), side = roll() < 0.5 ? 1 : -1;
    let walked = 0, next = roll() * config.every;
    for (let i = 0; i + 3 < c.length; i += 2) {
      const lat0 = c[i], lng0 = c[i + 1], lat1 = c[i + 2], lng1 = c[i + 3], length = metresBetween(lat0, lng0, lat1, lng1);
      while (length > 0 && next <= walked + length) {
        const t = (next - walked) / length, north = (lat1 - lat0) * METRES_PER_DEGREE, east = (lng1 - lng0) * METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
        const heading = ((Math.atan2(east, north) * 180) / Math.PI + (side < 0 ? 180 : 0) + 360) % 360;
        const offNorth = (-east / length) * config.kerb * side, offEast = (north / length) * config.kerb * side;
        const lat = lat0 + (lat1 - lat0) * t + offNorth / METRES_PER_DEGREE, lng = lng0 + (lng1 - lng0) * t + offEast / (METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180));
        const car = plantedAt(lat, lng, heading, config);
        cars.set(car.id, car);
        next += config.every * (0.6 + roll() * 0.8);
      }
      walked += length;
    }
  }
  return [...cars.values()];
}

// A running car for someone with none in walking distance, at this place on the road.
export function rescueCar(lat, lng, heading, nonce, config = GAME.worldCars) {
  return { ...plantedAt(lat, lng, heading, config), id: `x_${nonce}`, runs: true, why: null, fuel: 80 };
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
