import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { actionsOf, armoryIn, claimOpened, coreQuestions, houseGunIn, pushFits, pushTarget, pushThing, inertNear, lookLine, questionsFor, releaseOpened, thingsNear, uniqueChoices, usableNear, useThing, withoutTaken, switchNeedsKey, switchSpots, useSwitch } from '../public/js/footActions.js';
import { SAYINGS } from '../public/js/sayingsConfig.js';
import { CLIPS, SOUNDS, bagSound, bakeOrder, footfall, lengthOf, play, stepSound, takesOf, useSound } from '../public/js/sounds.js';
import { GAME } from '../public/js/gameConfig.js';
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
  assert.deepEqual(actionsOf('chair'), ['sit', 'move']);
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

test('opening something finds at most one thing, the same every time, and it stays until it is taken', () => {
  const finds = new Set();
  for (let n = 0; n < 40; n++) {
    const plan = {}, fridge = entry('fridge', n, 0), first = useThing(fridge, plan, 1, 'b'), again = useThing(fridge, plan, 1, 'b');
    assert.equal(useThing(fridge, {}, 1, 'b').give, first.give, 'the same for this building');
    if (first.give) {
      assert.equal(first.offer, true);
      assert.equal(first.take, `Take the ${first.give.toLowerCase()}?`);
      assert.equal(again.give, first.give, 'still there until taken');
      assert.equal(claimOpened(plan, 1, fridge), true);
      assert.equal(claimOpened(plan, 1, fridge), false);
      const after = useThing(fridge, plan, 1, 'b');
      assert.ok(SAYINGS.nothingElse.some((l) => l.replace('{name}', 'fridge') === after.say), after.say);
      assert.equal(after.give, undefined);
      releaseOpened(plan, 1, fridge);
      assert.equal(useThing(fridge, plan, 1, 'b').give, first.give, 'a full bag puts it back');
      finds.add(first.give);
    } else {
      assert.ok(SAYINGS.nothingElse.some((l) => l.replace('{name}', 'fridge') === again.say), again.say);
      assert.equal(again.give, undefined);
    }
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

test('every use of every thing has a sound that exists, and only what has no sound yet gets the acknowledgement', () => {
  const plan = {}, ack = [];
  for (const item of Object.keys(ITEMS)) for (const [i] of actionsOf(item).slice(0, 2).entries()) {
    const { sound } = useThing(entry(item), plan, 0, `b${item}`, i === 1);
    assert.ok(SOUNDS[sound], `${item}: ${sound}`);
    if (sound === 'ack') ack.push(item);
  }
  for (const item of ack) assert.ok(['barrierGate', 'tellerCounter', 'till', 'vendingMachine', 'coffeeMachine'].includes(item), `${item} has only the acknowledgement`);
});

test('a used thing sounds different when it had nothing to give', () => {
  assert.equal(useSound('sink', 'use', { dry: true }), 'dryTap');
  assert.equal(useSound('sink', 'use', { effect: {} }), 'water');
  assert.equal(useSound('vendingMachine', 'use', { give: 'Candy bar' }), 'vend');
  assert.equal(useSound('vendingMachine', 'use', { empty: true }), 'ack');
  assert.equal(useSound('fridge', 'open', {}), 'open');
  assert.equal(useSound('fridge', 'open', { give: 'Milk' }), 'found');
  assert.equal(useSound('bookcase', 'search', {}), 'search');
  assert.equal(useSound('somethingNew', 'use', {}), 'ack');
});

test('all food, drink and medicine has a sound of its own', () => {
  for (const [name, { kind }] of Object.entries(GAME.consumables)) assert.notEqual(bagSound(name, kind), 'ack', name);
  assert.equal(bagSound('Old jacket'), 'ack');
});

test('a crash plays the car-explosion recording, loud, and the wreck fire is on disk', () => {
  assert.ok(CLIPS.explosion.gain >= 2);
  assert.equal(CLIPS.explosion.file, 'audio/sfx/car-explosion.mp3');
  assert.ok(existsSync(new URL(`../public/${CLIPS.explosion.file}`, import.meta.url)));
  for (let i = 0; i < 5; i++) assert.ok(existsSync(new URL(`../public/models/fire/fire-${i}.glb`, import.meta.url)), `fire-${i}`);
});

test('sounds are short enough to act on, and their layers are ones play can make', () => {
  for (const [name, layers] of Object.entries(SOUNDS)) {
    assert.ok(lengthOf(name) > 0 && lengthOf(name) <= 1.5, `${name} lasts ${lengthOf(name)}`);
    for (const layer of layers) {
      assert.ok(layer.from > 0 && layer.to > 0, `${name}: frequencies have to be above 0 to ramp`);
      assert.ok(layer.level > 0 && layer.level <= 1, name);
      assert.ok(layer.noise || layer.wave, name);
    }
  }
});

test('playing a sound makes every layer and frees it afterwards', () => {
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 }), started = [], node = (extra = {}) => ({ connect: (next) => next, disconnect() {}, start: (at) => started.push(at), stop() {}, gain: param(), frequency: param(), Q: param(), ...extra });
  const ctx = { currentTime: 1, sampleRate: 100, createGain: node, createOscillator: node, createBiquadFilter: node, createBufferSource: node, createBuffer: () => ({ getChannelData: () => new Float32Array(200) }) };
  play(ctx, node(), 'found', () => 0.5);
  assert.equal(started.length, SOUNDS.found.length);
  assert.ok(started.every((at) => at >= 1));
  started.length = 0;
  play(ctx, node(), 'nothing such', () => 0.5);
  assert.equal(started.length, SOUNDS.ack.length, 'an unknown name gets the acknowledgement');
});

test('every sound gets baked once, the common ones first and in several takes', () => {
  const order = bakeOrder();
  assert.equal(new Set(order).size, order.length);
  assert.deepEqual([...order].sort(), Object.keys(SOUNDS).sort());
  for (const name of ['stepOut', 'stepIn', 'runOut', 'runIn', 'click']) {
    assert.ok(order.indexOf(name) < 8, `${name} bakes early`);
    assert.ok(takesOf(name) > 1, `${name} has more than one take`);
  }
  assert.equal(takesOf('flush'), 1);
});

test('each cycle of walking has two footfalls, when a leg is furthest forward, however the frames fall', () => {
  for (const dt of [0.003, 0.016, 0.1]) {
    let phase = 0, steps = 0, at = [];
    while (phase < 3) {
      const next = phase + dt;
      if (footfall(phase, next)) { steps++; at.push(next % 1); }
      phase = next;
    }
    assert.equal(steps, 6, `at ${dt}`);
    for (const p of at) assert.ok(Math.abs(p - 0.25) <= dt || Math.abs(p - 0.75) <= dt, `footfall at ${p}`);
  }
  assert.equal(footfall(0.3, 0.3), false, 'standing still takes no steps');
});

test('steps sound of where and how fast', () => {
  assert.equal(stepSound(false, false), 'stepOut');
  assert.equal(stepSound(true, true), 'runIn');
});

test('sitting and lying down are soft: a slow swell of low air, with nothing that knocks', () => {
  assert.equal(useSound('sofa', 'sit', { pose: 'sit' }), 'sit');
  assert.equal(useSound('bed', 'sleep', { pose: 'sleep' }), 'bed');
  for (const name of ['sit', 'bed']) for (const layer of SOUNDS[name]) {
    assert.equal(layer.noise, 'lowpass', name);
    assert.ok(layer.attack >= 0.05, `${name} swells rather than hits`);
    assert.ok(layer.level <= 0.16, `${name} is quiet`);
  }
});

test('F offers the elevator and the stairs, the ways there are to go', () => {
  assert.deepEqual(coreQuestions('lift', 1, 6, 1).map((q) => q.label), ['Take the elevator?']);
  assert.deepEqual(coreQuestions('stairs', 1, 3, 1).map((q) => [q.label, q.down]), [['Go upstairs?', false]]);
  assert.deepEqual(coreQuestions('stairs', 2, 3, 1).map((q) => [q.label, q.down]), [['Go upstairs?', false], ['Go downstairs?', true]]);
  assert.deepEqual(coreQuestions('stairs', 3, 3, 1).map((q) => [q.label, q.down]), [['Go downstairs?', true]]);
  assert.deepEqual(coreQuestions(null, 1, 3, 1), []);
});

test('F can say what a thing with no use is, leaving out what has a use and what is out of reach', () => {
  const frame = { toFrame: (x, y) => ({ u: x, v: y }) }, models = Object.fromEntries(['plant', 'fridge', 'lift', 'pillar'].map((item) => [ITEMS[item].models[0], { w: 0.5, d: 0.5, h: 1 }]));
  assert.equal(inertNear({ items: [entry('plant', 1, 0), entry('fridge', 0.5, 0)] }, frame, models, 0, 0)[0], 'plant');
  assert.equal(inertNear({ items: [entry('plant', 30, 0)] }, frame, models, 0, 0), null);
  assert.equal(inertNear({ items: [entry('lift', 0.5, 0)] }, frame, models, 0, 0), null, 'the elevator has its own question');
  assert.ok(SAYINGS.look_plant.includes(lookLine('plant')));
  assert.match(lookLine('tireStack'), /tire stack/);
});

const box = { w: 0.6, d: 0.6, h: 1 }, pushModels = new Proxy({}, { get: () => box });
const everywhere = () => true;

test('a push goes straight away from the person', () => {
  const chair = entry('chair', 2, 2);
  assert.deepEqual(pushTarget(chair, 1, 2, 0.8), { u: 2.8, v: 2 });
  assert.deepEqual(pushTarget(chair, 3, 2.2, 0.8), { u: 1.2, v: 2 });
  assert.deepEqual(pushTarget(chair, 2.1, 1, 0.8), { u: 2, v: 2.8 });
});

test('a thing will not be pushed through walls, into other things, out of the building or across the way to the stairs', () => {
  const chair = entry('chair', 2, 2), other = entry('sofa', 4, 2);
  const record = { walls: [[5, 0, 5, 9]], items: [chair, other] };
  assert.equal(pushFits(record, pushModels, chair, { u: 2.8, v: 2 }, everywhere), true);
  assert.equal(pushFits(record, pushModels, chair, { u: 3.5, v: 2 }, everywhere), false, 'the sofa');
  assert.equal(pushFits(record, pushModels, entry('chair', 6, 7), { u: 5, v: 7 }, everywhere), false, 'the wall');
  assert.equal(pushFits(record, pushModels, chair, { u: 2.8, v: 2 }, (u) => u < 2.5), false, 'the outside wall');
  assert.equal(pushFits(record, pushModels, chair, { u: 2.8, v: 2 }, everywhere, { clear: [2.5, 1, 3.5, 3] }), false, 'the stairs');
});

test('a pushed thing stays pushed, and keeps what has happened to it', () => {
  const chair = entry('chair', 2, 2), record = { walls: [], items: [chair, entry('sofa', 8, 8)] }, plan = {};
  const after = pushThing(record, plan, 1, chair, { u: 2.8, v: 2 });
  assert.equal(after.items[0][2], 2.8);
  const again = withoutTaken(record, plan, 1);
  assert.equal(again.items[0][2], 2.8, 'as the floor is read again');
  const further = pushThing(again, plan, 1, again.items[0], { u: 3.6, v: 2 });
  assert.equal(withoutTaken(record, plan, 1).items[0][2], 3.6);
  assert.equal(further.items[1][0], 'sofa');
  useThing(further.items[0], plan, 1, 'b');
  plan.state[1].taken.push(further.items[0][8]);
  assert.equal(withoutTaken(record, plan, 1).items.length, 1, 'taken, wherever it had got to');
});

test('pushing and driving are offered, and say so', () => {
  assert.deepEqual(questionsFor(entry('chair')).map((q) => q.label), ['Sit on the chair?', 'Push the chair?']);
  assert.equal(questionsFor(entry('forklift'))[0].label, 'Drive the forklift?');
  const chairPush = useThing(entry('chair'), {}, 1, 'b', true), lift = useThing(entry('forklift'), {}, 1, 'b');
  assert.ok(chairPush.push > 0 && chairPush.say && chairPush.stuck);
  assert.ok(lift.push > chairPush.push);
  assert.ok(useThing(entry('barrierGate'), {}, 1, 'b').say);
  assert.ok(useThing(entry('till'), {}, 1, 'b').say);
  assert.deepEqual(questionsFor(entry('till')).map((q) => q.label), ['Use the cash register?', 'Open the cash register?']);
  assert.equal(questionsFor(entry('bin'))[0].label, 'Search the trash can?');
});

test('about one house in four hides a gun in a bedroom wardrobe, cabinet or nightstand, on any floor', () => {
  const zones = [['bedroom'], ['living'], ['bathroom']];
  const stand = ['nightstand', 'cabinetBedDrawer', 0, 1, 0, 0, 0, 1];
  const livingStand = ['nightstand', 'cabinetBedDrawer', 4, 1, 0, 0, 1, 1];
  const wardrobe = ['wardrobe', 'bookcaseClosedDoors', 2, 1, 0, 0, 0, 1];
  const cabinet = ['bathCabinet', 'bathroomCabinet', 6, 1, 0, 0, 2, 1];
  const desk = ['desk', 'desk', 8, 1, 0, 0, 0, 1];
  const items = [stand, livingStand, wardrobe, cabinet, desk];
  let houses = 0, floor1 = 0;
  const guns = {};
  for (let n = 0; n < 800; n++) {
    const plan = { type: 'home', floors: 3 }, id = `house${n}`;
    const hits = [];
    for (const floor of [1, 2, 3]) for (const piece of items) {
      const found = houseGunIn(plan, id, floor, items, piece, GAME.houseGun, zones);
      if (found) hits.push({ floor, piece, found });
    }
    if (!hits.length) continue;
    houses++;
    assert.equal(hits.length, 1, id);
    assert.ok(hits[0].piece === stand || hits[0].piece === wardrobe, hits[0].piece[0]);
    if (hits[0].floor === 1) floor1++;
    const weapon = Object.values(GAME.weapons).find((w) => w.item === hits[0].found.found[0].id);
    const ammo = GAME.calibers[weapon.caliber];
    assert.equal(hits[0].found.found[0].loaded, weapon.magazine);
    assert.equal(hits[0].found.found[1].count, ammo.feed === 'round' ? GAME.houseGun.rounds : GAME.houseGun.boxes);
    guns[weapon.item] = (guns[weapon.item] || 0) + 1;
    const opened = useThing(hits[0].piece, plan, hits[0].floor, id, false, items, zones);
    assert.equal(opened.found[0].id, weapon.item);
    assert.equal(opened.offer, true);
    assert.ok(opened.take.startsWith(`Take the ${weapon.item.toLowerCase()} and `), opened.take);
    assert.equal(useThing(hits[0].piece, plan, hits[0].floor, id, false, items, zones).found[0].id, weapon.item);
    assert.equal(claimOpened(plan, hits[0].floor, hits[0].piece), true);
    assert.equal(useThing(hits[0].piece, plan, hits[0].floor, id, false, items, zones).found, undefined);
  }
  assert.ok(houses > 150 && houses < 250, houses);
  assert.ok(floor1 > 30, floor1);
  const common = guns.Handgun + guns.Revolver + guns['.45 Handgun'];
  const rare = (guns.SMG || 0) + (guns.Shotgun || 0) + (guns['Hunting Rifle'] || 0) + (guns['AR-15'] || 0) + (guns['Sniper Rifle'] || 0);
  assert.ok(guns.Handgun > (guns.SMG || 0) * 2, JSON.stringify(guns));
  assert.ok(guns.Revolver > (guns.Shotgun || 0) * 2, JSON.stringify(guns));
  assert.ok(guns['.45 Handgun'] > (guns['Sniper Rifle'] || 0) * 2, JSON.stringify(guns));
  assert.ok(common > rare, JSON.stringify(guns));
  let cottage = null;
  for (let n = 0; n < 80 && !cottage; n++) if (houseGunIn({ type: 'home', floors: 1 }, `cot${n}`, 1, items, stand, GAME.houseGun, zones)) cottage = `cot${n}`;
  assert.ok(cottage);
  assert.equal(houseGunIn({ type: 'home', floors: 1 }, cottage, 2, items, stand, GAME.houseGun, zones), null);
  assert.equal(houseGunIn({ type: 'office', floors: 4 }, 'office', 2, items, stand, GAME.houseGun, zones), null);
  const skipGround = (floor) => floor !== 1;
  let onGround = 0, upstairs = 0;
  for (let n = 0; n < 200; n++) {
    const plan = { type: 'home', floors: 3 }, id = `old${n}`;
    for (const floor of [1, 2, 3]) for (const piece of items) {
      const found = houseGunIn(plan, id, floor, items, piece, GAME.houseGun, zones, skipGround);
      if (!found) continue;
      if (floor === 1) onGround++;
      else upstairs++;
    }
  }
  assert.equal(onGround, 0);
  assert.ok(upstairs > 20, upstairs);
});

test('a police station, some shops and some malls stock a gun and a pile of its ammunition', () => {
  const cabinet = (u) => ['filingCabinet', 'filingCabinet', u, 1, 0, 0, 0, 1];
  const shelf = (u) => ['storeShelf', 'storeShelf', u, 1, 0, 0, 0, 1];
  const police = [cabinet(0), cabinet(2), cabinet(4), cabinet(6), cabinet(8)];
  const plan = { type: 'police', floors: 2 };
  const hits = police.filter((piece) => armoryIn(plan, 'station', 1, police, piece));
  assert.equal(hits.length, 4);
  const first = armoryIn(plan, 'station', 1, police, hits[0]);
  assert.equal(first.found[0].count, 1);
  assert.equal(first.found[1].count, 24);
  assert.equal(armoryIn(plan, 'station', 1, police, hits[0]).found[0].id, first.found[0].id);
  assert.equal(armoryIn({ type: 'office', floors: 2 }, 'station', 1, police, cabinet(0)), null);
  let shop = null;
  for (let n = 0; n < 80 && !shop; n++) if (armoryIn({ type: 'shop', floors: 1 }, `shop${n}`, 1, [shelf(0)], shelf(0))) shop = `shop${n}`;
  assert.ok(shop);
  assert.equal(armoryIn({ type: 'shop', floors: 1 }, shop, 1, [shelf(0)], shelf(0)).found[1].count, 30);
  let mall = null;
  for (let n = 0; n < 80 && !mall; n++) if (armoryIn({ type: 'mall', floors: 2 }, `mall${n}`, 1, [shelf(1)], shelf(1))) mall = `mall${n}`;
  assert.ok(mall);
  assert.equal(armoryIn({ type: 'mall', floors: 2 }, mall, 1, [shelf(1)], shelf(1)).found[1].count, 20);
});
