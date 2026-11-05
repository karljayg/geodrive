import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELL, Place, clipRing, fromLocal, inRings, parseTile, polygonsOf, signedArea, toLocal, triangulate } from '../public/js/footData.js';
import { RADIUS, GET_IN_REACH, buildingWithin, enterBuilding, leaveBuilding, RUN_SPEED, WALK_SPEED, carWalls, distanceToCar, newWalker, frameOf, placeCamera, spawnSpot, stepWalker, wayToCar } from '../public/js/footWalker.js';
import { Mesh, roomMesh } from '../public/js/footScene.js';
import { CYCLE_FRAMES, FRAME_COUNT, cadenceOf, personFloats, personParts, poseAt } from '../public/js/footPerson.js';
import { bearing, lookAt, multiply, perspective, swing, translate } from '../public/js/footGl.js';
import { readLayer } from '../public/js/vector.js';
import { Terrain } from '../public/js/terrain.js';
import { buildPersonGlb } from '../public/js/carModel.js';

const VIEW = { tilt: 62, range: 130, fov: 35, below: 0.45 };
const ORIGIN = { lat: 38.9, lng: -77 };
const square = (x, y, half) => [{ x: x - half, y: y - half }, { x: x + half, y: y - half }, { x: x + half, y: y + half }, { x: x - half, y: y + half }];
const bounds = (pts) => ({ minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) });
const building = (pts, extra = {}) => ({ rings: [{ pts, seam: pts.map(() => false) }], lift: 0, height: 8, colour: [0.8, 0.8, 0.8], ground: true, ...bounds(pts), ...extra });
const placeWith = ({ buildings = [], waters = [], lands = [], roads = [] } = {}) => {
  const place = new Place(ORIGIN);
  place.addTile('t', { buildings, waters, lands, roads });
  return place;
};
const worldOf = (place, over = {}) => ({ place, carWalls: [], height: () => 0, floor: () => 0, ...over });
const walk = (walker, world, input, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) stepWalker(walker, input, dt, world);
  return walker;
};

// --- Which way round the world is ------------------------------------------------------------------------------

const onScreen = (eye, target, p) => {
  const m = multiply(perspective(60, 1, 0.1, 500), lookAt(eye, target));
  const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
  return { x: (m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]) / w, y: (m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]) / w, w };
};

test('facing north, east is on the right of the screen and up is up, so the world is not mirrored', () => {
  const eye = { x: 0, y: -10, z: 2 }, target = { x: 0, y: 0, z: 2 };
  assert.ok(onScreen(eye, target, { x: 5, y: 0, z: 2 }).x > 0.1);
  assert.ok(onScreen(eye, target, { x: -5, y: 0, z: 2 }).x < -0.1);
  assert.ok(onScreen(eye, target, { x: 0, y: 0, z: 6 }).y > 0.1);
  assert.ok(onScreen(eye, target, { x: 0, y: 5, z: 2 }).w > 0, 'what is ahead is in front of the camera');
  assert.ok(onScreen(eye, target, { x: 0, y: -20, z: 2 }).w < 0, 'what is behind is not');
});

test('D walks to the right of the screen and W walks into it, whichever way the person faces', () => {
  for (const yawDeg of [0, 37, 90, 200, 300]) {
    const yaw = (yawDeg * Math.PI) / 180, world = worldOf(placeWith());
    const start = newWalker(0, 0, yaw);
    const cam = placeCamera(start, VIEW);
    const right = walk(newWalker(0, 0, yaw), world, { strafe: 1 }, 1);
    assert.ok(onScreen(cam.eye, cam.target, { ...right, z: start.z }).x > 0.005, `D at ${yawDeg}`);
    const left = walk(newWalker(0, 0, yaw), world, { strafe: -1 }, 1);
    assert.ok(onScreen(cam.eye, cam.target, { ...left, z: start.z }).x < -0.005, `A at ${yawDeg}`);
    const ahead = walk(newWalker(0, 0, yaw), world, { forward: 1 }, 1);
    assert.ok(Math.hypot(ahead.x - cam.eye.x, ahead.y - cam.eye.y) > Math.hypot(start.x - cam.eye.x, start.y - cam.eye.y), `W at ${yawDeg}`);
  }
});

test('aiming faces the scope, and backing up is half speed on foot or at a run', () => {
  const world = worldOf(placeWith());
  const back = walk(newWalker(0, 0, 0), world, { forward: -1, aiming: true, aimYaw: 0, walkSpeed: 4 }, 1);
  assert.ok(Math.abs(back.facing) < 0.02, 'still faces the scope');
  assert.ok(back.y < -1.9 && back.y > -2.1, `walked back ${back.y}, half of 4 m/s`);
  const ran = walk(newWalker(0, 0, 0), world, { forward: -1, aiming: true, aimYaw: 0, run: true, runSpeed: 8 }, 1);
  assert.ok(ran.y < -3.8 && ran.y > -4.2, `ran back ${ran.y}, half of 8 m/s`);
  const ahead = walk(newWalker(0, 0, 0), world, { forward: 1, aiming: true, aimYaw: Math.PI / 2, walkSpeed: 3 }, 1);
  assert.ok(Math.abs(ahead.facing - Math.PI / 2) < 0.02, 'they face the scope, not the way they started');
  assert.ok(ahead.x > 2.5 && Math.abs(ahead.y) < 0.2, 'ahead is where the scope looks');
  const side = walk(newWalker(0, 0, 0), world, { strafe: 1, aiming: true, aimYaw: Math.PI / 2, walkSpeed: 3 }, 1);
  assert.ok(Math.abs(side.facing - Math.PI / 2) < 0.02, 'strafe does not turn them off the scope');
  assert.ok(side.y < -2.5 && Math.abs(side.x) < 0.2, 'right of an eastward aim is south');
});

test('a look to the right turns the bearing clockwise', () => {
  const walker = newWalker(0, 0, 0);
  stepWalker(walker, { lookX: Math.PI / 2 }, 1 / 60, worldOf(placeWith()));
  walk(walker, worldOf(placeWith()), { forward: 1 }, 1);
  assert.ok(walker.x > 1 && Math.abs(walker.y) < 0.01, 'bearing 90 walks east');
});

test('a compass bearing turns a model the same way as the car', () => {
  const nose = multiply(bearing(Math.PI / 2), [0, 1, 0, 1]);
  assert.ok(Math.abs(nose[0] - 1) < 1e-9 && Math.abs(nose[1]) < 1e-9, 'heading 90 points the nose east');
  const foot = multiply(swing(0.5), [0, 0, -1, 0]);
  assert.ok(Math.abs(Math.hypot(foot[0], foot[1], foot[2]) - 1) < 1e-9);
  assert.deepEqual(multiply(translate(1, 2, 3), [0, 0, 0, 1]).slice(0, 3), [1, 2, 3]);
});

test('rooms face in', () => {
  const b = building(square(40, 40, 5));
  const place = placeWith({ buildings: [b] });
  const room = roomMesh(place, b, 0);
  for (let v = 0; v < room.length / 9; v++) {
    const [x, y, z, nx, ny, nz] = room.slice(v * 9, v * 9 + 6);
    if (Math.abs(nz) > 0.9) { assert.equal(nz > 0, z < 1, 'the floor faces up and the ceiling down'); continue; }
    assert.ok((x - 40) * nx + (y - 40) * ny < -4.5, 'a room wall faces the middle');
  }
});

test('a mesh takes its normal from its winding', () => {
  const mesh = new Mesh();
  mesh.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1]);
  assert.deepEqual(Array.from(mesh.floats().slice(3, 6)), [0, 0, 1]);
});

// --- Reading tiles ---------------------------------------------------------------------------------------------

const DULLES = new Uint8Array(readFileSync(new URL('./fixtures/dulles-14-4667-6264.pbf', import.meta.url)));
const DULLES_ORIGIN = { lat: 38.9555, lng: -77.4475 };

test('every polygon in a real tile becomes a building, not just the largest in each feature', () => {
  const layer = readLayer(DULLES, 'building');
  assert.equal(layer.features.length, 11);
  const parsed = parseTile(DULLES, 4667, 6264, DULLES_ORIGIN);
  assert.ok(parsed.buildings.length >= 170, `kept ${parsed.buildings.length} of 190 footprints, less only small ones and those of the next tile`);
  for (const b of parsed.buildings) {
    assert.ok(signedArea(b.rings[0].pts) > 0, 'outer rings are anticlockwise in metres');
    assert.ok(b.height > 0 && b.height >= b.lift);
  }
  assert.ok(parsed.roads.length > 100);
  assert.ok(parsed.lands.some((l) => l.trees), 'woods are recognised');
  assert.ok(parsed.waters.length > 0);
});

test('a real tile files into cells and every building gets walls', () => {
  const place = new Place(DULLES_ORIGIN);
  place.addTile('dulles', parseTile(DULLES, 4667, 6264, DULLES_ORIGIN));
  const seen = new Set();
  for (const cell of place.cells.values()) for (const b of cell.buildings) seen.add(b);
  assert.ok(seen.size >= 170);
  for (const b of seen) {
    if (!b.ground) continue;
    assert.ok(place.walls(b).length >= 3, 'walls all round');
  }
});

test('a ring grouping treats each positive ring as a new polygon and each negative one as a hole', () => {
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10]]; // positive with tile y pointing down
  const hole = [[2, 2], [2, 8], [8, 8], [8, 2]];
  const other = [[20, 0], [30, 0], [30, 10], [20, 10]];
  assert.deepEqual(polygonsOf([outer, hole, other]).map((p) => p.length), [2, 1]);
});

test('a footprint over a tile edge is cut there, and one wholly over the edge is dropped', () => {
  assert.deepEqual(clipRing([[4090, 10], [4110, 10], [4110, 20], [4090, 20]], 4096).map((p) => p[0]).sort((a, b) => a - b), [4090, 4090, 4096, 4096]);
  assert.equal(clipRing([[4100, 10], [4110, 10], [4110, 20], [4100, 20]], 4096).length, 0);
});

test('a hole is not part of the shape, and triangles cover the rest exactly', () => {
  const outer = square(0, 0, 10), hole = square(0, 0, 4).reverse();
  assert.equal(inRings([outer, hole], 0, 0), false);
  assert.equal(inRings([outer, hole], 7, 0), true);
  assert.equal(inRings([outer, hole], 15, 0), false);
  const area = (triangles) => {
    let total = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const [a, b, c] = [triangles[i], triangles[i + 1], triangles[i + 2]];
      const part = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
      assert.ok(part > 0, 'anticlockwise');
      total += part;
    }
    return total;
  };
  assert.ok(Math.abs(area(triangulate([outer])) - 400) < 1e-6);
  assert.ok(Math.abs(area(triangulate([outer, hole])) - 336) < 1e-6);
  const ell = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
  assert.ok(Math.abs(area(triangulate([ell])) - 64) < 1e-6);
});

test('metres and degrees convert both ways, with east as +x and north as +y', () => {
  const p = toLocal(ORIGIN, ORIGIN.lat + 0.001, ORIGIN.lng + 0.001);
  assert.ok(p.x > 80 && p.y > 100);
  const back = fromLocal(ORIGIN, p.x, p.y);
  assert.ok(Math.abs(back.lat - (ORIGIN.lat + 0.001)) < 1e-9 && Math.abs(back.lng - (ORIGIN.lng + 0.001)) < 1e-9);
});

// --- Doors and rooms -------------------------------------------------------------------------------------------

test('a building lifted overhead has no walls, and you walk under it', () => {
  const b = building(square(0, 10, 3), { lift: 10, height: 20, ground: false });
  const place = placeWith({ buildings: [b] });
  assert.deepEqual(place.walls(b), []);
  const walker = walk(newWalker(0, 0, 0), worldOf(place), { forward: 1 }, 10);
  assert.ok(walker.y > 13);
  assert.equal(walker.inside, null);
});

// --- What stops you --------------------------------------------------------------------------------------------

test('water and trunks stop you, tree tops do not matter, and the car is solid', () => {
  const lake = square(0, 20, 8);
  const water = walk(newWalker(0, 0, 0), worldOf(placeWith({ waters: [{ rings: [lake], ...bounds(lake) }] })), { forward: 1 }, 10);
  assert.ok(water.y < 12.1 && water.y > 11, `stopped at the shore, ${water.y}`);

  const onLake = newWalker(0, 20, 0);
  walk(onLake, worldOf(placeWith({ waters: [{ rings: [lake], ...bounds(lake) }] })), { forward: 1 }, 8);
  assert.ok(onLake.y > 28.5, 'someone already in the water can always wade out');

  const walls = carWalls(0, 1, 2.2);
  const toCar = walk(newWalker(0, -10, 0), worldOf(placeWith(), { carWalls: walls }), { forward: 1 }, 8);
  assert.ok(toCar.y < -2.2 && toCar.y > -3);
});

test('woods grow trees that stay put, leave roads and buildings clear, and fill the whole chunk', () => {
  const wood = square(40, 40, 60);
  const land = { rings: [wood], colour: '#000', rank: 3, trees: 'dense', ...bounds(wood) };
  const place = placeWith({ lands: [land] });
  const trees = place.treesIn(0, 0);
  assert.ok(trees.length > 50);
  assert.ok(trees.some((t) => t.x > 60), 'trees reach the far side of the chunk');
  assert.ok(trees.some((t) => t.x < 20));
  const box = building(square(40, 40, 15));
  place.addTile('more', { buildings: [box], lands: [], waters: [], roads: [{ width: 8, colour: '#000', kerb: true, line: [{ x: 0, y: 10 }, { x: 80, y: 10 }] }] });
  const after = place.treesIn(0, 0);
  assert.ok(after.length < trees.length);
  for (const t of after) {
    assert.ok(!(Math.abs(t.x - 40) < 15 && Math.abs(t.y - 40) < 15));
    assert.ok(Math.abs(t.y - 10) > 4);
    assert.ok(trees.some((o) => o.x === t.x && o.y === t.y), 'no tree moved');
  }
});

test('a steep rise stops you, a gentle one does not, and going downhill is fine', () => {
  const steep = (x, y) => Math.max(0, y) * 1.2;
  const up = walk(newWalker(0, -3, 0), worldOf(placeWith(), { height: steep }), { forward: 1 }, 5);
  assert.ok(up.y < 0.2 && up.y > -1.5, `stopped at the foot, ${up.y}`);
  const gentle = walk(newWalker(0, -3, 0), worldOf(placeWith(), { height: (x, y) => Math.max(0, y) * 0.3 }), { forward: 1 }, 5);
  assert.ok(gentle.y > 3);
  assert.ok(Math.abs(gentle.z - gentle.y * 0.3) < 0.2, 'and rides up it');
  const down = walk(newWalker(0, 3, Math.PI), worldOf(placeWith(), { height: steep }), { forward: 1 }, 2);
  assert.ok(down.y < 1, 'down a steep slope is allowed');
});

test('ground arriving late never leaves you stuck, even far from the height you were at', () => {
  let known = false;
  const world = worldOf(placeWith(), { height: (x, y) => (known ? 50 + y * 0.1 : null) });
  const walker = walk(newWalker(0, 0, 0), world, { forward: 1 }, 2);
  assert.ok(walker.y > 2.5, 'walks while the tile is missing');
  known = true;
  const before = walker.y;
  walk(walker, world, { forward: 1 }, 2);
  assert.ok(walker.y > before + 2.5, 'and carries on when it arrives');
  assert.ok(Math.abs(walker.z - (50 + walker.y * 0.1)) < 1);
});

test('a sprint does not pass through a wall on a long frame', () => {
  const b = building(square(0, 10, 3));
  const place = placeWith({ buildings: [b] });
  const walker = newWalker(0, 0, 0);
  walk(walker, worldOf(place), { forward: 1, run: true }, 3, 0.06);
  assert.ok(walker.y < 7);
});

test('speeds, the limbs, and the way back to the car', () => {
  const world = worldOf(placeWith());
  assert.ok(Math.abs(walk(newWalker(0, 0, 0), world, { forward: 1 }, 2).y - WALK_SPEED * 2) < 0.1);
  assert.ok(Math.abs(walk(newWalker(0, 0, 0), world, { forward: 1, run: true }, 2).y - RUN_SPEED * 2) < 0.2);
  const walker = walk(newWalker(0, 0, 0), world, { forward: 1 }, 1);
  assert.ok(frameOf(walker) >= 1 && frameOf(walker) <= CYCLE_FRAMES, 'walking frames');
  assert.ok(frameOf(walk(newWalker(0, 0, 0), world, { forward: 1, run: true }, 1)) > CYCLE_FRAMES, 'running frames');
  stepWalker(walker, {}, 1 / 60, world);
  assert.equal(frameOf(walker), 0, 'still means standing still');
  assert.ok(Math.abs(walk(newWalker(0, 0, 0), world, { forward: 1, walkSpeed: 1 }, 2).y - 2) < 0.1, 'speeds come from Settings');
  assert.deepEqual(wayToCar({ x: 100, y: 0 }), { metres: 100, direction: 'W' });
  assert.deepEqual(wayToCar({ x: 0, y: -50 }), { metres: 50, direction: 'N' });
});

test('getting back in works within reach of any part of the car', () => {
  const walls = carWalls(90, 1, 2.2);
  assert.ok(distanceToCar({ x: 0, y: 3.5 }, walls) <= GET_IN_REACH);
  assert.ok(distanceToCar({ x: 0, y: 5 }, walls) > GET_IN_REACH);
  assert.ok(distanceToCar({ x: 5, y: 0 }, walls) <= GET_IN_REACH, 'past the nose of a car heading east');
});

test('the person starts on a clear side of the car', () => {
  const free = spawnSpot(0, 1, 2.2, () => true);
  assert.ok(free.x > 1, 'heading north, the right side is east');
  const blocked = spawnSpot(0, 1, 2.2, (x) => x < 0);
  assert.ok(blocked.x < -1);
});

test('on foot the camera is the driving camera, and Q and E swing it round the person', () => {
  const walker = newWalker(10, 20, 0);
  const { eye, target } = placeCamera(walker, VIEW);
  assert.ok(Math.abs(Math.hypot(eye.x - target.x, eye.y - target.y, eye.z - target.z) - VIEW.range) < 1e-6, 'same range');
  assert.ok(Math.abs((Math.atan2(target.y - eye.y, eye.z - target.z) * 180) / Math.PI - VIEW.tilt) < 1e-6, 'same tilt');
  assert.ok(target.y > walker.y, 'looking at a point ahead, so the person sits low on the screen like the car');
  stepWalker(walker, { lookX: Math.PI / 2 }, 1 / 60, worldOf(placeWith()));
  const turned = placeCamera(walker, VIEW);
  assert.ok(turned.eye.x < walker.x - 50, 'turned to face east, the camera is west of the person');
  assert.equal(walker.x, 10, 'turning moves nobody');
});

// --- Ground picture and the rest --------------------------------------------------------------------------------

test('a late terrain tile counts once, and can be read many times a frame', async () => {
  let loads = 0, release;
  const heights = new Float32Array(256 * 256).fill(100);
  const terrain = new Terrain((x, y, zoom) => { loads++; assert.equal(zoom, 15); return new Promise((r) => { release = () => r(heights); }); }, 15);
  assert.equal(terrain.heightNow(38.9, -77), null);
  assert.equal(terrain.heightNow(38.9001, -77), null);
  assert.equal(loads, 1);
  assert.equal(terrain.changes, 0);
  release();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(terrain.changes, 1);
  assert.equal(terrain.heightNow(38.9, -77), 100);
});

test('a person has knees and elbows that bend the right way, feet on the ground, and arms against legs', () => {
  for (const gait of ['walk', 'run']) {
    const zs = [];
    for (let f = 0; f < 16; f++) {
      const j = poseAt(gait, f / 16);
      for (const l of j.legs) {
        zs.push(l.ankle[2]);
        assert.ok(l.knee[1] - (l.hip[1] + l.ankle[1]) / 2 > -1e-6, `${gait}: a knee bends forward`);
      }
      for (const a of j.arms) assert.ok(a.hand[1] - (a.shoulder[1] + a.elbow[1]) / 2 > -0.3, `${gait}: an elbow bends the forearm forward`);
    }
    assert.ok(Math.min(...zs) < 0.12, `${gait}: a foot reaches the ground`);
  }
  const stride = poseAt('walk', 0.25);
  assert.ok(stride.legs[0].ankle[1] > stride.legs[1].ankle[1], 'the right leg ahead');
  assert.ok(stride.arms[0].hand[1] < stride.arms[1].hand[1], 'with the right arm behind');
  assert.ok(poseAt('run', 0.25).chest[1] > poseAt('walk', 0.25).chest[1], 'a run leans forward more');
  assert.ok(cadenceOf(8.4, true) > cadenceOf(3, false), 'and turns over faster');
});

test('every frame of the person is a whole figure about 1.75 m tall, and they differ', () => {
  const seen = new Set();
  for (let f = 0; f < FRAME_COUNT; f++) {
    const parts = personParts(f), z = parts.flatMap((p) => p.pos.filter((_, i) => i % 3 === 2));
    assert.ok(Math.max(...z) > 1.5 && Math.max(...z) < 2, `height ${Math.max(...z)}`);
    assert.ok(Math.min(...z) > -0.05, 'not through the ground');
    seen.add(parts.flatMap((p) => p.pos).join());
  }
  assert.equal(seen.size, FRAME_COUNT);
  assert.equal(new TextDecoder().decode(buildPersonGlb(personParts(3)).slice(0, 4)), 'glTF');
});

test('leaving finds a way out even when the nearest wall faces another building, and a spot still indoors does not count', () => {
  const house = building([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
  const neighbour = building([{ x: 10.4, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10.4, y: 10 }]);
  const world = worldOf(placeWith({ buildings: [house, neighbour] }));
  const stuck = newWalker(5, 5, 0);
  stuck.inside = house;
  stuck.outside = { x: 5, y: 5 };
  assert.equal(leaveBuilding(stuck, world), true);
  assert.equal(stuck.inside, null);
  assert.equal(world.place.footprintAt(stuck.x, stuck.y), null);
  const again = newWalker(5, 5, 0);
  again.inside = house;
  assert.equal(leaveBuilding(again, world), true);
  assert.equal(world.place.footprintAt(again.x, again.y), null);
});

test('someone inside is by an outside wall only close to one', async () => {
  const { byOutsideWall } = await import('../public/js/footWalker.js');
  const building = {}, world = { place: { walls: () => [{ ax: 0, ay: 0, bx: 20, by: 0 }] } };
  assert.equal(byOutsideWall({ x: 10, y: 0.5, inside: building }, world), true);
  assert.equal(byOutsideWall({ x: 10, y: 15, inside: building }, world), false);
  assert.equal(byOutsideWall({ x: 10, y: 0.5, inside: null }, world), false);
});

test('outdoors F can tell a road, a named place, the land and the water apart', async () => {
  const { Place } = await import('../public/js/footData.js');
  const square = (x0, y0, x1, y1) => [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];
  const place = new Place({ lat: 39, lng: -77 });
  place.addTile('t', {
    buildings: [], waters: [{ rings: square(40, 0, 50, 10), minX: 40, maxX: 50, minY: 0, maxY: 10 }],
    lands: [{ rings: square(0, 0, 30, 30), name: 'grass', rank: 2, minX: 0, maxX: 30, minY: 0, maxY: 30 }],
    roads: [{ line: [{ x: 0, y: -20 }, { x: 30, y: -20 }], width: 6 }], pois: [{ x: 25, y: 25, name: 'Corner Shop' }],
  });
  assert.equal(place.whatsAround(45, 5).kind, 'water');
  assert.equal(place.whatsAround(10, -20).kind, 'road');
  assert.deepEqual(place.whatsAround(24, 24), { kind: 'place', name: 'Corner Shop' });
  assert.deepEqual(place.whatsAround(5, 5), { kind: 'land', name: 'grass' });
  assert.equal(place.whatsAround(100, 100).name, undefined);
});

test('a car can stand anywhere, and someone can walk with no car at all', () => {
  const walls = carWalls(0, 1, 2, 100, 50), at = newWalker(100, 53.5, 0);
  assert.ok(Math.abs(distanceToCar(at, walls) - 1.5) < 1e-9, 'measured to the car where it is');
  assert.equal(distanceToCar(newWalker(0, 0, 0), []), Infinity, 'with no car, nothing is ever in reach');
  assert.deepEqual(wayToCar(newWalker(100, 40, 0), { x: 100, y: 50 }), { metres: 10, direction: 'N' });
  assert.deepEqual(wayToCar(newWalker(0, 10, 0)), { metres: 10, direction: 'S' }, 'and the first car is at the origin as ever');
});

test('someone can have their own colours, and female is the same person with longer hair', () => {
  const look = (figure) => ({ figure, colours: { skin: '#ffffff', jacket: '#ff0000', jeans: '#00ff00', shoes: '#0000ff', hair: '#808080' } });
  for (let frame = 0; frame < 17; frame++) {
    const usual = personParts(frame), male = personParts(frame, look('male')), female = personParts(frame, look('female'));
    assert.deepEqual(male[1].colour, [1, 0, 0]);
    assert.deepEqual(male[4].colour.map((c) => Math.round(c * 100)), [50, 50, 50]);
    assert.equal(male[0].pos.length, usual[0].pos.length, 'colours change nothing of the shape');
    for (const i of [0, 1, 2, 3]) assert.equal(female[i].pos.length, male[i].pos.length, 'only the hair differs');
    assert.ok(female[4].pos.length > male[4].pos.length, 'longer hair');
    const z = (part) => part.pos.filter((_, i) => i % 3 === 2), y = (part) => part.pos.filter((_, i) => i % 3 === 1);
    assert.ok(Math.min(...z(female[4])) < Math.min(...z(male[4])), 'further down');
    assert.ok(Math.max(...z(female[4])) <= Math.max(...z(male[4])) + 1e-6, 'and no higher than the head');
    assert.ok(Math.min(...y(female[4])) < Math.min(...y(male[4])), 'down the back, not the face');
    assert.ok(Math.min(...z(female[4])) > Math.max(...z(female[1])) - 0.35, 'and it stays with the head, not down at the waist, on frame ' + frame);
  }
  assert.deepEqual(personParts(3, { colours: { hair: 'rubbish' } })[4].colour, personParts(3)[4].colour, 'a bad colour keeps the usual one');
  assert.equal(personFloats(3, look('female')).length > personFloats(3).length, true, 'indoors too');
});

test('another person outdoors can\'t be walked through, and two on the same spot don\'t get stuck', () => {
  const place = new Place({ lat: 38.9, lng: -77 });
  const world = { place, height: () => 0, floor: () => 0, carWalls: [], solidPeople: () => [{ x: 0, y: 0.1 }] };
  const walker = newWalker(0, -3, 0);
  for (let i = 0; i < 120; i++) stepWalker(walker, { forward: 1, walkSpeed: 3 }, 1 / 60, world);
  assert.ok(Math.hypot(walker.x, walker.y - 0.1) >= RADIUS * 2 - 1e-3, `stopped short, or slid by: ${walker.x}, ${walker.y}`);
  const onTop = newWalker(0, 0.1, 0);
  world.solidPeople = () => [{ x: 0, y: 0.1 }];
  stepWalker(onTop, { strafe: 1, walkSpeed: 3 }, 1 / 60, world);
  assert.ok(Number.isFinite(onTop.x), 'exactly on top of someone is no trouble');
});
