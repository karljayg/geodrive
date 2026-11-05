import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../public/js/gameConfig.js';
import { PocketData } from '../public/js/pocketData.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AIM_KINDS, caliberOf, carried, cooldownUntil, feedOf, gunToLoad, gunsFor, heldWeapon, hitChance, isAimWeapon, reload, resetWeaponSerial, shoot, shotLands, shotReady, weaponSpec } from '../public/js/weapons.js';
import { GUN_CLIPS } from '../public/js/sounds.js';

const memory = () => { const items = new Map(); return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v) }; };
const metres = (feet) => feet / GAME.aim.feetPerMetre;
const gun = (loaded = GAME.weapons.handgun.magazine) => ({ id: 'Handgun', name: 'Handgun', count: 1, loaded, uid: 'ghand' });

test('every gun names a caliber, a magazine and a fire mode the game actually runs', () => {
  const modes = new Set(['single', 'auto']);
  for (const [key, weapon] of Object.entries(GAME.weapons)) {
    assert.equal(weapon.kind, 'gun', key);
    assert.ok(GAME.calibers[weapon.caliber], key);
    assert.equal(weaponSpec(weapon.item), weapon);
    assert.ok(weapon.magazine > 0 && weapon.effectiveRangeFeet > 0 && weapon.fireIntervalMs > 0, key);
    assert.ok(modes.has(weapon.fireMode), key);
    assert.ok(weapon.damage > 0, key);
  }
  assert.equal(GAME.weapons.ar15.fireMode, 'auto');
  assert.equal(GAME.weapons.smg.fireMode, 'auto');
  assert.equal(GAME.weapons.ar15.magazine, 30);
  assert.equal(GAME.weapons.smg.magazine, 30);
  for (const [key, weapon] of Object.entries(GAME.weapons)) {
    if (key !== 'ar15' && key !== 'smg') assert.equal(weapon.fireMode, 'single', key);
    assert.ok(GUN_CLIPS[weapon.sound], weapon.item);
    assert.ok(existsSync(fileURLToPath(new URL(`../public/${GUN_CLIPS[weapon.sound].file}`, import.meta.url))), weapon.sound);
  }
  assert.deepEqual(gunsFor('9mm'), ['Handgun', 'SMG']);
  assert.deepEqual(gunsFor('rifle'), ['Hunting Rifle', 'AR-15']);
  assert.equal(feedOf(GAME.weapons.shotgun), 'round');
  assert.equal(feedOf(GAME.weapons.sniper), 'round');
  assert.equal(feedOf(GAME.weapons.handgun), 'box');
  assert.ok(AIM_KINDS.has('gun'));
  assert.equal(isAimWeapon('Handgun'), true);
  assert.equal(isAimWeapon('Flashlight'), false);
});

test('a box fills an empty gun and is refused while rounds remain; a shell loads one at a time', () => {
  const item = gun();
  for (let i = 0; i < 8; i++) assert.equal(shoot(item).ok, true, i);
  assert.equal(item.loaded, 0);
  assert.equal(shoot(item).reason, 'empty');
  assert.equal(caliberOf('9mm bullets'), '9mm');
  assert.equal(reload(item, 3).taken, 1);
  assert.equal(item.loaded, 8);
  assert.equal(reload(item, 2).reason, 'loaded');
  assert.equal(item.loaded, 8, 'a box does not go in until it is empty');
  item.loaded = 5;
  assert.equal(reload(item, 1).reason, 'loaded');
  assert.equal(item.loaded, 5);
  item.loaded = 0;
  assert.equal(reload(item, 0).reason, 'no ammo');
  const shotgun = { id: 'Shotgun', name: 'Shotgun', count: 1, loaded: 2 };
  assert.equal(reload(shotgun, 4).taken, 1);
  assert.equal(shotgun.loaded, 3);
  shotgun.loaded = GAME.weapons.shotgun.magazine;
  assert.equal(reload(shotgun, 4).reason, 'full');
  const bag = [item, { id: '9mm bullets', count: 3 }];
  assert.equal(gunToLoad('9mm', ['Flashlight', null], bag).id, 'Handgun');
  const smg = { id: 'SMG', name: 'SMG', count: 1, loaded: 0 };
  assert.equal(reload(smg, 1).loaded, 30, 'the same box fills the gun it goes into');
});

test('either hand aims, and two handguns keep their own rounds', () => {
  const bag = [gun(4), { id: 'Handgun', name: 'Handgun', count: 1, loaded: 1, uid: 'gother' }];
  assert.equal(heldWeapon(['Flashlight', 'gother'], bag).item.loaded, 1);
  assert.equal(heldWeapon(['ghand', null], bag).index, 0);
  assert.equal(heldWeapon(['Handgun', null], bag).item.uid, 'ghand', 'an old slot still finds the first');
  assert.equal(heldWeapon([null, 'Flashlight'], bag), null);
  const data = new PocketData(memory());
  const given = data.car.find((item) => item.id === 'Handgun');
  assert.equal(given.loaded, 8);
  assert.equal(data.car.find((item) => item.id === '9mm bullets').count, 3, 'still three boxes, not rounds');
  given.loaded = 4;
  assert.equal(data.move('Handgun', false, given.uid), true);
  assert.equal(data.bag.find((item) => item.uid === given.uid).loaded, 4);
  data.addToBag({ id: 'Handgun', name: 'Handgun', loaded: 2 });
  const hands = data.bag.filter((item) => item.id === 'Handgun');
  assert.equal(hands.length, 2);
  assert.deepEqual(hands.map((item) => item.loaded).sort(), [2, 4]);
  assert.equal(new Set(hands.map((item) => item.uid)).size, 2);
  data.drop('Handgun', false, hands.find((item) => item.loaded === 2).uid);
  assert.equal(data.bag.filter((item) => item.id === 'Handgun').length, 1);
  assert.equal(data.bag.find((item) => item.id === 'Handgun').loaded, 4);
});

test('a saved stack of the same gun splits, and a box count is left as boxes', () => {
  const storage = memory();
  storage.setItem('geodrive_pocket_v1', JSON.stringify({
    gunGiven: true, hammerGiven: true, notes: [], messages: {}, hotbar: [],
    bag: [{ id: 'Handgun', name: 'Handgun', count: 2, loaded: 3 }, { id: '9mm bullets', name: '9mm bullets', count: 15 }],
    car: [],
  }));
  const data = new PocketData(storage);
  const hands = data.bag.filter((item) => item.id === 'Handgun');
  assert.equal(hands.length, 2);
  assert.deepEqual(hands.map((item) => item.loaded).sort(), [3, 8]);
  assert.equal(data.bag.find((item) => item.id === '9mm bullets').count, 15);
  data.save();
  assert.equal(new PocketData(storage).bag.filter((item) => item.id === 'Handgun').length, 2);
});

test('a gun picked up after a reload does not take the handgun uid, so the hotbar can hold it', () => {
  resetWeaponSerial();
  const storage = memory();
  const first = new PocketData(storage);
  const hand = first.car.find((item) => item.id === 'Handgun');
  assert.equal(hand.uid, 'g1');
  first.save();
  resetWeaponSerial();
  const again = new PocketData(storage);
  assert.equal(again.move('Handgun', false, hand.uid), true);
  assert.equal(again.addToBag({ id: 'AR-15', name: 'AR-15', loaded: 30 }), true);
  const rifle = again.bag.find((item) => item.id === 'AR-15');
  assert.notEqual(rifle.uid, hand.uid);
  for (const index of [0, 1, 2]) {
    again.setHotbar(index, rifle.uid);
    const held = carried(again.bag, again.state.hotbar[index]);
    assert.equal(held.id, 'AR-15');
    assert.equal(held.name, 'AR-15');
  }
});

test('two guns saved under one uid are split, and the hand that had it keeps the first', () => {
  resetWeaponSerial();
  const storage = memory();
  storage.setItem('geodrive_pocket_v1', JSON.stringify({
    gunGiven: true, hammerGiven: true, notes: [], messages: {},
    hotbar: ['g1', null, null, null, null, null, null, null, null, null],
    bag: [
      { id: 'Handgun', name: 'Handgun', count: 1, loaded: 8, uid: 'g1' },
      { id: 'AR-15', name: 'AR-15', count: 1, loaded: 30, uid: 'g1' },
    ],
    car: [],
  }));
  const data = new PocketData(storage);
  const pistol = data.bag.find((item) => item.id === 'Handgun');
  const rifle = data.bag.find((item) => item.id === 'AR-15');
  assert.equal(pistol.uid, 'g1');
  assert.notEqual(rifle.uid, pistol.uid);
  assert.equal(carried(data.bag, data.state.hotbar[0]).id, 'Handgun');
  data.setHotbar(0, rifle.uid);
  data.setHotbar(2, rifle.uid);
  assert.equal(carried(data.bag, data.state.hotbar[0]).name, 'AR-15');
  assert.equal(carried(data.bag, data.state.hotbar[2]).name, 'AR-15');
  const saved = JSON.parse(storage.getItem('geodrive_pocket_v1'));
  assert.equal(saved.bag.find((item) => item.id === 'AR-15').uid, rifle.uid);
});

test('range stays certain until a full extra 50 ft, then halves, and one roll decides the shot', () => {
  const spec = GAME.weapons.handgun;
  const at = (feet) => hitChance(metres(feet), spec);
  assert.equal(at(50), 1);
  assert.equal(at(75), 1);
  assert.equal(at(99.9), 1);
  assert.equal(at(100), 0.5);
  assert.equal(at(149.9), 0.5);
  assert.equal(at(150), 0.25);
  assert.equal(at(200), 0.125);
  assert.ok(at(0) <= 1 && at(10000) >= 0);
  let rolls = 0;
  const random = () => { rolls++; return 0.49; };
  assert.equal(shotLands(0.5, random), true);
  assert.equal(shotLands(0.5, () => 0.5), false);
  assert.equal(shotLands(1, () => 0.999), true);
  assert.equal(rolls, 1);
  assert.equal(shotReady(1000, 1000), true);
  assert.equal(shotReady(999, 1000), false);
  assert.equal(cooldownUntil(1000, GAME.weapons.ar15), 1100);
});
