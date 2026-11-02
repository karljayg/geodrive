// What a person can do with the things in a room: which is in reach, what F does to it, and what's found inside. Pure, tested in node.
// What has happened is kept in the building's plan by floor, not in the saved layout, so a layout can be redone without losing it.
import { dice, hashText } from './buildings.js';
import { ITEMS } from './furniture.js';

const REACH = 1.2;       // m from a thing's edge that it can be used
const EMPTY_CHANCE = 0.3; // of something that can be opened having nothing in it
const DONE = new Set(['sit', 'sleep', 'open', 'search', 'pick up', 'use', 'switch', 'write']);
const NOT_USED_HERE = new Set(['stairs', 'stairwell', 'lift']); // L does those

const NAMES = {
  tv: 'TV', tvStand: 'TV stand', screen: 'computer', frontDesk: 'front desk', atm: 'cash machine', bin: 'bin', bath: 'bath', basin: 'basin', bathCabinet: 'bathroom cabinet',
  cashCart: 'cash cart', medCart: 'medical cart', radio: 'radio', books: 'books', toaster: 'toaster', smallPlant: 'little plant', tableLamp: 'lamp', floorLamp: 'lamp', parkedCar: 'car',
};
const nameOf = (item) => NAMES[item] || item.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);

// What can be found in what. Anything that opens without a list here is simply empty.
const FINDS = {
  fridge: ['Milk', 'Leftover pizza', 'Orange juice', 'Cold soda'], counter: ['Can of soup', 'Box of cereal', 'Cutlery'], wardrobe: ['Old jacket', 'Spare keys', 'Shoebox'],
  nightstand: ['Flashlight', 'Paperback', 'Reading glasses'], sideTable: ['Batteries', 'Pack of cards', 'Old letters'], tvStand: ['TV remote', 'Old DVD'], bathCabinet: ['Toothpaste', 'Plasters', 'Aspirin'],
  bookcase: ['Novel', 'Atlas', 'Photo album'], desk: ['Stapler', 'Notebook', 'USB stick'], filingCabinet: ['Old invoices', 'Paperclips', 'Sealed envelope'], locker: ['Gym towel', 'Padlock', 'Trainers'],
  box: ['Old newspapers', 'Packing tape', 'Holiday lights'], bin: ['Crumpled receipt', 'Empty can'], cashCart: ['Bundle of cash'], toolChest: ['Wrench', 'Screwdriver', 'Tape measure'], medCart: ['Bandages', 'Thermometer'],
  storeShelf: ['Tin of beans', 'Bottle of water', 'Pack of batteries'], clothesRack: ['Denim jacket', 'Silk scarf'], displayTable: ['Gift card', 'Sunglasses'], displayCase: ['Old coin', 'Museum guide'],
  palletRack: ['Box of parts', 'Roll of tape'], bookStack: ['Library book', 'Old atlas'], gearRack: ['Fire helmet', 'Gloves'], walkInFridge: ['Tray of steaks', 'Crate of milk'], toyBox: ['Toy car', 'Teddy bear'],
  fridgeCase: ['Sandwich', 'Cold drink'], breadRack: ['Fresh loaf', 'Croissant'], vendingMachine: ['Candy bar'], petCage: ['Dog biscuit'],
};
// What using something says. A thing can also give something, as a cash machine gives cash.
const USES = {
  atm: { say: 'The cash machine gives you some cash.', give: 'Cash' }, vendingMachine: { say: 'It drops a candy bar.', give: 'Candy bar' }, coffeeMachine: { say: 'You pour a coffee.', give: 'Cup of coffee' },
  sink: { say: 'You wash your hands.' }, basin: { say: 'You wash your hands.' }, toilet: { say: 'That\'s better.' }, bath: { say: 'You run the water for a moment.' }, stove: { say: 'The ring clicks on and off.' },
  proStove: { say: 'The burners roar, then you turn them off.' }, microwave: { say: 'It hums and beeps.' }, toaster: { say: 'Pop.' }, washer: { say: 'It rumbles through a cycle.' }, screen: { say: 'It asks for a password.' },
  treadmill: { say: 'You jog for a minute.' }, benchPress: { say: 'You lift it twice and put it down.' }, punchBag: { say: 'Thud.' }, weightRack: { say: 'Heavier than it looks.' }, poolTable: { say: 'You knock a ball in.' },
  ticketMachine: { say: 'It prints a ticket.', give: 'Ticket' }, tellerCounter: { say: 'The teller is on a break.' }, printer: { say: 'It\'s out of paper.' }, machine: { say: 'It whirrs into life and stops.' },
  carLift: { say: 'The lift rises a little.' }, examTable: { say: 'The paper crinkles.' }, scanner: { say: 'It hums for a moment.' }, turnstile: { say: 'It clicks round.' }, workbench: { say: 'You tidy the tools.' },
  scales: { say: 'It reads nothing.' },
};
const SWITCHES = { tv: 'The TV flickers on and off.', radio: 'A burst of music, and you turn it off.', tableLamp: 'Click. Click.', floorLamp: 'Click. Click.', surgeryLamp: 'It blazes, and you turn it off.', speakerStand: 'A burst of static.' };

const key = (entry) => `${entry[0]}|${entry[2]}|${entry[3]}`;
const stateOf = (plan, floor) => ((plan.state ||= {})[floor] ||= { taken: [], opened: [] });

// A floor as the person has left it: without what they've picked up.
export function withoutTaken(record, plan, floor) {
  const taken = plan.state?.[floor]?.taken;
  return taken?.length ? { ...record, items: record.items.filter((entry) => !taken.includes(key(entry))) } : record;
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
