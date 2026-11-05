// What can be held in a hand and aimed, and whether a shot at that range connects. Pure, tested in node.
// A box of ammunition is one full load for the gun you put it in. Shells and precision rounds go in one at a time.
import { GAME } from './gameConfig.js';

// A bow or a spear later is the same aim, with its own kind. Only these bring up the scope.
export const AIM_KINDS = new Set(['gun', 'bow', 'spear']);

let gunSerial = 1;
export const weaponUid = () => `g${(gunSerial++).toString(36)}`;

// A reload starts the count at 1 again. Move it past uids already saved, or the next gun takes the handgun's.
export function noteWeaponUids(lists) {
  for (const list of lists) {
    for (const item of list || []) {
      const match = /^g([0-9a-z]+)$/.exec(item?.uid || '');
      if (!match) continue;
      const n = parseInt(match[1], 36);
      if (n >= gunSerial) gunSerial = n + 1;
    }
  }
}

// Tests use this to act like a fresh page load.
export function resetWeaponSerial() {
  gunSerial = 1;
}

export function weaponSpec(id) {
  return Object.values(GAME.weapons).find((weapon) => weapon.item === id) || null;
}

export function ammoItem(spec) {
  return spec ? GAME.calibers[spec.caliber]?.item || null : null;
}

export function caliberOf(id) {
  return Object.entries(GAME.calibers).find(([, spec]) => spec.item === id)?.[0] || null;
}

// box: one of the stack fills an empty gun. round: one of the stack is one round.
export function feedOf(spec) {
  return GAME.calibers[spec?.caliber]?.feed === 'round' ? 'round' : 'box';
}

// The gun those bullets fit, the one in hand first, otherwise any in the bag.
export function gunToLoad(caliber, hotbar, bag, prefer = 1) {
  const held = heldWeapon(hotbar, bag, prefer);
  if (held?.spec.caliber === caliber) return held.item;
  return bag?.find((item) => weaponSpec(item.id)?.caliber === caliber) || null;
}

export const isAimWeapon = (id) => {
  const spec = weaponSpec(id);
  return !!spec && AIM_KINDS.has(spec.kind);
};

export const gunsFor = (caliber) => Object.values(GAME.weapons).filter((weapon) => weapon.caliber === caliber && weapon.kind === 'gun').map((weapon) => weapon.item);

// A hotbar slot may be an item id or one gun's uid.
export function carried(bag, key) {
  if (!key || !bag) return null;
  return bag.find((item) => item.uid === key) || bag.find((item) => item.id === key) || null;
}

// The weapon in hand 1 or 2, the preferred hand first, or null.
export function heldWeapon(hotbar, bag, prefer = 1) {
  const order = prefer === 0 ? [0, 1] : [1, 0];
  for (const index of order) {
    const item = carried(bag, hotbar?.[index]);
    const spec = item && weaponSpec(item.id);
    if (item && spec && AIM_KINDS.has(spec.kind)) return { index, item, spec, ammo: ammoItem(spec) };
  }
  return null;
}

// One round, if the gun has one in it. loaded stays on that gun, not on the caliber.
export function shoot(item) {
  const spec = weaponSpec(item?.id);
  if (!spec) return { ok: false, reason: 'none', loaded: 0 };
  const loaded = item.loaded ?? 0;
  if (loaded <= 0) return { ok: false, reason: 'empty', loaded: 0, magazine: spec.magazine };
  item.loaded = loaded - 1;
  return { ok: true, loaded: item.loaded, magazine: spec.magazine, caliber: spec.caliber, fireMode: spec.fireMode || 'single' };
}

// `reserve` is how many boxes, or rounds, are in the bag. A box fills an empty gun and is refused while any round is left.
// A round-fed gun takes one round, and can be topped up until it is full.
export function reload(item, reserve) {
  const spec = weaponSpec(item?.id);
  if (!spec) return { taken: 0, loaded: 0, reason: 'none' };
  const feed = feedOf(spec);
  const loaded = item.loaded ?? 0;
  const magazine = spec.magazine;
  if (feed === 'box') {
    if (loaded > 0) return { taken: 0, loaded, reason: 'loaded', magazine, feed };
    if (!reserve) return { taken: 0, loaded, reason: 'no ammo', magazine, feed };
    item.loaded = magazine;
    return { taken: 1, loaded: item.loaded, magazine, feed, reason: 'ok' };
  }
  if (loaded >= magazine) return { taken: 0, loaded, reason: 'full', magazine, feed };
  if (!reserve) return { taken: 0, loaded, reason: 'no ammo', magazine, feed };
  item.loaded = loaded + 1;
  return { taken: 1, loaded: item.loaded, magazine, feed, reason: 'ok' };
}

// Chance a lined-up shot hits. Full inside the gun's range, then half for each further complete 50 ft. Not a curve.
export function hitChance(metres, spec) {
  const step = GAME.aim.rangeStepFeet;
  const feet = Math.round(Math.max(0, metres) * GAME.aim.feetPerMetre * 1000) / 1000;
  const beyond = Math.max(0, feet - (spec?.effectiveRangeFeet || 0));
  const steps = Math.floor(beyond / step);
  const chance = (spec?.baseHit ?? 1) * (0.5 ** steps);
  return Math.min(1, Math.max(0, chance));
}

// One roll per shot that already met a target. `random` returns 0..1.
export function shotLands(chance, random = Math.random) {
  return random() < chance;
}

export const shotReady = (now, nextAt) => now >= nextAt;
export const cooldownUntil = (now, spec) => now + (spec?.fireIntervalMs || 0);
