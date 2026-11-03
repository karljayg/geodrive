// Two people in one building, or one dropped thing: pure rules first, then two real worlds against a real server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/app.mjs';
import { WorldLink } from '../public/js/net.js';
import { PROTOCOL, FLAGS, metresApart, packPresence } from '../public/js/protocol.js';
import { GAME } from '../public/js/gameConfig.js';
import { PrivateWorld, rememberWorld, savedMe } from '../public/js/world.js';
import { applyFloorOp, cleanDrop, crashHoldsUp, crashOutcome, emptyFloorState, nextManagers, floorOpsBetween, mergePlan, planToShare, tileOfBuilding, undoFloorOp } from '../public/js/worldOps.js';
import { vectorTileAt } from '../public/js/vector.js';
import { plantCars } from '../public/js/worldCars.js';

const LOOK = { figure: 'male', colours: { skin: '#ddaa88', jacket: '#ff8800', jeans: '#223355', shoes: '#111111', hair: '#221100' } };
const HANGAR = '1947789_-3872411';
const PLAN = { type: 'office', floors: 3, style: 'modern' };
const memory = () => { const map = new Map(); return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) }; };
const until = async (check, what = 'it') => {
  for (let i = 0; i < 200; i++) {
    const value = check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waited for ${what}`);
};

test('only one person can take a thing, and it can be pushed only while it\'s there', () => {
  const state = emptyFloorState();
  assert.equal(applyFloorOp(state, { op: 'take', key: 'book|1|2' }), null);
  assert.equal(applyFloorOp(state, { op: 'take', key: 'book|1|2' }), 'gone');
  assert.equal(applyFloorOp(state, { op: 'push', key: 'book|1|2', u: 1, v: 1 }), 'gone');
  assert.equal(applyFloorOp(state, { op: 'open', key: 'desk|0|0' }), null);
  assert.equal(applyFloorOp(state, { op: 'open', key: 'desk|0|0' }), 'gone');
  assert.deepEqual(state.taken, ['book|1|2']);
});

test('pushing moves a thing wherever it\'s been pushed to, lights go on and off, and holes are kept once', () => {
  const state = emptyFloorState();
  applyFloorOp(state, { op: 'push', key: 'sofa', u: 1, v: 2 });
  applyFloorOp(state, { op: 'push', key: 'sofa', u: 3, v: 2 });
  assert.deepEqual(state.moved.sofa, [3, 2]);
  applyFloorOp(state, { op: 'lights', on: true });
  assert.equal(state.lights, true);
  applyFloorOp(state, { op: 'lights', on: false });
  assert.equal(state.lights, false);
  applyFloorOp(state, { op: 'hole', hole: [0, 0, 1, 0] });
  applyFloorOp(state, { op: 'hole', hole: [0, 0, 1, 0] });
  assert.equal(state.holes.length, 1);
});

test('anything else on a floor is refused', () => {
  const state = emptyFloorState();
  for (const op of [{ op: 'burn' }, { op: 'take' }, { op: 'take', key: 7 }, { op: 'take', key: 'x'.repeat(200) }, { op: 'push', key: 'a', u: 'no', v: 1 }, { op: 'push', key: 'a', u: 1, v: Infinity }, { op: 'hole', hole: [1, 2] }, { op: 'hole', hole: 'x' }, { op: 'lights', on: 'yes' }]) assert.equal(applyFloorOp(state, op), 'bad', JSON.stringify(op));
  assert.deepEqual(state, emptyFloorState());
});

test('what changed on a floor is worked out from before and after, and can be taken back', () => {
  const was = { taken: ['a'], opened: [], moved: { s: [1, 1] }, holes: [[0, 0, 1, 1]], lights: false };
  const now = { taken: ['a', 'b'], opened: ['c'], moved: { s: [2, 1], t: [5, 5] }, holes: [[0, 0, 1, 1], [2, 2, 3, 3]], lights: true };
  assert.deepEqual(floorOpsBetween(was, now), [
    { op: 'take', key: 'b' }, { op: 'open', key: 'c' }, { op: 'push', key: 's', u: 2, v: 1 }, { op: 'push', key: 't', u: 5, v: 5 }, { op: 'hole', hole: [2, 2, 3, 3] }, { op: 'lights', on: true },
  ]);
  assert.deepEqual(floorOpsBetween(now, now), []);
  assert.deepEqual(floorOpsBetween(undefined, { taken: ['z'], opened: [] }), [{ op: 'take', key: 'z' }]);
  undoFloorOp(now, { op: 'take', key: 'b' });
  undoFloorOp(now, { op: 'open', key: 'c' });
  assert.deepEqual(now.taken, ['a']);
  assert.deepEqual(now.opened, []);
});

test('the first to say what a building is keeps it, and later ones only fill in the gaps', () => {
  assert.deepEqual(mergePlan({ type: 'office', floors: 3 }, { type: 'bank', floors: 9, look: 'x' }), { type: 'office', floors: 3, look: 'x' });
  assert.equal(mergePlan({ floors: 3 }, { floors: 1, core: null }).floors, 1, 'too narrow for stairs brings it down, once');
  assert.equal(mergePlan({ floors: 3, core: { a: 1 } }, { floors: 1, core: null }).floors, 3);
  assert.deepEqual(planToShare({ type: 'a', state: {}, saved: {}, seen: 1, switchesOn: true }), { type: 'a' });
});

test('a dropped thing is checked before it\'s kept', () => {
  assert.deepEqual(cleanDrop({ id: 'a', name: 'Box', lat: 1, lng: 2, facing: 1, extra: '<script>' }), { id: 'a', name: 'Box', facing: 1, lat: 1, lng: 2 });
  assert.deepEqual(cleanDrop({ id: 'a', name: 'Box', buildingId: '1_2', floor: 2, axis: 0, u: 1, v: 2 }), { id: 'a', name: 'Box', facing: 0, buildingId: '1_2', floor: 2, axis: 0, u: 1, v: 2 });
  for (const bad of [null, {}, { id: 'a' }, { id: 'a', name: 'B', lat: 200, lng: 0 }, { id: 'a', name: 'B', lat: 'x', lng: 0 }, { id: 'a', name: 'B', buildingId: '1_2', floor: 1.5, axis: 0, u: 0, v: 0 }]) assert.equal(cleanDrop(bad), null, JSON.stringify(bad));
});

test('a building\'s tile is the same one the game loads its outline from', () => {
  const lat = 1947789 * 2e-5, lng = -3872411 * 2e-5, { x, y } = vectorTileAt(lat, lng);
  assert.equal(tileOfBuilding(HANGAR), `${x}_${y}`);
});

async function pair(fn, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'geodrive-shared-'));
  let server = await startServer({ dir, ...options });
  const all = [], address = () => `ws://127.0.0.1:${server.port}`;
  const world = (id, link, welcome, storage) => { const w = new PrivateWorld({ id, link, welcome, storage }); all.push(w); return w; };
  const create = async () => {
    let made;
    const storage = memory(), link = new WorldLink({ address: address(), onMessage: (m) => { if (m.t === 'made') made = m; } });
    const welcome = await link.open({ t: 'create', protocol: PROTOCOL, name: 'Crew', player: { name: 'Karl', ...LOOK } });
    rememberWorld(storage, { id: made.world, name: 'Crew', me: { id: made.id, secret: made.secret } });
    return Object.assign(world(made.world, link, welcome, storage), { storage });
  };
  const join_ = async (host, name) => {
    const { code } = await host.link.ask({ t: 'invite' }), storage = memory(), link = new WorldLink({ address: address() });
    const welcome = await link.open({ t: 'join', protocol: PROTOCOL, world: host.id, code, name, ...LOOK });
    rememberWorld(storage, { id: host.id, name: 'Crew', me: { id: welcome.you.id, secret: welcome.you.secret } });
    return Object.assign(world(host.id, link, welcome, storage), { storage });
  };
  const back = async (old) => {
    const me = savedMe(old.storage, old.id), link = new WorldLink({ address: address() });
    return world(old.id, link, await link.open({ t: 'hello', protocol: PROTOCOL, world: old.id, player: me.id, secret: me.secret }), old.storage);
  };
  try {
    await fn({ create, join: join_, back, restart: async () => { for (const w of all) w.link.close(); const { port } = server; await server.close(); server = await startServer({ dir, port, ...options }); } });
  } finally {
    for (const w of all) { clearInterval(w.saving); clearInterval(w.placing); w.link.close(); }
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const TILE = tileOfBuilding(HANGAR);

async function inBuilding(a, b) {
  await Promise.all([a.buildings.watch(TILE), b.buildings.watch(TILE)]);
  const plan = a.buildings.remember(HANGAR, { ...PLAN });
  await until(() => b.buildings.get(HANGAR), 'the plan to reach the other');
  return { plan, theirs: b.buildings.get(HANGAR) };
}

test('turning on a light in a room turns it on for whoever else is there', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), { plan, theirs } = await inBuilding(a, b), changes = [];
  b.buildings.onChange = (id, floor) => changes.push(`${id}:${floor}`);
  (plan.state ||= {})[2] = { taken: [], opened: [], lights: true };
  a.buildings.saveIndex();
  await until(() => theirs.state?.[2]?.lights === true, 'the light');
  assert.ok(changes.includes(`${HANGAR}:2`), 'and the other is told which floor');
  plan.state[2].lights = false;
  a.buildings.saveIndex();
  await until(() => theirs.state[2].lights === false, 'the light off');
}));

test('two people grabbing one thing: exactly one gets it, and the other is told and put right', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), { plan, theirs } = await inBuilding(a, b), refused = [];
  a.buildings.onRefused = (id, floor, op, why) => refused.push(['a', op.key, why]);
  b.buildings.onRefused = (id, floor, op, why) => refused.push(['b', op.key, why]);
  (plan.state ||= {})[1] = { taken: ['book|1|1'], opened: [] };
  (theirs.state ||= {})[1] = { taken: ['book|1|1'], opened: [] };
  a.buildings.saveIndex();
  b.buildings.saveIndex();
  await until(() => refused.length, 'one to lose');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(refused.length, 1);
  assert.equal(refused[0][2], 'gone');
  assert.equal(refused[0][1], 'book|1|1');
  const loser = refused[0][0] === 'a' ? plan : theirs;
  assert.deepEqual(loser.state[1].taken, ['book|1|1'], 'it stays gone for them: the winner\'s take was heard');
}));

test('things taken, moved and walls broken reach others on that floor', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), { plan, theirs } = await inBuilding(a, b);
  plan.state = { 1: { taken: ['cup|0|0'], opened: ['desk|1|1'], moved: { 'sofa|2|2': [3, 3] }, holes: [[0, 0, 1, 0]] } };
  a.buildings.saveIndex();
  await until(() => theirs.state?.[1]?.holes?.length, 'all of it');
  assert.deepEqual(theirs.state[1].taken, ['cup|0|0']);
  assert.deepEqual(theirs.state[1].opened, ['desk|1|1']);
  assert.deepEqual(theirs.state[1].moved['sofa|2|2'], [3, 3]);
  a.buildings.saveIndex();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(theirs.state[1].taken, ['cup|0|0'], 'and saving again sends nothing twice');
}));

test('whoever comes later finds a building as it was left, on any floor', () => pair(async ({ create, join, restart, back }) => {
  const a = await create(), b = await join(a, 'Dana'), { plan } = await inBuilding(a, b);
  const record = { v: 1, axis: 0.5, items: [['cup', 0, 1, 1]], walls: [[0, 0, 1, 0]] };
  a.buildings.saveFloor(HANGAR, 2, record);
  plan.state = { 2: { taken: ['cup|1|1'], opened: [], lights: true } };
  plan.switchesOn = true;
  a.buildings.saveIndex();
  await until(() => b.buildings.floor(HANGAR, 2), 'the floor');
  await new Promise((r) => setTimeout(r, 40));
  await restart();
  const later = await back(b);
  assert.equal(later.buildings.get(HANGAR), null, 'nothing until they\'re near');
  await later.buildings.watch(TILE);
  const seen = later.buildings.get(HANGAR);
  assert.equal(seen.type, 'office');
  assert.equal(seen.switchesOn, true);
  assert.equal(seen.state[2].lights, true);
  assert.deepEqual(seen.state[2].taken, ['cup|1|1']);
  assert.deepEqual(later.buildings.floor(HANGAR, 2), record);
}));

test('the first plan and layout are what everyone gets', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana');
  await Promise.all([a.buildings.watch(TILE), b.buildings.watch(TILE)]);
  a.buildings.remember(HANGAR, { ...PLAN });
  await until(() => b.buildings.get(HANGAR), 'A\'s plan');
  const theirs = b.buildings.remember(HANGAR, { type: 'bank', floors: 9, style: 'old' });
  await until(() => theirs.type === 'office', 'B to adopt it');
  assert.equal(theirs.floors, 3);
  const mine = { v: 1, items: [] }, other = { v: 1, items: [['x']] };
  a.buildings.saveFloor(HANGAR, 1, mine);
  await until(() => b.buildings.floor(HANGAR, 1), 'A\'s floor');
  b.buildings.saveFloor(HANGAR, 1, other);
  await until(() => JSON.stringify(b.buildings.floor(HANGAR, 1)) === JSON.stringify(mine), 'B to adopt it');
}));

test('a building the other isn\'t near doesn\'t reach them', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana');
  await a.buildings.watch(TILE);
  a.buildings.remember(HANGAR, { ...PLAN });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(b.buildings.get(HANGAR), null);
  await b.buildings.watch(TILE);
  assert.equal(b.buildings.get(HANGAR).type, 'office', 'until they come near');
}));

test('bad building messages are refused', () => pair(async ({ create }) => {
  const a = await create();
  for (const message of [{ t: 'claimPlan', building: '../x', plan: {} }, { t: 'claimPlan', building: HANGAR, plan: 'no' }, { t: 'claimFloor', building: HANGAR, floor: 1.5, record: {} }, { t: 'floorOp', building: HANGAR, floor: 1, op: 'burn' }, { t: 'area', tiles: ['../../etc'] }, { t: 'where', building: 7 }, { t: 'dropAdd', drop: { id: 'x' } }, { t: 'dropTake', drop: 5 }, { t: 'switchesOn', building: 'x' }]) {
    assert.equal((await a.link.ask(message)).t, 'no', JSON.stringify(message));
  }
}));

test('something dropped is there for everyone, indoors and out, and later too', () => pair(async ({ create, join, back }) => {
  const a = await create(), b = await join(a, 'Dana');
  let told = 0;
  b.drops.onChange = () => { told++; };
  const id = a.drops.add({ name: 'Flashlight', buildingId: HANGAR, floor: 2, axis: 0.5, u: 1, v: 2, facing: 0 });
  a.drops.add({ name: 'Box', lat: 38.95, lng: -77.45, facing: 0 });
  assert.equal(a.drops.inBuilding(HANGAR, 2).length, 1, 'shown at once');
  await until(() => b.drops.list.length === 2, 'it to arrive');
  assert.equal(told, 2);
  assert.equal(b.drops.inBuilding(HANGAR, 2)[0].name, 'Flashlight');
  assert.equal(b.drops.around(38.95, -77.45, 100, 5)[0].name, 'Box');
  const later = await join(a, 'Mo');
  assert.equal(later.drops.list.length, 2, 'someone new sees them');
  assert.equal(b.drops.remove(id), true);
  await until(() => a.drops.inBuilding(HANGAR, 2).length === 0, 'it to go');
  await until(() => later.drops.list.length === 1, 'it to go for Mo too');
  const again = await back(a);
  assert.equal(again.drops.list.length, 1, 'and it\'s kept');
}));

test('two people picking up one thing: exactly one gets it', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), lost = [];
  a.drops.onLost = (drop) => lost.push(`a ${drop.name}`);
  b.drops.onLost = (drop) => lost.push(`b ${drop.name}`);
  const id = a.drops.add({ name: 'Box', lat: 1, lng: 2, facing: 0 });
  await until(() => b.drops.list.length, 'it');
  a.drops.remove(id);
  b.drops.remove(id);
  await until(() => lost.length, 'one to lose');
  assert.equal(lost.length, 1);
  assert.equal(a.drops.list.length + b.drops.list.length, 0);
}));

test('those on the same floor of the same building are found, and only them', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana');
  b.setBuilding(HANGAR);
  b.whereAmI = () => ({ lat: 38.95, lng: -77.45, heading: 90, speed: 3, onFoot: true, gait: 2, floor: 2, u: 4.5, v: -3, flags: FLAGS.onFoot | FLAGS.indoors });
  const found = await until(() => a.peopleOnFloor(HANGAR, 2, performance.now())[0], 'Dana indoors');
  assert.equal(found.member.name, 'Dana');
  assert.ok(Math.abs(found.place.u - 4.5) < 0.05 && Math.abs(found.place.v + 3) < 0.05);
  assert.equal(found.place.gait, 2);
  assert.deepEqual(a.peopleOnFloor(HANGAR, 1, performance.now()), [], 'not on the floor below');
  assert.deepEqual(a.peopleOnFloor('1_2', 2, performance.now()), [], 'not in another building');
  b.setBuilding(null);
  await until(() => a.peopleOnFloor(HANGAR, 2, performance.now()).length === 0, 'Dana leaving');
}));

test('someone arriving is told who\'s already in a building', () => pair(async ({ create, join }) => {
  const a = await create();
  a.setBuilding(HANGAR);
  await new Promise((r) => setTimeout(r, 30));
  const b = await join(a, 'Dana');
  assert.equal(b.people.member(a.you.id).building, HANGAR);
}));

test('the line back says where someone is again, and everything is caught up', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), { plan, theirs } = await inBuilding(a, b);
  plan.state = { 1: { taken: [], opened: [], lights: true } };
  a.buildings.saveIndex();
  await until(() => theirs.state?.[1]?.lights, 'the light');
  await b.buildings.rejoined();
  assert.equal(b.buildings.get(HANGAR).state[1].lights, true);
}));

const [A_CAR, ANOTHER] = plantCars({ kerbs: [{ c: [38.9, -77.4, 38.95, -77.4], out: 4.6 }] }).filter((car) => car.runs).concat(plantCars({ kerbs: [{ c: [39.9, -77.4, 39.95, -77.4], out: 4.6 }] }).filter((car) => car.runs));
const DEAD_CAR = plantCars({ kerbs: [{ c: [38.9, -77.4, 38.95, -77.4], out: 4.6 }] }).find((car) => !car.runs);

test('one driver: two people at one car, the first takes the wheel and the other rides', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana');
  const [first, second] = await Promise.all([a.cars.getIn(A_CAR), b.cars.getIn(A_CAR)]);
  assert.ok(first.car && second.car, 'both are in');
  const known = await until(() => { const car = a.cars.records.get(A_CAR.id); return car?.seats?.length === 1 && car; }, 'the seat');
  assert.deepEqual([known.driver, known.seats[0]].sort(), [a.you.id, b.you.id].sort());
}));

test('a car that doesn\'t run says why, and can\'t be got into', () => pair(async ({ create }) => {
  const a = await create(), answer = await a.cars.getIn(DEAD_CAR);
  assert.equal(answer.why, DEAD_CAR.why);
  assert.equal(a.cars.records.size, 0, 'and trying doesn\'t record it');
}));

test('a car left somewhere is there for anyone, with its fuel, and the old driver can\'t move it', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana');
  const seen = (await a.cars.getIn(A_CAR)).car;
  await until(() => b.cars.records.get(A_CAR.id)?.driver === a.you.id, 'Dana to hear');
  assert.equal((await b.cars.getOut(seen, { lat: 1, lng: 2, heading: 0 })).why, 'not-yours');
  await a.cars.getOut(seen, { lat: 38.5, lng: -77.5, heading: 45, fuel: 12 });
  const left = await until(() => { const known = b.cars.records.get(A_CAR.id); return known && !known.driver && known; }, 'it to be left');
  assert.equal(left.lat, 38.5);
  assert.equal(left.fuel, 12);
  assert.equal(b.cars.around({ lat: 38.5, lng: -77.5 }, 10)[0].id, A_CAR.id);
  const now = (await b.cars.getIn(left)).car;
  assert.equal(now.driver, b.you.id);
  assert.equal(now.fuel, 12);
}));

test('a driver who drops off keeps the seat for a few seconds, then anyone can have it', () => pair(async ({ create, join, back }) => {
  const a = await create(), b = await join(a, 'Dana');
  await a.cars.getIn(A_CAR);
  a.link.close();
  await until(() => !b.people.member(a.you.id).online, 'them to go');
  const beside = await b.cars.getIn(A_CAR);
  assert.equal(beside.car.driver, a.you.id, 'someone getting in now rides, as the seat at the wheel is still theirs');
  assert.deepEqual(beside.car.seats, [b.you.id]);
  const again = await back(a);
  assert.equal(again.cars.mine().id, A_CAR.id, 'and coming back, they\'re still at the wheel');
  assert.equal((await again.cars.getIn(again.cars.mine())).car.driver, again.you.id);
}));

test('what\'s in a car is shared, and a change from an old look is refused', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), hammer = [{ id: 'Sledgehammer', name: 'Sledgehammer', count: 1 }];
  const first = await a.cars.setStorage(A_CAR, hammer);
  assert.deepEqual(first.car.storage, hammer);
  const theirs = await until(() => b.cars.records.get(A_CAR.id), 'Dana to hear');
  assert.deepEqual(theirs.storage, hammer);
  assert.equal((await a.cars.setStorage(A_CAR, [])).why, 'stale', 'A is still looking at the car as it was');
  assert.equal((await b.cars.setStorage(theirs, [])).car.storage.length, 0);
}));

test('nobody is stranded: with no running car near, one is added, once', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), place = { lat: 10, lng: 10 };
  const car = await a.cars.makeSureOfOne(place, { lat: 10, lng: 10, heading: 0 });
  assert.equal(car.runs, true);
  await until(() => b.cars.records.has(car.id), 'Dana to hear');
  assert.equal(await b.cars.makeSureOfOne(place, { lat: 10, lng: 10, heading: 0 }), null, 'one\'s here now');
  assert.equal(await a.cars.makeSureOfOne({ lat: 20, lng: 20 }, { lat: 20, lng: 20, heading: 0 }), null, 'and each person only gets one');
  assert.equal(ANOTHER.runs, true);
}));

const CRASH = GAME.crash, mph = (n) => n / 2.23694;

test('what a crash does goes by what hit what, and how fast', () => {
  const plain = (kind, speed) => { const { mph: _, ...rest } = crashOutcome(kind, mph(speed), CRASH); return rest; };
  assert.deepEqual(plain('car', 4), { kill: [], hurt: [], wreck: [] }, 'a touch does nothing');
  assert.deepEqual(plain('car', 60), { kill: [], hurt: ['me', 'other'], wreck: [] }, 'both hurt');
  assert.deepEqual(plain('car', 101), { kill: ['me', 'other'], hurt: [], wreck: ['me', 'other'] }, 'two at 50 mph head on is 100: both gone');
  assert.deepEqual(plain('parked', 99), { kill: [], hurt: ['me'], wreck: [] });
  assert.deepEqual(plain('parked', 100), { kill: ['me'], hurt: [], wreck: ['me', 'other'] });
  assert.deepEqual(plain('person', 49), { kill: [], hurt: ['other'], wreck: [] }, 'the driver isn\'t hurt');
  assert.deepEqual(plain('person', 50), { kill: ['other'], hurt: [], wreck: [] }, 'and carries on');
});

test('a claimed crash has to be backed up by where each said they were', () => {
  const at = { lat: 38.9, lng: -77.4 }, here = [{ ...at, speed: 50 }], check = (over) => crashHoldsUp({ mine: here, theirs: null, at, closing: 45, withinMetres: 20, ...over }, metresApart);
  assert.equal(check({}), true);
  assert.equal(check({ mine: [] }), false, 'no record of them moving');
  assert.equal(check({ mine: [{ lat: 39, lng: -77.4, speed: 50 }] }), false, 'they were somewhere else');
  assert.equal(check({ closing: 120 }), false, 'nor that fast');
  assert.equal(check({ theirs: here, closing: 120 }), true, 'but two together can be');
  assert.equal(check({ theirs: [{ lat: 39, lng: -77.4, speed: 50 }], closing: 50 }), false, 'if they were both there');
  assert.equal(check({ theirs: [] }), false, 'and nobody can be killed who hasn\'t been seen');
});

test('next man up: backup takes over, then invite order', () => {
  const people = (lives) => ['a', 'b', 'c', 'd'].map((id, i) => ({ id, lives: lives[i] }));
  assert.deepEqual(nextManagers({ owner: 'a', backup: 'b' }, people([1, 1, 1, 1])), { owner: 'a', backup: 'b' }, 'nobody gone');
  assert.deepEqual(nextManagers({ owner: 'a', backup: 'c' }, people([0, 1, 1, 1])), { owner: 'c', backup: 'b' }, 'the owner goes: their chosen backup, and the earliest left');
  assert.deepEqual(nextManagers({ owner: 'a', backup: 'b' }, people([1, 0, 1, 1])), { owner: 'a', backup: 'c' }, 'the backup goes');
  assert.deepEqual(nextManagers({ owner: 'a', backup: 'b' }, people([0, 0, 0, 1])), { owner: 'd', backup: null }, 'one left runs it alone');
  assert.deepEqual(nextManagers({ owner: 'a', backup: null }, people([0, 0, 0, 0])), { owner: 'a', backup: null }, 'nobody left: nothing changes');
});

const placeAt = (world, lat, lng, speed, seq = 1) => world.link.sendBytes(packPresence({ seq, lat, lng, heading: 0, speed, flags: 0 }));
const HERE = { lat: 38.9, lng: -77.4 };

test('a crash too fast to survive kills both and wrecks both cars, and each loses one life', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), died = [];
  a.on.died = (m) => died.push(['a', m]);
  b.on.died = (m) => died.push(['b', m]);
  await a.cars.getIn(A_CAR);
  await b.cars.getIn(ANOTHER);
  placeAt(a, HERE.lat, HERE.lng, 30);
  placeAt(b, HERE.lat, HERE.lng, 30);
  await new Promise((r) => setTimeout(r, 40));
  const answer = await a.link.ask({ t: 'crash', kind: 'car', other: b.you.id, closing: 60, ...HERE });
  assert.equal(answer.outcome, 'dead');
  await until(() => died.length >= 4, 'everyone to hear');
  const heard = died.filter(([who]) => who === 'a').map(([, m]) => m.member).sort();
  assert.deepEqual(heard, [a.you.id, b.you.id].sort());
  assert.equal(died[0][1].lives, GAME.world.lives - 1);
  assert.equal(a.people.member(b.you.id).lives, GAME.world.lives - 1);
  await until(() => a.cars.records.get(A_CAR.id)?.wrecked && a.cars.records.get(ANOTHER.id)?.wrecked, 'the wrecks');
  const wreck = b.cars.records.get(A_CAR.id);
  assert.equal(wreck.driver, null);
  assert.equal((await b.cars.getIn(wreck)).why, 'carWrecked', 'and it never runs again');
  assert.equal((await a.link.ask({ t: 'crash', kind: 'car', other: b.you.id, closing: 60, ...HERE })).outcome, 'same', 'both games reporting it is one crash');
}));

test('a crash that nobody\'s path backs up is only a stop', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), died = [];
  a.on.died = (m) => died.push(m);
  placeAt(a, HERE.lat, HERE.lng, 30);
  placeAt(b, 39.9, -70, 30);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal((await a.link.ask({ t: 'crash', kind: 'car', other: b.you.id, closing: 60, ...HERE })).outcome, 'stop');
  assert.equal(died.length, 0);
}));

test('hitting a person at speed kills them and leaves the driver alone', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), died = [];
  b.on.died = (m) => died.push(m);
  placeAt(a, HERE.lat, HERE.lng, 30);
  placeAt(b, HERE.lat, HERE.lng, 0);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal((await a.link.ask({ t: 'crash', kind: 'person', other: b.you.id, closing: 25, ...HERE })).outcome, 'dead');
  await until(() => died.length, 'them to hear');
  assert.equal(died[0].member, b.you.id);
  assert.equal(died[0].how, 'hit');
  assert.equal(died[0].by, a.you.id);
  assert.equal(a.people.member(a.you.id).lives, GAME.world.lives);
}));

test('slower, people are hurt rather than killed', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), hurt = [];
  a.on.injured = () => hurt.push('a');
  b.on.injured = () => hurt.push('b');
  placeAt(a, HERE.lat, HERE.lng, 10);
  placeAt(b, HERE.lat, HERE.lng, 10);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal((await a.link.ask({ t: 'crash', kind: 'car', other: b.you.id, closing: 15, ...HERE })).outcome, 'hurt');
  await until(() => hurt.length === 2, 'both');
  assert.equal(a.people.member(a.you.id).lives, GAME.world.lives);
  assert.equal((await b.link.ask({ t: 'crash', kind: 'parked', other: A_CAR.id, closing: 1, ...HERE, planted: A_CAR })).outcome, 'stop', 'a touch does nothing');
}));

test('hitting a parked car at speed wrecks it and kills only the driver', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), died = [];
  a.on.died = (m) => died.push(m.member);
  await a.cars.getIn(A_CAR);
  placeAt(a, HERE.lat, HERE.lng, 50);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal((await a.link.ask({ t: 'crash', kind: 'parked', other: ANOTHER.id, closing: 50, ...HERE, planted: ANOTHER })).outcome, 'dead');
  await until(() => died.length, 'it');
  assert.deepEqual(died, [a.you.id]);
  await until(() => b.cars.records.get(ANOTHER.id)?.wrecked, 'the parked one');
  assert.ok(b.cars.records.get(A_CAR.id).wrecked);
}));

test('out of lives: gone for good, name kept, next person up runs things, and only someone new comes back', () => pair(async ({ create, join, back }) => {
  const a = await create(), b = await join(a, 'Dana'), c = await join(a, 'Mo');
  placeAt(a, HERE.lat, HERE.lng, 50);
  placeAt(b, HERE.lat, HERE.lng, 0);
  placeAt(c, HERE.lat, HERE.lng, 50);
  await new Promise((r) => setTimeout(r, 40));
  for (let i = 0; i < 3; i++) {
    await a.link.ask({ t: 'crash', kind: 'person', other: b.you.id, closing: 25, ...HERE });
    await new Promise((r) => setTimeout(r, 3100)); // crashes between the same two count once in a while
    placeAt(a, HERE.lat, HERE.lng, 50, i + 2);
    placeAt(b, HERE.lat, HERE.lng, 0, i + 2);
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(a.people.member(b.you.id).lives, 0);
  assert.equal(c.backup, c.you.id, 'Dana was the backup; Mo is next');
  assert.equal(a.owner, a.you.id);
  b.link.close();
  await new Promise((r) => setTimeout(r, 40));
  const link = new WorldLink({ address: a.link.address }), me = savedMe(b.storage, b.id);
  assert.equal((await link.open({ t: 'hello', protocol: PROTOCOL, world: b.id, player: me.id, secret: me.secret })).why, 'dead');
  const { code } = await a.link.ask({ t: 'invite' }), again = new WorldLink({ address: a.link.address });
  assert.equal((await again.open({ t: 'join', protocol: PROTOCOL, world: a.id, code, name: 'dana', ...LOOK })).why, 'name-taken', 'their name stays taken');
  assert.equal((await again.say({ t: 'join', protocol: PROTOCOL, world: a.id, code, name: 'Dana2', ...LOOK })).you.lives, 3, 'someone new, with full lives');
  link.close();
  again.close();
}, { config: { ...GAME.world, lives: 3 } }));

test('nobody can claim a crash with rubbish', () => pair(async ({ create }) => {
  const a = await create();
  for (const message of [{ kind: 'fall' }, { kind: 'car', closing: 'fast', lat: 1, lng: 2 }, { kind: 'car', closing: 5000, lat: 1, lng: 2 }, { kind: 'car', closing: 5 }]) assert.equal((await a.link.ask({ t: 'crash', ...message })).why, 'bad');
  assert.equal((await a.link.ask({ t: 'crash', kind: 'car', other: 'nobody', closing: 60, lat: 1, lng: 2 })).outcome, 'stop');
}));

test('four to a car: the first drives, three ride, and a fifth is told it\'s full', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), c = await join(a, 'Mo'), d = await join(a, 'Priya'), e = await join(a, 'Sam');
  const first = await a.cars.getIn(A_CAR);
  assert.equal(first.car.driver, a.you.id);
  await until(() => [b, c, d, e].every((w) => w.cars.records.get(A_CAR.id)?.driver === a.you.id), 'all to hear');
  const rides = await Promise.all([b, c, d].map((w) => w.cars.getIn(w.cars.records.get(A_CAR.id))));
  for (const answer of rides) assert.equal(answer.car.driver, a.you.id);
  const seats = await until(() => { const known = a.cars.records.get(A_CAR.id); return known?.seats?.length === 3 && known.seats; }, 'the seats to fill');
  assert.deepEqual([...seats].sort(), [b.you.id, c.you.id, d.you.id].sort());
  assert.equal((await e.cars.getIn(e.cars.records.get(A_CAR.id))).why, 'carFull');
  assert.equal(b.cars.mine().id, A_CAR.id, 'a passenger knows which car they\'re in');
}));

test('a driver gets out and those riding stay, and one can take the wheel', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), c = await join(a, 'Mo');
  await a.cars.getIn(A_CAR);
  await until(() => b.cars.records.has(A_CAR.id) && c.cars.records.has(A_CAR.id), 'them to hear');
  await b.cars.getIn(b.cars.records.get(A_CAR.id));
  await c.cars.getIn(c.cars.records.get(A_CAR.id));
  assert.equal((await b.cars.slide(b.cars.records.get(A_CAR.id))).why, 'carTaken', 'not with a driver there');
  await a.cars.getOut(a.cars.records.get(A_CAR.id), { lat: 38.8, lng: -77.3, heading: 10, fuel: 40 });
  const parked = await until(() => { const known = b.cars.records.get(A_CAR.id); return known && !known.driver && known; }, 'the driver to go');
  assert.equal(parked.seats.length, 2);
  assert.equal(parked.lat, 38.8);
  const moved = await b.cars.slide(parked);
  assert.equal(moved.car.driver, b.you.id);
  assert.deepEqual(moved.car.seats, [c.you.id]);
  assert.equal((await c.cars.slide(moved.car)).why, 'carTaken', 'and only one can');
  await c.cars.getOut(moved.car, { lat: 1, lng: 1, heading: 0 });
  const left = await until(() => { const known = b.cars.records.get(A_CAR.id); return known?.seats?.length === 0 && known; }, 'Mo to get out');
  assert.equal(left.lat, 38.8, 'a passenger getting out doesn\'t move the car');
  assert.equal(left.driver, b.you.id);
}));

test('someone riding who drops off gives up their seat, and comes back in the car only if they still have one', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana');
  await a.cars.getIn(A_CAR);
  await until(() => b.cars.records.has(A_CAR.id), 'Dana to hear');
  await b.cars.getIn(b.cars.records.get(A_CAR.id));
  await until(() => a.cars.records.get(A_CAR.id)?.seats?.length === 1, 'the seat');
  b.link.close();
  await until(() => a.cars.records.get(A_CAR.id)?.seats?.length === 0, 'the seat to free');
}));

test('a crash takes everyone in the car with it', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), died = [];
  a.on.died = (m) => died.push(m.member);
  await a.cars.getIn(A_CAR);
  await until(() => b.cars.records.has(A_CAR.id), 'Dana to hear');
  await b.cars.getIn(b.cars.records.get(A_CAR.id));
  placeAt(a, HERE.lat, HERE.lng, 50);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal((await a.link.ask({ t: 'crash', kind: 'parked', other: ANOTHER.id, closing: 50, ...HERE, planted: ANOTHER })).outcome, 'dead');
  await until(() => died.length === 2, 'both');
  assert.deepEqual([...died].sort(), [a.you.id, b.you.id].sort());
  const wreck = await until(() => { const known = a.cars.records.get(A_CAR.id); return known?.wrecked && known; }, 'the wreck');
  assert.deepEqual(wreck.seats, []);
}));

test('speech reaches those in the car or close by, and nothing keeps it', () => pair(async ({ create, join, back }) => {
  const a = await create(), b = await join(a, 'Dana'), c = await join(a, 'Mo'), d = await join(a, 'Far'), heard = [];
  for (const [name, w] of [['b', b], ['c', c], ['d', d]]) w.on.spoken = (m) => heard.push(`${name}:${m.text}`);
  placeAt(a, HERE.lat, HERE.lng, 0);
  placeAt(b, HERE.lat + 20 / 111320, HERE.lng, 0);
  placeAt(c, HERE.lat + 25 / 111320, HERE.lng, 0);
  placeAt(d, HERE.lat + 100 / 111320, HERE.lng, 0);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal((await a.link.ask({ t: 'speak', text: 'over here' })).heard, 2);
  await until(() => heard.length === 2, 'it to be heard');
  assert.deepEqual(heard.sort(), ['b:over here', 'c:over here'], 'not by someone 100 m off');
  heard.length = 0;
  b.setBuilding(HANGAR);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await a.link.ask({ t: 'speak', text: 'through a wall' })).heard, 1, 'someone indoors can\'t hear someone outdoors');
  b.setBuilding(null);
  await a.cars.getIn(A_CAR);
  await until(() => d.cars.records.has(A_CAR.id), 'Far to hear');
  await d.cars.getIn(d.cars.records.get(A_CAR.id));
  heard.length = 0;
  assert.equal((await a.link.ask({ t: 'speak', text: 'in the car' })).heard, 1, 'in a car, only the car, wherever they are');
  await until(() => heard.length, 'Far');
  assert.deepEqual(heard, ['d:in the car']);
  assert.equal((await b.link.ask({ t: 'speak', text: 'knock knock' })).heard, 1, 'and someone outside hears only those outside');
  assert.deepEqual((await b.link.ask({ t: 'speak', text: 'x'.repeat(401) })).why, 'too-long');
  a.link.close();
  const again = await back(a);
  assert.equal(again.chat.messages('group').length, 0, 'and nothing was kept');
}));

test('a crash wears the cars and hurts those in them, going by speed', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana'), losses = [];
  a.on.injured = ({ lost }) => losses.push(lost);
  await a.cars.getIn(A_CAR);
  await b.cars.getIn(ANOTHER);
  placeAt(a, HERE.lat, HERE.lng, 20);
  placeAt(b, HERE.lat, HERE.lng, 0);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal((await a.link.ask({ t: 'crash', kind: 'car', other: b.you.id, closing: 13.4, ...HERE })).outcome, 'hurt');
  const worn = await until(() => { const known = a.cars.records.get(A_CAR.id); return known?.condition < 100 && known; }, 'the wear');
  assert.ok(worn.condition > 88 && worn.condition < 94, `about 30 mph takes about a tenth: ${worn.condition}`);
  await until(() => losses.length, 'it to hurt');
  assert.ok(losses[0] > 5 && losses[0] < 15, `${losses[0]}`);
  assert.ok(a.cars.records.get(A_CAR.id).condition > 0);
}));

test('a car worn out can\'t be driven, but is still there', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana');
  const { car } = await a.cars.getIn(A_CAR);
  assert.equal((await a.link.ask({ t: 'carWear', car: car.id, condition: 200 })).why, undefined);
  assert.equal((await a.link.ask({ t: 'carWear', car: car.id, condition: 8 })).why, undefined);
  await until(() => b.cars.records.get(A_CAR.id)?.condition === 8, 'it to wear');
  assert.equal((await b.link.ask({ t: 'carWear', car: car.id, condition: 1 })).why, 'bad', 'only the driver says');
  await a.cars.getOut(a.cars.records.get(A_CAR.id), { lat: 1, lng: 1, heading: 0 });
  await until(() => !b.cars.records.get(A_CAR.id)?.driver, 'them to leave');
  assert.equal((await b.cars.getIn(b.cars.records.get(A_CAR.id))).why, 'carDead');
}));

test('a driver who vanishes leaves the car rolling on to a stop, not frozen', () => pair(async ({ create, join }) => {
  const a = await create(), b = await join(a, 'Dana');
  await a.cars.getIn(A_CAR);
  await until(() => b.cars.records.has(A_CAR.id), 'Dana to hear');
  a.link.sendBytes(packPresence({ seq: 1, lat: 38.9, lng: -77.4, heading: 0, speed: 20, flags: 0 }));
  await new Promise((r) => setTimeout(r, 40));
  a.link.close();
  const car = await until(() => { const known = b.cars.records.get(A_CAR.id); return known?.coast && known; }, 'it to roll');
  assert.equal(car.coast.speed, 20);
  assert.ok(car.lat > 38.9 + 20 / 111320, 'it ends well along the way');
  assert.ok(car.lat < 38.9 + 400 / 111320, 'but not for ever');
}));
