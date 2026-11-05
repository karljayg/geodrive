// Where the scope mark sits on screen, and the ground it shoots at. The same projection as the chase camera in main.js. Pure, tested in node.
import { leadDistance } from './camera.js';

const FEET_ABOVE = 0.025; // of the screen height, matching the headlight placement: feet sit a little above the ground's middle
const rad = (degrees) => (degrees * Math.PI) / 180;

function viewScale(view) {
  return view.height / (2 * Math.tan(rad(view.fovY) / 2));
}

// Where a point on the ground, metres ahead of and to the right of the person, falls on screen.
export function screenOfGround(ahead, side, view) {
  const scale = viewScale(view), t = rad(view.tilt);
  const fromCentre = ahead - leadDistance(view.range, view.tilt, view.fovY, view.below);
  const depth = view.range + fromCentre * Math.sin(t);
  if (depth < view.range * 0.2) return null;
  return {
    x: view.width / 2 + (scale * side) / depth,
    y: view.height * (0.5 - FEET_ABOVE) - (scale * fromCentre * Math.cos(t)) / depth,
  };
}

// The ground under a screen pixel, in metres ahead of and to the right of the person. Null when the pixel looks above the ground.
export function groundOfScreen(x, y, view) {
  const scale = viewScale(view), t = rad(view.tilt);
  const nx = x - view.width / 2;
  const ny = view.height * (0.5 - FEET_ABOVE) - y;
  const denom = scale * Math.cos(t) - ny * Math.sin(t);
  if (Math.abs(denom) < 1e-6) return null;
  const fromCentre = (ny * view.range) / denom;
  const depth = view.range + fromCentre * Math.sin(t);
  if (depth < view.range * 0.2) return null;
  return { ahead: fromCentre + leadDistance(view.range, view.tilt, view.fovY, view.below), side: (nx * depth) / scale };
}

// The shot through that pixel: metres from the person (x east, y north) and the bearing they should face. yaw is the camera, radians, 0 north.
export function aimOf(x, y, yaw, view) {
  const ground = groundOfScreen(x, y, view);
  if (!ground) return { yaw, point: null, ahead: 0, side: 0 };
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const point = { x: sin * ground.ahead + cos * ground.side, y: cos * ground.ahead - sin * ground.side };
  const dist = Math.hypot(point.x, point.y);
  return { yaw: dist > 0.15 ? Math.atan2(point.x, point.y) : yaw, point, ahead: ground.ahead, side: ground.side };
}

// Moves the mark by mouse pixels from the centre of the view. Past the edge, the view turns (lookX, radians).
export function stepAim(aim, dx, dy, width, height, sensitivity) {
  const maxX = Math.max(24, width * 0.42), maxY = Math.max(24, height * 0.42);
  let x = aim.x + dx, y = aim.y + dy, overflow = 0;
  if (x > maxX) { overflow = x - maxX; x = maxX; }
  else if (x < -maxX) { overflow = x + maxX; x = -maxX; }
  aim.x = x;
  aim.y = Math.max(-maxY, Math.min(maxY, y));
  return { lookX: overflow * sensitivity };
}

// How far along the ray (0 at the camera, 1 at the ground) a shot passes through a creature, or null.
// `at` is its feet, x east and y north, in the same frame as eye and end. height is metres.
export function shotHits(eye, end, at, radius, height) {
  const dx = end.x - eye.x, dy = end.y - eye.y, dz = end.z - eye.z;
  if (Math.abs(dz) < 1e-6 || !(radius > 0) || !(height > 0)) return null;
  const t0 = (end.z - eye.z) / dz;
  const t1 = (end.z + height - eye.z) / dz;
  const a = Math.max(0, Math.min(t0, t1));
  const b = Math.min(1, Math.max(t0, t1));
  if (a > b) return null;
  const len2 = dx * dx + dy * dy;
  let t = len2 < 1e-8 ? a : ((at.x - eye.x) * dx + (at.y - eye.y) * dy) / len2;
  t = Math.max(a, Math.min(b, t));
  const px = eye.x + t * dx, py = eye.y + t * dy;
  return Math.hypot(px - at.x, py - at.y) <= radius ? t : null;
}

// The first creature the shot meets. Each one has x, y, radius and body (metres).
export function firstInShot(eye, end, animals) {
  let best = null, bestT = Infinity;
  for (const animal of animals) {
    const t = shotHits(eye, end, animal, animal.radius, animal.body);
    if (t != null && t < bestT) { best = animal; bestT = t; }
  }
  return best;
}
