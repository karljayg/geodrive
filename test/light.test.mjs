import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceHour, clockText } from '../public/js/daylight.js';
import { TORCHES, lightAt, lightMap, sunAt, windowsOn } from '../public/js/roomLight.js';
import { PocketData, BAG_SLOTS, CAR_SLOTS, FLASHLIGHT } from '../public/js/pocketData.js';
import { torchPools } from '../public/js/headlights.js';

// A room 20 by 10 with windows on the east and west walls. Rings run anticlockwise, so inside is left of each wall.
const box = { minX: 0, maxX: 20, minY: 0, maxY: 10 };
const east = { ax: 20, ay: 0, bx: 20, by: 10 }, west = { ax: 0, ay: 10, bx: 0, by: 0 };
const windows = [...windowsOn(east), ...windowsOn(west)];
const mean = (map, x0, x1) => { let sum = 0, n = 0; for (let x = x0; x < x1; x += 0.5) for (let y = 1; y < 9; y += 0.5) { sum += lightAt(map, x, y); n++; } return sum / n; };

test('the sun rises in the east, is south at noon and sets in the west, and is gone at night', () => {
  assert.ok(sunAt(8).x > 0.5, 'morning is to the east');
  assert.ok(sunAt(16).x < -0.5, 'afternoon to the west');
  assert.ok(sunAt(12).y < -0.9 && Math.abs(sunAt(12).x) < 0.05, 'noon to the south');
  assert.equal(sunAt(23).strength, 0);
  assert.ok(sunAt(23).sky < 0.05 && sunAt(12).sky > 0.9);
});

test('a window looks into the room, on the side the wall has its room', () => {
  for (const w of windowsOn(east)) assert.equal(w.nx, -1, 'an east wall looks west');
  for (const w of windowsOn(west)) assert.equal(w.nx, 1);
  assert.equal(windowsOn({ ax: 0, ay: 0, bx: 1, by: 0 }).length, 0, 'too short for one');
});

test('morning sun comes in the east windows, and afternoon sun the west ones', () => {
  const morning = lightMap(box, windows, [], 8.5), afternoon = lightMap(box, windows, [], 15.5);
  assert.ok(mean(morning, 14, 20) > mean(morning, 0, 6) * 1.25, `morning east ${mean(morning, 14, 20)} west ${mean(morning, 0, 6)}`);
  assert.ok(mean(afternoon, 0, 6) > mean(afternoon, 14, 20) * 1.25, `afternoon west ${mean(afternoon, 0, 6)} east ${mean(afternoon, 14, 20)}`);
});

test('no light at night, more by a window than deep in a room, and none through a wall', () => {
  assert.ok(mean(lightMap(box, windows, [], 23), 0, 20) < 0.02);
  const noon = lightMap(box, windows, [], 12);
  assert.ok(lightAt(noon, 1.5, 5) > lightAt(noon, 10, 5) * 1.5, 'brighter near a window');
  const walled = lightMap({ minX: 0, maxX: 20, minY: 0, maxY: 10 }, windowsOn(west), [{ ax: 6, ay: 0, bx: 6, by: 10 }], 12);
  assert.ok(lightAt(walled, 2, 5) > 0.1);
  assert.ok(lightAt(walled, 9, 5) < 0.01, 'the room behind a wall stays dark');
  assert.ok(mean(lightMap(box, [], [], 12), 0, 20) === 0, 'and one with no windows is dark at noon');
});

test('a light map is small enough for a big building', () => {
  const map = lightMap({ minX: 0, maxX: 300, minY: 0, maxY: 200 }, windows, [], 12);
  assert.ok(map.width <= 96 && map.height <= 96);
  assert.equal(map.data.length, map.width * map.height);
});

test('the flashlight reaches far and wide, the phone about a person ahead and narrow', () => {
  assert.ok(TORCHES.flash.reach > TORCHES.phone.reach * 5);
  assert.ok(TORCHES.phone.reach < 2.2, 'about five feet');
  assert.ok(TORCHES.flash.cone > 0 && TORCHES.phone.cone > 0);
  const big = torchPools(16, 0.34), small = torchPools(2.2, 0.28);
  assert.ok(big.every((p) => p.r === 0), 'one beam, not two');
  assert.ok(Math.max(...big.map((p) => p.f)) > Math.max(...small.map((p) => p.f)) * 5);
  assert.ok(Math.max(...big.map((p) => p.rx)) > Math.max(...small.map((p) => p.rx)) * 3);
});

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('everyone starts with a flashlight in the bag, and things move one at a time, while there is room', () => {
  const storage = memory(), data = new PocketData(storage);
  assert.equal(data.bagHas(FLASHLIGHT), true);
  assert.equal(data.addToBag({ id: 'Milk', name: 'Milk' }), true);
  data.addToBag({ id: 'Milk', name: 'Milk' });
  assert.equal(data.move('Milk', true), true);
  assert.equal(data.bag.find((i) => i.id === 'Milk').count, 1);
  assert.equal(data.car[0].count, 1);
  assert.equal(data.move(FLASHLIGHT, true), true);
  assert.equal(new PocketData(storage).bagHas(FLASHLIGHT), false, 'and it stays in the car after a reload');
  assert.equal(new PocketData(storage).car.length, 2);
  assert.equal(data.move(FLASHLIGHT, false), true);
  assert.equal(data.bagHas(FLASHLIGHT), true);
  assert.equal(data.move('nothing', true), false);
});

test('a bag saved before there were flashlights gets one', () => {
  const storage = memory();
  storage.setItem('geodrive_pocket_v1', JSON.stringify({ notes: [], messages: {}, bag: [{ id: 'Milk', name: 'Milk', count: 1 }] }));
  const data = new PocketData(storage);
  assert.equal(data.bagHas(FLASHLIGHT), true);
  assert.equal(data.bagHas('Milk'), true);
  data.save();
  assert.equal(new PocketData(storage).bag.filter((i) => i.id === FLASHLIGHT).length, 1, 'only once');
});

test('a full bag refuses, the car holds far more, and a full car refuses', () => {
  const data = new PocketData(memory());
  assert.ok(CAR_SLOTS >= BAG_SLOTS * 4);
  for (let i = 0; data.bag.length < BAG_SLOTS; i++) data.addToBag({ id: `b${i}`, name: 'x' });
  for (let i = 0; i < CAR_SLOTS; i++) { data.state.car.push({ id: `c${i}`, name: 'x', count: 1 }); }
  assert.equal(data.move('c0', false), false, 'the bag is full');
  assert.equal(data.move('b0', true), false, 'the car is full');
});

test('the clock keeps real time at the wheel, runs faster on foot as set, and wraps at midnight', () => {
  assert.equal(clockText(advanceHour(9, 60, false, 1)), '9:01 AM', 'a minute driving is a minute');
  assert.equal(clockText(advanceHour(9, 60, true, 1)), '10:00 AM', 'a minute on foot is an hour');
  assert.equal(clockText(advanceHour(9, 60, true, 3)), '12:00 PM', 'or what the setting says');
  assert.equal(clockText(advanceHour(23.5, 60, true, 1)), '12:30 AM');
  let hour = 9;
  for (let i = 0; i < 3600; i++) hour = advanceHour(hour, 1 / 60, true, 1);
  assert.equal(clockText(hour), '10:00 AM', 'and small steps add up to the same');
});
