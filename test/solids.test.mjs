// What stops a car that nothing draws: rows of parking beside aisles, and woods, with every road kept open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TileSolids, tilesAhead } from '../public/js/solids.js';
import { buildingHit } from '../public/js/collide.js';

const LAT = 39, LNG = -77.4, NORTH = 1 / 111320, EAST = 1 / (111320 * Math.cos((LAT * Math.PI) / 180));
const at = (x, y) => [LNG + x * EAST, LAT + y * NORTH]; // metres east and north, as [lng, lat]
const CONFIG = { rowFrom: 3.6, rowTo: 9, roadClear: 4 };
const solid = (world, x, y) => {
  const [lng, lat] = at(x, y);
  return world.contains(lat, lng);
};
// An aisle running east for 100 m.
const lot = (more = {}) => new TileSolids({ aisles: [[at(0, 0), at(100, 0)]], roads: [], woods: [], ...more }, CONFIG);

test('beside an aisle is a row of parking, and the aisle itself is open', () => {
  const world = lot();
  assert.equal(solid(world, 50, 0), false, 'the middle of the aisle');
  assert.equal(solid(world, 50, 3), false, 'still the aisle');
  assert.equal(solid(world, 50, 6), true, 'a row to the north');
  assert.equal(solid(world, 50, -6), true, 'a row to the south');
  assert.equal(solid(world, 50, 12), false, 'beyond the row');
});

test('a row only runs as far as its aisle, so the end of a lot can be driven round', () => {
  const world = lot();
  assert.equal(solid(world, -6, 6), false);
  assert.equal(solid(world, 106, 6), false);
  assert.equal(solid(world, 99, 6), true);
});

test('a cross aisle cuts through a row, and so does any road', () => {
  const crossed = new TileSolids({ aisles: [[at(0, 0), at(100, 0)], [at(50, 0), at(50, 40)]], roads: [], woods: [] }, CONFIG);
  assert.equal(solid(crossed, 50, 6), false, 'the cross aisle');
  assert.equal(solid(crossed, 40, 6), true, 'the row beside it');
  const driveway = lot({ roads: [[at(70, -30), at(70, 30)]] });
  assert.equal(solid(driveway, 70, 6), false, 'a driveway through the row');
  assert.equal(solid(driveway, 60, 6), true);
});

test('a wood is solid except where something drivable goes through it', () => {
  const wood = [at(0, 0), at(100, 0), at(100, 100), at(0, 100), at(0, 0)];
  const plain = new TileSolids({ aisles: [], roads: [], woods: [wood] }, CONFIG);
  assert.equal(solid(plain, 50, 50), true);
  assert.equal(solid(plain, 150, 50), false);
  const tracked = new TileSolids({ aisles: [], roads: [[at(50, -10), at(50, 110)]], woods: [wood] }, CONFIG);
  assert.equal(solid(tracked, 50, 50), false, 'on the driveway');
  assert.equal(solid(tracked, 30, 50), true, 'off it');
});

test('a tile with nothing mapped stops nothing', () => {
  const empty = new TileSolids({ aisles: [], roads: [], woods: [] }, CONFIG);
  assert.equal(empty.contains(LAT, LNG), false);
});

test('a car at 500 mph can\'t jump a row, and one driving along the aisle is never stopped', () => {
  const world = lot(), contains = (lat, lng) => world.contains(lat, lng), box = { heading: 0, halfWidth: 0.95, halfLength: 2.2 };
  const [lng] = at(50, 0), frame = 223 / 60; // a frame's movement at 500 mph
  let hit = null, y = -1;
  for (; y < 20 && !hit; y += frame) hit = buildingHit({ lat: LAT + y * NORTH, lng, ...box }, frame, contains, 1);
  assert.ok(hit, 'stopped on the way across');
  assert.ok(y < 12, `and in the row, not past it: ${y}`);
  for (let x = 3; x < 97; x += frame) {
    const [east] = at(x, 0);
    assert.equal(buildingHit({ lat: LAT, lng: east, heading: 90, halfWidth: 0.95, halfLength: 2.2 }, frame, contains, 1), null);
  }
});

test('a car that finds itself in a row can always drive out', () => {
  const world = lot(), [lng] = at(50, 0);
  assert.equal(buildingHit({ lat: LAT + 6 * NORTH, lng, heading: 180, halfWidth: 0.95, halfLength: 2.2 }, 0.5, (la, ln) => world.contains(la, ln), 1), null);
});

test('the tiles wanted are the one here and those about to be reached, each once', () => {
  const tileAt = (lat, lng) => ({ x: Math.floor(lng * 100), y: Math.floor(lat * 100) });
  assert.equal(tilesAhead(39.005, -77.005, 0, 10, tileAt).length, 1, 'nothing new close by');
  const ahead = tilesAhead(39.0095, -77.005, 0, 400, tileAt);
  assert.equal(ahead.length, 2, 'the next one, before the car gets there');
  assert.deepEqual(ahead[1], tileAt(39.0095 + 400 / 111320, -77.005));
});
