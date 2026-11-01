// The person on foot: where they stand, how they step, and which chunks of the walk are in view.
// Pure. x is east, z is north, y is metres above the ground the car was parked on. Yaw 0 looks north.
import { CHUNK, contains, distToSeg, pointInRing, wallSegments } from './place.js';

export { CHUNK };
export const VIEW_RADIUS = groundView(130, 62, 35); // the closest chase camera: range 130, tilt 62°, fov 35°
export const WALK_SPEED = 1.45;
export const RUN_SPEED = 4;
export const PERSON_RADIUS = 0.35;
export const STEP_UP = 0.4;
export const RETURN_DISTANCE = 3;
export const STRIDE = 1.35;
const SPAWN = 2.2;
const DOOR_WAIT = 0.35;
const NUDGE = PERSON_RADIUS + 0.5;
const WALK_UNDER = 2.2; // a building whose floor is above this is a roof; the person walks under it

// How far along the ground the closest drive camera can see, in metres.
export function groundView(range, tiltDeg, fovDeg) {
  const tilt = tiltDeg * Math.PI / 180;
  const depression = Math.PI / 2 - tilt;
  const upper = Math.max(0.05, depression - (fovDeg * Math.PI / 180) / 2);
  const height = range * Math.cos(tilt);
  const back = range * Math.sin(tilt);
  return Math.round(height / Math.tan(upper) - back);
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function canLeaveCar(mps) {
  return Math.abs(mps) * 2.23694 < 1;
}

export function carRing(headingDeg, shape) {
  const h = headingDeg * Math.PI / 180;
  const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  const { w, l } = shape;
  return [
    { x: fx * l + rx * w, z: fz * l + rz * w },
    { x: -fx * l + rx * w, z: -fz * l + rz * w },
    { x: -fx * l - rx * w, z: -fz * l - rz * w },
    { x: fx * l - rx * w, z: fz * l - rz * w },
  ];
}

export function newWalker(headingDeg) {
  const h = (headingDeg * Math.PI) / 180;
  return {
    x: Math.cos(h) * SPAWN, z: -Math.sin(h) * SPAWN, y: 0,
    yaw: h, pitch: 0.12, facing: h, dist: 0, moving: false, inside: null, doorWait: 0,
  };
}

// Swing is -1..1 over a stride. Still means every limb hangs straight.
export function poseOf(walker) {
  if (!walker.moving) return { swing: 0, bob: 0 };
  const phase = (walker.dist / STRIDE) * Math.PI * 2;
  return { swing: Math.sin(phase), bob: Math.abs(Math.cos(phase)) * 0.035 };
}

export function nearCar(walker, reach = RETURN_DISTANCE) {
  return !walker.inside && Math.hypot(walker.x, walker.z) <= reach;
}

function rectHitsCircle(x0, z0, size, cx, cz, r) {
  const x = Math.max(x0, Math.min(cx, x0 + size));
  const z = Math.max(z0, Math.min(cz, z0 + size));
  return (x - cx) ** 2 + (z - cz) ** 2 <= r * r;
}

export function chunksAround(x, z, radius = VIEW_RADIUS) {
  const minX = Math.floor((x - radius) / CHUNK), maxX = Math.floor((x + radius) / CHUNK);
  const minZ = Math.floor((z - radius) / CHUNK), maxZ = Math.floor((z + radius) / CHUNK);
  const keys = [];
  for (let iz = minZ; iz <= maxZ; iz++) {
    for (let ix = minX; ix <= maxX; ix++) {
      if (rectHitsCircle(ix * CHUNK, iz * CHUNK, CHUNK, x, z, radius)) keys.push(`${ix}_${iz}`);
    }
  }
  return keys;
}

// At most `limit` chunks to add and `limit` to drop, so one frame never rebuilds the whole view.
export function chunkChanges(loaded, wanted, limit = 3) {
  const have = loaded instanceof Set ? loaded : new Set(loaded);
  const want = new Set(wanted);
  const enter = [], leave = [];
  for (const key of wanted) {
    if (enter.length >= limit) break;
    if (!have.has(key)) enter.push(key);
  }
  for (const key of have) {
    if (leave.length >= limit) break;
    if (!want.has(key)) leave.push(key);
  }
  return { enter, leave };
}

function orient(ax, az, bx, bz, cx, cz) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

function crossesDoor(x0, z0, x1, z1, door) {
  const o1 = orient(x0, z0, x1, z1, door.ax, door.az);
  const o2 = orient(x0, z0, x1, z1, door.bx, door.bz);
  const o3 = orient(door.ax, door.az, door.bx, door.bz, x0, z0);
  const o4 = orient(door.ax, door.az, door.bx, door.bz, x1, z1);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function blockedBy(x, z, segments) {
  for (const [a, b] of segments) if (distToSeg(x, z, a, b) < PERSON_RADIUS) return true;
  return false;
}

function carBlocks(x, z, ring) {
  if (!ring) return false;
  if (pointInRing(ring, x, z)) return true;
  for (let i = 0; i < ring.length; i++) if (distToSeg(x, z, ring[i], ring[(i + 1) % ring.length]) < PERSON_RADIUS) return true;
  return false;
}

function hit(x, z, building, world) {
  if (building) return blockedBy(x, z, wallSegments(building.ring, building.door));
  if (carBlocks(x, z, world.carRing)) return true;
  for (const tree of world.trees || []) if (Math.hypot(x - tree.x, z - tree.z) < PERSON_RADIUS + (tree.r || 0.28)) return true;
  for (const water of world.waters || []) if (contains(water, x, z)) return true;
  for (const item of world.buildings || []) {
    if ((item.lift || 0) > WALK_UNDER || !item.ring) continue;
    if (item.minX != null && (x < item.minX - 1 || x > item.maxX + 1 || z < item.minZ - 1 || z > item.maxZ + 1)) continue;
    if (blockedBy(x, z, wallSegments(item.ring, item.door))) return true;
  }
  return false;
}

function slide(x, z, dx, dz, building, world) {
  if (!hit(x + dx, z + dz, building, world)) return { x: x + dx, z: z + dz };
  if (!hit(x + dx, z, building, world)) return { x: x + dx, z };
  if (!hit(x, z + dz, building, world)) return { x, z: z + dz };
  return { x, z };
}

function nudge(door, inward) {
  const s = inward ? 1 : -1;
  return { x: door.mx - door.nx * NUDGE * s, z: door.mz - door.nz * NUDGE * s };
}

function crossDoors(walker, x0, z0, world) {
  if (walker.doorWait > 0) return;
  if (walker.inside) {
    const building = (world.buildings || []).find((b) => b.id === walker.inside);
    if (building?.door && crossesDoor(x0, z0, walker.x, walker.z, building.door)) {
      const out = nudge(building.door, false);
      walker.x = out.x;
      walker.z = out.z;
      walker.inside = null;
      walker.doorWait = DOOR_WAIT;
    }
    return;
  }
  for (const building of world.buildings || []) {
    if ((building.lift || 0) > WALK_UNDER || !building.door) continue;
    if (!crossesDoor(x0, z0, walker.x, walker.z, building.door)) continue;
    const into = nudge(building.door, true);
    walker.x = into.x;
    walker.z = into.z;
    walker.y = building.floorY || 0;
    walker.inside = building.id;
    walker.doorWait = DOOR_WAIT;
    return;
  }
}

// `input.lookX` and `lookY` are radians. `forward` and `strafe` are -1..1, relative to where the camera looks.
export function stepWalker(walker, input, dt, world) {
  dt = Math.max(0, Math.min(dt || 0, 0.06));
  walker.yaw -= input.lookX || 0;
  walker.pitch = clamp(walker.pitch - (input.lookY || 0), -1, 0.8);
  if (walker.doorWait > 0) walker.doorWait = Math.max(0, walker.doorWait - dt);
  const building = walker.inside ? (world.buildings || []).find((b) => b.id === walker.inside) : null;
  const f = input.forward || 0, s = input.strafe || 0;
  const mag = Math.hypot(f, s);
  let dx = 0, dz = 0;
  if (mag > 0) {
    const scale = (input.run ? RUN_SPEED : WALK_SPEED) * dt / mag;
    dx = (Math.sin(walker.yaw) * f + Math.cos(walker.yaw) * s) * scale;
    dz = (Math.cos(walker.yaw) * f - Math.sin(walker.yaw) * s) * scale;
  }
  const x0 = walker.x, z0 = walker.z;
  const next = slide(x0, z0, dx, dz, building, world);
  const sample = world.heightAt?.(next.x, next.z);
  const y = building ? (building.floorY || 0) : (sample == null || Number.isNaN(sample) ? walker.y : sample);
  if (!building && y - walker.y > STEP_UP) {
    walker.moving = false;
    return walker;
  }
  const moved = Math.hypot(next.x - x0, next.z - z0);
  walker.x = next.x;
  walker.z = next.z;
  walker.y = y;
  walker.moving = moved > 0.0001;
  if (walker.moving) {
    walker.dist += moved;
    walker.facing = Math.atan2(next.x - x0, next.z - z0);
  }
  crossDoors(walker, x0, z0, world);
  return walker;
}

// Pull the camera in until it is inside the room. `yaw` 0 looks north, so back is -z.
export function indoorDistance(ring, x, z, yaw, wanted = 2.6) {
  const bx = Math.sin(yaw), bz = Math.cos(yaw);
  let dist = wanted;
  for (let i = 0; i < 8; i++) {
    if (pointInRing(ring, x - bx * dist, z - bz * dist)) return dist;
    dist *= 0.62;
  }
  return 0.8;
}

// Offset from the person's feet to the camera.
export function cameraBack(yaw, pitch, dist) {
  const back = Math.cos(pitch) * dist;
  return { x: -Math.sin(yaw) * back, y: 1.55 + Math.sin(pitch) * dist, z: -Math.cos(yaw) * back };
}
