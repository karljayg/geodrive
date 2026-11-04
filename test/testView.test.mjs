import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonGlb } from '../public/js/carModel.js';
import { crackPaths, groundOnScreen, groundReach, litterSpecks, makeDrops, plantParts, readTestView, resolveView, stepDrops, toCamera, vinePlaces, worldMetres } from '../public/js/testView.js';

const chase = { width: 800, height: 600, tilt: 62, range: 130, fovY: 35, below: 0.45 };

test('the address turns a view on, and a missing one leaves the game alone', () => {
  assert.equal(readTestView(''), null);
  assert.equal(readTestView('?world=walktest'), null);
  assert.equal(readTestView('?testview=snow').drops, 'snow');
  assert.equal(readTestView('?testview=SNOW').name, 'snow');
  assert.equal(readTestView('?testview=off').grade, null);
  assert.equal(readTestView('?testview=').name, 'off');
  const mix = readTestView('?testview=rain,cracks');
  assert.equal(mix.drops, 'rain');
  assert.equal(mix.cracks, true);
  assert.equal(mix.vines, false);
  const ruin = resolveView('ruin');
  assert.equal(ruin.vines && ruin.cracks && ruin.deadVines && ruin.drops === 'ash', true);
});

test('the ground under the camera is where the car sits, ahead is higher, and right is to the right', () => {
  const at = groundOnScreen(0, 0, chase);
  assert.ok(Math.abs(at.y / chase.height - 0.725) < 0.02, `car row ${at.y}`);
  assert.ok(Math.abs(at.x - chase.width / 2) < 1);
  assert.ok(groundOnScreen(24, 0, chase).y < at.y);
  assert.ok(groundOnScreen(12, 8, chase).x > groundOnScreen(12, 0, chase).x);
  const north = toCamera(0, 10, 0);
  assert.ok(north.ahead > 9 && Math.abs(north.side) < 0.01);
  const facingEast = toCamera(0, 10, 90);
  assert.ok(facingEast.side < -9 && Math.abs(facingEast.ahead) < 0.01);
});

test('cracks, plants and litter stay put, and the filled area passes the horizon', () => {
  const lat = 38.9555, lng = -77.4475;
  assert.deepEqual(crackPaths(lat, lng), crackPaths(lat, lng));
  const here = crackPaths(lat, lng), nearby = crackPaths(lat + 0.0002, lng);
  assert.ok(here.length > 8);
  const shared = here.filter((path) => nearby.some((other) => other.pts[0].east === path.pts[0].east && other.pts[0].north === path.pts[0].north));
  assert.ok(shared.length > 0, 'a crack shared by two spots a short way apart');
  const plants = vinePlaces(lat, lng, 600);
  assert.ok(plants.length > 4 && plants.length <= 100);
  assert.ok(plants.every((spot) => spot.dist >= 8 && spot.dist <= 600));
  assert.ok(plants.some((spot) => spot.dist > 250), 'plants already stand past where the view ends');
  assert.deepEqual(vinePlaces(lat, lng, 600).map((spot) => spot.id), plants.map((spot) => spot.id));
  const moved = vinePlaces(lat + 0.0003, lng, 600);
  const still = new Set(moved.map((spot) => spot.id));
  const near = plants.filter((spot) => spot.dist < 520);
  assert.ok(near.filter((spot) => still.has(spot.id)).length > near.length * 0.9);
  const snow = litterSpecks(lat, lng, 'snow');
  assert.ok(snow.length > 10);
  assert.ok(snow.every((speck) => speck.r < 0.2));
  assert.deepEqual(litterSpecks(lat, lng, 'snow'), snow);
  assert.equal(litterSpecks(lat, lng, 'nope').length, 0);
  const wide = crackPaths(lat, lng, 600);
  const origin = worldMetres(lat, lng);
  assert.ok(wide.some((path) => Math.hypot(path.pts[0].east - origin.east, path.pts[0].north - origin.north) > 280));
});

test('the filled ground reaches past the top of a high camera', () => {
  const high = { width: 1400, height: 800, tilt: 45, range: 320, fovY: 35, below: 0.45 };
  let far = 0;
  for (let ahead = 40; ahead < 1500; ahead += 15) {
    const at = groundOnScreen(ahead, 0, high);
    if (!at || at.y < 4) break;
    far = Math.hypot(ahead, 0);
  }
  assert.ok(far > 150, `visible ground ends at ${far}`);
  assert.ok(groundReach(high) > far * 1.2, `reach ${groundReach(high)} visible ${far}`);
});

test('rain falls down the screen, and a plant model builds', () => {
  const drops = makeDrops('rain', 400, 300, () => 0.25);
  const before = drops[0].y;
  stepDrops(drops, 0.05, 400, 300, 'rain', () => 0.2);
  assert.ok(drops[0].y > before);
  for (const kind of ['bush', 'vine']) {
    for (const dead of [false, true]) {
      const glb = buildPersonGlb(plantParts(kind, dead));
      assert.equal(glb[0], 0x67);
      assert.ok(glb.length > 400);
    }
  }
});
