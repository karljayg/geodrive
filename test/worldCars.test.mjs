import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_REASONS, cleanCar, cleanStorage, plantCars, rescueCar } from '../public/js/worldCars.js';
import { FLAG_BRIDGE } from '../public/js/road.js';
import { GAME } from '../public/js/gameConfig.js';
import { SAYINGS } from '../public/js/sayingsConfig.js';
import { SharedCars } from '../public/js/sharedWorld.js';
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

test('about 1 in 4 run and about 1 in 4 hold a sledgehammer, and those that don\'t run say why', () => {
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
