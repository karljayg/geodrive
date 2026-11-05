// What can happen to a floor of a shared building, the same on the server, which decides, and in the browser, which shows it at once. Pure, tested in node.
import { GAME } from './gameConfig.js';
// State is what footActions.js keeps in plan.state[floor]: { taken, opened, moved, holes, lights }.
const KEY_MOST = 80;      // characters in the name of a thing
const THINGS_MOST = 5000; // on one floor

export const emptyFloorState = () => ({ taken: [], opened: [] });
const okKey = (key) => typeof key === 'string' && key.length > 0 && key.length <= KEY_MOST;
const okNumber = (n) => Number.isFinite(n) && Math.abs(n) < 100000;

// Does one thing to this state, in place. Returns null if it worked, or why not, leaving it as it was. First come, first served: only one person gets anything.
export function applyFloorOp(state, { op, key, u, v, hole, on }) {
  switch (op) {
    case 'take':
      if (!okKey(key) || state.taken.length >= THINGS_MOST) return 'bad';
      if (state.taken.includes(key)) return 'gone';
      state.taken.push(key);
      return null;
    case 'open':
      if (!okKey(key) || state.opened.length >= THINGS_MOST) return 'bad';
      if (state.opened.includes(key)) return 'gone';
      state.opened.push(key);
      return null;
    case 'push':
      if (!okKey(key) || !okNumber(u) || !okNumber(v)) return 'bad';
      if (state.taken.includes(key)) return 'gone';
      (state.moved ||= {})[key] = [u, v];
      return null;
    case 'hole': {
      if (!Array.isArray(hole) || hole.length !== 4 || !hole.every(okNumber) || (state.holes?.length ?? 0) >= THINGS_MOST) return 'bad';
      const holes = (state.holes ||= []);
      if (!holes.some((known) => known.every((n, i) => n === hole[i]))) holes.push(hole);
      return null;
    }
    case 'lights':
      if (typeof on !== 'boolean') return 'bad';
      state.lights = on;
      return null;
    default:
      return 'bad';
  }
}

// What this browser did since it last looked: the ops that turn `was` into `now`. It's how what footActions.js changes in place gets to the server.
export function floorOpsBetween(was, now) {
  const ops = [];
  const known = was ?? emptyFloorState();
  for (const key of now.taken ?? []) if (!known.taken?.includes(key)) ops.push({ op: 'take', key });
  for (const key of now.opened ?? []) if (!known.opened?.includes(key)) ops.push({ op: 'open', key });
  for (const [key, to] of Object.entries(now.moved ?? {})) {
    const from = known.moved?.[key];
    if (!from || from[0] !== to[0] || from[1] !== to[1]) ops.push({ op: 'push', key, u: to[0], v: to[1] });
  }
  for (const hole of now.holes ?? []) if (!known.holes?.some((other) => other.every((n, i) => n === hole[i]))) ops.push({ op: 'hole', hole });
  if (!!now.lights !== !!known.lights) ops.push({ op: 'lights', on: !!now.lights });
  return ops;
}

// Takes back what a refused op did here: someone else got there first.
export function undoFloorOp(state, { op, key }) {
  if (op === 'take') state.taken = state.taken.filter((other) => other !== key);
  if (op === 'open') state.opened = state.opened.filter((other) => other !== key);
}

// A plan's parts that are settled once and shared. state, saved and seen aren't: those are kept apart, or only mean something to one browser.
export function planToShare(plan) {
  const { state, saved, seen, switchesOn, ...rest } = plan;
  return rest;
}

// The first to say what a building is keeps it, and later ones only fill in what's still missing, such as stairs worked out at first entry. The floors can come
// down once, when a building turns out to be too narrow for stairs.
export function mergePlan(kept, incoming) {
  const merged = { ...kept };
  for (const [key, value] of Object.entries(incoming)) if (merged[key] === undefined) merged[key] = value;
  if (incoming.core === null && kept.core === undefined) merged.floors = incoming.floors;
  return merged;
}

// A dropped thing, checked, as anyone can send anything. Null if it isn't one. Outdoors { lat, lng }, indoors { buildingId, floor, axis, u, v }.
export function cleanDrop(drop) {
  if (!drop || !okKey(drop.id) || !okKey(drop.name) || !okNumber(drop.facing ?? 0)) return null;
  const common = { id: drop.id, name: drop.name, facing: drop.facing ?? 0 };
  if (Number.isInteger(drop.loaded) && drop.loaded >= 0 && drop.loaded <= 500) common.loaded = drop.loaded;
  if (drop.buildingId !== undefined) {
    if (!okKey(drop.buildingId) || !Number.isInteger(drop.floor) || ![drop.axis, drop.u, drop.v].every(okNumber)) return null;
    return { ...common, buildingId: drop.buildingId, floor: drop.floor, axis: drop.axis, u: drop.u, v: drop.v };
  }
  if (!Number.isFinite(drop.lat) || !Number.isFinite(drop.lng) || Math.abs(drop.lat) > 90 || Math.abs(drop.lng) > 180) return null;
  return { ...common, lat: drop.lat, lng: drop.lng };
}

// The map tile a building's id falls in: the tiles someone's near say which buildings they hear about.
const ID_GRID = 2e-5;
export function tileOfBuilding(id) {
  const [lat, lng] = String(id).split('_').map((n) => Number(n) * ID_GRID), n = 2 ** 14, r = (lat * Math.PI) / 180;
  return `${Math.floor(((lng + 180) / 360) * n)}_${Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)}`;
}

// Who runs a world after someone runs out of lives. members: oldest invite first, with lives. If the owner is gone the backup takes over, and the next living person by
// invite order becomes the backup, so two manage while two are alive. Nobody left: nothing changes, and nobody can invite.
export function nextManagers({ owner, backup }, members) {
  const alive = (id) => members.some((member) => member.id === id && member.lives > 0);
  const next = (taken) => members.find((member) => member.lives > 0 && !taken.includes(member.id))?.id ?? null;
  let newOwner = alive(owner) ? owner : null, newBackup = alive(backup) ? backup : null;
  if (!newOwner) {
    newOwner = newBackup ?? next([]);
    newBackup = null;
    if (!newOwner) return { owner, backup: null };
  }
  if (!newBackup || newBackup === newOwner) newBackup = next([newOwner]);
  return { owner: newOwner, backup: newBackup };
}

const MPH = 2.23694;

// What a crash does to whom, from its kind and closing speed in m/s: { kill: [...], hurt: [...], wreck: [...] } of 'me', 'other'. Between cars and a parked one, both go.
// A chicken or a rabbit hurts nobody. A deer or a person hurts the driver a bit and doesn't wreck the car; a person hit hard enough also dies. config: GAME.crash.
export function crashOutcome(kind, closing, config) {
  const mph = closing * MPH;
  if (mph < config.injuredFromMph) return { kill: [], hurt: [], wreck: [], mph };
  if (kind === 'chicken' || kind === 'rabbit') return { kill: [], hurt: [], wreck: [], mph };
  // A deer dies either way. The driver is hurt and the car is damaged, and neither is wrecked: a deer is not a car.
  if (kind === 'deer') return { kill: [], hurt: ['me'], wreck: [], mph };
  if (kind === 'person') return mph >= config.personDeadlyMph ? { kill: ['other'], hurt: ['me'], wreck: [], mph } : { kill: [], hurt: ['me', 'other'], wreck: [], mph };
  const people = kind === 'car' ? ['me', 'other'] : ['me'];
  return mph >= config.carDeadlyMph ? { kill: people, hurt: [], wreck: kind === 'building' ? ['me'] : ['me', 'other'], mph } : { kill: [], hurt: people, wreck: [], mph };
}

// Whether a report of a deadly crash holds up, from what each has said about where they were and how fast. A wrong death can't be undone, so someone's game saying so isn't enough.
// mine, theirs: recent places, { lat, lng, speed }, theirs null for a parked car. Metres and speeds with room for lag, but no more.
export function crashHoldsUp({ mine, theirs, at, closing, withinMetres }, metresApart) {
  const near = (list) => list.some((place) => metresApart(place, at) <= withinMetres);
  const fastest = (list) => list.reduce((most, place) => Math.max(most, Math.abs(place.speed ?? 0)), 0);
  if (!mine.length || !near(mine)) return false;
  if (theirs && (!theirs.length || !near(theirs))) return false;
  return closing <= (fastest(mine) + (theirs ? fastest(theirs) : 0)) * 1.25 + 3; // m/s
}

// The gun with this item name, or null. The server uses this rather than whatever damage a game claims.
export function gunByItem(item) {
  return Object.values(GAME.weapons).find((weapon) => weapon.item === item) || null;
}

// How many shots of this damage finish someone from full health, and the health one of them takes.
// 1 takes four, 2 takes three, 3 takes two, and 4 or more takes one.
export function shotWound(damage) {
  const shots = Math.max(1, Math.min(4, 5 - Math.round(Number(damage) || 1)));
  return { shots, lost: Math.ceil(100 / shots) };
}

// Whether a claimed hit is close enough to count. shooter, target and aim are { lat, lng }. rangeMetres is the gun's.
export function shotHoldsUp({ shooter, target, aim, rangeMetres, aimSlack, rangeSlack }, apart) {
  if (!shooter || !target || !aim || !(rangeMetres > 0)) return false;
  const reach = rangeMetres + rangeSlack;
  return apart(shooter, aim) <= reach && apart(shooter, target) <= reach && apart(target, aim) <= aimSlack;
}
