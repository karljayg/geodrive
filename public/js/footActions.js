// What a person can do with the things in a room: which is in reach, what F does to it, and what's found inside. Pure, tested in node.
// What has happened is kept in the building's plan by floor, not in the saved layout, so a layout can be redone without losing it.
import { dice, hashText } from './buildings.js';
import { ITEMS } from './furniture.js';

const REACH = 1.2;       // m from a thing's edge that it can be used
const EMPTY_CHANCE = 0.3; // of something that can be opened having nothing in it
const DONE = new Set(['sit', 'sleep', 'open', 'search', 'pick up', 'use', 'switch', 'write']);
const NOT_USED_HERE = new Set(['stairs', 'stairwell', 'lift']); // L does those
export const SWITCH_REACH = 1.5; // m from a light switch that it can be used
export const BUILDING_KEY = 'Building key'; // turns on a light switch that needs one
const KEY_CHANCE = 0.25;      // of a large building's switches needing a key
const LARGE_FOOTPRINT = 500;  // m² on one floor
const LARGE_TOTAL = 1500;     // m² over all its floors
const HOMES = new Set(['home', 'shed']);
const DOOR_GAP_LEAST = 0.6, DOOR_GAP_MOST = 3.2, BESIDE_FRONT_DOOR = 0.85; // m

const NAMES = {
  tv: 'TV', tvStand: 'TV stand', screen: 'computer', frontDesk: 'front desk', atm: 'cash machine', bin: 'bin', bath: 'bath', basin: 'basin', bathCabinet: 'bathroom cabinet',
  cashCart: 'cash cart', medCart: 'medical cart', radio: 'radio', books: 'books', toaster: 'toaster', smallPlant: 'little plant', tableLamp: 'lamp', floorLamp: 'lamp', parkedCar: 'car',
};
const nameOf = (item) => NAMES[item] || item.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);

// What can be found in what. Anything that opens without a list here is simply empty.
const FINDS = {
  fridge: ['Milk', 'Leftover pizza', 'Orange juice', 'Cold soda'], counter: ['Can of soup', 'Box of cereal', 'Cutlery'], wardrobe: ['Old jacket', 'Spare keys', 'Shoebox'],
  nightstand: ['Flashlight', 'Paperback', 'Reading glasses'], sideTable: ['Batteries', 'Pack of cards', 'Old letters'], tvStand: ['TV remote', 'Old DVD'], bathCabinet: ['Toothpaste', 'Plasters', 'Aspirin'],
  bookcase: ['Novel', 'Atlas', 'Photo album'], desk: ['Stapler', 'Notebook', 'USB stick', BUILDING_KEY], filingCabinet: ['Old invoices', 'Paperclips', 'Sealed envelope', BUILDING_KEY], locker: ['Gym towel', 'Padlock', 'Trainers', BUILDING_KEY],
  box: ['Old newspapers', 'Packing tape', 'Holiday lights'], bin: ['Crumpled receipt', 'Empty can'], cashCart: ['Bundle of cash'], toolChest: ['Wrench', 'Screwdriver', 'Tape measure', BUILDING_KEY], medCart: ['Bandages', 'Thermometer'],
  storeShelf: ['Tin of beans', 'Bottle of water', 'Pack of batteries'], clothesRack: ['Denim jacket', 'Silk scarf'], displayTable: ['Gift card', 'Sunglasses'], displayCase: ['Old coin', 'Museum guide'],
  palletRack: ['Box of parts', 'Roll of tape'], bookStack: ['Library book', 'Old atlas'], gearRack: ['Fire helmet', 'Gloves'], walkInFridge: ['Tray of steaks', 'Crate of milk'], toyBox: ['Toy car', 'Teddy bear'],
  produceStand: ['Apple', 'Banana'], fridgeCase: ['Sandwich', 'Cold drink'], breadRack: ['Fresh loaf', 'Croissant'], vendingMachine: ['Candy bar'], petCage: ['Dog biscuit'],
};
// What using something says. A thing can also give something, as a cash machine gives cash.
const USES = {
  atm: { say: 'The cash machine gives you some cash.', give: 'Cash' }, vendingMachine: { say: 'It drops a candy bar.', give: 'Candy bar' }, coffeeMachine: { say: 'You pour a coffee.', give: 'Cup of coffee' },
  sink: { say: 'You wash your hands.' }, basin: { say: 'You wash your hands.' }, toilet: { say: 'That\'s better.' }, bath: { say: 'You run the water for a moment.' }, stove: { say: 'The ring clicks on and off.' },
  proStove: { say: 'The burners roar, then you turn them off.' }, microwave: { say: 'It hums and beeps.' }, toaster: { say: 'Pop.' }, washer: { say: 'It rumbles through a cycle.' }, screen: { say: 'It asks for a password.' },
  treadmill: { say: 'You jog for a minute.' }, benchPress: { say: 'You lift it twice and put it down.' }, punchBag: { say: 'Thud.' }, weightRack: { say: 'Heavier than it looks.' }, poolTable: { say: 'You knock a ball in.' },
  ticketMachine: { say: 'It prints a ticket.', give: 'Ticket' }, tellerCounter: { say: 'The teller is on a break.' }, printer: { say: 'It\'s out of paper.' }, machine: { say: 'It whirrs into life and stops.' },
  carLift: { say: 'The lift rises a little.' }, examTable: { say: 'The paper crinkles.' }, scanner: { say: 'It hums for a moment.' }, turnstile: { say: 'It clicks round.' }, workbench: { say: 'You tidy the tools.' },
  scales: { say: 'It reads nothing.' }, xrayBelt: { say: 'The belt creeps forward.' },
};
const SWITCHES = { tv: 'The TV flickers on and off.', radio: 'A burst of music, and you turn it off.', tableLamp: 'Click. Click.', floorLamp: 'Click. Click.', surgeryLamp: 'It blazes, and you turn it off.', speakerStand: 'A burst of static.' };

const key = (entry) => `${entry[0]}|${entry[2]}|${entry[3]}`;
const stateOf = (plan, floor) => ((plan.state ||= {})[floor] ||= { taken: [], opened: [] });

// A floor as the person has left it: without what they've picked up.
export function withoutTaken(record, plan, floor) {
  const taken = plan.state?.[floor]?.taken;
  return taken?.length ? { ...record, items: record.items.filter((entry) => !taken.includes(key(entry))) } : record;
}

// Where a floor's light switches are, in the frame: on the wall beside each front door and each gap left for a door, and for a floor with no front door, by the stairs.
// post: it stands on its own rather than on a wall.
export function switchSpots(record, core) {
  const spots = [], add = (u, v, post = false) => {
    if (!spots.some((s) => Math.hypot(s.u - u, s.v - v) < 1)) spots.push({ u, v, post });
  };
  const fronts = record.items.filter((entry) => entry[0] === 'frontDoor');
  for (const [, , u, v, , rot] of fronts) (Math.round(rot / 90) % 2 === 0 ? add(u + BESIDE_FRONT_DOOR, v) : add(u, v + BESIDE_FRONT_DOOR));
  const lines = new Map();
  for (const [u0, v0, u1, v1] of record.walls) {
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

// Whether a building's light switches need a key: about one large building in four, always the same ones. Homes never do.
export function switchNeedsKey(plan, footprint, buildingId) {
  if (!plan || HOMES.has(plan.type)) return false;
  if (footprint < LARGE_FOOTPRINT && footprint * (plan.floors || 1) < LARGE_TOTAL) return false;
  return dice(hashText(`${buildingId}:switch`))() < KEY_CHANCE;
}

// F at a switch. hasKey: there's one in the bag, which, once used, leaves this building's switches working. Returns what to say.
export function useSwitch(plan, floor, needsKey, hasKey) {
  if (needsKey && !plan.switchesOn) {
    if (!hasKey) return 'Light switch not enabled, find key.';
    plan.switchesOn = true;
  }
  const state = stateOf(plan, floor);
  state.lights = !state.lights;
  return state.lights ? 'Lights on.' : 'Lights off.';
}

// What can be done with a thing, as the catalogue says, in the order it says it: the first is F, the second Shift+F.
export function actionsOf(item) {
  if (NOT_USED_HERE.has(item)) return [];
  return (ITEMS[item]?.use || []).filter((use) => DONE.has(use) && (use !== 'use' || USES[item]) && (use !== 'switch' || SWITCHES[item]));
}

// The thing to use from here: the nearest in reach, favouring what's in front.
export function usableNear(record, frame, models, x, y, facing) {
  const { u, v } = frame.toFrame(x, y), bearing = facing + frame.axis, sin = Math.sin(bearing), cos = Math.cos(bearing);
  let best = null, bestScore = Infinity;
  for (const entry of record.items) {
    const [item, name, iu, iv, , rot] = entry, model = models[name];
    if (!model || !actionsOf(item).length) continue;
    const quarter = Math.round(rot / 90) % 2 === 0, hu = (quarter ? model.w : model.d) / 2, hv = (quarter ? model.d : model.w) / 2;
    const gap = Math.hypot(Math.max(Math.abs(iu - u) - hu, 0), Math.max(Math.abs(iv - v) - hv, 0));
    if (gap > REACH) continue;
    const toward = (iu - u) * sin + (iv - v) * cos, length = Math.hypot(iu - u, iv - v) || 1, score = gap - (toward / length) * 0.5;
    if (score < bestScore) { bestScore = score; best = entry; }
  }
  return best;
}

const VERB = { sit: 'sit', sleep: 'sleep', open: 'open', search: 'search', 'pick up': 'pick up', use: 'use', switch: 'switch on', write: 'write on' };

// The hint: what F, and Shift+F if there's a second thing, would do.
export function usePrompt(entry) {
  const [first, second] = actionsOf(entry[0]), name = nameOf(entry[0]), text = (use) => (use === 'sit' || use === 'sleep' ? `${VERB[use]} on the ${name}` : `${VERB[use]} the ${name}`);
  return `F to ${text(first)}${second ? ` · Shift+F to ${text(second)}` : ''}`;
}

// Does it. second: Shift was held. Returns what happened: { say } always, with { give: name of a thing for the bag }, { taken: true } if the thing has gone from the room, or { pose: 'sit' | 'sleep' }.
export function useThing(entry, plan, floor, buildingId, second = false) {
  const actions = actionsOf(entry[0]), action = actions[second && actions[1] ? 1 : 0], item = entry[0], name = nameOf(item), state = stateOf(plan, floor), id = key(entry);
  if (action === 'sit' || action === 'sleep') return { pose: action, say: action === 'sleep' ? 'You lie down.' : '' };
  if (action === 'pick up') {
    state.taken.push(id);
    return { give: name[0].toUpperCase() + name.slice(1), taken: true, say: `You pick up the ${name}.` };
  }
  if (action === 'open' || action === 'search') {
    const finds = FINDS[item];
    if (state.opened.includes(id)) return { say: `Nothing else in the ${name}.` };
    state.opened.push(id);
    const roll = dice(hashText(`${buildingId}:${floor}:${id}`));
    if (!finds || roll() < EMPTY_CHANCE) return { say: `The ${name} is empty.` };
    const found = finds[Math.floor(roll() * finds.length)];
    return { give: found, say: `In the ${name}: ${found.toLowerCase()}.` };
  }
  if (action === 'switch') return { say: SWITCHES[item] };
  if (action === 'write') return { say: 'You doodle on it and wipe it off.' };
  const use = USES[item];
  return use.give ? { say: use.say, give: use.give } : { say: use.say };
}

// Where someone sitting or lying on a thing goes, in the frame: its middle, facing as it does.
export function poseSpot(entry) {
  return { u: entry[2], v: entry[3], rot: entry[5] };
}
