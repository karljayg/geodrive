// Loads roads into a RoadNet around the car from OpenFreeMap's vector tiles. Any failure is tolerated:
// without a tile the car drives freely until a retry works.
import { move } from './camera.js';
import { roadsFromTile, vectorTileAt } from './vector.js';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const RETRY_AFTER = 15000; // ms before a tile that failed is tried again
const AROUND = [-1, 0, 1];
const RING = 2500;         // m out from the car that should always be loaded
const LOOK = 20;           // seconds of driving ahead to load

export class RoadTiles {
  constructor(net) {
    this.net = net;
    this.loaded = new Set();
    this.failedAt = new Map();
    this.loading = new Map();
    this.template = null;
  }

  keyAt(lat, lng) {
    const { x, y } = vectorTileAt(lat, lng);
    return `${x}_${y}`;
  }

  hasRoads(lat, lng) {
    return this.loaded.has(this.keyAt(lat, lng));
  }

  load(key) {
    if (this.loaded.has(key)) return Promise.resolve(true);
    if (this.loading.has(key)) return this.loading.get(key);
    const job = this.fetchTile(key)
      .then((ways) => {
        this.net.add(ways);
        this.loaded.add(key);
        this.failedAt.delete(key);
        return true;
      })
      .catch((err) => {
        console.warn(`road tile ${key}:`, err.message);
        this.failedAt.set(key, Date.now());
        return false;
      })
      .finally(() => this.loading.delete(key));
    this.loading.set(key, job);
    return job;
  }

  async fetchTile(key) {
    if (!this.template) {
      const res = await fetch(TILEJSON);
      if (!res.ok) throw new Error(`tile index answered ${res.status}`);
      [this.template] = (await res.json()).tiles;
    }
    const [x, y] = key.split('_').map(Number);
    const res = await fetch(this.template.replace('{z}', 14).replace('{x}', x).replace('{y}', y));
    if (res.status === 204 || res.status === 404) return []; // nothing mapped there
    if (!res.ok) throw new Error(`vector tile answered ${res.status}`);
    return roadsFromTile(new Uint8Array(await res.arrayBuffer()), x, y);
  }

  // Everything near a point, for finding its nearest road. True if the tile under the point itself arrived.
  async loadNear(lat, lng) {
    const keys = new Set([this.keyAt(lat, lng)]);
    for (const dy of AROUND) for (const dx of AROUND) keys.add(this.keyAt(lat + dy * 0.004, lng + dx * 0.005));
    const results = await Promise.all([...keys].map((key) => this.load(key)));
    return results[0];
  }

  // Keeps the tiles around the car loaded, plus where it will be soon.
  ensure(lat, lng, heading, speed) {
    const keys = new Set([this.keyAt(lat, lng)]);
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const p = move(lat, lng, bearing, RING);
      keys.add(this.keyAt(p.lat, p.lng));
    }
    for (let d = 1000; d < Math.abs(speed) * LOOK; d += 1000) {
      const p = move(lat, lng, speed >= 0 ? heading : heading + 180, d);
      keys.add(this.keyAt(p.lat, p.lng));
    }
    for (const key of keys) {
      const failed = this.failedAt.get(key);
      if (!failed || Date.now() - failed > RETRY_AFTER) this.load(key);
    }
  }
}
