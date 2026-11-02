// Getting past what's in the way: climbing over furniture, and a sledgehammer for walls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { breakThrough, canClimb, outletSpots, switchSpots, wallAhead, withoutTaken } from '../public/js/footActions.js';
import { climbOver } from '../public/js/footWalker.js';
import { GAME } from '../public/js/gameConfig.js';
import { PocketData } from '../public/js/pocketData.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const room = { };
// A person at (0, 0) facing north, with a box a little ahead of them.
const world = (boxes, walls = [], inside = room, roomOk = () => true) => ({
  carWalls: [],
  inner: { boxes, walls },
  place: { cellAt: () => ({ buildings: [] }), walls: () => [], footprintAt: (x, y) => (roomOk(x, y) ? inside : null) },
});
const box = (x, y, hw, hd, top = 2) => ({ x, y, c: 1, s: 0, hw, hd, top, entry: ['storeShelf', 'm', 0, 0, 0, 0] });
const person = (facing = 0) => ({ x: 0, y: 0, facing, inside: room });

test('climbing lands on the far side of what they are facing', () => {
  const to = climbOver(person(), world([box(0, 1, 2, 0.4)]));
  assert.ok(to);
  assert.ok(to.y > 1.4, `landed at ${to.y}`);
  assert.equal(to.x, 0);
});

test('nothing is offered for a thing behind them, or too far away', () => {
  assert.equal(climbOver(person(Math.PI), world([box(0, 1, 2, 0.4)])), null);
  assert.equal(climbOver(person(), world([box(0, 3, 2, 0.4)])), null);
});

test('a second thing straight behind the first is cleared too, as shelves stand back to back', () => {
  const to = climbOver(person(), world([box(0, 1, 2, 0.4), box(0, 1.8, 2, 0.4)]));
  assert.ok(to.y > 2.2, `landed at ${to.y}`);
});

test('a full wall behind it stops the climb, but a thing with a top does not', () => {
  const wall = { ax: -5, ay: 1.6, bx: 5, by: 1.6 };
  assert.equal(climbOver(person(), world([box(0, 1, 2, 0.4)], [wall])), null);
  assert.ok(climbOver(person(), world([box(0, 1, 2, 0.4)], [{ ...wall, top: 1 }])));
});

test('it never lands outside the building', () => {
  assert.equal(climbOver(person(), world([box(0, 1, 2, 0.4)], [], room, (x, y) => y < 1.4)), null);
});

test('skip leaves a thing out, and stairs and doors are never climbed', () => {
  assert.equal(climbOver(person(), world([box(0, 1, 2, 0.4)]), () => true), null);
  assert.equal(canClimb('stairs', 2), false);
  assert.equal(canClimb('frontDoor', 2), false);
  assert.equal(canClimb('pillar', 2), false, 'you walk round a pillar');
  assert.equal(canClimb('storeShelf', 2), true);
  assert.equal(canClimb('storeShelf', 0.1), false, 'too low to bother with');
});

const floor = () => ({ walls: [[-10, 2, 10, 2], [-10, -6, -2, -6], [0.5, -6, 10, -6]], items: [], zones: [], axis: 0 });

test('a hole is on the wall they face, as wide as the config says, and the rest stays', () => {
  const { hole } = wallAhead(floor(), null, 'b', 1, 0, 1.5, 0);
  assert.equal(hole[1], 2);
  assert.ok(Math.abs(Math.hypot(hole[2] - hole[0], hole[3] - hole[1]) - GAME.hammer.width) < 1e-6);
  assert.ok(hole[0] <= 3 && hole[2] >= -3);
  const plan = {}, record = breakThrough(floor(), plan, 1, hole);
  assert.equal(record.walls.length, 4);
  const onLine = record.walls.filter((w) => w[1] === 2).sort((a, b) => a[0] - b[0]);
  assert.equal(onLine[0][2], hole[0]);
  assert.equal(onLine[1][0], hole[2]);
});

test('no wall is offered when it is behind them or out of reach', () => {
  assert.equal(wallAhead(floor(), null, 'b', 1, 0, 1.5, Math.PI), null);
  assert.equal(wallAhead(floor(), null, 'b', 1, 0, -2, 0), null);
});

test('a hole is kept with the building, and comes back when the floor is read again', () => {
  const plan = {}, { hole } = wallAhead(floor(), null, 'b', 1, 3, 1.5, 0);
  breakThrough(floor(), plan, 1, hole);
  const saved = JSON.parse(JSON.stringify(plan)), again = withoutTaken(floor(), saved, 1);
  assert.equal(again.walls.length, 4);
  assert.equal(again.builtWalls.length, 3);
  assert.deepEqual(withoutTaken(floor(), saved, 2).walls, floor().walls, 'only on its own floor');
});

test('a hole grows no switches and moves no power points', () => {
  const plan = {}, { hole } = wallAhead(floor(), null, 'b', 1, 3, 1.5, 0), before = floor();
  const after = breakThrough(floor(), plan, 1, hole);
  assert.deepEqual(switchSpots(after, null), switchSpots(before, null));
  assert.deepEqual(outletSpots(after, null, 'b', 1), outletSpots(before, null, 'b', 1));
});

test('a hole keeps clear of a switch, and a short wall full of them refuses', () => {
  const wiring = floor(), spot = switchSpots(wiring, null)[0];
  assert.ok(spot, 'the gap in the far wall has a switch by it');
  const near = wallAhead(wiring, null, 'b', 1, spot.u, spot.v + 0.5, Math.PI);
  assert.ok(near.hole);
  assert.ok(near.hole[2] < spot.u - 0.2 || near.hole[0] > spot.u + 0.2);
  const tiny = { ...floor(), walls: [[-0.5, 2, 0.5, 2], [1.2, 2, 2, 2]] }, door = switchSpots(tiny, null)[0];
  assert.equal(wallAhead(tiny, null, 'b', 1, door.u, 1.5, 0).hole, null);
});

test('the car gets one sledgehammer, once, and old saves get it too', () => {
  const storage = memory(), data = new PocketData(storage);
  assert.deepEqual(data.car, [{ id: GAME.hammer.item, name: GAME.hammer.item, count: 1 }]);
  data.drop(GAME.hammer.item, true);
  data.save();
  assert.equal(new PocketData(storage).car.length, 0, 'not given again');
  const old = memory();
  old.setItem('geodrive_pocket_v1', JSON.stringify({ notes: [], messages: {}, bag: [], car: [{ id: 'Milk', name: 'Milk', count: 1 }] }));
  assert.equal(new PocketData(old).car.length, 2);
});

test('what the game hands the walking code is all kept, as a name left out is silently dropped', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('../public/js/main.js', import.meta.url), 'utf8'), foot = await readFile(new URL('../public/js/foot.js', import.meta.url), 'utf8');
  const given = main.match(/new Foot\(\{(.*)\}\);/)[1], taken = foot.match(/constructor\(\{([^}]*)\}\)/)[1].split(',').map((name) => name.trim());
  for (const name of ['hasKey', 'hasHammer', 'onSay', 'onUsed', 'onSound']) {
    assert.ok(given.includes(`${name}:`), `main.js gives ${name}`);
    assert.ok(taken.includes(name), `Foot takes ${name}`);
    assert.ok(foot.includes(`this.${name} = ${name};`), `Foot keeps ${name}`);
  }
});
