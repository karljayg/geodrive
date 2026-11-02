import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME } from '../public/js/gameConfig.js';
import { PocketData } from '../public/js/pocketData.js';
import { Clock, RULES, TRIAL, openWorld, scopedStorage } from '../public/js/world.js';

const memory = () => {
  const map = new Map();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), get keys() { return [...map.keys()]; } };
};
const NEAR = { pos: { lat: 38.9, lng: -77 }, heading: 90 };

// Node has no localStorage, so what the sandbox would use is stood in for here. Each class reads it only when it isn't given a store.
function sandbox(hour = 12) {
  const storage = memory(), before = globalThis.localStorage;
  globalThis.localStorage = storage;
  const settings = { hour };
  let saved = 0;
  const world = openWorld({ search: '', storage, settings, saveSettings: () => { saved++; } });
  return { storage, settings, world, savedCount: () => saved, done: () => { globalThis.localStorage = before; } };
}

test('the sandbox is what opens by default, and allows what it always has', () => {
  const { world, done } = sandbox();
  assert.equal(world.mode, 'sandbox');
  assert.equal(world.store, undefined, 'its classes keep their own default, so today\'s saves are untouched');
  assert.deepEqual(world.rules, RULES.sandbox);
  assert.ok(world.rules.ownCar && !world.rules.startsOnFoot && world.rules.skipTime && world.rules.changeStart && world.rules.share && world.rules.forgetBuildings);
  done();
});

test('the sandbox saves under the same keys as it did before worlds existed', () => {
  const { world, storage, done } = sandbox();
  world.trips.save(NEAR);
  world.trips.saveRoute({ lat: 1, lng: 2 }, [{ lat: 1, lng: 2 }, { lat: 1.1, lng: 2.1 }]);
  world.drops.add({ name: 'Box', lat: 1, lng: 2, facing: 0 });
  world.vitals.save();
  assert.deepEqual(storage.keys.sort(), ['geodrive_drops_v1', 'geodrive_route_v1', 'geodrive_session_v1', 'geodrive_vitals_v1']);
  done();
});

test('the sandbox reads saves from before worlds existed', () => {
  const { storage, settings, done } = sandbox();
  storage.setItem('geodrive_session_v1', JSON.stringify(NEAR));
  storage.setItem('geodrive_drops_v1', JSON.stringify([{ id: 4, name: 'Box', lat: 1, lng: 2, facing: 0 }]));
  const world = openWorld({ storage, settings, saveSettings() {} });
  assert.deepEqual(world.trips.load(), NEAR);
  assert.equal(world.drops.list[0].name, 'Box');
  done();
});

test('the sandbox opens saved buildings under their old key too', async () => {
  const { world, storage, done } = sandbox();
  const buildings = await world.openBuildings();
  assert.equal(await world.openBuildings(), buildings, 'one store for the visit');
  buildings.remember('1_2', { type: 'home', floors: 1 }, 5);
  assert.ok(storage.getItem('geodrive_rooms_v3'));
  done();
});

test('the sandbox\'s clock is the one in its settings', () => {
  const { world, settings, savedCount, done } = sandbox(10);
  assert.equal(world.clock.hour, 10);
  world.clock.advance(60, true, 1);
  assert.equal(settings.hour, 11, 'an hour a minute on foot');
  world.clock.advance(3600, false, 1);
  assert.equal(settings.hour, 12, 'real time in the car');
  world.clock.skip(13);
  assert.equal(settings.hour, 1, 'wrapping at midnight');
  settings.hour = 20;
  assert.equal(world.clock.hour, 20, 'the Settings slider moves it');
  world.clock.save();
  assert.equal(savedCount(), 1);
  done();
});

test('a practice world keeps everything apart from the sandbox', async () => {
  const storage = memory(), settings = { hour: 9 }, search = `?world=${TRIAL}`;
  const world = openWorld({ search, storage, settings, saveSettings: () => assert.fail('its clock isn\'t in settings') });
  assert.equal(world.mode, 'trial');
  assert.deepEqual(world.rules, RULES.trial);
  world.trips.save(NEAR);
  world.drops.add({ name: 'Box', lat: 1, lng: 2, facing: 0 });
  world.vitals.save();
  new PocketData(world.store).addNote(1);
  (await world.openBuildings()).remember('1_2', { type: 'home', floors: 1 }, 5);
  world.clock.hour = 15;
  world.clock.save();
  assert.equal(settings.hour, 9, 'the sandbox\'s time is untouched');
  assert.ok(storage.keys.length >= 5);
  for (const key of storage.keys) assert.ok(key.startsWith(`geodrive_w_${TRIAL}_`), key);

  const again = openWorld({ search, storage, settings, saveSettings() {} });
  assert.deepEqual(again.trips.load(), NEAR, 'and it\'s all there next time');
  assert.equal(again.drops.list.length, 1);
  assert.equal(again.clock.hour, 15);
  assert.equal(new PocketData(again.store).notes.length, 1);
});

test('a practice world starts on foot with no car, and starts its clock from the sandbox\'s', () => {
  const world = openWorld({ search: `?world=${TRIAL}`, storage: memory(), settings: { hour: 7 }, saveSettings() {} });
  assert.ok(world.rules.startsOnFoot && !world.rules.ownCar);
  assert.ok(!world.rules.skipTime && !world.rules.changeStart && !world.rules.share && !world.rules.forgetBuildings);
  assert.equal(world.clock.hour, 7);
  world.clock.advance(60, true, GAME.clock.onFootHoursPerMinute);
  assert.equal(world.clock.hour, 8);
});

test('an unknown world is the sandbox, and so is a practice world with no storage', () => {
  const settings = { hour: 3 };
  assert.equal(openWorld({ search: '?world=nope', storage: memory(), settings, saveSettings() {} }).mode, 'sandbox');
  assert.equal(openWorld({ search: `?world=${TRIAL}`, storage: null, settings, saveSettings() {} }).mode, 'sandbox');
});

test('a scoped storage adds its name to every key and hides others', () => {
  const storage = memory(), scoped = scopedStorage(storage, 'a_');
  scoped.setItem('k', '1');
  assert.equal(storage.getItem('a_k'), '1');
  assert.equal(scoped.getItem('k'), '1');
  assert.equal(scopedStorage(storage, 'b_').getItem('k'), null);
  scoped.removeItem('k');
  assert.equal(storage.getItem('a_k'), null);
});

test('a clock that can\'t save or has rubbish saved still tells the time', () => {
  const broken = { getItem: () => '{nope', setItem: () => { throw new Error('full'); }, removeItem() {} };
  const world = openWorld({ search: `?world=${TRIAL}`, storage: broken, settings: { hour: 6 }, saveSettings() {} });
  assert.equal(world.clock.hour, 6);
  world.clock.save();
  assert.ok(world.clock instanceof Clock);
});

// main.js and foot.js are too tied to the browser to run here, so this keeps a door from reopening: all saved data goes through world.js.
test('the game reaches for saved data only through the world', () => {
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8'), foot = readFileSync(new URL('../public/js/foot.js', import.meta.url), 'utf8'), pocket = readFileSync(new URL('../public/js/pocket.js', import.meta.url), 'utf8');
  for (const made of ['new Drops(', 'new Vitals(', 'new TripStore(', 'new BuildingStore(', 'settings.hour']) assert.ok(!main.includes(made), `main.js: ${made}`);
  assert.ok(!foot.includes('new BuildingStore('), 'foot.js');
  assert.ok(!pocket.includes('new PocketData()'), 'pocket.js takes the world\'s store');
});
