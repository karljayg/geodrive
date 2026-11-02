import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_TYPE, findEntry, parsePlaces, readDirectory, tileId } from '../public/js/overture.js';

test('tiles are numbered zoom by zoom along a Hilbert curve, as PMTiles says', () => {
  assert.equal(tileId(0, 0, 0), 0);
  assert.deepEqual([[0, 0], [0, 1], [1, 1], [1, 0]].map(([x, y]) => tileId(1, x, y)), [1, 2, 3, 4]);
  assert.equal(tileId(2, 0, 0), 5);
  assert.equal(tileId(2, 3, 0), 20);
});

const varints = (list) => list.flatMap((n) => {
  const out = [];
  while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); }
  return [...out, n];
});

test('a directory is read column by column, with a zero offset meaning right after the last', () => {
  const bytes = Uint8Array.from(varints([3, 5, 1, 300, 1, 2, 0, 10, 20, 30, 1, 0, 500]));
  assert.deepEqual(readDirectory(bytes), [
    { id: 5, run: 1, length: 10, offset: 0 },
    { id: 6, run: 2, length: 20, offset: 10 },
    { id: 306, run: 0, length: 30, offset: 499 },
  ]);
});

test('finding a tile: inside a run, a further directory, or nothing', () => {
  const entries = [{ id: 5, run: 2 }, { id: 10, run: 0 }];
  assert.equal(findEntry(entries, 6).id, 5);
  assert.equal(findEntry(entries, 7), null, 'past the end of its run');
  assert.equal(findEntry(entries, 50).id, 10, 'a directory covers everything after it');
  assert.equal(findEntry(entries, 2), null);
});

test('banks, gas stations and garages are as they should be, and a cash machine counts for nothing', () => {
  assert.equal(CATEGORY_TYPE.bank_or_credit_union, 'bank');
  assert.equal(CATEGORY_TYPE.gas_station, 'gasStation');
  assert.equal(CATEGORY_TYPE.parking_garage, 'parking');
  assert.equal(CATEGORY_TYPE.atm, undefined, 'a cash machine says nothing about the building');
});

test('a tile with no places layer has no places', () => {
  assert.deepEqual(parsePlaces(new Uint8Array(0), 1, 1), []);
});
