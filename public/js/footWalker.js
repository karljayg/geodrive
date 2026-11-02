// The person on foot: moving, what stops them, and where the camera goes. Pure, tested in node.
// x east, y north, z up, in metres from the parked car. Yaw is a compass bearing in radians, the same way round as car.heading.
import { leadDistance } from './camera.js';
import { distToSegment } from './footData.js';
import { cadenceOf, frameFor } from './footPerson.js';

export const WALK_SPEED = 3;     // m/s, as Settings starts
export const RUN_SPEED = 8.4;
export const GET_IN_REACH = 3;   // m from the car
export const RADIUS = 0.35;      // m
export const STEEP = 0.6;        // m of rise per metre of ground that stops you
export const ROOM_HEIGHT = 3;    // m
const ENTER_REACH = 1;           // m from a wall that L takes you through it
const STEP_INSIDE = 1;           // m past the wall that you end up, either way
export const JUMP_HEIGHT = 1.3;  // m, which clears chairs, tables, beds and counters, but not wardrobes or a fridge
const GRAVITY = 12;              // m/s², a little more than real, for a snappy hop that still stays up long enough to clear a chair at a walk
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
const STAND_INSET = 0.15;        // m past a thing's edge that someone standing on it stays on it
const SUB_STEP = 0.2;            // m, less than the person is wide, so a run can't pass through a wall
const CLEAR_STEP = 0.25, CLEAR_REACH = 8, CLEAR_DIRECTIONS = 16; // m, m, and how many ways to look for a clear spot
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function newWalker(x, y, yaw) {
  return { x, y, z: 0, height: 0, rise: 0, yaw, facing: yaw, phase: 0, running: false, dist: 0, speed: 0, inside: null };
}

// The parked car's outline as walls, from the same half sizes the model is built with.
export function carWalls(headingDeg, halfWidth, halfLength) {
  const h = (headingDeg * Math.PI) / 180, fx = Math.sin(h), fy = Math.cos(h), rx = fy, ry = -fx;
  const corner = (f, r) => ({ x: fx * f * halfLength + rx * r * halfWidth, y: fy * f * halfLength + ry * r * halfWidth });
  const c = [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)];
  return c.map((a, i) => ({ ax: a.x, ay: a.y, bx: c[(i + 1) % 4].x, by: c[(i + 1) % 4].y }));
}

export const distanceToCar = (walker, walls) => Math.min(...walls.map((w) => distToSegment(walker.x, walker.y, w.ax, w.ay, w.bx, w.by)));

// A clear place beside the car: its right side first, then its left, behind and ahead.
export function spawnSpot(headingDeg, halfWidth, halfLength, isClear) {
  const h = (headingDeg * Math.PI) / 180, fx = Math.sin(h), fy = Math.cos(h), rx = fy, ry = -fx, side = halfWidth + 1.2, end = halfLength + 1.2;
  const spots = [[rx * side, ry * side], [-rx * side, -ry * side], [-fx * end, -fy * end], [fx * end, fy * end]];
  const [x, y] = spots.find(([px, py]) => isClear(px, py)) || spots[0];
  return { x, y };
}

// Moves a point clear of anything solid, which is also what lets the person slide along a wall.
function pushClear(x, y, world, height = 0) {
  for (let round = 0; round < 3; round++) {
    let moved = false;
    const away = (wall) => {
      if (wall.top !== undefined && wall.top <= height + 0.01) return; // over the top of it
      const d = distToSegment(x, y, wall.ax, wall.ay, wall.bx, wall.by);
      if (d >= RADIUS) return;
      const dx = wall.bx - wall.ax, dy = wall.by - wall.ay, len2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - wall.ax) * dx + (y - wall.ay) * dy) / len2, 0, 1);
      const ox = x - (wall.ax + dx * t), oy = y - (wall.ay + dy * t), len = Math.hypot(ox, oy);
      if (len < 1e-6) return;
      x += (ox / len) * (RADIUS - d + 1e-4);
      y += (oy / len) * (RADIUS - d + 1e-4);
      moved = true;
    };
    for (const wall of world.carWalls) away(wall);
    for (const wall of world.inner?.walls || []) away(wall);
    const cell = world.place.cellAt(x, y);
    for (const building of cell.buildings) {
      if (x < building.minX - 1 || x > building.maxX + 1 || y < building.minY - 1 || y > building.maxY + 1) continue;
      for (const wall of world.place.walls(building)) away(wall);
    }
    if (!moved) break;
  }
  return { x, y };
}

// The nearest ground-floor wall within reach, with the spot just inside it. Null if the person isn't by one, or it has no room inside.
export function buildingWithin(walker, world) {
  let best = null, bestDist = ENTER_REACH;
  for (const building of world.place.cellAt(walker.x, walker.y).buildings) {
    for (const w of world.place.walls(building)) {
      const d = distToSegment(walker.x, walker.y, w.ax, w.ay, w.bx, w.by);
      if (d >= bestDist) continue;
      const dx = w.bx - w.ax, dy = w.by - w.ay, len2 = dx * dx + dy * dy || 1, t = clamp(((walker.x - w.ax) * dx + (walker.y - w.ay) * dy) / len2, 0, 1);
      const px = w.ax + dx * t, py = w.ay + dy * t, len = Math.sqrt(len2), nx = dy / len, ny = -dx / len;
      const spot = [1, -1].map((side) => ({ x: px + nx * side * STEP_INSIDE, y: py + ny * side * STEP_INSIDE })).find((p) => world.place.footprintAt(p.x, p.y) === building);
      if (spot) { best = { building, spot }; bestDist = d; }
    }
  }
  return best;
}

const LEAVE_REACH = 3;   // m from an outside wall that F offers the way out
// Whether someone inside is close enough to one of its outside walls to step out through it.
export function byOutsideWall(walker, world) {
  if (!walker.inside) return false;
  return (walker.inside.pieces || [walker.inside]).some((piece) => world.place.walls(piece).some((w) => distToSegment(walker.x, walker.y, w.ax, w.ay, w.bx, w.by) < LEAVE_REACH));
}

// L beside a building goes in, remembering where from. True if it went.
export function enterBuilding(walker, world) {
  const near = buildingWithin(walker, world);
  if (!near) return false;
  walker.outside = { x: walker.x, y: walker.y };
  walker.x = near.spot.x;
  walker.y = near.spot.y;
  walker.inside = near.building;
  return true;
}

// L inside goes back out where you came in. A building that filled in around someone has no such place, so they leave by its nearest wall.
export function leaveBuilding(walker, world) {
  const building = walker.inside;
  if (!building) return false;
  let to = walker.outside;
  if (!to) {
    let bestDist = Infinity;
    for (const w of world.place.walls(building)) {
      const d = distToSegment(walker.x, walker.y, w.ax, w.ay, w.bx, w.by);
      if (d >= bestDist) continue;
      const dx = w.bx - w.ax, dy = w.by - w.ay, len = Math.hypot(dx, dy) || 1, mx = (w.ax + w.bx) / 2, my = (w.ay + w.by) / 2;
      const spot = [1, -1].map((side) => ({ x: mx + (dy / len) * side * STEP_INSIDE, y: my - (dx / len) * side * STEP_INSIDE })).find((p) => !world.place.footprintAt(p.x, p.y));
      if (spot) { to = spot; bestDist = d; }
    }
  }
  if (!to) return false;
  walker.x = to.x;
  walker.y = to.y;
  walker.outside = null;
  walker.inside = null;
  return true;
}

const inBox = (box, x, y, pad) => {
  const dx = x - box.x, dy = y - box.y;
  return Math.abs(dx * box.c - dy * box.s) < box.hw + pad && Math.abs(dx * box.s + dy * box.c) < box.hd + pad;
};

// Someone who arrives where a thing stands moves to the nearest place that's clear, or they'd be stuck inside its outline.
export function stepClearOfThings(walker, world) {
  const boxes = world.inner?.boxes || [];
  const clear = (x, y) => !boxes.some((box) => inBox(box, x, y, RADIUS));
  if (clear(walker.x, walker.y)) return false;
  for (let distance = CLEAR_STEP; distance <= CLEAR_REACH; distance += CLEAR_STEP) {
    for (let k = 0; k < CLEAR_DIRECTIONS; k++) {
      const a = (k / CLEAR_DIRECTIONS) * Math.PI * 2, x = walker.x + Math.sin(a) * distance, y = walker.y + Math.cos(a) * distance;
      if (clear(x, y) && world.place.footprintAt(x, y) === walker.inside) {
        walker.x = x;
        walker.y = y;
        return true;
      }
    }
  }
  return false;
}

const CLIMB_REACH = 0.7;   // m from a thing's edge that F offers to climb it
const CLIMB_BEYOND = 3;   // m past its far side to look for somewhere to land, as shelves stand back to back
const CLIMB_STEP = 0.25;  // m
const CLIMB_FACING = 0.25;// how nearly they must face it: the cosine of the angle
const LANDING_SLIP = 0.03; // m a landing spot can be nudged by a wall and still count as clear

const crosses = (ax, ay, bx, by, wall) => {
  const side = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  return side(ax, ay, bx, by, wall.ax, wall.ay) * side(ax, ay, bx, by, wall.bx, wall.by) < 0 && side(wall.ax, wall.ay, wall.bx, wall.by, ax, ay) * side(wall.ax, wall.ay, wall.bx, wall.by, bx, by) < 0;
};

// The thing they're facing and up against, and clear floor on its far side with no wall between: { box, x, y }, or null.
// skip(box): things not to offer. The nearest first, so it's the one they mean.
export function climbOver(walker, world, skip) {
  const sin = Math.sin(walker.facing), cos = Math.cos(walker.facing), boxes = world.inner?.boxes || [], near = [];
  for (const box of boxes) {
    const dx = walker.x - box.x, dy = walker.y - box.y;
    const lx = dx * box.c - dy * box.s, ly = dx * box.s + dy * box.c, gapX = Math.abs(lx) - box.hw, gapY = Math.abs(ly) - box.hd;
    const gap = Math.hypot(Math.max(gapX, 0), Math.max(gapY, 0));
    if (gap > CLIMB_REACH) continue;
    const nx = clamp(lx, -box.hw, box.hw) - lx, ny = clamp(ly, -box.hd, box.hd) - ly, length = Math.hypot(nx, ny) || 1; // towards its nearest point
    const toward = ((nx * box.c + ny * box.s) * sin + (-nx * box.s + ny * box.c) * cos) / length;
    if (toward >= CLIMB_FACING && !skip?.(box)) near.push({ box, gap, lx, ly, gapX, gapY });
  }
  const full = (world.inner?.walls || []).filter((wall) => wall.top === undefined);
  const clearAt = (x, y) => world.place.footprintAt(x, y) === walker.inside && !boxes.some((other) => inBox(other, x, y, RADIUS));
  for (const { box, lx, ly, gapX, gapY } of near.sort((a, b) => a.gap - b.gap)) {
    const alongX = gapX >= gapY, half = (alongX ? box.hw : box.hd) + RADIUS + 0.05, sign = (alongX ? lx : ly) > 0 ? -1 : 1;
    const across = alongX ? clamp(ly, -box.hd, box.hd) : clamp(lx, -box.hw, box.hw);
    for (let extra = 0; extra <= CLIMB_BEYOND; extra += CLIMB_STEP) {
      const along = sign * (half + extra), mx = alongX ? along : across, my = alongX ? across : along;
      const x = box.x + mx * box.c + my * box.s, y = box.y - mx * box.s + my * box.c;
      if (full.some((wall) => crosses(walker.x, walker.y, x, y, wall))) break; // and so will anything further
      if (!clearAt(x, y)) continue;
      const to = pushClear(x, y, world);
      if (Math.hypot(to.x - x, to.y - y) < LANDING_SLIP) return { box, x, y };
    }
  }
  return null;
}

// In the air, the person holds one stride of the run, whatever they were doing.
export const frameOf = (walker) => (walker.height > 0.05 && walker.rise !== 0 ? frameFor(RUN_SPEED, true, 0.25) : frameFor(walker.speed, walker.running, walker.phase));

// The top of what's under someone at this height, or the floor. It only counts if they're above it.
function standingOn(walker, world) {
  let top = 0;
  for (const box of world.inner?.boxes || []) {
    if (box.top > top && box.top <= walker.height + 0.02 && inBox(box, walker.x, walker.y, STAND_INSET)) top = box.top;
  }
  return top;
}

// Up, and back down on to whatever is underneath. A jump only starts from something solid.
function stepHeight(walker, input, dt, world) {
  const under = standingOn(walker, world), grounded = walker.height <= under + 0.001 && walker.rise <= 0;
  if (grounded && input.jump) walker.rise = JUMP_SPEED;
  else if (grounded) {
    walker.height = under;
    walker.rise = 0;
    return;
  }
  walker.rise -= GRAVITY * dt;
  walker.height += walker.rise * dt;
  const landing = standingOn(walker, world);
  if (walker.height <= landing && walker.rise <= 0) {
    walker.height = landing;
    walker.rise = 0;
  }
}

// Water is a wall from the shore, though someone already in it can always wade out. A slope is judged by the ground ahead,
// so nothing here depends on the height the person was last at: ground whose tile arrived late can never leave them stuck.
function canGo(walker, to, dx, dy, world) {
  if (world.place.inWater(to.x, to.y) && !world.place.inWater(walker.x, walker.y)) return false;
  if (world.place.footprintAt(to.x, to.y)) return true;
  const len = Math.hypot(dx, dy) || 1;
  const here = world.height(to.x, to.y), ahead = world.height(to.x + dx / len, to.y + dy / len);
  return here === null || ahead === null || ahead - here <= STEEP;
}

function stepOnce(walker, dx, dy, world) {
  for (const [mx, my] of [[dx, dy], [dx, 0], [0, dy]]) {
    if (!mx && !my) continue;
    const to = pushClear(walker.x + mx, walker.y + my, world, walker.height);
    if (!canGo(walker, to, mx, my, world)) continue;
    const moved = Math.hypot(to.x - walker.x, to.y - walker.y);
    walker.x = to.x;
    walker.y = to.y;
    return moved;
  }
  return 0;
}

// input: forward and strafe -1..1 relative to the view, run, lookX in radians since the last step.
export function stepWalker(walker, input, dt, world) {
  walker.yaw += input.lookX || 0;
  const f = input.forward || 0, s = input.strafe || 0, mag = Math.hypot(f, s);
  let walked = 0;
  if (mag && dt) {
    const speed = input.run ? input.runSpeed ?? RUN_SPEED : input.walkSpeed ?? WALK_SPEED, way = (speed * dt) / mag;
    const sin = Math.sin(walker.yaw), cos = Math.cos(walker.yaw);
    const dx = (sin * f + cos * s) * way, dy = (cos * f - sin * s) * way;
    const steps = Math.ceil((speed * dt) / SUB_STEP);
    for (let i = 0; i < steps; i++) walked += stepOnce(walker, dx / steps, dy / steps, world);
    if (walked > 1e-4) {
      const wanted = Math.atan2(dx, dy), turn = Math.atan2(Math.sin(wanted - walker.facing), Math.cos(wanted - walker.facing));
      walker.facing += turn * (1 - Math.exp(-dt * 12));
    }
  }
  walker.dist += walked;
  walker.speed = dt ? walked / dt : 0;
  walker.running = !!input.run;
  walker.phase += dt * cadenceOf(walker.speed, walker.running);
  if (dt) stepHeight(walker, input, dt, world);
  walker.inside = world.place.footprintAt(walker.x, walker.y);
  const ground = walker.inside ? world.floor(walker.inside) : world.height(walker.x, walker.y);
  if (ground !== null) walker.z += (ground - walker.z) * (dt ? 1 - Math.exp(-dt * 12) : 1);
  return walker;
}

// The driving camera's angle and distance: it orbits a point ahead of the person, who keeps the car's place on screen.
// view: { tilt, range, fov, below }, as the driving camera has them. Walls don't move it, so Q and E are the way to see round a building.
export function placeCamera(walker, view) {
  const lead = leadDistance(view.range, view.tilt, view.fov, view.below), t = (view.tilt * Math.PI) / 180;
  const sin = Math.sin(walker.yaw), cos = Math.cos(walker.yaw);
  const target = { x: walker.x + sin * lead, y: walker.y + cos * lead, z: walker.z };
  const back = view.range * Math.sin(t);
  return { eye: { x: target.x - sin * back, y: target.y - cos * back, z: target.z + view.range * Math.cos(t) }, target };
}

const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
// The way back to the car, for the label on screen.
export function wayToCar(walker) {
  const metres = Math.round(Math.hypot(walker.x, walker.y));
  const bearing = (Math.atan2(-walker.x, -walker.y) * 180) / Math.PI;
  return { metres, direction: NAMES[Math.round(((bearing + 360) % 360) / 45) % 8] };
}
