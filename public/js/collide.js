// Nothing passes through anything in a shared world. Each game tests its own car along the whole of a frame's movement against where everything is now, and stops only
// itself: the other game is told, and stops itself too. Metres east and north from the car, so nothing here cares where on the globe it is. Pure, tested in node.
import { metresApart } from './protocol.js';

const METRES_PER_DEGREE = 111320;
const STEP = 0.75;        // m between tests along a frame's movement, shorter than any car
export const BOUNCE = 1.2; // m/s back from what was hit

// The other thing, in metres from this car: { x, y }.
export function offset(from, to) {
  return { x: (to.lng - from.lng) * METRES_PER_DEGREE * Math.cos((from.lat * Math.PI) / 180), y: (to.lat - from.lat) * METRES_PER_DEGREE };
}

// The corners' axes of a car: x along its width, y along its length, for a compass heading.
const axes = (heading) => {
  const r = (heading * Math.PI) / 180;
  return { fx: Math.sin(r), fy: Math.cos(r), rx: Math.cos(r), ry: -Math.sin(r) };
};

// Whether two cars' rectangles touch, by separating axes. a and b: { x, y, heading, halfWidth, halfLength }.
export function carsTouch(a, b) {
  const A = axes(a.heading), B = axes(b.heading), dx = b.x - a.x, dy = b.y - a.y;
  for (const [ax, ay] of [[A.fx, A.fy], [A.rx, A.ry], [B.fx, B.fy], [B.rx, B.ry]]) {
    const reachA = a.halfLength * Math.abs(A.fx * ax + A.fy * ay) + a.halfWidth * Math.abs(A.rx * ax + A.ry * ay);
    const reachB = b.halfLength * Math.abs(B.fx * ax + B.fy * ay) + b.halfWidth * Math.abs(B.rx * ax + B.ry * ay);
    if (Math.abs(dx * ax + dy * ay) > reachA + reachB) return false;
  }
  return true;
}

// Whether a car's rectangle touches a person, a circle at { x, y }.
export function carTouchesPerson(car, person, radius) {
  const { fx, fy, rx, ry } = axes(car.heading), dx = person.x - car.x, dy = person.y - car.y;
  const along = dx * fx + dy * fy, across = dx * rx + dy * ry;
  const nearestAlong = Math.max(-car.halfLength, Math.min(car.halfLength, along)), nearestAcross = Math.max(-car.halfWidth, Math.min(car.halfWidth, across));
  return Math.hypot(along - nearestAlong, across - nearestAcross) <= radius;
}

const velocity = (heading, speed) => {
  const r = (heading * Math.PI) / 180;
  return { x: Math.sin(r) * speed, y: Math.cos(r) * speed };
};

// How fast two things were coming together, in m/s: 0 if they weren't. Moving apart never counts, so nothing is ever stuck to what it hit.
export function closingSpeed(me, other, toward) {
  const a = velocity(me.heading, me.speed), b = velocity(other.heading ?? 0, other.speed ?? 0), length = Math.hypot(toward.x, toward.y) || 1;
  return Math.max(0, ((a.x - b.x) * toward.x + (a.y - b.y) * toward.y) / length);
}

// What this car hits, moving this far this frame. me: { lat, lng, heading, speed, halfWidth, halfLength }, already moved. moved: metres along its heading. obstacles: others,
// each { id, kind: 'car' | 'parked' | 'person', lat, lng, heading, speed, halfWidth, halfLength, radius }, where they are right now. Returns { other, closing, back: metres to go back } or null.
export function firstHit(me, moved, obstacles) {
  if (!obstacles.length) return null;
  const { fx, fy } = axes(me.heading), steps = Math.max(1, Math.ceil(Math.abs(moved) / STEP)), near = Math.abs(moved) + 25;
  const relevant = obstacles.map((other) => ({ other, at: offset(me, other) })).filter(({ at }) => Math.hypot(at.x, at.y) < near);
  if (!relevant.length) return null;
  for (let i = 1; i <= steps; i++) { // from the start of the frame's movement to its end, so nothing can be jumped over
    const back = moved * (1 - i / steps), body = { x: -fx * back, y: -fy * back, heading: me.heading, halfWidth: me.halfWidth, halfLength: me.halfLength };
    for (const { other, at } of relevant) {
      const touching = other.kind === 'person' ? carTouchesPerson(body, at, other.radius) : carsTouch(body, { ...at, heading: other.heading, halfWidth: other.halfWidth, halfLength: other.halfLength });
      if (!touching) continue;
      const closing = closingSpeed(me, other, { x: at.x - body.x, y: at.y - body.y });
      if (closing <= 0) continue; // already touching and moving apart
      return { other, closing, back: back + moved / steps };
    }
  }
  return null;
}

// Others' places, for the walker: those near enough to matter.
export const within = (at, list, metres) => list.filter((other) => metresApart(at, other) < metres);

// One bump per pair of things in this long, however many frames they touch. What's shown and said is once, not every frame.
export class BumpLimit {
  constructor(ms = 1000) {
    this.ms = ms;
    this.last = new Map();
  }

  allows(id, now) {
    if (now - (this.last.get(id) ?? -Infinity) < this.ms) return false;
    this.last.set(id, now);
    return true;
  }
}
