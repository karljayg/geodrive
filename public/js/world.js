// The one place the game gets its saved data from, and what it's allowed to do with it. See docs/SHARED_WORLD.md: only this file knows which mode it's in, and
// the rest asks `world` and `world.rules`. The sandbox opens no connection and uses the same keys as ever. Pure apart from loading the buildings, tested in node.
import { advanceHour } from './daylight.js';
import { Drops } from './drops.js';
import { TripStore } from './session.js';
import { Vitals } from './vitals.js';

const CLOCK_STORE = 'geodrive_clock_v1';
export const TRIAL = 'walktest'; // ?world=walktest: a practice world in this browser, for trying what a shared world will do, with no server

export const RULES = {
  sandbox: { ownCar: true, startsOnFoot: false, skipTime: true, changeStart: true, share: true, forgetBuildings: true },
  trial: { ownCar: false, startsOnFoot: true, skipTime: false, changeStart: false, share: false, forgetBuildings: false },
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
    this.vitals = new Vitals(store);
    this.buildingsOpening = null;
  }

  // Loaded when first wanted, as only those who walk need any of it.
  openBuildings() {
    this.buildingsOpening ||= import('./buildings.js').then(({ BuildingStore }) => new BuildingStore(this.store));
    return this.buildingsOpening;
  }
}

// Which world this page is in, from its address. settings and saveSettings: this browser's preferences, which hold the sandbox's clock.
export function openWorld({ search = '', storage, settings, saveSettings }) {
  if (new URLSearchParams(search).get('world') === TRIAL && storage) {
    const store = scopedStorage(storage, `geodrive_w_${TRIAL}_`);
    return new World({ mode: 'trial', rules: RULES.trial, store, clock: storedClock(store, settings.hour) });
  }
  return new World({
    mode: 'sandbox', rules: RULES.sandbox,
    clock: new Clock({ read: () => settings.hour, write: (value) => { settings.hour = value; }, save: saveSettings }),
  });
}
