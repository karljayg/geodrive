// What a person carries, kept in this browser: notes, text messages and the bag. Pure, tested in node.
import { GAME } from './gameConfig.js';
import { weaponSpec } from './weapons.js';

const STORE = 'geodrive_pocket_v1';
export const BAG_SLOTS = 12;
export const CAR_SLOTS = 60;
export const HOTBAR_SIZE = 10; // 1 left hand, 2 right hand, then 3–9 and 0
export const FLASHLIGHT = 'Flashlight'; // everyone starts with one
const MOST_NOTES = 200, MOST_TEXT = 4000, MOST_MESSAGES = 100; // per thread

// The people in the phone. Calls and texts stay inside the game, so these are made up, and nothing is sent anywhere.
export const CONTACTS = [
  { id: 'home', name: 'Home', number: '555-0100', replies: ['Ok, see you soon.', 'Don\'t forget the milk.', 'Where are you now?'] },
  { id: 'garage', name: 'Garage', number: '555-0142', replies: ['Bring the car in any time.', 'We close at six.', 'Sounds like the brakes.'] },
  { id: 'roadside', name: 'Roadside Help', number: '555-0177', replies: ['A truck is on the way.', 'Stay with your car if you can.', 'What road are you on?'] },
  { id: 'pizza', name: 'Pizza Place', number: '555-0193', replies: ['Large pepperoni, 30 minutes.', 'Sorry, delivery only.', 'Your order is ready.'] },
];

const HAMMER = GAME.hammer.item;
// The left hand starts on the flashlight. A saved bar is kept as it was, including all empty.
export const blankHotbar = () => [FLASHLIGHT, ...Array(HOTBAR_SIZE - 1).fill(null)];
export const hotbarIndex = (key) => (key === '0' ? HOTBAR_SIZE - 1 : Number(key) - 1);
export const hotbarKey = (index) => String((index + 1) % 10);
export const hotbarPlace = (index) => (index === 0 ? 'left hand' : index === 1 ? 'right hand' : hotbarKey(index));

export function hotbarKeys(hotbar, id) {
  const keys = [];
  for (let i = 0; i < hotbar.length; i++) if (hotbar[i] === id) keys.push(hotbarKey(i));
  return keys;
}

// A missing bar is the default: flashlight in the left hand when it's in the bag. A saved one is ten ids, with old item names brought forward.
export function normalHotbar(saved, bag) {
  if (!Array.isArray(saved)) {
    const bar = Array(HOTBAR_SIZE).fill(null);
    if (!bag || bag.some((item) => item.id === FLASHLIGHT)) bar[0] = FLASHLIGHT;
    return bar;
  }
  const list = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const id = saved[i];
    const name = typeof id === 'string' ? (RENAMED[id] || id) : '';
    list.push(name || null);
  }
  return list;
}

const blank = () => ({ notes: [], messages: {}, bag: [{ id: FLASHLIGHT, name: FLASHLIGHT, count: 1 }], car: [], hotbar: blankHotbar() });

// Things saved under a name since changed, joined with any of the new name.
const RENAMED = { Trainers: 'Sneakers', Plasters: 'Band-Aids', 'Tin of beans': 'Can of beans', Cutlery: 'Silverware' };
function renameOld(list) {
  for (const item of [...(list || [])]) {
    const name = RENAMED[item.id];
    if (!name) continue;
    const there = list.find((other) => other.id === name);
    if (there) {
      there.count += item.count;
      list.splice(list.indexOf(item), 1);
    } else Object.assign(item, { id: name, name });
  }
}

export class PocketData {
  constructor(storage) {
    this.state = blank();
    try {
      this.storage = storage ?? localStorage;
      const saved = JSON.parse(this.storage.getItem(STORE));
      this.state = { ...blank(), ...saved };
      for (const list of [this.state.bag, this.state.car]) renameOld(list);
      if (!this.state.hammerGiven) { // once, to new players and those from before there was one
        this.state.hammerGiven = true;
        this.state.car.push({ id: HAMMER, name: HAMMER, count: 1 });
      }
      if (!this.state.gunGiven) { // once, the same way, so a handgun is there to aim with
        this.state.gunGiven = true;
        const gun = GAME.weapons.handgun, ammo = GAME.calibers[gun.caliber];
        this.state.car.push({ id: gun.item, name: gun.item, count: 1, loaded: gun.magazine });
        this.state.car.push({ id: ammo.item, name: ammo.item, count: gun.spare });
      }
      if (saved?.bag && !saved.car) this.state.bag.length < BAG_SLOTS ? this.state.bag.push(blank().bag[0]) : this.state.car.push(blank().bag[0]); // saved before there was a flashlight
      this.state.hotbar = normalHotbar(saved?.hotbar, this.state.bag);
    } catch (err) {
      console.warn('saved pocket:', err);
    }
  }

  save() {
    try {
      this.storage?.setItem(STORE, JSON.stringify(this.state));
    } catch (err) {
      console.warn('saving pocket:', err);
    }
  }

  // --- Notes, newest first --------------------------------------------------------------------------------------

  get notes() {
    return this.state.notes;
  }

  addNote(now = Date.now()) {
    const note = { id: `${now}_${this.state.notes.length}`, text: '', at: now };
    this.state.notes.unshift(note);
    this.state.notes.length = Math.min(this.state.notes.length, MOST_NOTES);
    this.save();
    return note;
  }

  setNote(id, text, now = Date.now()) {
    const note = this.state.notes.find((n) => n.id === id);
    if (!note) return;
    note.text = text.slice(0, MOST_TEXT);
    note.at = now;
    this.save();
  }

  // A note left empty is not worth keeping.
  closeNote(id) {
    const before = this.state.notes.length;
    this.state.notes = this.state.notes.filter((n) => n.id !== id || n.text.trim());
    if (this.state.notes.length !== before) this.save();
  }

  deleteNote(id) {
    this.state.notes = this.state.notes.filter((n) => n.id !== id);
    this.save();
  }

  // --- Text messages --------------------------------------------------------------------------------------------

  thread(contactId) {
    return this.state.messages[contactId] || [];
  }

  addMessage(contactId, text, mine, now = Date.now()) {
    const list = this.state.messages[contactId] ||= [];
    list.push({ text: text.slice(0, MOST_TEXT), mine, at: now });
    if (list.length > MOST_MESSAGES) list.shift();
    this.save();
  }

  // The contact's answer: which of their replies is the next, going round.
  replyFrom(contactId) {
    const contact = CONTACTS.find((c) => c.id === contactId);
    if (!contact) return null;
    return contact.replies[this.thread(contactId).filter((m) => !m.mine).length % contact.replies.length];
  }

  // --- The bag --------------------------------------------------------------------------------------------------

  get bag() {
    return this.state.bag;
  }

  // item: { id, name, count, loaded }. False if the bag is full; the same thing again adds to its count. A weapon remembers the rounds in it.
  addToBag(item) {
    const known = this.state.bag.find((i) => i.id === item.id);
    const n = item.count || 1;
    if (known) known.count += n;
    else if (this.state.bag.length >= BAG_SLOTS) return false;
    else this.state.bag.push(bagEntry(item));
    this.save();
    return true;
  }

  get car() {
    return this.state.car;
  }

  bagHas(id) {
    return this.state.bag.some((item) => item.id === id);
  }

  // Points a hand or quick slot at something in the bag. The thing stays in the bag; the slot only remembers its id.
  setHotbar(index, id) {
    if (index < 0 || index >= HOTBAR_SIZE) return false;
    this.state.hotbar[index] = id || null;
    this.save();
    return true;
  }

  // One of a thing from the bag to the car, or back. False if there's no room where it's going.
  move(id, toCar) {
    const [from, to, room] = toCar ? [this.state.bag, this.state.car, CAR_SLOTS] : [this.state.car, this.state.bag, BAG_SLOTS];
    const item = from.find((i) => i.id === id);
    if (!item) return false;
    const there = to.find((i) => i.id === id);
    if (!there && to.length >= room) return false;
    if (there) there.count++;
    else to.push(movedOne(item));
    if (--item.count <= 0) from.splice(from.indexOf(item), 1);
    this.save();
    return true;
  }

  // Leaves one of a thing behind, from the bag or the car, for good. False if there isn't one.
  drop(id, fromCar = false) {
    const list = fromCar ? this.state.car : this.state.bag, item = list.find((i) => i.id === id);
    if (!item) return false;
    if (--item.count <= 0) list.splice(list.indexOf(item), 1);
    this.save();
    return true;
  }

  // Undoes a drop, which always has room as the drop made it.
  putBack(item, toCar = false) {
    const list = toCar ? this.state.car : this.state.bag, there = list.find((i) => i.id === item.id);
    if (there) there.count++;
    else list.push(bagEntry(item));
    this.save();
  }

  // A new life: only what everyone starts with, in a shared world.
  startAgain() {
    const fresh = blank();
    this.state.bag = fresh.bag;
    this.state.hotbar = fresh.hotbar;
    this.save();
  }

  takeFromBag(id) {
    return this.takeCount(id, 1) > 0;
  }

  // Several of one thing, for loading a gun. How many actually went.
  takeCount(id, n) {
    const known = this.state.bag.find((i) => i.id === id);
    if (!known || n <= 0) return 0;
    const taken = Math.min(known.count, n);
    known.count -= taken;
    if (known.count <= 0) this.state.bag = this.state.bag.filter((i) => i !== known);
    this.save();
    return taken;
  }
}

// A new bag or car entry. A weapon starts full unless it already says how many rounds it has.
function bagEntry(item) {
  const made = { id: item.id, name: item.name, count: item.count || 1 };
  const spec = weaponSpec(item.id);
  if (spec) made.loaded = Number.isFinite(item.loaded) ? item.loaded : spec.magazine;
  return made;
}

// One moved between the bag and the car. The last of a stack keeps its rounds; a split one is full.
function movedOne(item) {
  const spec = weaponSpec(item.id);
  const made = { id: item.id, name: item.name, count: 1 };
  if (spec) made.loaded = item.count <= 1 && Number.isFinite(item.loaded) ? item.loaded : spec.magazine;
  return made;
}

// --- The way to the car ---------------------------------------------------------------------------------------

// A compass bearing in degrees from (x, y) to the origin, where the car is, in metres from it.
export const bearingToCar = (x, y) => (((Math.atan2(-x, -y) * 180) / Math.PI) + 360) % 360;

const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassName = (degrees) => NAMES[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];

export function distanceText(metres) {
  const feet = metres * 3.28084;
  return feet < 1000 ? `${Math.round(feet / 5) * 5} ft` : `${(metres / 1609.34).toFixed(metres < 16093 ? 1 : 0)} mi`;
}

// How far round the dial's edge the car is, when the person looks at a bearing: 0 is dead ahead, positive is to the right, in -180..180.
export const turnToCar = (x, y, facing) => ((bearingToCar(x, y) - facing + 540) % 360) - 180;

// A stream's 'Artist - Title' as the two lines of a music player. Some stations send only one part, or none.
export function songParts(song) {
  const text = (song || '').trim(), at = text.indexOf(' - ');
  if (!text) return { title: '', artist: '' };
  return at < 0 ? { title: text, artist: '' } : { title: text.slice(at + 3).trim(), artist: text.slice(0, at).trim() };
}

// Adds a song to the list of what has played, newest first, unless it's the one playing already.
export function addRecent(list, song, most = 6) {
  if (!song || list[0] === song) return list;
  return [song, ...list.filter((s) => s !== song)].slice(0, most);
}

export const noteTitle = (note) => note.text.trim().split('\n')[0].slice(0, 40) || 'New note';
