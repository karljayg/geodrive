import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actionsOf, questionsFor, thingsNear, uniqueChoices, usableNear, useThing, withoutTaken, switchNeedsKey, switchSpots, useSwitch } from '../public/js/footActions.js';
import { SAYINGS } from '../public/js/sayingsConfig.js';
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
  assert.deepEqual(questionsFor(entry('microwave')).map((q) => q.label), ['Use the microwave?', 'Pick up the microwave?']);
  assert.deepEqual(questionsFor(entry('microwave')).map((q) => q.second), [false, true]);
  assert.equal(questionsFor(entry('bed'))[0].label, 'Sleep on the bed?');
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
    assert.ok(SAYINGS.nothingElse.some((l) => l.replace('{name}', 'fridge') === again.say), again.say);
    assert.equal(again.give, undefined);
    assert.equal(useThing(fridge, {}, 1, 'b').give, first.give, 'the same for this building');
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

test('switches sit by front doors and door gaps, and by the stairs on a floor with no front door', () => {
  const record = { items: [['frontDoor', 'frontDoor', 0, 0, 0, 0, -1, 1]], walls: [[0, 5, 4, 5], [5, 5, 9, 5], [12, 0, 12, 3], [20, 0, 20, 9]] };
  const spots = switchSpots(record, null);
  assert.ok(spots.some((s) => Math.hypot(s.u, s.v) < 1), 'beside the front door');
  assert.ok(spots.some((s) => s.v === 5 && s.u > 3 && s.u <= 4), 'on the wall at a door gap');
  assert.equal(spots.length, 2, 'and not along plain walls');
  const upstairs = switchSpots({ items: [], walls: [] }, { clear: [3, 4, 6, 7] });
  assert.equal(upstairs.length, 1);
  assert.equal(upstairs[0].post, true);
  assert.ok(Math.hypot(upstairs[0].u - 3, upstairs[0].v - 4) < 1);
});

test('about a quarter of large buildings need a key for their switches, and never homes or small places', () => {
  let need = 0;
  for (let i = 0; i < 2000; i++) need += switchNeedsKey({ type: 'office', floors: 3 }, 800, `b${i}`) ? 1 : 0;
  assert.ok(need > 400 && need < 600, `${need} of 2000`);
  assert.equal(switchNeedsKey({ type: 'office', floors: 3 }, 800, 'b1'), switchNeedsKey({ type: 'office', floors: 3 }, 800, 'b1'), 'always the same answer');
  for (let i = 0; i < 300; i++) {
    assert.equal(switchNeedsKey({ type: 'home', floors: 2 }, 900, `h${i}`), false);
    assert.equal(switchNeedsKey({ type: 'cafe', floors: 1 }, 120, `c${i}`), false);
  }
  assert.ok(Array.from({ length: 300 }, (_, i) => switchNeedsKey({ type: 'office', floors: 8 }, 300, `t${i}`)).some(Boolean), 'a tall small office counts');
});

test('a switch that needs a key says so, works with one, and stays working', () => {
  const plan = {};
  assert.ok(SAYINGS.switchLocked.includes(useSwitch(plan, 1, true, false)));
  assert.ok(!plan.state?.[1]?.lights);
  assert.ok(SAYINGS.lightsOn.includes(useSwitch(plan, 1, true, true)));
  assert.equal(plan.state[1].lights, true);
  assert.ok(SAYINGS.lightsOff.includes(useSwitch(plan, 1, true, false)), 'without the key now');
  assert.ok(SAYINGS.lightsOn.includes(useSwitch(plan, 2, true, false)), 'on any floor');
  const open = {};
  assert.ok(SAYINGS.lightsOn.includes(useSwitch(open, 1, false, false)));
});

test('what is in reach comes nearest first, and F offers no question twice nor more than a number can pick', () => {
  const frame = { axis: 0, toFrame: (x, y) => ({ u: x, v: y }) }, models = Object.fromEntries(['fridge', 'toilet', 'bed'].map((item) => [ITEMS[item].models[0], { w: 0.6, d: 0.6, h: 1 }]));
  const record = { items: [entry('fridge', 1.5, 0), entry('toilet', 0.6, 0), entry('bed', 30, 30)] };
  assert.deepEqual(thingsNear(record, frame, models, 0, 0, 0).map((e) => e[0]), ['toilet', 'fridge'], 'nearest first, and the far one left out');
  const many = Array.from({ length: 20 }, (_, i) => ({ label: `Thing ${i % 12}?` }));
  assert.equal(uniqueChoices(many).length, 9);
  assert.equal(new Set(uniqueChoices(many).map((c) => c.label)).size, 9);
});
