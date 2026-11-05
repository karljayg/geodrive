// Deer along the roads this browser has loaded. Behaviour is deer.js. Each gait is a handful of baked frames, and only the current one is shown.
import { move } from './camera.js';
import { GAME } from './gameConfig.js';
import { frameOf, newDeer, plantDeer, stepDeer } from './deer.js';
import { metresApart } from './protocol.js';

const HIDDEN = 0.001, SHOWN = 1;
const GAITS = ['idle', 'walk', 'gallop'];
const METRES_PER_DEGREE = 111320;

const metresFrom = (home, lat, lng) => ({
  x: (lng - home.homeLng) * METRES_PER_DEGREE * Math.cos((home.homeLat * Math.PI) / 180),
  y: (lat - home.homeLat) * METRES_PER_DEGREE,
});

export class DeerView {
  constructor({ maps3d, map, store = 'geodrive_deer_dead_v1', key = 'deer' }) {
    this.maps3d = maps3d;
    this.map = map;
    this.storeKey = store;
    this.key = key;
    this.plantedTiles = new Map(); // road tile key -> planted spots
    this.live = new Map(); // id -> deer state
    this.shown = new Map(); // id -> { deer, frames, gait, frame }
    this.queue = [];
    this.config = GAME.deer;
    this.dead = new Set();
    this.bodies = [];
    this.bodyModels = new Map();
    this.loadDead();
  }

  loadDead() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storeKey) ?? 'null');
      if (!saved) return;
      for (const id of saved.ids ?? []) this.dead.add(id);
      this.bodies = Array.isArray(saved.bodies) ? saved.bodies : [];
    } catch (err) {
      console.warn('deer:', err);
    }
  }

  saveDead() {
    try {
      localStorage.setItem(this.storeKey, JSON.stringify({ ids: [...this.dead], bodies: this.bodies }));
    } catch (err) {
      console.warn('saving deer:', err);
    }
  }

  // New road tiles' deer, once each. Spacing comes from config.every (Settings can change it).
  plantFrom(waysOf, config = GAME.deer) {
    this.config = config;
    for (const [key, ways] of waysOf) {
      if (this.plantedTiles.has(key)) continue;
      this.plantedTiles.set(key, plantDeer(ways, config));
    }
    for (const key of [...this.plantedTiles.keys()]) if (!waysOf.has(key)) this.plantedTiles.delete(key);
    const wanted = new Set();
    for (const planted of this.plantedTiles.values()) {
      for (const spot of planted) {
        if (this.dead.has(spot.id)) continue;
        wanted.add(spot.id);
        if (!this.live.has(spot.id)) this.live.set(spot.id, newDeer(spot));
      }
    }
    for (const id of [...this.live.keys()]) if (!wanted.has(id)) this.drop(id);
  }

  // Wipe planted tiles so a new every re-rolls the road. Live deer that were on those tiles go with them.
  replant(waysOf, config = GAME.deer) {
    for (const id of [...this.live.keys()]) this.drop(id);
    this.plantedTiles.clear();
    this.plantFrom(waysOf, config);
  }

  drop(id) {
    const animal = this.shown.get(id);
    if (animal) {
      for (const gait of GAITS) for (const element of animal.frames[gait] || []) element?.remove();
      this.shown.delete(id);
    }
    this.queue = this.queue.filter((job) => job.animal.deer.id !== id);
    this.live.delete(id);
  }

  around(at, within, most) {
    const found = [];
    for (const deer of this.live.values()) {
      const place = this.where(deer);
      const away = metresApart(at, place);
      if (away <= within) found.push({ deer, away });
    }
    return found.sort((a, b) => a.away - b.away).slice(0, most).map(({ deer }) => deer);
  }

  enqueue(animal) {
    const file = animal.deer.stag && this.config.stagModel ? this.config.stagModel : this.config.model;
    const dir = this.config.dir || 'deer';
    for (const gait of GAITS) {
      for (let i = 0; i < this.config.frames[gait]; i++) this.queue.push({ animal, gait, i, url: `models/${dir}/${file}-${gait}-${i}.glb` });
    }
    const rank = (job) => (job.gait === 'idle' && job.i === 0 ? 2 : job.gait === 'idle' ? 1 : 0);
    this.queue.sort((a, b) => rank(a) - rank(b));
  }

  addSome(n) {
    for (let i = 0; i < n && this.queue.length; i++) {
      const job = this.queue.pop();
      if (!this.shown.has(job.animal.deer.id)) continue;
      const element = new this.maps3d.Model3DElement({
        position: this.where(job.animal.deer), altitudeMode: 'RELATIVE_TO_GROUND',
        orientation: { heading: job.animal.deer.heading, tilt: 0, roll: 0 }, scale: HIDDEN,
      });
      element.src = new URL(job.url, document.baseURI).href;
      this.map.append(element);
      job.animal.frames[job.gait][job.i] = element;
    }
  }

  where(deer) {
    const north = move(deer.homeLat, deer.homeLng, 0, deer.y);
    return { ...move(north.lat, north.lng, 90, deer.x), altitude: 0 };
  }

  // Circles the car can hit. Speed is whatever the deer is doing right now.
  hitList() {
    const radius = this.config.hitRadius;
    return [...this.live.values()].map((deer) => {
      const at = this.where(deer);
      return {
        id: deer.id, kind: 'deer', lat: at.lat, lng: at.lng, heading: deer.heading, speed: deer.speed, radius, body: this.config.body || 1,
        shotRadius: this.config.shotRadius || radius, shotBody: this.config.shotBody || this.config.body || 1,
      };
    });
  }

  // The body stays where it fell. A refresh does not bring that deer back.
  kill(id) {
    const deer = this.live.get(id);
    if (!deer) return null;
    const at = this.where(deer);
    const file = deer.stag && this.config.stagModel ? this.config.stagModel : this.config.model;
    const body = {
      id, lat: at.lat, lng: at.lng, heading: deer.heading, stag: deer.stag, meat: this.config.meat,
      raw: this.config.raw, file, dir: this.config.dir || 'deer', down: this.config.down,
    };
    this.dead.add(id);
    this.bodies.push(body);
    this.drop(id);
    this.saveDead();
    this.placeBody(body);
    return body;
  }

  nearBodies(at, within) {
    return this.bodies.filter((body) => metresApart(at, body) <= within);
  }

  removeBody(id) {
    if (!this.bodies.some((body) => body.id === id)) return;
    this.bodies = this.bodies.filter((body) => body.id !== id);
    this.bodyModels.get(id)?.remove();
    this.bodyModels.delete(id);
    this.saveDead();
  }

  placeBody(body) {
    if (this.bodyModels.has(body.id) || !this.maps3d) return;
    const file = body.file || (body.stag ? 'stag' : 'deer');
    const element = new this.maps3d.Model3DElement({
      position: { lat: body.lat, lng: body.lng, altitude: 0 }, altitudeMode: 'RELATIVE_TO_GROUND',
      orientation: { heading: body.heading, tilt: 0, roll: 90 }, scale: SHOWN,
    });
    element.src = new URL(`models/${body.dir || 'deer'}/${file}-idle-0.glb`, document.baseURI).href;
    this.map.append(element);
    this.bodyModels.set(body.id, element);
  }

  syncBodies(player) {
    const near = this.nearBodies(player, this.config.shownWithin);
    const wanted = new Set(near.map((body) => body.id));
    for (const [id, element] of this.bodyModels) if (!wanted.has(id)) { element.remove(); this.bodyModels.delete(id); }
    for (const body of near) this.placeBody(body);
  }

  tick(player, dt, now, load = true) {
    const { shownWithin, mostShown } = this.config;
    const near = this.around(player, shownWithin, mostShown);
    const wanted = new Set(near.map((deer) => deer.id));
    for (const id of [...this.shown.keys()]) if (!wanted.has(id)) this.dropShown(id);
    let added = false;
    for (const deer of near) {
      if (this.shown.has(deer.id)) continue;
      if (added) break; // one new deer a frame, as with parked cars
      added = true;
      const animal = { deer, frames: { idle: [], walk: [], gallop: [] }, gait: null, frame: -1 };
      this.shown.set(deer.id, animal);
      this.enqueue(animal);
    }
    for (const deer of near) stepDeer(deer, metresFrom(deer, player.lat, player.lng), dt, now, this.config);
    if (load) this.addSome(1);
    this.sync();
    this.syncBodies(player);
  }

  dropShown(id) {
    const animal = this.shown.get(id);
    if (!animal) return;
    for (const gait of GAITS) for (const element of animal.frames[gait] || []) element?.remove();
    this.shown.delete(id);
    this.queue = this.queue.filter((job) => job.animal.deer.id !== id);
  }

  sync() {
    for (const animal of this.shown.values()) {
      const deer = animal.deer;
      const gait = animal.frames[deer.gait].some(Boolean) ? deer.gait : 'idle';
      const frames = animal.frames[gait];
      let frame = frameOf({ ...deer, gait }, this.config);
      if (!frames[frame]) frame = frames.findIndex(Boolean);
      const element = frames[frame];
      if (!element) continue;
      if (animal.gait !== gait || animal.frame !== frame) {
        if (animal.frames[animal.gait]?.[animal.frame]) animal.frames[animal.gait][animal.frame].scale = HIDDEN;
        element.scale = SHOWN;
        animal.gait = gait;
        animal.frame = frame;
      }
      element.position = this.where(deer);
      element.orientation = { heading: deer.heading, tilt: 0, roll: 0 };
    }
  }
}
