import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_REASONS, cleanCar, cleanStorage, plantCars, rescueCar } from '../public/js/worldCars.js';
import { FLAG_BRIDGE } from '../public/js/road.js';
import { GAME } from '../public/js/gameConfig.js';
import { SAYINGS } from '../public/js/sayingsConfig.js';
import { SharedCars } from '../public/js/sharedWorld.js';
import { BumpLimit, carTouchesPerson, carsTouch, closingSpeed, firstHit } from '../public/js/collide.js';
import { metresApart } from '../public/js/protocol.js';

const METRE = 1 / 111320;
// A long straight road north, from a given start, in the shape vector.js gives.
const road = (lat = 38.9, lng = -77.4, metres = 30000, f = 0) => ({ id: 'w', f, n: [], c: [lat, lng, lat + metres * METRE, lng] });

test('everyone gets the same cars from the same road', () => {
  assert.deepEqual(plantCars([road()]), plantCars([road()]));
  assert.notDeepEqual(plantCars([road(39)]).map((c) => c.id), plantCars([road()]).map((c) => c.id), 'and different ones on another road');
});

test('cars are spaced along a road at about the set distance, none on bridges', () => {
  const cars = plantCars([road()]), expected = 30000 / GAME.worldCars.every;
  assert.ok(cars.length > expected * 0.7 && cars.length < expected * 1.4, `${cars.length}`);
  assert.equal(plantCars([road(38.9, -77.4, 30000, FLAG_BRIDGE)]).length, 0);
  assert.equal(plantCars([{ f: 0, c: [1, 2] }]).length, 0, 'a road with one point');
});

test('about 2 in 5 run and about 1 in 4 hold a sledgehammer, and those that don\'t run say why', () => {
  const cars = Array.from({ length: 40 }, (_, i) => plantCars([road(38 + i * 0.5)])).flat();
  const share = (fits) => cars.filter(fits).length / cars.length;
  assert.ok(cars.length > 1000);
  assert.ok(Math.abs(share((c) => c.runs) - GAME.worldCars.runningChance) < 0.05, `${share((c) => c.runs)}`);
  assert.ok(Math.abs(share((c) => c.storage.some((i) => i.id === GAME.hammer.item)) - GAME.worldCars.hammerChance) < 0.05);
  for (const car of cars) assert.equal(!!car.why, !car.runs);
  for (const why of CAR_REASONS) assert.ok(SAYINGS[why]?.length, why);
  for (const car of cars) assert.ok(car.fuel >= 25 && car.fuel <= 95);
});

test('a car sits at the kerb, in line with the road', () => {
  for (const car of plantCars([road()])) {
    assert.ok(Math.abs(metresApart(car, { lat: car.lat, lng: -77.4 }) - GAME.worldCars.kerb) < 0.05, 'beside the road');
    assert.ok(car.heading === 0 || Math.abs(car.heading - 180) < 1e-6, `${car.heading}`);
  }
});

test('a car needs a good id, place and look before it\'s kept', () => {
  const [car] = plantCars([road()]);
  assert.equal(cleanCar(car).id, car.id);
  assert.equal(cleanCar(car).driver, null, 'nobody can claim to be driving');
  for (const bad of [null, {}, { ...car, id: '../x' }, { ...car, lat: 200 }, { ...car, lng: NaN }, { ...car, type: 'tank' }, { ...car, colour: 'red' }, { ...car, runs: 'yes' }]) assert.equal(cleanCar(bad), null);
  assert.equal(cleanCar({ ...car, fuel: 900 }).fuel, 100);
  const rescued = rescueCar(38.9, -77.4, 90, 'me-1');
  assert.equal(rescued.runs, true);
  assert.equal(cleanCar(rescued).id, 'x_me-1');
});

test('storage must be a short list of plain things', () => {
  assert.deepEqual(cleanStorage([{ id: 'Sledgehammer', name: 'Sledgehammer', count: 1, x: 1 }]), [{ id: 'Sledgehammer', name: 'Sledgehammer', count: 1 }]);
  for (const bad of ['x', [{ id: 5, count: 1 }], [{ id: 'a', count: 0 }], [{ id: 'a', count: 1.5 }], Array(61).fill({ id: 'a', count: 1 })]) assert.equal(cleanStorage(bad), null);
});

test('around shows parked cars, a moved one where it now is, and not those being driven', () => {
  const planted = plantCars([road()]), first = planted[0], cars = new SharedCars(null, 'me');
  cars.plantFrom(new Map([['t', [road()]]]));
  assert.equal(cars.around(first, 1)[0].id, first.id);
  cars.heard({ ...first, lat: 40, lng: -70, driver: null });
  assert.equal(cars.around(first, 1).length, 0, 'it\'s gone from there');
  assert.equal(cars.around({ lat: 40, lng: -70 }, 5)[0].id, first.id);
  cars.heard({ ...first, driver: 'dana' });
  assert.equal(cars.around(first, 1).length, 0);
  assert.equal(cars.mine(), null);
  cars.heard({ ...first, driver: 'me' });
  assert.equal(cars.mine().id, first.id);
  assert.equal(cars.around(first, 5000, 3).length, 3, 'with a limit');
  assert.ok(metresApart(cars.around(planted[3], 5000, 1)[0], planted[3]) < 1, 'nearest first');
  cars.plantFrom(new Map());
  assert.equal(cars.plantedTiles.size, 0, 'and a tile let go of takes its cars with it');
});

const CAR_BOX = { halfWidth: 1, halfLength: 2.2 };
const METRE_LAT = 1 / 111320;
const north = (metres) => ({ lat: 38.9 + metres * METRE_LAT, lng: -77.4 });
const parked = (metres, over = {}) => ({ id: 'p', kind: 'parked', ...north(metres), heading: 0, speed: 0, ...CAR_BOX, ...over });
const driving = (metres, speed, heading = 0) => ({ ...north(metres), heading, speed, ...CAR_BOX });

test('cars touch when their rectangles do, turned or not', () => {
  const at = (x, y, heading = 0) => ({ x, y, heading, ...CAR_BOX });
  assert.equal(carsTouch(at(0, 0), at(0, 4)), true, 'nose to tail, overlapping');
  assert.equal(carsTouch(at(0, 0), at(0, 5)), false);
  assert.equal(carsTouch(at(0, 0), at(1.9, 0)), true, 'side by side');
  assert.equal(carsTouch(at(0, 0), at(2.1, 0)), false);
  assert.equal(carsTouch(at(0, 0, 90), at(0, 3.3)), false, 'a car across the road reaches less far that way');
  assert.equal(carsTouch(at(0, 0, 90), at(0, 3.1)), true);
  assert.equal(carsTouch(at(0, 0, 90), at(0, 2.9, 90)), false);
  assert.equal(carsTouch(at(0, 0, 90), at(4, 0, 90)), true);
  assert.equal(carsTouch(at(0, 0, 45), at(2.5, 2.5, 45)), true);
  assert.equal(carsTouch(at(0, 0, 45), at(2.5, -2.5, 45)), false, 'beside it, on the diagonal');
});

test('a car touches a person at its edge', () => {
  const car = { x: 0, y: 0, heading: 0, ...CAR_BOX };
  assert.equal(carTouchesPerson(car, { x: 0, y: 2.5 }, 0.35), true);
  assert.equal(carTouchesPerson(car, { x: 0, y: 2.6 }, 0.35), false);
  assert.equal(carTouchesPerson(car, { x: 1.3, y: 0 }, 0.35), true);
  assert.equal(carTouchesPerson(car, { x: 1.4, y: 0 }, 0.35), false);
});

test('a car hits what\'s ahead, and says how fast and how far to go back', () => {
  const hit = firstHit(driving(1, 20), 0.5, [parked(5)]);
  assert.ok(hit);
  assert.equal(hit.closing, 20);
  assert.ok(hit.back > 0);
  assert.equal(firstHit(driving(1, 20), 0.5, [parked(10)]), null, 'not yet');
  assert.equal(firstHit(driving(1, 20), 0.5, []), null);
});

test('at any speed nothing is jumped over', () => {
  const fast = driving(100, 223), moved = 223 / 10; // a whole 10 fps frame at top speed
  const hit = firstHit({ ...fast, ...north(100) }, moved, [parked(90)]);
  assert.ok(hit, 'it was in the way');
  assert.ok(hit.back > 3, `stops well short of where it would have got to: ${hit.back}`);
  assert.equal(firstHit({ ...fast, ...north(100) }, moved, [parked(150)]), null, 'beyond it, nothing');
});

test('reversing hits what\'s behind', () => {
  const hit = firstHit(driving(0, -5), -0.2, [parked(-4)]);
  assert.ok(hit);
  assert.equal(hit.closing, 5);
  assert.equal(firstHit(driving(0, -5), -0.2, [parked(4.5)]), null);
});

test('a car already touching something can drive away from it', () => {
  assert.equal(firstHit(driving(0, 5), 0.1, [parked(-4)]), null, 'forward, from what\'s behind');
  assert.equal(firstHit(driving(0, -5), -0.1, [parked(4)]), null, 'back, from what\'s ahead');
  assert.ok(firstHit(driving(0, 5), 0.1, [parked(4)]), 'but not further in');
  assert.equal(firstHit(driving(0, 0), 0, [parked(4)]), null, 'and sitting still does nothing');
});

test('closing speed is how fast two are coming together', () => {
  const toward = { x: 0, y: 1 };
  assert.equal(closingSpeed({ heading: 0, speed: 20 }, { heading: 180, speed: 25 }, toward), 45, 'head on adds up');
  assert.equal(closingSpeed({ heading: 0, speed: 30 }, { heading: 0, speed: 20 }, toward), 10, 'catching up is the difference');
  assert.equal(closingSpeed({ heading: 0, speed: 20 }, { heading: 0, speed: 30 }, toward), 0, 'being left behind is nothing');
  assert.equal(closingSpeed({ heading: 180, speed: 20 }, { speed: 0 }, toward), 0, 'nor is moving away');
  assert.ok(Math.abs(closingSpeed({ heading: 90, speed: 20 }, { heading: 0, speed: 0 }, { x: 0, y: 1 })) < 1e-9, 'passing across isn\'t closing');
});

test('a moving car and a person are both hit', () => {
  const hit = firstHit(driving(0, 10), 0.2, [{ id: 'd', kind: 'car', ...north(4), heading: 180, speed: 10, ...CAR_BOX }]);
  assert.equal(hit.closing, 20);
  const person = firstHit(driving(0, 10), 0.2, [{ id: 'p', kind: 'person', ...north(2.5), radius: 0.35 }]);
  assert.equal(person.closing, 10);
  assert.equal(person.other.kind, 'person');
});

test('bumps between two things come at most once in a while', () => {
  const limit = new BumpLimit(1000);
  assert.equal(limit.allows('a', 0), true);
  assert.equal(limit.allows('a', 500), false);
  assert.equal(limit.allows('b', 500), true, 'something else is its own');
  assert.equal(limit.allows('a', 1000), true);
});
