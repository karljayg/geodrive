// What the test windows work from: overriding tunable numbers for one world, and the list of what can be spawned. Pure, tested in node. Used by the browser and the world server.
import { CAR_PROFILES } from './cars.js';
import { GAME } from './gameConfig.js';
import { ITEM_NAMES } from './itemArt.js';

export const SPAWN_MOST = 50;   // at a time
export const LIVES_MOST = 999;
const VALUE_MOST = 1e9;
const PRISTINE = structuredClone(GAME);

// Everyone may use these while the game is being tested. When they become an admin feature, this and mayTest in room.mjs are what change.
export const testToolsAllowed = () => true;

// Every number that can be overridden, as { path, value } with value the one in the server's files. Lists are left out, as their positions aren't names.
export function tunables(from = PRISTINE, prefix = '') {
  return Object.entries(from).flatMap(([key, value]) => {
    const path = prefix + key;
    if (typeof value === 'number') return [{ path, value }];
    return value && typeof value === 'object' && !Array.isArray(value) ? tunables(value, `${path}.`) : [];
  });
}

const KNOWN = new Map(tunables().map(({ path, value }) => [path, value]));
export const fileValue = (path) => KNOWN.get(path);
export const isTunable = (path) => KNOWN.has(path);
export const okValue = (value) => Number.isFinite(value) && Math.abs(value) <= VALUE_MOST;

function setAt(target, path, value) {
  const parts = path.split('.'), last = parts.pop();
  for (const part of parts) target = target[part];
  target[last] = value;
}

// A copy of a config with these overrides, for a world server, where one process holds many worlds. Anything not known is ignored, as a save may outlive a number.
export function tunedCopy(base, overrides) {
  const copy = structuredClone(base);
  for (const [path, value] of Object.entries(overrides)) if (isTunable(path) && okValue(value)) setAt(copy, path, value);
  return copy;
}

// Puts overrides on GAME itself, for a browser, which holds one world and reads GAME as it goes. Anything no longer overridden goes back to its file value.
export function applyOverrides(overrides, game = GAME) {
  for (const [path, value] of KNOWN) setAt(game, path, isTunable(path) && okValue(overrides[path]) ? overrides[path] : value);
}

// All that can be spawned: every item, and each type of car.
export function spawnCatalog() {
  const items = new Set(ITEM_NAMES);
  for (const name of Object.keys(GAME.consumables)) items.add(name);
  for (const list of Object.values(GAME.finds)) for (const name of list) items.add(name);
  for (const machine of Object.values(GAME.machines)) for (const name of machine.give) items.add(name);
  items.add(GAME.hammer.item);
  return [
    ...[...items].sort().map((name) => ({ kind: 'item', name, label: name })),
    ...Object.entries(CAR_PROFILES).map(([type, profile]) => ({ kind: 'car', type, name: profile.name, label: `${profile.name} (car)` })),
  ];
}

// What to offer for what's been typed: nothing under 2 letters, and names beginning with it first.
export function spawnMatches(text, catalog, most = 10) {
  const typed = text.trim().toLowerCase();
  if (typed.length < 2) return [];
  const score = (entry) => { const at = entry.label.toLowerCase().indexOf(typed); return at < 0 ? -1 : at === 0 ? 0 : 1; };
  return catalog.filter((entry) => score(entry) >= 0).sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label)).slice(0, most);
}

// Spots around someone, each further out than the last, so a pile can be walked through. Bearings in degrees, from a turn chosen by the caller so a second lot doesn't land on the first.
export const spawnSpots = (count, near, gap, turn = 0) => Array.from({ length: count }, (_, i) => ({ bearing: (turn + i * 137.5) % 360, metres: near + gap * Math.sqrt(i) }));
