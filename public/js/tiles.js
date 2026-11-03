// Loads roads into a RoadNet around the car from OpenFreeMap's vector tiles. Any failure is tolerated:
// without a tile the car drives freely until a retry works.
import { move } from './camera.js';
import { namesFromTile, parkingFromTile, roadsFromTile, VECTOR_ZOOM, vectorTileAt } from './vector.js';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const RETRY_AFTER = 15000; // ms before a tile that failed is tried again
const AROUND = [-1, 0, 1];
const RING = 2500;         // m out from the car that should always be loaded
const MAX_TILES = 60;      // road tiles kept before the furthest are released
const EVICT_PER_CHECK = 3; // tiles released at once, so it never costs more than a frame can absorb
const LOOK = 20;           // seconds of driving ahead to load
const MAX_NAME_TILES = 40; // tiles of street names kept before the oldest are released

export class RoadTiles {
  constructor(net) {
    this.net = net;
    this.loaded = new Set();
    this.failedAt = new Map();
    this.loading = new Map();
    this.template = null;
    this.waysOf = new Map(); // tile key -> its ways, so one tile can be released
    this.parkingOf = new Map(); // tile key -> where cars may be left there (parkingFromTile), for a shared world's cars
    this.onWork = null;      // called with the ms each tile cost the main thread
    this.namesOf = new Map(); // tile key -> its named roads
    this.namesFailedAt = new Map();
    this.namesLoading = false;
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
      .then(({ ways, parking }) => {
        this.parkingOf.set(key, parking);
        const began = performance.now();
        this.net.add(ways);
        this.onWork?.(performance.now() - began);
        this.waysOf.set(key, ways);
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

  // One map tile as it comes, or null if nothing is mapped there. Walking reads other layers from the same tiles.
  async tileBytes(x, y) {
    if (!this.template) {
      const res = await fetch(TILEJSON);
      if (!res.ok) throw new Error(`tile index answered ${res.status}`);
      [this.template] = (await res.json()).tiles;
    }
    const res = await fetch(this.template.replace('{z}', 14).replace('{x}', x).replace('{y}', y));
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) throw new Error(`vector tile answered ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async fetchTile(key) {
    const [x, y] = key.split('_').map(Number);
    const bytes = await this.tileBytes(x, y);
    if (!bytes) return { ways: [], parking: { aisles: [], driveways: [], kerbs: [] } };
    const began = performance.now();
    const ways = roadsFromTile(bytes, x, y), parking = parkingFromTile(bytes, x, y);
    this.onWork?.(performance.now() - began);
    return { ways, parking };
  }

  // Street names within reach of a point, for the phone's Map. They aren't needed to drive, so they're read only when asked for
  // and a tile at a time, nearest first: what's here now comes back, and the rest turns up on later calls.
  streetNames(lat, lng, reach) {
    const here = vectorTileAt(lat, lng), tileSize = (40075000 * Math.cos((lat * Math.PI) / 180)) / 2 ** VECTOR_ZOOM;
    const span = Math.ceil(reach / tileSize), wanted = [];
    for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) wanted.push({ key: `${here.x + dx}_${here.y + dy}`, away: Math.hypot(dx, dy) });
    wanted.sort((a, b) => a.away - b.away);
    const lines = [];
    let next = null;
    for (const { key } of wanted) {
      const held = this.namesOf.get(key);
      if (held) lines.push(...held);
      else if (!next && Date.now() - (this.namesFailedAt.get(key) || 0) > RETRY_AFTER) next = key;
    }
    if (next && !this.namesLoading) this.loadNames(next, new Set(wanted.map((tile) => tile.key)));
    return lines;
  }

  async loadNames(key, wanted) {
    this.namesLoading = true;
    try {
      const [x, y] = key.split('_').map(Number);
      const bytes = await this.tileBytes(x, y);
      this.namesOf.set(key, bytes ? namesFromTile(bytes, x, y) : []);
      for (const old of this.namesOf.keys()) {
        if (this.namesOf.size <= MAX_NAME_TILES) break;
        if (!wanted.has(old)) this.namesOf.delete(old);
      }
    } catch (err) {
      console.warn(`street names ${key}:`, err.message);
      this.namesFailedAt.set(key, Date.now());
    }
    this.namesLoading = false;
  }

  // Everything near a point, for finding its nearest road. True if the tile under the point itself arrived.
  async loadNear(lat, lng) {
    const keys = new Set([this.keyAt(lat, lng)]);
    for (const dy of AROUND) for (const dx of AROUND) keys.add(this.keyAt(lat + dy * 0.004, lng + dx * 0.005));
    const results = await Promise.all([...keys].map((key) => this.load(key)));
    return results[0];
  }

  // Releases the tiles furthest from the one the car is in, leaving the ones it still wants.
  evict(lat, lng, wanted) {
    if (this.loaded.size <= MAX_TILES) return;
    const here = vectorTileAt(lat, lng);
    const far = [...this.loaded].filter((key) => !wanted.has(key)).map((key) => {
      const [x, y] = key.split('_').map(Number);
      return { key, away: Math.hypot(x - here.x, y - here.y) };
    }).sort((a, b) => b.away - a.away);
    for (const { key } of far.slice(0, Math.min(EVICT_PER_CHECK, this.loaded.size - MAX_TILES))) {
      const began = performance.now();
      this.net.remove(this.waysOf.get(key));
      this.onWork?.(performance.now() - began);
      this.waysOf.delete(key);
      this.parkingOf.delete(key);
      this.loaded.delete(key);
    }
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
    this.evict(lat, lng, keys);
  }
}
