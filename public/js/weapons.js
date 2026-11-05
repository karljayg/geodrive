// What can be held in a hand and aimed. A caliber names the bullets, so later guns can share them. Pure, tested in node.
import { GAME } from './gameConfig.js';

// A bow or a spear later is the same aim, with its own kind. Only these bring up the scope.
export const AIM_KINDS = new Set(['gun', 'bow', 'spear']);

export function weaponSpec(id) {
  return Object.values(GAME.weapons).find((weapon) => weapon.item === id) || null;
}

export function ammoItem(spec) {
  return spec ? GAME.calibers[spec.caliber]?.item || null : null;
}

export function caliberOf(id) {
  return Object.entries(GAME.calibers).find(([, spec]) => spec.item === id)?.[0] || null;
}

// The handgun those bullets fit, the one in hand first, otherwise any in the bag.
export function gunToLoad(caliber, hotbar, bag, prefer = 1) {
  const held = heldWeapon(hotbar, bag, prefer);
  if (held?.spec.caliber === caliber) return held.item;
  return bag?.find((item) => weaponSpec(item.id)?.caliber === caliber) || null;
}

export const isAimWeapon = (id) => {
  const spec = weaponSpec(id);
  return !!spec && AIM_KINDS.has(spec.kind);
};

// Guns that take this caliber. The bullets stay one item in the bag.
export const gunsFor = (caliber) => Object.values(GAME.weapons).filter((weapon) => weapon.caliber === caliber && weapon.kind === 'gun').map((weapon) => weapon.item);

// The weapon in hand 1 or 2, the preferred hand first, or null. The thing has to be in the bag.
export function heldWeapon(hotbar, bag, prefer = 1) {
  const order = prefer === 0 ? [0, 1] : [1, 0];
  for (const index of order) {
    const id = hotbar?.[index];
    if (!isAimWeapon(id)) continue;
    const item = bag?.find((entry) => entry.id === id);
    const spec = weaponSpec(id);
    if (item && spec) return { index, item, spec, ammo: ammoItem(spec) };
  }
  return null;
}

// One round, if the gun has one in it. loaded stays on the bag item.
export function shoot(item) {
  const spec = weaponSpec(item?.id);
  if (!spec) return { ok: false, reason: 'none', loaded: 0 };
  const loaded = item.loaded ?? 0;
  if (loaded <= 0) return { ok: false, reason: 'empty', loaded: 0, magazine: spec.magazine };
  item.loaded = loaded - 1;
  return { ok: true, loaded: item.loaded, magazine: spec.magazine, caliber: spec.caliber };
}

// One casing from `casings` fills the gun, up to a full magazine. The caller takes that one casing out of the bag.
export function reload(item, casings) {
  const spec = weaponSpec(item?.id);
  if (!spec) return { taken: 0, loaded: 0, reason: 'none' };
  const casing = GAME.calibers[spec.caliber]?.casing || spec.magazine;
  const loaded = item.loaded ?? 0;
  const room = spec.magazine - loaded;
  if (room <= 0) return { taken: 0, loaded, reason: 'full', magazine: spec.magazine, casing };
  if (!casings) return { taken: 0, loaded, reason: 'no ammo', magazine: spec.magazine, casing };
  item.loaded = loaded + Math.min(room, casing);
  return { taken: 1, loaded: item.loaded, magazine: spec.magazine, casing, reason: 'ok' };
}
