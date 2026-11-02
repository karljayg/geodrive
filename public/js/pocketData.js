// What a person carries, kept in this browser: notes, text messages and the bag. Pure, tested in node.
const STORE = 'geodrive_pocket_v1';
export const BAG_SLOTS = 12;
export const CAR_SLOTS = 60;
export const FLASHLIGHT = 'Flashlight'; // everyone starts with one
const MOST_NOTES = 200, MOST_TEXT = 4000, MOST_MESSAGES = 100; // per thread

// The people in the phone. Calls and texts stay inside the game, so these are made up, and nothing is sent anywhere.
export const CONTACTS = [
  { id: 'home', name: 'Home', number: '555-0100', replies: ['Ok, see you soon.', 'Don\'t forget the milk.', 'Where are you now?'] },
  { id: 'garage', name: 'Garage', number: '555-0142', replies: ['Bring the car in any time.', 'We close at six.', 'Sounds like the brakes.'] },
  { id: 'roadside', name: 'Roadside Help', number: '555-0177', replies: ['A truck is on the way.', 'Stay with your car if you can.', 'What road are you on?'] },
  { id: 'pizza', name: 'Pizza Place', number: '555-0193', replies: ['Large pepperoni, 30 minutes.', 'Sorry, delivery only.', 'Your order is ready.'] },
];

const blank = () => ({ notes: [], messages: {}, bag: [{ id: FLASHLIGHT, name: FLASHLIGHT, count: 1 }], car: [] });

export class PocketData {
  constructor(storage) {
    this.state = blank();
    try {
      this.storage = storage ?? localStorage;
      const saved = JSON.parse(this.storage.getItem(STORE));
      this.state = { ...blank(), ...saved };
      if (saved?.bag && !saved.car) this.state.bag.length < BAG_SLOTS ? this.state.bag.push(blank().bag[0]) : this.state.car.push(blank().bag[0]); // saved before there was a flashlight
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

  // item: { id, name }. False if the bag is full; the same thing again adds to its count.
  addToBag(item) {
    const known = this.state.bag.find((i) => i.id === item.id);
    if (known) known.count++;
    else if (this.state.bag.length >= BAG_SLOTS) return false;
    else this.state.bag.push({ ...item, count: 1 });
    this.save();
    return true;
  }

  get car() {
    return this.state.car;
  }

  bagHas(id) {
    return this.state.bag.some((item) => item.id === id);
  }

  // One of a thing from the bag to the car, or back. False if there's no room where it's going.
  move(id, toCar) {
    const [from, to, room] = toCar ? [this.state.bag, this.state.car, CAR_SLOTS] : [this.state.car, this.state.bag, BAG_SLOTS];
    const item = from.find((i) => i.id === id);
    if (!item) return false;
    const there = to.find((i) => i.id === id);
    if (!there && to.length >= room) return false;
    if (there) there.count++;
    else to.push({ id: item.id, name: item.name, count: 1 });
    if (--item.count <= 0) from.splice(from.indexOf(item), 1);
    this.save();
    return true;
  }

  takeFromBag(id) {
    const known = this.state.bag.find((i) => i.id === id);
    if (!known) return false;
    if (--known.count <= 0) this.state.bag = this.state.bag.filter((i) => i !== known);
    this.save();
    return true;
  }
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
