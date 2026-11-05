import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../public/js/gameConfig.js';
import { PocketData } from '../public/js/pocketData.js';
import { AIM_KINDS, caliberOf, gunToLoad, gunsFor, heldWeapon, isAimWeapon, reload, shoot } from '../public/js/weapons.js';

const memory = () => { const items = new Map(); return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v) }; };
const gun = () => ({ id: 'Handgun', name: 'Handgun', count: 1, loaded: GAME.weapons.handgun.magazine });

test('a handgun holds 8 rounds of 9mm, and those bullets are the caliber other handguns can share', () => {
  assert.equal(GAME.weapons.handgun.magazine, 8);
  assert.equal(GAME.weapons.handgun.caliber, '9mm');
  assert.deepEqual(gunsFor('9mm'), ['Handgun']);
  assert.ok(AIM_KINDS.has('gun') && AIM_KINDS.has('bow') && AIM_KINDS.has('spear'));
  assert.equal(isAimWeapon('Handgun'), true);
  assert.equal(isAimWeapon('Flashlight'), false);
  const item = gun();
  for (let i = 0; i < 8; i++) assert.equal(shoot(item).ok, true, i);
  assert.equal(item.loaded, 0);
  assert.equal(shoot(item).reason, 'empty');
  assert.equal(GAME.calibers['9mm'].casing, 8);
  assert.equal(caliberOf('9mm bullets'), '9mm');
  const ammo = { id: '9mm bullets', count: 3 };
  assert.equal(reload(item, ammo.count).taken, 1, 'one casing, not one round');
  assert.equal(item.loaded, 8);
  ammo.count -= 1;
  assert.equal(reload(item, ammo.count).reason, 'full');
  item.loaded = 5;
  assert.equal(reload(item, 1).taken, 1);
  assert.equal(item.loaded, 8, 'a casing fills the gun');
  item.loaded = 0;
  assert.equal(reload(item, 0).reason, 'no ammo');
  const bag = [item, ammo];
  assert.equal(gunToLoad('9mm', ['Flashlight', null], bag).id, 'Handgun');
});

test('either hand aims, the one asked for first, and a new handgun is full', () => {
  const bag = [gun()];
  assert.equal(heldWeapon(['Flashlight', 'Handgun'], bag).index, 1);
  assert.equal(heldWeapon(['Handgun', null], bag).index, 0);
  assert.equal(heldWeapon(['Handgun', 'Handgun'], bag, 0).index, 0);
  assert.equal(heldWeapon([null, 'Flashlight'], bag), null);
  const data = new PocketData(memory());
  const given = data.car.find((item) => item.id === 'Handgun');
  assert.equal(given.loaded, 8);
  assert.equal(data.car.find((item) => item.id === '9mm bullets').count, 3);
  given.loaded = 4;
  assert.equal(data.move('Handgun', false), true);
  assert.equal(data.bag.find((item) => item.id === 'Handgun').loaded, 4, 'the rounds move with the gun');
  const other = new PocketData(memory());
  other.addToBag({ id: 'Handgun', name: 'Handgun', loaded: 3 });
  assert.equal(other.bag.find((item) => item.id === 'Handgun').loaded, 3);
});
