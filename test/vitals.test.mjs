import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../public/js/gameConfig.js';
import { Vitals } from '../public/js/vitals.js';
import { newWalk, updateWalk, walkFigures } from '../public/js/trip.js';
import { SAYINGS } from '../public/js/sayingsConfig.js';
import { say } from '../public/js/sayings.js';
import { claimOpened, outletSpots, useThing } from '../public/js/footActions.js';
import { ITEMS } from '../public/js/furniture.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const fresh = () => new Vitals(memory());
const entry = (item, u = 0, v = 0) => [item, ITEMS[item].models[0], u, v, 0, 0, 0, 1];

test('tired people run slower, and exhausted ones only walk', () => {
  const v = fresh(), at = (energy) => { v.stats.energy = energy; return { can: v.canRun(), speed: v.runSpeed(2, 8) }; };
  assert.deepEqual(at(26), { can: true, speed: 8 });
  assert.deepEqual(at(25), { can: true, speed: 5 });
  assert.deepEqual(at(11), { can: true, speed: 5 });
  assert.equal(at(10).can, false);
  assert.equal(at(0).can, false);
});

test('a need is good, then caution from its first warning, then critical at its last', () => {
  const v = fresh(), at = (name, value) => { v.stats[name] = value; return v.levelOf(name); };
  assert.equal(at('hunger', 41), 'good');
  assert.equal(at('hunger', 40), 'caution');
  assert.equal(at('hunger', 9), 'caution');
  assert.equal(at('hunger', 8), 'critical');
  assert.equal(at('health', 100), 'good');
  assert.equal(at('health', 40), 'caution');
  assert.equal(at('health', 15), 'critical');
  assert.equal(at('phone', 0), 'critical');
});

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
  const findable = new Set([...Object.values(GAME.finds).flat(), ...Object.values(GAME.machines).flatMap((m) => m.give)]);
  const fromDeer = new Set([GAME.deer, GAME.chicken, GAME.rabbit].flatMap((kind) => [kind.raw, kind.cooked]));
  for (const name of Object.keys(GAME.consumables)) if (!fromDeer.has(name)) assert.ok(findable.has(name), name);
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
    const plan = {}, machine = entry('vendingMachine', i, 0), first = useThing(machine, plan, 1, 'b');
    if (first.give) {
      some++;
      assert.equal(first.offer, true);
      assert.equal(useThing(machine, plan, 1, 'b').give, first.give);
      claimOpened(plan, 1, machine);
    }
    const again = useThing(machine, plan, 1, 'b');
    assert.equal(again.give, undefined);
    assert.ok(SAYINGS.vendingEmpty.includes(again.say), again.say);
  }
  assert.ok(some > 40 && some < 85);
  const toilet = useThing(entry('toilet'), {}, 1, 'b');
  assert.ok(toilet.effect.bladder >= 100 && toilet.effect.bowels >= 100);
});

test('some taps work and always the same ones', () => {
  const results = Array.from({ length: 200 }, (_, i) => useThing(entry('sink', i, 0), {}, 1, 'b'));
  const works = results.filter((r) => r.effect).length;
  assert.ok(works > 60 && works < 140, `${works}`);
  assert.equal(!!useThing(entry('sink', 3, 0), {}, 1, 'b').effect, !!results[3].effect);
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

test('sayings take turns through every line before repeating, and never twice running', () => {
  const lines = { k: ['one', 'two', 'three', 'four'] };
  const said = Array.from({ length: 40 }, () => say('k', {}, lines));
  for (let i = 1; i < said.length; i++) assert.notEqual(said[i], said[i - 1]);
  for (let i = 0; i + 4 <= said.length; i += 4) assert.equal(new Set(said.slice(i, i + 4)).size, 4);
});

test('sayings fill their blanks, and anything that is not a key is said as written', () => {
  assert.equal(say('b', { name: 'fridge' }, { b: ['The {name} is empty.'] }), 'The fridge is empty.');
  assert.equal(say('Just plain text.'), 'Just plain text.');
});

test('every say in the config is a real key, and the common ones have several lines', () => {
  const keys = [];
  for (const stat of [...Object.values(GAME.stats), GAME.health]) {
    keys.push(...(stat.warn || []).map(([, key]) => key));
    if (stat.accident) keys.push(stat.accident.say);
  }
  keys.push(GAME.collapse.say);
  for (const machine of Object.values(GAME.machines)) keys.push(machine.say, machine.empty);
  for (const use of Object.values(GAME.uses)) { if (use.dry) keys.push(use.dry); }
  for (const key of keys) assert.ok(SAYINGS[key]?.length, key);
  for (const key of ['nothingHere', 'lightsOn', 'lightsOff', 'emptyThing', 'bagFull', 'locked', 'relief']) assert.ok(SAYINGS[key].length >= 3, key);
  assert.ok(SAYINGS.switchLocked.every((l) => /key/i.test(l)), 'every wording says a key is needed');
  assert.ok(SAYINGS.locked.every((l) => /locked/i.test(l)));
});

test('food turns up often enough in the places you would expect it', () => {
  const finds = (item, n = 400) => {
    let food = 0;
    for (let i = 0; i < n; i++) if (GAME.consumables[useThing(entry(item, i, 0), {}, 1, 'food').give]) food++;
    return food / n;
  };
  assert.ok(finds('fridge') > 0.3, 'a fridge often has something');
  assert.ok(finds('walkInFridge') > 0.5);
  assert.ok(finds('barCounter') > 0.3, 'a counter in a restaurant');
  assert.ok(finds('storeShelf') > 0.05 && finds('storeShelf') < 0.25, 'shelves are many, so each is a long shot');
});

test('the pause screen lists needs, lowest first, with the phone and flashlight after them', () => {
  const vitals = fresh();
  Object.assign(vitals.stats, { health: 100, energy: 50, hunger: 80, thirst: 10, bladder: 60, bowels: 70, phone: 1, flashlight: 2 });
  const rows = vitals.needRows(['health', 'energy', 'hunger', 'thirst', 'bladder', 'bowels', 'phone', 'flashlight'], vitals.rates({ activity: 'still' }));
  assert.deepEqual(rows.map((r) => r.name), ['thirst', 'energy', 'bladder', 'bowels', 'hunger', 'health', 'phone', 'flashlight']);
  assert.equal(rows[0].level, 'critical');
  assert.ok(rows.every((r) => r.tip), 'every need says what to do');
});

test('a walk adds up, and running is the share of the distance run', () => {
  const walk = newWalk();
  updateWalk(walk, 10, 30, false);
  updateWalk(walk, 10, 90, true);
  const figures = walkFigures(walk);
  assert.equal(figures.time, '0:20');
  assert.equal(figures.running, '75%');
  assert.equal(figures.distance, '0.07 mi');
  assert.equal(walkFigures(newWalk()).running, '0%');
});

test('walks are saved with the vitals and older saves get a blank tally', () => {
  const store = memory();
  store.setItem('geodrive_vitals_v1', JSON.stringify({ stats: {}, hours: 5 }));
  const vitals = new Vitals(store);
  assert.equal(vitals.state.walked.meters, 0);
  vitals.state.walked.meters = 42;
  vitals.save();
  assert.equal(new Vitals(store).state.walked.meters, 42);
});

test('with no bed or toilet: half the energy for 7 hours, half the relief, offered only when needed', () => {
  const bed = fresh(), rough = fresh();
  assert.deepEqual(rough.roughNeeds(), { sleep: false, relief: false });
  bed.stats.energy = rough.stats.energy = 0;
  assert.equal(rough.roughNeeds().sleep, true);
  bed.sleep(GAME.rough.sleepHours);
  const { hours } = rough.sleepRough();
  assert.equal(hours, 7);
  assert.equal(rough.stats.energy, bed.stats.energy / 2);
  rough.stats.bladder = 20;
  rough.stats.bowels = 60;
  assert.equal(rough.roughNeeds().relief, true);
  const went = rough.state.totals.restroom;
  rough.relieveRough();
  assert.equal(rough.stats.bladder, 60);
  assert.equal(rough.stats.bowels, 80);
  assert.equal(rough.state.totals.restroom, went + 1);
});

test('going says what was done, and the label stays where it happened', async () => {
  const { Marks } = await import('../public/js/drops.js');
  const v = fresh();
  v.stats.bladder = 10;
  assert.equal(v.relieveRough(), 'peed');
  v.stats.bladder = 90; v.stats.bowels = 5;
  assert.equal(v.relieveRough(), 'pooped');
  v.stats.bladder = 5; v.stats.bowels = 5;
  assert.equal(v.relieveRough(), 'peed and pooped');
  const storage = memory(), marks = new Marks(storage, 2);
  marks.add('peed', 39, -77);
  assert.equal(new Marks(storage).around(39, -77, 100, 20)[0].what, 'peed');
  assert.equal(marks.around(39.01, -77, 100, 20).length, 0, 'not seen from far off');
  marks.add('peed', 39, -77); marks.add('pooped', 39, -77);
  assert.equal(marks.list.length, 2, 'only the newest are kept');
});

test('critical: a day of it kills, once, and getting better starts the count again', () => {
  const v = fresh();
  v.stats.health = 10;
  assert.equal(v.isCritical, true);
  assert.equal(v.criticalHoursLeft(), GAME.health.criticalHours);
  const feed = () => { v.stats.hunger = 100; v.stats.thirst = 100; v.stats.energy = 100; v.stats.bladder = 100; v.stats.bowels = 100; };
  let events = [];
  for (let i = 0; i < 12; i++) { feed(); events = events.concat(v.pass(1, { activity: 'still' })); }
  assert.ok(!events.some((e) => e.type === 'succumb'));
  assert.ok(v.criticalHoursLeft() <= 12.01);
  v.stats.health = 1;
  for (let i = 0; i < 12; i++) { feed(); events = events.concat(v.pass(1, { activity: 'still' })); }
  assert.equal(events.filter((e) => e.type === 'succumb').length, 1);
  for (let i = 0; i < 3; i++) { feed(); events = events.concat(v.pass(1, { activity: 'still' })); }
  assert.equal(events.filter((e) => e.type === 'succumb').length, 1, 'once');
  v.stats.health = 50;
  v.pass(0.25, { activity: 'still' });
  assert.equal(v.criticalHoursLeft(), null);
  v.stats.health = 10;
  assert.equal(v.criticalHoursLeft(), GAME.health.criticalHours, 'and it starts afresh');
});

test('hurt badly, moving about heals very slowly, and lying in bed fed heals better', () => {
  const rate = (doing, change = {}) => {
    const v = fresh();
    Object.assign(v.stats, { health: 5, hunger: 80, thirst: 80, energy: 80 }, change);
    return v.rates(doing).health;
  };
  assert.equal(rate({ activity: 'walking' }), GAME.health.healWhenCritical);
  assert.equal(rate({ activity: 'resting' }), GAME.health.healInBed);
  assert.ok(rate({ activity: 'resting' }) > rate({ activity: 'walking' }) * 5);
  assert.ok(rate({ activity: 'resting' }, { hunger: 0 }) < 0, 'with nothing to eat, bed won\'t save them');
  const notBad = fresh();
  Object.assign(notBad.stats, { health: 60, hunger: 80, thirst: 80, energy: 80 });
  assert.equal(notBad.rates({ activity: 'walking' }).health, GAME.health.healWhenWell, 'and it only applies when they\'re critical');
});

test('resting in bed uses up what sleep does, not what being up does', () => {
  const v = fresh(), up = v.rates({ activity: 'walking' }), resting = v.rates({ activity: 'resting' });
  assert.ok(resting.energy > 0, 'it restores energy');
  assert.ok(resting.hunger > up.hunger, 'and hunger comes on slower');
});

test('a day of healing from the worst, in bed and fed, gets someone out of it in time', () => {
  const { criticalBelow, healInBed, criticalHours } = GAME.health;
  assert.ok((criticalBelow - 1) / healInBed < criticalHours);
});
