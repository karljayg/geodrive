import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../public/js/gameConfig.js';
import { Vitals } from '../public/js/vitals.js';
import { outletSpots, useThing } from '../public/js/footActions.js';
import { ITEMS } from '../public/js/furniture.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const fresh = () => new Vitals(memory());
const entry = (item, u = 0, v = 0) => [item, ITEMS[item].models[0], u, v, 0, 0, 0, 1];

test('rates come out near real figures', () => {
  const hoursToEmpty = (name, activity) => 100 / -GAME.stats[name].perHour[activity];
  assert.ok(Math.abs(hoursToEmpty('energy', 'still') - 16) < 1, 'awake 16 hours');
  assert.ok(GAME.stats.energy.perHour.sleeping * 8 >= 100, '8 hours of sleep fills it');
  assert.ok(Math.abs(hoursToEmpty('hunger', 'still') - 25) < 3, 'a day without food');
  assert.ok(hoursToEmpty('bladder', 'still') > 5 && hoursToEmpty('bladder', 'still') < 9);
  assert.ok(hoursToEmpty('bowels', 'still') > 24);
  assert.ok(100 / -GAME.stats.flashlight.using.light === 5, '5 hours of light');
  assert.ok(GAME.stats.energy.perHour.running < GAME.stats.energy.perHour.walking && GAME.stats.energy.perHour.walking < GAME.stats.energy.perHour.sitting);
});

test('a stat falls by its rate, and only what is on costs battery', () => {
  const v = fresh(), before = { ...v.stats };
  v.pass(2, { activity: 'still' });
  assert.ok(Math.abs(v.stats.energy - (before.energy + 2 * GAME.stats.energy.perHour.still)) < 1e-6);
  assert.ok(Math.abs(v.stats.phone - (before.phone + 2 * GAME.stats.phone.perHour.all)) < 1e-6);
  const f = v.stats.flashlight, p = v.stats.phone;
  v.pass(1, { activity: 'still', light: 'flash', screen: true });
  assert.ok(f - v.stats.flashlight > 19);
  assert.ok(p - v.stats.phone > 12);
});

test('charging fills the phone and the flashlight only if it is in the bag', () => {
  const v = fresh();
  v.stats.phone = 10;
  v.stats.flashlight = 10;
  v.pass(1, { activity: 'still', charging: true, chargingFlashlight: false });
  assert.ok(Math.abs(v.stats.phone - 60) < 1e-6);
  assert.ok(v.stats.flashlight < 10);
  const events = v.pass(3, { activity: 'still', charging: true, chargingFlashlight: true });
  assert.equal(v.stats.phone, 100);
  assert.ok(events.some((e) => e.type === 'full' && e.stat === 'phone'));
  assert.ok(v.stats.flashlight > 80);
});

test('warnings come once on the way down, and again only after recovering', () => {
  const v = fresh();
  v.stats.hunger = 41;
  const hungry = (ev) => ev.filter((e) => e.type === 'warn' && e.stat === 'hunger').length;
  assert.equal(hungry(v.pass(1, { activity: 'still' })), 1);
  assert.equal(hungry(v.pass(1, { activity: 'still' })), 0);
  v.apply({ hunger: 50 });
  v.pass(0.25, { activity: 'still' });
  v.stats.hunger = 41;
  assert.equal(hungry(v.pass(1, { activity: 'still' })), 1);
});

test('holding it too long is an accident, which empties the need and hurts a little', () => {
  const v = fresh();
  v.stats.bladder = 1;
  const health = v.stats.health, events = v.pass(0.5, { activity: 'still' });
  assert.ok(events.some((e) => e.type === 'accident' && e.say));
  assert.ok(v.stats.bladder > 90);
  assert.ok(v.stats.health < health);
  assert.equal(v.state.totals.accidents, 1);
});

test('going without food, water or sleep costs health; being well brings it back', () => {
  const v = fresh();
  v.stats.health = 50;
  v.stats.thirst = 0;
  v.pass(1, { activity: 'sitting' });
  assert.ok(v.stats.health < 50);
  v.stats.thirst = 90;
  const low = v.stats.health;
  v.pass(1, { activity: 'still' });
  assert.ok(v.stats.health > low);
  const asleep = v.stats.health;
  v.pass(1, { activity: 'sleeping' });
  assert.ok(v.stats.health > asleep + 1);
});

test('dropping passes the time and leaves them alive, never at zero', () => {
  const v = fresh();
  v.stats.energy = 0.1;
  const events = v.pass(0.25, { activity: 'still' });
  assert.ok(events.some((e) => e.type === 'collapse' && e.why === 'energy'));
  const before = v.state.hours, out = v.collapse();
  assert.equal(v.state.hours - before, GAME.collapse.hours);
  assert.match(out.say, /6 hours/);
  assert.ok(v.stats.energy >= GAME.collapse.reviveEnergyAtLeast);
  assert.ok(v.stats.health >= GAME.collapse.reviveHealth);
});

test('sleep runs to morning within limits, and restores energy but makes you hungrier', () => {
  const v = fresh();
  assert.equal(v.sleepHours(23), 8);
  assert.equal(v.sleepHours(7), GAME.sleep.leastHours);
  assert.equal(v.sleepHours(9), GAME.sleep.mostHours, 'a morning nap is limited');
  v.stats.energy = 20;
  const food = v.stats.hunger;
  v.sleep(8);
  assert.ok(v.stats.energy >= 100);
  assert.ok(v.stats.hunger < food);
  assert.equal(v.state.totals.sleeps, 1);
});

test('eating and drinking do what the config says, and other things are not food', () => {
  const v = fresh();
  v.stats.hunger = 10;
  v.stats.bowels = 50;
  assert.ok(v.consume('Leftover pizza'));
  assert.equal(v.stats.hunger, 10 + GAME.consumables['Leftover pizza'].hunger);
  assert.ok(v.stats.bowels < 50);
  assert.equal(v.state.totals.food, 1);
  assert.equal(v.consume('Stapler'), null);
  const b = v.stats.bladder;
  v.consume('Bottle of water');
  assert.ok(v.stats.bladder < b, 'a drink has to go somewhere');
});

test('everything edible that can be found is listed, and every consumable can be found somewhere', () => {
  const findable = new Set([...Object.values(GAME.finds).flat(), ...Object.values(GAME.machines).map((m) => m.give)]);
  for (const name of Object.keys(GAME.consumables)) assert.ok(findable.has(name), name);
  for (const food of ['Milk', 'Leftover pizza', 'Sandwich', 'Apple', 'Candy bar', 'Bottle of water']) assert.ok(GAME.consumables[food], food);
});

test('saved between visits, and a new stat in the config starts fresh', () => {
  const storage = memory(), v = new Vitals(storage);
  v.stats.hunger = 12;
  v.save();
  assert.equal(new Vitals(storage).stats.hunger, 12);
  const saved = JSON.parse(storage.getItem('geodrive_vitals_v1'));
  delete saved.stats.flashlight;
  storage.setItem('geodrive_vitals_v1', JSON.stringify(saved));
  assert.equal(new Vitals(storage).stats.flashlight, GAME.stats.flashlight.start);
});

test('food is rare: fridges have it about as often as the config says', () => {
  let found = 0;
  const n = 600;
  for (let i = 0; i < n; i++) if (useThing(entry('fridge', i, 0), {}, 1, 'b').give) found++;
  const rate = found / n;
  assert.ok(Math.abs(rate - GAME.findChance.fridge) < 0.08, `${rate}`);
});

test('machines give once at most, and a toilet relieves both needs', () => {
  let some = 0;
  for (let i = 0; i < 100; i++) {
    const plan = {}, machine = entry('vendingMachine', i, 0), first = useThing(machine, plan, 1, 'b'), again = useThing(machine, plan, 1, 'b');
    if (first.give) some++;
    assert.equal(again.give, undefined);
    assert.equal(again.say, GAME.machines.vendingMachine.empty);
  }
  assert.ok(some > 20 && some < 60);
  const toilet = useThing(entry('toilet'), {}, 1, 'b');
  assert.ok(toilet.effect.bladder >= 100 && toilet.effect.bowels >= 100);
});

test('some taps work and always the same ones', () => {
  const results = Array.from({ length: 200 }, (_, i) => useThing(entry('sink', i, 0), {}, 1, 'b'));
  const works = results.filter((r) => r.effect).length;
  assert.ok(works > 60 && works < 140, `${works}`);
  assert.deepEqual(useThing(entry('sink', 3, 0), {}, 1, 'b'), results[3]);
});

test('every floor has an outlet to look for, some work, and the same ones each time', () => {
  const record = { items: [['frontDoor', 'frontDoor', 0, 0, 0, 0, -1, 1]], walls: Array.from({ length: 30 }, (_, i) => [i * 3, 5, i * 3 + 2.5, 5]) };
  const spots = outletSpots(record, null, 'b', 1);
  assert.ok(spots.length >= 1 && spots.length <= GAME.outlets.mostPerFloor);
  assert.deepEqual(outletSpots(record, null, 'b', 1), spots);
  let works = 0, all = 0;
  for (let i = 0; i < 200; i++) for (const s of outletSpots(record, null, `b${i}`, 1)) { all++; if (s.works) works++; }
  assert.ok(Math.abs(works / all - GAME.outlets.workingChance) < 0.1);
});
