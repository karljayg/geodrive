// What a person can do with the things in a room: which is in reach, what F does to it, and what's found inside. Pure, tested in node.
// What has happened is kept in the building's plan by floor, not in the saved layout, so a layout can be redone without losing it.
import { dice, hashText } from './buildings.js';
import { ITEMS, isSolid } from './furniture.js';
import { GAME } from './gameConfig.js';
import { say as line } from './sayings.js';
import { SAYINGS } from './sayingsConfig.js';
import { useSound } from './sounds.js';

const REACH = 1.2;       // m from a thing's edge that it can be used
const DONE = new Set(['sit', 'sleep', 'open', 'search', 'pick up', 'use', 'switch', 'write', 'move', 'drive']);
const WALL_HALF = 0.06; // m, half a wall's thickness
const NOT_USED_HERE = new Set(['stairs', 'stairwell', 'lift']); // L does those
export const SWITCH_REACH = 1.5; // m from a light switch that it can be used
export const BUILDING_KEY = 'Building key'; // turns on a light switch that needs one
const STUB = 0.3;       // m of wall too short to leave standing at the end of a hole
const WIRING = 0.25;    // m a hole keeps from a switch or a power point
const HOLE_TRIES = [0, 0.5, -0.5, 1, -1, 1.5, -1.5]; // m along the wall from where they're standing
const SWUNG_AT = 0.2;   // how nearly they must face a wall: the cosine of the angle
const NEVER_CLIMBED = new Set(['stairs', 'stairwell', 'lift', 'frontDoor', 'pillar']);
const KEY_CHANCE = 0.25;      // of a large building's switches needing a key
const LARGE_FOOTPRINT = 500;  // m² on one floor
const LARGE_TOTAL = 1500;     // m² over all its floors
const HOMES = new Set(['home', 'shed']);
const DOOR_GAP_LEAST = 0.6, DOOR_GAP_MOST = 3.2, BESIDE_FRONT_DOOR = 0.85; // m

const NAMES = {
  tv: 'TV', tvStand: 'TV stand', screen: 'computer', frontDesk: 'front desk', atm: 'ATM', till: 'cash register', bin: 'trash can', bath: 'bath', basin: 'sink', bathCabinet: 'bathroom cabinet',
  cashCart: 'cash cart', medCart: 'medical cart', radio: 'radio', books: 'books', toaster: 'toaster', smallPlant: 'little plant', tableLamp: 'lamp', floorLamp: 'lamp', parkedCar: 'car',
};
const nameOf = (item) => NAMES[item] || item.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);

// What using something says. A thing can also give something, as an ATM gives cash.
const USES = {
  barrierGate: { say: 'barrierGate' }, till: { say: 'tillUse' },
  atm: { say: 'The ATM gives you some cash.', give: 'Cash' }, vendingMachine: {}, coffeeMachine: {},
  sink: { say: 'washHands' }, basin: { say: 'washHands' }, toilet: { say: 'That\'s better.' }, stall: { say: 'That\'s better.' }, bath: { say: 'You run the water for a moment.' }, stove: { say: 'The ring clicks on and off.' },
  proStove: { say: 'The burners roar, then you turn them off.' }, microwave: { say: 'It hums and beeps.' }, toaster: { say: 'Pop.' }, washer: { say: 'It rumbles through a cycle.' }, screen: { say: 'It asks for a password.' },
  treadmill: { say: 'You jog for a minute.' }, benchPress: { say: 'You lift it twice and put it down.' }, punchBag: { say: 'Thud.' }, weightRack: { say: 'Heavier than it looks.' }, poolTable: { say: 'You knock a ball in.' },
  ticketMachine: { say: 'It prints a ticket.', give: 'Ticket' }, tellerCounter: { say: 'The teller is on a break.' }, printer: { say: 'It\'s out of paper.' }, machine: { say: 'It whirrs into life and stops.' },
  carLift: { say: 'The lift rises a little.' }, examTable: { say: 'The paper crinkles.' }, scanner: { say: 'It hums for a moment.' }, turnstile: { say: 'It clicks round.' }, workbench: { say: 'You tidy the tools.' },
  scales: { say: 'It reads nothing.' }, xrayBelt: { say: 'The belt creeps forward.' },
};
const SWITCHES = { tv: 'The TV flickers on and off.', radio: 'A burst of music, and you turn it off.', tableLamp: 'Click. Click.', floorLamp: 'Click. Click.', surgeryLamp: 'It blazes, and you turn it off.', speakerStand: 'A burst of static.' };

// A thing's name for its state, where it started out even after being pushed, which is the ninth value of its entry.
export const thingKey = (entry) => entry[8] ?? `${entry[0]}|${entry[2]}|${entry[3]}`;
const key = thingKey;
const stateOf = (plan, floor) => ((plan.state ||= {})[floor] ||= { taken: [], opened: [] });

// A floor as the person has left it: without what they've picked up.
export function withoutTaken(record, plan, floor) {
  const taken = plan.state?.[floor]?.taken, moved = plan.state?.[floor]?.moved, holes = plan.state?.[floor]?.holes;
  if (holes?.length) record = { ...record, walls: holes.reduce((walls, hole) => cutWalls(walls, hole), record.walls), builtWalls: record.walls, holes };
  if (!taken?.length && !moved) return record;
  const items = record.items.filter((entry) => !taken?.includes(key(entry))).map((entry) => {
    const to = moved?.[key(entry)];
    return to ? pushedEntry(entry, to[0], to[1]) : entry;
  });
  return { ...record, items };
}

const pushedEntry = (entry, u, v) => { const copy = [...entry]; copy[2] = u; copy[3] = v; copy[8] = key(entry); return copy; };

const halfSizes = (model, rot) => (Math.round(rot / 90) % 2 === 0 ? [model.w / 2, model.d / 2] : [model.d / 2, model.w / 2]);

// Where a push takes a thing: straight along the room, away from the person, whichever way is most nearly away.
export function pushTarget(entry, u, v, step) {
  const du = entry[2] - u, dv = entry[3] - v;
  return Math.abs(du) >= Math.abs(dv) ? { u: entry[2] + Math.sign(du || 1) * step, v: entry[3] } : { u: entry[2], v: entry[3] + Math.sign(dv || 1) * step };
}

// Whether a thing fits there: inside the building by inBuilding(u, v), clear of walls, of other solid things and of the way to the stairs.
export function pushFits(record, models, entry, to, inBuilding, core) {
  const [hu, hv] = halfSizes(models[entry[1]], entry[5]), u0 = to.u - hu, u1 = to.u + hu, v0 = to.v - hv, v1 = to.v + hv;
  if (![[u0, v0], [u1, v0], [u1, v1], [u0, v1], [to.u, to.v]].every(([u, v]) => inBuilding(u, v))) return false;
  const overlaps = (a0, b0, a1, b1) => a0 < u1 && a1 > u0 && b0 < v1 && b1 > v0;
  for (const [a, b, c, d] of record.walls) {
    if (overlaps(Math.min(a, c) - WALL_HALF, Math.min(b, d) - WALL_HALF, Math.max(a, c) + WALL_HALF, Math.max(b, d) + WALL_HALF)) return false;
  }
  if (core?.clear && overlaps(core.clear[0], core.clear[1], core.clear[2], core.clear[3])) return false;
  return !record.items.some((other) => {
    const model = models[other[1]];
    if (other === entry || !model || !isSolid(other[0])) return false;
    const [ou, ov] = halfSizes(model, other[5]);
    return overlaps(other[2] - ou, other[3] - ov, other[2] + ou, other[3] + ov);
  });
}

// Moves it, and keeps that with the building. Returns the record as it now is.
export function pushThing(record, plan, floor, entry, to) {
  const state = stateOf(plan, floor);
  (state.moved ||= {})[key(entry)] = [to.u, to.v];
  const moved = pushedEntry(entry, to.u, to.v);
  return { ...record, items: record.items.map((other) => (other === entry ? moved : other)) };
}

// Walls with a length taken out of whichever it lies along.
function cutWalls(walls, [hu0, hv0, hu1, hv1]) {
  return walls.flatMap((wall) => {
    const [u0, v0, u1, v1] = wall, du = u1 - u0, dv = v1 - v0, length = Math.hypot(du, dv) || 1, ux = du / length, vx = dv / length;
    const along = (u, v) => (u - u0) * ux + (v - v0) * vx, off = (u, v) => Math.abs((u - u0) * vx - (v - v0) * ux);
    if (off(hu0, hv0) > 0.02 || off(hu1, hv1) > 0.02) return [wall];
    const a = Math.min(along(hu0, hv0), along(hu1, hv1)), b = Math.max(along(hu0, hv0), along(hu1, hv1));
    if (b <= 0 || a >= length) return [wall];
    const out = [];
    if (a > 0) out.push([u0, v0, u0 + ux * a, v0 + vx * a]);
    if (b < length) out.push([u0 + ux * b, v0 + vx * b, u1, v1]);
    return out;
  });
}

const fromSegment = (u, v, [u0, v0, u1, v1]) => {
  const du = u1 - u0, dv = v1 - v0, t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / (du * du + dv * dv || 1)));
  return Math.hypot(u - (u0 + du * t), v - (v0 + dv * t));
};

// The inner wall they're facing, in reach, or null. Otherwise { hole }: the length a hammer would take out, slid along clear of switches and power points,
// or null if there's nowhere clear on this stretch. Only inner walls are in a floor's record, and none stand where the stairs are.
export function wallAhead(record, core, buildingId, floor, u, v, bearing, config = GAME.hammer) {
  const sin = Math.sin(bearing), cos = Math.cos(bearing);
  let best = null, bestAway = config.reach, spots = null;
  for (const wall of record.walls) {
    const [u0, v0, u1, v1] = wall, du = u1 - u0, dv = v1 - v0, t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / (du * du + dv * dv || 1)));
    const pu = u0 + du * t, pv = v0 + dv * t, away = Math.hypot(pu - u, pv - v);
    if (away >= bestAway || ((pu - u) * sin + (pv - v) * cos) / (away || 1) < SWUNG_AT) continue;
    best = { wall, at: t * Math.hypot(du, dv) };
    bestAway = away;
  }
  if (!best) return null;
  const [u0, v0, u1, v1] = best.wall, length = Math.hypot(u1 - u0, v1 - v0), ux = (u1 - u0) / (length || 1), vx = (v1 - v0) / (length || 1), half = config.width / 2;
  spots = [...switchSpots(record, core), ...outletSpots(record, core, buildingId, floor)];
  for (const shift of HOLE_TRIES) {
    const mid = length <= config.width ? length / 2 : Math.max(half, Math.min(length - half, best.at + shift));
    let a = mid - half, b = mid + half;
    if (a < STUB) a = 0;
    if (b > length - STUB) b = length;
    const hole = [u0 + ux * a, v0 + vx * a, u0 + ux * b, v0 + vx * b];
    if (!spots.some((spot) => fromSegment(spot.u, spot.v, hole) < WIRING)) return { hole };
  }
  return { hole: null };
}

// Takes it out, and keeps that with the building. Returns the record as it now is.
export function breakThrough(record, plan, floor, hole) {
  const state = stateOf(plan, floor);
  (state.holes ||= []).push(hole);
  return { ...record, walls: cutWalls(record.walls, hole), builtWalls: record.builtWalls ?? record.walls, holes: state.holes };
}

// Whether it's a thing to offer climbing over, by what it is and how high it stands.
export const canClimb = (item, top, config = GAME.climb) => !NEVER_CLIMBED.has(item) && top >= config.leastHeight;
export const climbQuestion = (item) => `Climb over the ${nameOf(item)}?`;

// Where a floor's light switches are, in the frame: on the wall beside each front door and each gap left for a door, and for a floor with no front door, by the stairs.
// post: it stands on its own rather than on a wall.
export function switchSpots(record, core) {
  const spots = [], add = (u, v, post = false) => {
    if (!spots.some((s) => Math.hypot(s.u - u, s.v - v) < 1)) spots.push({ u, v, post });
  };
  const fronts = record.items.filter((entry) => entry[0] === 'frontDoor');
  for (const [, , u, v, , rot] of fronts) (Math.round(rot / 90) % 2 === 0 ? add(u + BESIDE_FRONT_DOOR, v) : add(u, v + BESIDE_FRONT_DOOR));
  const lines = new Map();
  for (const [u0, v0, u1, v1] of record.builtWalls ?? record.walls) { // as built, or a hole would grow a switch
    const alongU = Math.abs(v1 - v0) < 0.01;
    if (!alongU && Math.abs(u1 - u0) >= 0.01) continue;
    const key = `${alongU ? 'v' : 'u'}${(alongU ? v0 : u0).toFixed(2)}`, list = lines.get(key) || [];
    list.push(alongU ? [Math.min(u0, u1), Math.max(u0, u1)] : [Math.min(v0, v1), Math.max(v0, v1)]);
    lines.set(key, list);
  }
  for (const [key, list] of lines) {
    const at = Number(key.slice(1));
    list.sort((a, b) => a[0] - b[0]);
    list.slice(1).forEach(([start], i) => {
      const end = list[i][1], gap = start - end;
      if (gap < DOOR_GAP_LEAST || gap > DOOR_GAP_MOST) return;
      if (key[0] === 'v') add(end - 0.2, at);
      else add(at, end - 0.2);
    });
  }
  if (!fronts.length && core) add(core.clear[0] - 0.3, core.clear[1] - 0.3, true);
  return spots;
}

// Where a floor's power points are, in the frame, the same ones every time, and whether each works. Low on inner walls, and always one by the front door or stairs, so there's something to find.
export function outletSpots(record, core, buildingId, floor, config = GAME.outlets) {
  const roll = dice(hashText(`${buildingId}:${floor}:outlets`)), spots = [], add = (u, v) => spots.push({ u, v, works: roll() < config.workingChance });
  const first = switchSpots(record, core)[0];
  if (first) add(first.u + 0.45, first.v + 0.45);
  for (const [u0, v0, u1, v1] of record.builtWalls ?? record.walls) { // as built, or a hole would move them
    if (spots.length >= config.mostPerFloor) break;
    if (Math.hypot(u1 - u0, v1 - v0) < config.leastWall || roll() >= config.wallChance) continue;
    add((u0 + u1) / 2, (v0 + v1) / 2);
  }
  return spots;
}

// Whether a building's light switches need a key: about one large building in four, always the same ones. Homes never do.
export function switchNeedsKey(plan, footprint, buildingId) {
  if (!plan || HOMES.has(plan.type)) return false;
  if (footprint < LARGE_FOOTPRINT && footprint * (plan.floors || 1) < LARGE_TOTAL) return false;
  return dice(hashText(`${buildingId}:switch`))() < KEY_CHANCE;
}

// F at a switch. hasKey: there's one in the bag, which, once used, leaves this building's switches working. Returns what to say.
export function useSwitch(plan, floor, needsKey, hasKey) {
  if (needsKey && !plan.switchesOn) {
    if (!hasKey) return line('switchLocked');
    plan.switchesOn = true;
  }
  const state = stateOf(plan, floor);
  state.lights = !state.lights;
  return line(state.lights ? 'lightsOn' : 'lightsOff');
}

// What can be done with a thing, as the catalogue says, in the order it says it: the first is F, the second Shift+F.
export function actionsOf(item) {
  if (NOT_USED_HERE.has(item)) return [];
  return (ITEMS[item]?.use || []).filter((use) => DONE.has(use) && (use !== 'use' || USES[item]) && (use !== 'switch' || SWITCHES[item]));
}

// The model of a thing that was picked up in a room, by the name it has in the bag, or null.
let modelNames = null;
export function modelNamed(name) {
  if (!modelNames) {
    modelNames = new Map();
    for (const item of Object.keys(ITEMS)) {
      if (!actionsOf(item).includes('pick up')) continue;
      const label = nameOf(item);
      modelNames.set(label[0].toUpperCase() + label.slice(1), ITEMS[item].models[0]);
    }
  }
  return modelNames.get(name) ?? null;
}

// The things in reach, the nearest first, favouring what's in front.
export function thingsNear(record, frame, models, x, y, facing) {
  const { u, v } = frame.toFrame(x, y), bearing = facing + frame.axis, sin = Math.sin(bearing), cos = Math.cos(bearing), near = [];
  for (const entry of record.items) {
    const [item, name, iu, iv, , rot] = entry, model = models[name];
    if (!model || !actionsOf(item).length) continue;
    const quarter = Math.round(rot / 90) % 2 === 0, hu = (quarter ? model.w : model.d) / 2, hv = (quarter ? model.d : model.w) / 2;
    const gap = Math.hypot(Math.max(Math.abs(iu - u) - hu, 0), Math.max(Math.abs(iv - v) - hv, 0));
    if (gap > REACH) continue;
    const toward = (iu - u) * sin + (iv - v) * cos, length = Math.hypot(iu - u, iv - v) || 1;
    near.push({ entry, score: gap - (toward / length) * 0.5 });
  }
  return near.sort((p, q) => p.score - q.score).map((n) => n.entry);
}

// The nearest thing in reach with nothing to do to it, for F to say what it is. Stairs and elevators have their own question.
export function inertNear(record, frame, models, x, y) {
  const { u, v } = frame.toFrame(x, y);
  let best = null, bestGap = REACH;
  for (const entry of record.items) {
    const [item, name, iu, iv, , rot] = entry, model = models[name];
    if (!model || actionsOf(item).length || NOT_USED_HERE.has(item)) continue;
    const quarter = Math.round(rot / 90) % 2 === 0, hu = (quarter ? model.w : model.d) / 2, hv = (quarter ? model.d : model.w) / 2;
    const gap = Math.hypot(Math.max(Math.abs(iu - u) - hu, 0), Math.max(Math.abs(iv - v) - hv, 0));
    if (gap <= bestGap) { best = entry; bestGap = gap; }
  }
  return best;
}

// What F says about one: its own line if it has any, or the general one.
export const lookLine = (item) => (SAYINGS[`look_${item}`] ? line(`look_${item}`) : line('lookAt', { name: nameOf(item) }));

export const usableNear = (record, frame, models, x, y, facing) => thingsNear(record, frame, models, x, y, facing)[0] || null;

const VERB = { sit: 'sit', sleep: 'sleep', open: 'open', search: 'search', 'pick up': 'pick up', use: 'use', switch: 'switch on', write: 'write on', move: 'push', drive: 'drive' };

// What a thing offers, as questions to confirm: its one or two uses. second says which to ask useThing for.
export function questionsFor(entry) {
  const name = nameOf(entry[0]);
  return actionsOf(entry[0]).slice(0, 2).map((use, i) => {
    const text = use === 'sit' || use === 'sleep' ? `${VERB[use]} on the ${name}` : `${VERB[use]} the ${name}`;
    return { label: `${text[0].toUpperCase()}${text.slice(1)}?`, second: i === 1 };
  });
}

// What F offers at stairs or an elevator, as L does. down says which way to press it. near: 'lift' or 'stairs', from coreNear.
export function coreQuestions(near, level, floors, groundFloor) {
  if (near === 'lift') return [{ label: 'Take the elevator?', down: false }];
  if (near !== 'stairs') return [];
  const ways = [];
  if (level < floors) ways.push({ label: 'Go upstairs?', down: false });
  if (level > groundFloor) ways.push({ label: 'Go downstairs?', down: true });
  return ways;
}

// The choices to put to someone: no question twice, however many chairs there are, and no more than a number key can pick.
export const MOST_CHOICES = 9;
export function uniqueChoices(choices) {
  const seen = new Set();
  return choices.filter((choice) => !seen.has(choice.label) && seen.add(choice.label)).slice(0, MOST_CHOICES);
}

// About one home in four. The same drawer, desk or cabinet every time, upstairs when the house has one.
export function houseGunIn(plan, buildingId, floor, items, entry, config = GAME.houseGun) {
  if (!config || plan?.type !== 'home' || !items?.length || !entry) return null;
  const roll = dice(hashText(`${buildingId}:housegun`));
  if (roll() >= config.chance) return null;
  const floors = plan.floors || 1;
  const where = floors < 2 ? 1 : 2 + Math.floor(dice(hashText(`${buildingId}:housegun:floor`))() * (floors - 1));
  if (floor !== where) return null;
  const kind = config.hideIn.find((name) => items.some((item) => item[0] === name));
  if (!kind) return null;
  const spots = items.filter((item) => item[0] === kind);
  const chosen = spots[Math.floor(dice(hashText(`${buildingId}:housegun:spot`))() * spots.length)];
  if (thingKey(chosen) !== thingKey(entry)) return null;
  const weapon = GAME.weapons.handgun, ammo = GAME.calibers[weapon.caliber].item;
  const found = [
    { id: weapon.item, name: weapon.item, count: 1, loaded: weapon.magazine },
    { id: ammo, name: ammo, count: config.casings },
  ];
  return { give: weapon.item, found, say: line('foundGun', { name: nameOf(entry[0]), casings: config.casings }) };
}

// Does it, and says which sound goes with it. second: Shift was held. items: the floor's furniture, so a house gun can pick one of them.
export function useThing(entry, plan, floor, buildingId, second = false, items = null) {
  const actions = actionsOf(entry[0]), action = actions[second && actions[1] ? 1 : 0], result = doThing(entry, action, plan, floor, buildingId, items);
  return { ...result, sound: useSound(entry[0], action, result) };
}

// Returns what happened: { say } always, with { give: name of a thing for the bag }, { taken: true } if the thing has gone from the room, { pose: 'sit' | 'sleep' }, or { empty } or { dry } if it had nothing to give.
function doThing(entry, action, plan, floor, buildingId, items) {
  const item = entry[0], name = nameOf(item), state = stateOf(plan, floor), id = key(entry);
  if (action === 'sit' || action === 'sleep') return { pose: action, say: action === 'sleep' ? 'You lie down.' : '' };
  if (action === 'pick up') {
    state.taken.push(id);
    return { give: name[0].toUpperCase() + name.slice(1), taken: true, say: line('pickUp', { name }) };
  }
  if (action === 'open' || action === 'search') {
    if (state.opened.includes(id)) return { say: line('nothingElse', { name }) };
    state.opened.push(id);
    const stashed = houseGunIn(plan, buildingId, floor, items, entry);
    if (stashed) return stashed;
    const finds = GAME.finds[item], chance = GAME.findChance[item] ?? GAME.findChance.default;
    const roll = dice(hashText(`${buildingId}:${floor}:${id}`));
    if (!finds || roll() >= chance) return { say: line('emptyThing', { name }) };
    const found = finds[Math.floor(roll() * finds.length)];
    return { give: found, say: line('foundIn', { name, found: found.toLowerCase() }) };
  }
  if (action === 'move' || action === 'drive') return { push: action === 'drive' ? GAME.push.driveStep : GAME.push.step, say: line(action === 'drive' ? 'droveIt' : 'pushed', { name }), stuck: line('pushStuck', { name }) };
  if (action === 'switch') return { say: SWITCHES[item] };
  if (action === 'write') return { say: 'You doodle on it and wipe it off.' };
  const machine = GAME.machines[item];
  if (machine) {
    if (state.opened.includes(id)) return { say: line(machine.empty), empty: true };
    state.opened.push(id);
    const roll = dice(hashText(`${buildingId}:${floor}:${id}`));
    if (roll() >= machine.chance) return { say: line(machine.empty), empty: true };
    const give = machine.give[Math.floor(roll() * machine.give.length)];
    return { say: line(machine.say, { found: give.toLowerCase() }), give };
  }
  const effect = GAME.uses[item];
  if (effect) {
    if (effect.works !== undefined && dice(hashText(`${buildingId}:${floor}:${id}:works`))() >= effect.works) return { say: line(effect.dry), dry: true };
    return { say: line(effect.say), effect, count: effect.count };
  }
  const use = USES[item];
  return use.give ? { say: line(use.say), give: use.give } : { say: line(use.say) };
}

// Where someone sitting or lying on a thing goes, in the frame: its middle, facing as it does.
export function poseSpot(entry) {
  return { u: entry[2], v: entry[3], rot: entry[5] };
}
