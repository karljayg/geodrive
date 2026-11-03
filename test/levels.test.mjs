// Where things on the ground mustn't stop a car: bridges, tunnels and highways. And what stops one elsewhere: buildings and water.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TileLevels, tilesAhead } from '../public/js/levels.js';
import { FootprintIndex, buildingHit, sameLevel } from '../public/js/collide.js';
import { waterFromTile } from '../public/js/stations.js';

const LAT = 39, LNG = -77.4, NORTH = 1 / 111320, EAST = 1 / (111320 * Math.cos((LAT * Math.PI) / 180));
const at = (x, y) => [LNG + x * EAST, LAT + y * NORTH]; // metres east and north, as [lng, lat]
const CONFIG = { bridgeClear: 30, highwayClear: 15, waterRoadClear: 12 };
const here = (levels, method, x, y) => {
  const [lng, lat] = at(x, y);
  return levels[method](lat, lng);
};

test('beside a bridge or tunnel line counts as on it, and further off doesn\'t', () => {
  const levels = new TileLevels({ bridges: [[at(0, 0), at(100, 0)]] }, CONFIG);
  assert.equal(here(levels, 'nearBridge', 50, 0), true);
  assert.equal(here(levels, 'nearBridge', 50, 25), true, 'the far edge of a wide one');
  assert.equal(here(levels, 'nearBridge', 50, 40), false);
  assert.equal(here(levels, 'nearBridge', 125, 0), true, 'just past its end');
  assert.equal(here(levels, 'nearBridge', 140, 0), false);
});

test('a highway\'s lanes count for buildings and water, but not for what\'s parked on it', () => {
  const levels = new TileLevels({ highways: [[at(0, 0), at(100, 0)]] }, CONFIG);
  assert.equal(here(levels, 'overGround', 50, 12), true);
  assert.equal(here(levels, 'overGround', 50, 40), false);
  assert.equal(here(levels, 'nearBridge', 50, 12), false);
});

test('a bridge counts for buildings and water too', () => {
  const levels = new TileLevels({ bridges: [[at(0, 0), at(100, 0)]] }, CONFIG);
  assert.equal(here(levels, 'overGround', 50, 25), true);
});

test('close to any road water doesn\'t count, for docks and causeways with no bridge tag', () => {
  const levels = new TileLevels({ roads: [[at(0, 0), at(100, 0)]] }, CONFIG);
  assert.equal(here(levels, 'nearRoad', 50, 9), true);
  assert.equal(here(levels, 'nearRoad', 50, 20), false);
  assert.equal(here(new TileLevels({}, CONFIG), 'nearRoad', 50, 9), false);
});

test('a tile with no bridges or highways says so', () => {
  const levels = new TileLevels({}, CONFIG);
  assert.equal(levels.nearBridge(LAT, LNG), false);
  assert.equal(levels.overGround(LAT, LNG), false);
});

test('on or beside a bridge only another driver at the same level can be hit', () => {
  const parked = { id: 'p', kind: 'parked' }, person = { id: 'q', kind: 'person' }, below = { id: 'r', kind: 'car', onBridge: false }, above = { id: 's', kind: 'car', onBridge: true };
  assert.deepEqual(sameLevel([parked, person, below, above], true), [above], 'on top');
  assert.deepEqual(sameLevel([parked, person, below, above], false), [below], 'beside or below');
});

test('water stops a car, however fast, as a building does', () => {
  const lake = new FootprintIndex([[at(0, 20), at(100, 20), at(100, 120), at(0, 120), at(0, 20)]]), contains = (lat, lng) => lake.contains(lat, lng);
  const [lng] = at(50, 0), frame = 223 / 60;
  let hit = null, y = 0;
  for (; y < 60 && !hit; y += frame) hit = buildingHit({ lat: LAT + y * NORTH, lng, heading: 0, halfWidth: 0.95, halfLength: 2.2 }, frame, contains, 1);
  assert.ok(hit, 'stopped at the shore');
  assert.ok(y < 30, `not far into it: ${y}`);
});

test('a tile with no water layer has no water', () => {
  assert.deepEqual(waterFromTile(new Uint8Array(0), 0, 0), []);
});

test('the tiles wanted are the one here and those about to be reached, each once', () => {
  const tileAt = (lat, lng) => ({ x: Math.floor(lng * 100), y: Math.floor(lat * 100) });
  assert.equal(tilesAhead(39.005, -77.005, 0, 10, tileAt).length, 1, 'nothing new close by');
  const ahead = tilesAhead(39.0095, -77.005, 0, 400, tileAt);
  assert.equal(ahead.length, 2, 'the next one, before the car gets there');
  assert.deepEqual(ahead[1], tileAt(39.0095 + 400 / 111320, -77.005));
});
