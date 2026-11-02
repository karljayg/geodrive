// Ground height from free terrain tiles (Mapzen's, on AWS Open Data), in place of the billed Elevation API. One tile
// covers about 8 km and answers every height inside it. Any failure is tolerated: the camera keeps its last height.
// Pure apart from loadHeights, and tested in node.
const ZOOM = 12;           // about 30 m a pixel, close enough for the camera's pivot
const SIZE = 256;          // pixels a side
const MAX_TILES = 12;      // kept in memory, 256 KB each
const RETRY_AFTER = 15000; // ms before a tile that failed is tried again
const WAIT = 8000;         // ms a tile may take

// Terrarium tiles store metres above sea level in a pixel's colour.
export const heightFromPixel = (r, g, b) => r * 256 + g + b / 256 - 32768;

export function heightsFromPixels(rgba) {
  const heights = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < heights.length; i++) heights[i] = heightFromPixel(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  return heights;
}

// Which tile holds a point, and where in it, in pixels.
export function tilePoint(lat, lng, zoom = ZOOM) {
  const n = 2 ** zoom, r = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n, y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x: Math.floor(x), y: Math.floor(y), px: (x - Math.floor(x)) * SIZE, py: (y - Math.floor(y)) * SIZE };
}

// Blends the four pixels around a point, whose values belong to their centres.
export function sampleHeights(heights, px, py) {
  const fx = Math.max(0, Math.min(SIZE - 1, px - 0.5)), fy = Math.max(0, Math.min(SIZE - 1, py - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(SIZE - 1, x0 + 1), y1 = Math.min(SIZE - 1, y0 + 1);
  const at = (x, y) => heights[y * SIZE + x], dx = fx - x0, dy = fy - y0;
  return (at(x0, y0) * (1 - dx) + at(x1, y0) * dx) * (1 - dy) + (at(x0, y1) * (1 - dx) + at(x1, y1) * dx) * dy;
}

async function loadHeights(x, y, zoom) {
  const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`, { signal: AbortSignal.timeout(WAIT) });
  if (!res.ok) throw new Error(`terrain tile answered ${res.status}`);
  // Colours are data here, so nothing may adjust them on the way to the pixels.
  const image = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const ctx = new OffscreenCanvas(SIZE, SIZE).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  image.close();
  return heightsFromPixels(ctx.getImageData(0, 0, SIZE, SIZE).data);
}

export class Terrain {
  constructor(load = loadHeights, zoom = ZOOM) {
    this.load = load;
    this.zoom = zoom;
    this.changes = 0; // counts tiles arriving
    this.tiles = new Map(); // oldest used first
    this.loading = new Map();
    this.failedAt = new Map();
  }

  // Metres above sea level, or null if the tile can't be had just now.
  async heightAt(lat, lng) {
    const { x, y, px, py } = tilePoint(lat, lng, this.zoom), key = `${x}_${y}`;
    let heights = this.tiles.get(key);
    if (heights) {
      this.tiles.delete(key);
    } else {
      if (Date.now() - (this.failedAt.get(key) ?? -Infinity) < RETRY_AFTER) return null;
      if (!this.loading.has(key)) this.loading.set(key, this.load(x, y, this.zoom).then((loaded) => { this.changes++; return loaded; }).finally(() => this.loading.delete(key)));
      try {
        heights = await this.loading.get(key);
      } catch (err) {
        console.warn(`terrain tile ${key}:`, err.message);
        this.failedAt.set(key, Date.now());
        return null;
      }
    }
    this.tiles.set(key, heights);
    if (this.tiles.size > MAX_TILES) this.tiles.delete(this.tiles.keys().next().value);
    return sampleHeights(heights, px, py);
  }

  // The height right now, or null while its tile is on the way, which this sends for. For asking many times a frame.
  heightNow(lat, lng) {
    const { x, y, px, py } = tilePoint(lat, lng, this.zoom), heights = this.tiles.get(`${x}_${y}`);
    if (heights) return sampleHeights(heights, px, py);
    this.heightAt(lat, lng);
    return null;
  }
}
