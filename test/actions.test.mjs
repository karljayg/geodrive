import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actionsOf, usableNear, usePrompt, useThing, withoutTaken } from '../public/js/footActions.js';
import { ITEMS, parseFurniture } from '../public/js/furniture.js';
import { frameOf } from '../public/js/furnish.js';
import { SIT_FRAME, personParts, poseAt } from '../public/js/footPerson.js';

const bytes = readFileSync(new URL('../public/furniture.bin', import.meta.url));
const { models } = parseFurniture(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
const pts = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
const piece = { rings: [{ pts, seam: pts.map(() => false) }], minX: 0, maxX: 20, minY: 0, maxY: 20 };
const frame = frameOf([piece], 0);
const entry = (item, u = 0, v = 0, rot = 0) => [item, ITEMS[item].models[0], u, v, 0, rot, 0, 1];

test('what can be done with a thing comes from the catalogue, and stairs are left to L', () => {
  assert.deepEqual(actionsOf('chair'), ['sit']);
  assert.deepEqual(actionsOf('bed'), ['sleep']);
  assert.deepEqual(actionsOf('books'), ['pick up']);
  assert.deepEqual(actionsOf('microwave'), ['use', 'pick up']);
  assert.deepEqual(actionsOf('stairs'), []);
  assert.deepEqual(actionsOf('lift'), []);
  assert.deepEqual(actionsOf('rug'), []);
  assert.match(usePrompt(entry('microwave')), /F to use the microwave · Shift\+F to pick up the microwave/);
  assert.match(usePrompt(entry('bed')), /F to sleep on the bed/);
});

test('every thing that says it can be used can be, and says something', () => {
  for (const item of Object.keys(ITEMS)) {
    for (const second of [false, true]) {
      if (!actionsOf(item).length) continue;
      const result = useThing(entry(item), { }, 1, 'b', second);
      assert.ok(result.pose || result.say, item);
    }
  }
});

test('the thing in reach is the nearest, favouring what is ahead, and nothing far off', () => {
  const record = { axis: 0, items: [entry('books', 2, 0), entry('books', -2, 0), entry('rug', 0, 0), entry('books', 30, 30)] };
  assert.equal(usableNear(record, frame, models, 10 + 1, 10, Math.PI / 2)[2], 2, 'facing east, the one to the east');
  assert.equal(usableNear({ axis: 0, items: [entry('books', 8, 8)] }, frame, models, 10, 10, 0), null);
});

test('picking something up gives it and keeps it gone, even if the floor is read again', () => {
  const plan = {}, book = entry('books', 3, 4), other = entry('tableLamp', 1, 1), record = { items: [book, other] };
  const result = useThing(book, plan, 2, 'b');
  assert.equal(result.give, 'Books');
  assert.equal(result.taken, true);
  assert.deepEqual(withoutTaken(record, plan, 2).items, [other]);
  assert.deepEqual(withoutTaken(record, plan, 1).items, [book, other], 'only on that floor');
  assert.deepEqual(JSON.parse(JSON.stringify(plan)).state[2].taken.length, 1);
});

test('opening something finds at most one thing, the same every time for that building, and it stays searched', () => {
  const finds = new Set();
  for (let n = 0; n < 40; n++) {
    const plan = {}, fridge = entry('fridge', n, 0), first = useThing(fridge, plan, 1, 'b'), again = useThing(fridge, plan, 1, 'b');
    assert.match(again.say, /Nothing else/);
    assert.equal(again.give, undefined);
    assert.deepEqual(useThing(fridge, {}, 1, 'b'), first, 'the same for this building');
    if (first.give) finds.add(first.give);
  }
  assert.ok(finds.size >= 2, 'some variety');
});

test('sitting and sleeping take a pose, and a cash machine gives cash', () => {
  assert.equal(useThing(entry('sofa'), {}, 1, 'b').pose, 'sit');
  assert.equal(useThing(entry('bed'), {}, 1, 'b').pose, 'sleep');
  assert.equal(useThing(entry('atm'), {}, 1, 'b').give, 'Cash');
});

test('the sitting person has feet on the floor, knees ahead at about seat height', () => {
  const j = poseAt('sit', 0);
  assert.ok(j.hip[2] > 0.4 && j.hip[2] < 0.6, `${j.hip[2]}`);
  for (const leg of j.legs) {
    assert.ok(leg.knee[1] > 0.35, 'the thigh is forward');
    assert.ok(Math.abs(leg.ankle[2] - 0.06) < 0.05, 'and the foot down');
  }
  assert.ok(personParts(SIT_FRAME).some((part) => part.pos.length));
});
