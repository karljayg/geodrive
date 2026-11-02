// What wear and crashes do to a car and those in it, as one formula from speed: a little at low speed, rising with its square, and a whole car at the deadly speed. It's kinder
// than real life on purpose. All numbers are in gameConfig.js. Pure, tested in node.
import { GAME } from './gameConfig.js';
import { CAR } from './physics.js';

const METRES_PER_DEGREE = 111320;

// Damage to a car from a crash at this closing speed in mph: 0 to 100.
export const carDamageAt = (mph, { crash } = GAME) => Math.min(100, (mph / crash.carDeadlyMph) ** 2 * 100);
// Health lost by those in it. A person hit stands much less.
export const healthLossInCar = (mph, { crash } = GAME) => Math.min(100, (mph / crash.carDeadlyMph) ** 2 * crash.carHealthLoss);
export const healthLossHit = (mph, { crash } = GAME) => Math.min(100, (mph / crash.personDeadlyMph) ** 2 * crash.personHealthLoss);

export const drivable = (condition, { damage } = GAME) => (condition ?? 100) > damage.notDrivableAt;

// How well it goes: full power until it's badly worn, then less.
export function powerOf(condition, { damage } = GAME) {
  const c = condition ?? 100;
  if (c >= damage.unreliableBelow) return 1;
  return Math.max(damage.leastPower, c / damage.unreliableBelow);
}

// Badly worn, the engine cuts out for moments at a time. seconds: the time; the pattern depends only on that, so it isn't saved.
export function cutsOut(condition, seconds, { damage } = GAME) {
  const c = condition ?? 100;
  if (c >= damage.unreliableBelow) return false;
  const severity = 1 - c / damage.unreliableBelow, phase = (seconds * 0.37 + Math.sin(seconds * 1.7) * 0.5) % 1;
  return phase < severity * damage.mostCutOut;
}

export function reliabilityText(condition, { damage } = GAME) {
  const c = condition ?? 100;
  if (c <= damage.notDrivableAt) return 'Won\'t run';
  if (c < damage.unreliableBelow) return 'Unreliable';
  return c < damage.wornBelow ? 'Worn' : 'Good';
}

// Off road, a car wears a little with every metre, and is held back while moving.
export const offRoadWear = (metres, { damage } = GAME) => (Math.abs(metres) / 1000) * damage.offRoadPerKm;
export const offRoadSlowing = (speed, dt, { damage } = GAME) => speed * Math.max(0, 1 - damage.offRoadDrag * dt);

// A driver gone without warning: the engine's off and the car rolls on in a straight line until it stops. { seconds, metres } to the stop.
export function coastDistance(speed, spec = CAR) {
  let v = Math.abs(speed), metres = 0, seconds = 0;
  const dt = 0.1;
  while (v > 0.05 && seconds < 300) {
    v = Math.max(0, v - (spec.rolling + spec.aero * v * v + GAME.damage.coastBrake) * dt);
    metres += v * dt;
    seconds += dt;
  }
  return { seconds, metres };
}

// Where a coasting car is by now. coast: { lat, lng, heading, speed, at }, at in ms. Stops at its end.
export function coastPlace(coast, now, spec = CAR) {
  const elapsed = Math.max(0, (now - coast.at) / 1000), { seconds, metres } = coastDistance(coast.speed, spec);
  const t = seconds > 0 ? Math.min(1, elapsed / seconds) : 1, along = metres * (1 - (1 - t) ** 2) * Math.sign(coast.speed || 1), r = (coast.heading * Math.PI) / 180;
  return {
    lat: coast.lat + (Math.cos(r) * along) / METRES_PER_DEGREE,
    lng: coast.lng + (Math.sin(r) * along) / (METRES_PER_DEGREE * Math.cos((coast.lat * Math.PI) / 180)),
    heading: coast.heading, speed: t < 1 ? coast.speed * (1 - t) : 0, done: t >= 1,
  };
}
