// Two people in one building, or one dropped thing: pure rules first, then two real worlds against a real server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/app.mjs';
import { WorldLink } from '../public/js/net.js';
import { PROTOCOL, FLAGS } from '../public/js/protocol.js';
import { PrivateWorld, rememberWorld, savedMe } from '../public/js/world.js';
import { applyFloorOp, cleanDrop, emptyFloorState, floorOpsBetween, mergePlan, planToShare, tileOfBuilding, undoFloorOp } from '../public/js/worldOps.js';
import { vectorTileAt } from '../public/js/vector.js';

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

async function pair(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'geodrive-shared-'));
  let server = await startServer({ dir });
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
    await fn({ create, join: join_, back, restart: async () => { for (const w of all) w.link.close(); const { port } = server; await server.close(); server = await startServer({ dir, port }); } });
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
