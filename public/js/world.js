// The one place the game gets its saved data from, and what it's allowed to do with it. See docs/SHARED_WORLD.md: only this file knows which mode it's in, and
// the rest asks `world` and `world.rules`. The sandbox opens no connection and uses the same keys as ever. Pure apart from loading the buildings, tested in node.
import { ChatLog } from './chat.js';
import { advanceHour } from './daylight.js';
import { Drops, Marks } from './drops.js';
import { TripStore } from './session.js';
import { Vitals } from './vitals.js';
import { GAME } from './gameConfig.js';
import { People, presenceRate } from './people.js';
import { SharedBuildings, SharedCars, SharedDrops } from './sharedWorld.js';
import { PROTOCOL, clockHour, packPresence, unpackPresence } from './protocol.js';

const CLOCK_STORE = 'geodrive_clock_v1';
export const TRIAL = 'walktest'; // ?world=walktest: a practice world in this browser, for trying what a shared world will do, with no server

export const RULES = {
  sandbox: { ownCar: true, startsOnFoot: false, skipTime: true, changeStart: true, createWorld: true, forgetBuildings: true, invites: false, people: false, chat: false },
  trial: { ownCar: false, startsOnFoot: true, skipTime: false, changeStart: false, createWorld: false, forgetBuildings: false, invites: false, people: false, chat: false },
  private: { ownCar: false, startsOnFoot: true, skipTime: false, changeStart: false, createWorld: false, forgetBuildings: false, invites: true, people: true, chat: true },
};

// A storage with this world's name on every key, so several worlds can live in one browser.
export const scopedStorage = (storage, prefix) => ({
  getItem: (key) => storage.getItem(prefix + key),
  setItem: (key, value) => storage.setItem(prefix + key, value),
  removeItem: (key) => storage.removeItem(prefix + key),
});

// What time it is. It moves the same in every mode for now; only where it's kept differs.
export class Clock {
  constructor({ read, write, save }) {
    Object.assign(this, { read, write, keep: save });
  }

  get hour() {
    return this.read();
  }

  set hour(value) {
    this.write(value);
  }

  advance(seconds, onFoot, footRate) {
    this.write(advanceHour(this.read(), seconds, onFoot, footRate));
  }

  skip(hours) {
    this.write((this.read() + hours) % 24);
  }

  save() {
    this.keep();
  }
}

function storedClock(storage, startHour) {
  let hour = startHour;
  try {
    const saved = JSON.parse(storage.getItem(CLOCK_STORE));
    if (Number.isFinite(saved)) hour = saved;
  } catch (err) {
    console.warn('saved clock:', err);
  }
  return new Clock({
    read: () => hour,
    write: (value) => { hour = value; },
    save: () => {
      try {
        storage.setItem(CLOCK_STORE, JSON.stringify(hour));
      } catch (err) {
        console.warn('saving clock:', err);
      }
    },
  });
}

class World {
  // store: where this world's saves go, or undefined for each class's own default of localStorage under today's keys.
  constructor({ mode, rules, store, clock }) {
    Object.assign(this, { mode, rules, store, clock });
    this.trips = new TripStore(store);
    this.drops = new Drops(store);
    this.marks = new Marks(store);
    this.vitals = new Vitals(store);
    this.buildingsOpening = null;
  }

  // Loaded when first wanted, as only those who walk need any of it.
  openBuildings() {
    this.buildingsOpening ||= import('./buildings.js').then(({ BuildingStore }) => new BuildingStore(this.store));
    return this.buildingsOpening;
  }
}

// --- A shared world ---------------------------------------------------------------------------------------------

const WORLDS_STORE = 'geodrive_worlds_v1';
const POCKET_KEY = 'geodrive_pocket_v1', VITALS_KEY = 'geodrive_vitals_v1', SESSION_KEY = 'geodrive_session_v1';
const SAVE_EVERY = 20000;   // ms between sending what's changed, as often as needs are saved
const LOOK_EVERY = 50;      // ms between seeing whether a place is due
const MOVING = 0.1;         // m/s
const CHAT_SEEN = 'geodrive_chat_seen_v1';

export const worldPrefix = (id) => `geodrive_w_${id}_`;

// True if this address or browser needs worldEntry.js, so that nobody who's never seen a world loads any of it or the network code.
export const needsEntry = (where, storage) => /^#w=/.test(where.hash) || new URLSearchParams(where.search).has('w') || (!!storage && knownWorlds(storage).length > 0);

// The worlds this browser has been in: [{ id, name }]. Each one's id and secret are under its own name.
export function knownWorlds(storage) {
  try {
    const list = JSON.parse(storage.getItem(WORLDS_STORE));
    return Array.isArray(list) ? list.filter((world) => world?.id && world.name) : [];
  } catch (err) {
    return [];
  }
}

export function savedMe(storage, id) {
  try {
    const me = JSON.parse(scopedStorage(storage, worldPrefix(id)).getItem('me_v1'));
    return me?.id && me.secret ? me : null;
  } catch (err) {
    return null;
  }
}

export function rememberWorld(storage, { id, name, me }) {
  scopedStorage(storage, worldPrefix(id)).setItem('me_v1', JSON.stringify(me));
  storage.setItem(WORLDS_STORE, JSON.stringify([{ id, name }, ...knownWorlds(storage).filter((world) => world.id !== id)]));
}

// Looks like a browser's storage to the classes that use one, but the bag and needs live on the server, and everything else in this browser under this world's name.
// A trip stays here, as it holds addresses and town names from Google. Only its figures and the place go to the server.
export function remoteStore(local, player) {
  const held = new Map(), changed = {};
  if (player?.pocket) held.set(POCKET_KEY, JSON.stringify(player.pocket));
  if (player?.vitals) held.set(VITALS_KEY, JSON.stringify(player.vitals));
  return {
    getItem: (key) => (key === POCKET_KEY || key === VITALS_KEY ? held.get(key) ?? null : local.getItem(key)),
    setItem(key, value) {
      if (key === POCKET_KEY) { held.set(key, value); changed.pocket = true; return; }
      if (key === VITALS_KEY) { held.set(key, value); changed.vitals = true; return; }
      local.setItem(key, value);
      if (key === SESSION_KEY) changed.session = value;
    },
    removeItem: (key) => local.removeItem(key),
    // What's changed since last asked, as a message, or null. Only figures from a trip: the server refuses the rest anyway.
    takeChanges() {
      const message = {};
      if (changed.pocket) message.pocket = JSON.parse(held.get(POCKET_KEY));
      if (changed.vitals) message.vitals = JSON.parse(held.get(VITALS_KEY));
      if (changed.session) {
        const { pos, trip } = JSON.parse(changed.session);
        message.trip = trip;
        if (pos) Object.assign(message, { lat: pos.lat, lng: pos.lng });
      }
      for (const key of Object.keys(changed)) delete changed[key];
      return Object.keys(message).length ? message : null;
    },
  };
}

// The world's clock: told by the server and worked out here, so everyone agrees. Nothing here can set it; sleeping asks.
class ServerClock {
  constructor(link) {
    this.link = link;
    this.set({ hour: 8, rate: 0, at: 0, now: 0 });
  }

  set(clock) {
    this.state = clock;
    this.offset = clock.now - Date.now();
  }

  get hour() {
    return clockHour(this.state, Date.now() + this.offset);
  }

  set hour(value) { /* only the server moves it */ }

  advance() { /* it runs by itself */ }

  skip(hours) {
    this.link.ask({ t: 'sleep', hours });
  }

  save() { /* the server keeps it */ }
}

export class PrivateWorld extends World {
  // entry: { id, link, welcome }, from worldEntry.js. storage: this browser's.
  constructor({ id, link, welcome, storage }) {
    const local = scopedStorage(storage, worldPrefix(id)), store = remoteStore(local, welcome.player);
    super({ mode: 'private', rules: RULES.private, store, clock: new ServerClock(link) });
    Object.assign(this, { id, link, local, name: welcome.world.name, you: welcome.you, player: welcome.player, near: welcome.near });
    this.creator = welcome.world.creator;
    this.people = new People(welcome.you.id);
    this.chat = new ChatLog(welcome.you.id, GAME.world.chatKept, Number(local.getItem(CHAT_SEEN)) || 0);
    this.on = {};          // what main.js wants to know: said, missed, member, managers, link
    this.whereAmI = null;  // what to send: { lat, lng, heading, speed, flags, gait, floor, u, v }, or null for nothing yet
    this.seq = 0;
    this.sentAt = -Infinity;
    this.me = savedMe(storage, id);
    this.buildings = new SharedBuildings(link);
    this.drops = new SharedDrops(link, welcome.you.id, welcome.drops ?? []);
    this.cars = new SharedCars(link, welcome.you.id, welcome.cars ?? []);
    this.accept(welcome);
    link.onMessage = (message) => this.heard(message);
    link.onBytes = (bytes) => {
      const place = unpackPresence(bytes);
      if (place) this.people.heard(place, performance.now());
    };
    link.onState = (state, why) => this.on.link?.(state, why);
    link.stayOpen(() => ({ t: 'hello', protocol: PROTOCOL, world: id, player: this.me.id, secret: this.me.secret }));
    this.saving = setInterval(() => this.flush(), SAVE_EVERY);
    this.placing = setInterval(() => this.sendPlace(), LOOK_EVERY);
  }

  // Shared buildings are here already, and read at once from what's arrived.
  openBuildings() {
    return Promise.resolve(this.buildings);
  }

  accept({ members, clock, chat, world }) {
    this.people.setMembers(members);
    this.clock.set(clock);
    this.owner = world.owner;
    this.backup = world.backup;
    this.missed = this.chat.load(chat);
  }

  heard(message) {
    if (message.t === 'welcome') { // back after losing the line
      this.accept(message);
      this.drops.setAll(message.drops ?? []);
      this.cars.setAll(message.cars ?? []);
      this.inBuilding = undefined; // the server has forgotten, so it's said again
      this.buildings.rejoined();
      this.on.link?.('open');
      if (this.missed) this.on.missed?.(this.missed);
    } else if (message.t === 'member') {
      const known = this.people.member(message.member.id);
      this.people.setMember(message.member);
      if (known && !message.member.online) this.people.forget(message.member.id);
      this.on.member?.(message.member, known);
    } else if (message.t === 'clock') {
      this.clock.set(message.clock);
    } else if (message.t === 'managers') {
      this.owner = message.owner;
      this.backup = message.backup;
      this.on.managers?.();
    } else if (message.t === 'said') {
      if (this.chat.add(message)) this.on.said?.(message);
    } else if (message.t === 'where') {
      const member = this.people.member(message.member);
      if (member) member.building = message.building;
    } else if (message.t === 'floorOp') {
      this.buildings.heardFloorOp(message);
    } else if (message.t === 'plan') {
      this.buildings.heardPlan(message);
    } else if (message.t === 'floor') {
      this.buildings.heardFloor(message);
    } else if (message.t === 'switchesOn') {
      this.buildings.heardSwitchesOn(message);
    } else if (message.t === 'dropAdded') {
      this.drops.heardAdded(message.drop);
    } else if (message.t === 'car') {
      this.cars.heard(message.car);
    } else if (message.t === 'dropTaken') {
      this.drops.heardTaken(message.id);
    }
  }

  get isManager() {
    return this.you.id === this.owner || this.you.id === this.backup;
  }

  get managerNames() {
    return [this.owner, this.backup].map((id) => this.people.member(id)?.name).filter(Boolean);
  }

  nameOf(id) {
    return this.people.member(id)?.name ?? null;
  }

  // How to begin, if this browser has no trip of its own for this world: { restore: { lat, lng, trip } }, { near }, or { choose: true } for the creator's start.
  beginning() {
    const { lat, lng, trip } = this.player;
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== null) return { restore: { lat, lng, trip } };
    if (this.near) return { near: this.near };
    return { choose: true };
  }

  markChatSeen() {
    this.local.setItem(CHAT_SEEN, String(this.chat.markSeen()));
  }

  // Says which building this person is in, when that changes.
  setBuilding(id) {
    if (this.inBuilding === id) return;
    this.inBuilding = id;
    this.link.send({ t: 'where', building: id });
  }

  // Everyone on this floor of this building: { member, place }.
  peopleOnFloor(building, floor, now) {
    return this.people.othersOnline.flatMap((member) => {
      if (member.building !== building) return [];
      const place = this.people.drawnAt(member.id, now);
      return place && place.floor === floor ? [{ member, place }] : [];
    });
  }

  // The newest place, if one's due at the rate for what they're doing. On a timer, as the game loop stops in a hidden tab.
  sendPlace() {
    const place = this.whereAmI?.();
    if (!place || !this.link.connected) return;
    const now = performance.now(), rate = presenceRate({ moving: Math.abs(place.speed) > MOVING, onFoot: place.onFoot, away: place.away, near: this.people.someoneNear(place, now) });
    if (now - this.sentAt < 1000 / rate) return;
    this.sentAt = now;
    this.link.sendBytes(packPresence({ ...place, seq: this.seq++ }));
  }

  // What's changed goes to the server. Nothing waits on the answer, and it's sent again next time if the line was down.
  flush() {
    if (!this.link.connected) return; // it waits, and goes when the line's back
    const changes = this.store.takeChanges();
    if (changes) this.link.send({ t: 'save', ...changes });
  }
}

// Which world this page is in, from its address or from what worldEntry.js found. settings and saveSettings: this browser's preferences, which hold the sandbox's clock.
export function openWorld({ search = '', storage, settings, saveSettings, entry }) {
  if (entry?.kind === 'private') return new PrivateWorld({ ...entry, storage });
  if (new URLSearchParams(search).get('world') === TRIAL && storage) {
    const store = scopedStorage(storage, `geodrive_w_${TRIAL}_`);
    return new World({ mode: 'trial', rules: RULES.trial, store, clock: storedClock(store, settings.hour) });
  }
  return new World({
    mode: 'sandbox', rules: RULES.sandbox,
    clock: new Clock({ read: () => settings.hour, write: (value) => { settings.hour = value; }, save: saveSettings }),
  });
}
