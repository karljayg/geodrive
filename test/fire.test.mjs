// Fire: how long things burn, what a building needs to catch, the shapes kept for it, and the models built for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../public/js/gameConfig.js';
import { LocalFires, buildingStage, carFireStage, cleanFireShape, flameSpots, msPerHour, shootBuilding, thinRing } from '../public/js/burning.js';
import { buildBlastGlb, buildFlamesGlb, buildMuzzleGlb, buildRuinGlb, buildSmokeGlb, buildStreakGlb, buildWreckGlb, capOf } from '../public/js/fireModels.js';
import { firstWallInShot } from '../public/js/aim.js';
import { BODY_SHAPES } from '../public/js/carModel.js';

const HOUR = 1000, rules = GAME.burning;
const shape = { id: '1950300_-3870232', lat: 39.006, lng: -77.4046, rings: [[[39.00603, -77.40455], [39.00608, -77.40462], [39.00598, -77.40474], [39.00593, -77.40467]]], height: 6.5 };

// The JSON chunk of a .glb.
function gltfOf(glb) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'a glb');
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + view.getUint32(12, true))));
}

test('a wreck burns for its first hours and is charred after; one from before fires were kept is charred', () => {
  const car = { wrecked: true, wreckedAt: 0 };
  assert.equal(carFireStage(car, rules.carFireHours * HOUR - 1, HOUR), 'fire');
  assert.equal(carFireStage(car, rules.carFireHours * HOUR, HOUR), 'charred');
  assert.equal(carFireStage({ wrecked: true }, 0, HOUR), 'charred');
  assert.equal(carFireStage({ wrecked: false }, 0, HOUR), null);
});

test('a building smokes after enough shots, burns after more or after smoking a while, and is charred after burning', () => {
  let fire = null;
  for (let i = 0; i < rules.smokeShots - 1; i++) fire = shootBuilding(fire, shape, 1, 0, HOUR).fire;
  assert.equal(buildingStage(fire, 0, HOUR), null, 'not yet');
  let out = shootBuilding(fire, shape, 1, 10, HOUR);
  assert.equal(out.changed, true);
  assert.equal(buildingStage(out.fire, 10, HOUR), 'smoke');
  assert.equal(buildingStage(out.fire, 10 + rules.smokeToFireHours * HOUR, HOUR), 'fire', 'smoke left alone catches');
  out = shootBuilding(out.fire, shape, rules.fireShots, 20, HOUR);
  assert.equal(buildingStage(out.fire, 20, HOUR), 'fire', 'or enough shots light it');
  assert.equal(buildingStage(out.fire, 20 + rules.buildingFireHours * HOUR, HOUR), 'charred');
  const after = shootBuilding(out.fire, shape, 5, 30, HOUR);
  assert.equal(after.fire, out.fire, 'shooting a fire does nothing');
  assert.equal(after.changed, false);
});

test('game hours run at the shared clock in a world, and at the on-foot rate in the sandbox', () => {
  assert.equal(msPerHour(true), 3600000 / GAME.world.clockRate);
  assert.equal(msPerHour(false), 60000 / GAME.clock.onFootHoursPerMinute);
});

test('the sandbox keeps its fires in the browser', () => {
  const kept = new Map(), storage = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) };
  new LocalFires(storage).shoot(shape, rules.smokeShots, 5, HOUR);
  assert.equal(buildingStage(new LocalFires(storage).get(shape.id), 5, HOUR), 'smoke');
});

test('a building\'s shape is checked before it is kept', () => {
  assert.deepEqual(cleanFireShape(shape).rings, shape.rings);
  assert.equal(cleanFireShape({ ...shape, id: 'x' }), null);
  assert.equal(cleanFireShape({ ...shape, height: 1 }), null);
  assert.equal(cleanFireShape({ ...shape, rings: [[[39.1, -77.4], [39.006, -77.4], [39.006, -77.41]]] }), null, 'nothing kilometres off');
  assert.equal(cleanFireShape({ ...shape, rings: [Array.from({ length: 200 }, () => [39.006, -77.4046])] }), null, 'not too many corners');
  assert.equal(thinRing(Array.from({ length: 50 }, (_, i) => i), 10).length, 10);
});

test('flames stand inside the footprint', () => {
  const ring = [[-10, -5], [10, -5], [10, 5], [-10, 5]];
  const spots = flameSpots([ring], 6);
  assert.ok(spots.length >= 4);
  for (const { x, y } of spots) assert.ok(Math.abs(x) < 10 && Math.abs(y) < 5);
});

test('a roof covers an L-shaped outline with triangles inside it', () => {
  const ring = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  const tris = capOf(ring);
  assert.equal(tris.length, ring.length - 2);
  const area = tris.reduce((sum, [a, b, c]) => sum + Math.abs((ring[b][0] - ring[a][0]) * (ring[c][1] - ring[a][1]) - (ring[c][0] - ring[a][0]) * (ring[b][1] - ring[a][1])) / 2, 0);
  assert.equal(area, 64);
});

test('a shot meets a building\'s wall on its way to the ground, and not one behind the shooter or below its line', () => {
  const box = { height: 6 }, at = (x, y) => (x > 10 && x < 20 && Math.abs(y) < 5 ? box : null), heightOf = (b) => b.height;
  const hit = firstWallInShot({ x: -20, y: 0, z: 10 }, { x: 30, y: 0, z: 0 }, { x: 0, y: 0 }, at, heightOf);
  assert.ok(hit && hit.x > 10 && hit.x < 11, 'the near wall');
  assert.equal(firstWallInShot({ x: 40, y: 0, z: 20 }, { x: 0, y: 0, z: 0 }, { x: 5, y: 0 }, at, heightOf), null, 'a building between the camera and the person is behind them');
  assert.equal(firstWallInShot({ x: -20, y: 0, z: 200 }, { x: 30, y: 0, z: 0 }, { x: 0, y: 0 }, at, () => 1), null, 'over a low roof');
});

test('the fire models are glbs: the wreck is black, smoke and glows see-through, flames and flashes glow', () => {
  for (const type of Object.keys(BODY_SHAPES)) {
    const wreck = gltfOf(buildWreckGlb(type));
    assert.ok(!wreck.materials.some((m) => m.name === 'glass' || m.name === 'tyre'), `${type}: no glass or tyres left`);
    const soot = wreck.materials.find((m) => m.name === 'soot');
    assert.ok(soot.pbrMetallicRoughness.baseColorFactor.slice(0, 3).every((c) => c < 0.05), 'charred black');
  }
  const smoke = gltfOf(buildSmokeGlb(0.4, true));
  assert.ok(smoke.materials.every((m) => m.alphaMode === 'BLEND'));
  for (const glb of [buildFlamesGlb([{ x: 0, y: 0, z: 0, size: 3 }], 2), buildMuzzleGlb(), buildStreakGlb(), buildBlastGlb(0.1)]) {
    assert.ok(gltfOf(glb).materials.some((m) => m.emissiveFactor), 'something in it glows');
  }
  const ruin = gltfOf(buildRuinGlb([[[-5, -4], [5, -4], [5, 4], [-5, 4]]], 6.5, true));
  const walls = ruin.accessors.find((a) => a.min);
  assert.ok(ruin.accessors.filter((a) => a.max).every((a) => a.max[2] >= 0), 'stands up');
  assert.ok(Math.max(...ruin.accessors.filter((a) => a.max).map((a) => a.max[2])) >= 6.5, 'above the building it hides');
  assert.ok(walls.min[0] < -5, 'and a little wider than it');
});
