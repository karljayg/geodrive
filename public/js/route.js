// A line for the car to drive along, with the fastest safe speed at every point on it: slower for tight curves,
// and braking early enough to reach them. Used for navigation routes and for signalled turns. Pure, tested in node.

const M_PER_DEG = 111320;
const SPACING = 8;      // m between points, so curve speeds don't depend on how sparse the source line is
const CURVE_WINDOW = 15; // m either side of a point to measure its curve over
const rad = (d) => (d * Math.PI) / 180;
const metersBetween = (a, b) => Math.hypot((b.lng - a.lng) * Math.cos(rad(a.lat)), b.lat - a.lat) * M_PER_DEG;
const bearingBetween = (a, b) => (Math.atan2((b.lng - a.lng) * Math.cos(rad(a.lat)), b.lat - a.lat) * 180) / Math.PI;

export class Path {
  // points: [{ lat, lng, cruise? }] where cruise is the usual speed there in m/s. stopAtEnd: slow to a stop at the last point.
  constructor(points, { stopAtEnd = false, grip = 9, decel = 12, minSpeed = 6 } = {}) {
    this.points = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i], next = points[i + 1];
      this.points.push(p);
      if (!next) break;
      const pieces = Math.floor(metersBetween(p, next) / SPACING);
      for (let s = 1; s < pieces; s++) {
        const f = s / pieces;
        this.points.push({ lat: p.lat + (next.lat - p.lat) * f, lng: p.lng + (next.lng - p.lng) * f, cruise: next.cruise });
      }
    }
    const n = this.points.length;
    this.cum = new Float64Array(n);
    for (let i = 1; i < n; i++) this.cum[i] = this.cum[i - 1] + metersBetween(this.points[i - 1], this.points[i]);
    this.length = this.cum[n - 1] || 0;

    this.limit = new Float32Array(n).fill(1000);
    for (let i = 1; i < n - 1; i++) {
      let a = i, b = i;
      while (a > 0 && this.cum[i] - this.cum[a] < CURVE_WINDOW) a--;
      while (b < n - 1 && this.cum[b] - this.cum[i] < CURVE_WINDOW) b++;
      if (a === i || b === i) continue;
      const turn = Math.abs(((bearingBetween(this.points[i], this.points[b]) - bearingBetween(this.points[a], this.points[i]) + 540) % 360) - 180);
      if (turn > 1) this.limit[i] = Math.max(minSpeed, Math.sqrt(grip * ((this.cum[b] - this.cum[a]) / rad(turn))));
    }
    if (stopAtEnd) this.limit[n - 1] = 0;
    for (let i = n - 2; i >= 0; i--) {
      const ds = this.cum[i + 1] - this.cum[i];
      this.limit[i] = Math.min(this.limit[i], Math.sqrt(this.limit[i + 1] ** 2 + 2 * decel * ds));
    }
  }

  // The closest point on the line, searching forward from `from` (the last answer) so a route that doubles
  // back on itself doesn't make the car jump along it. No `from` searches everything.
  locate(lat, lng, from = null) {
    const here = { lat, lng };
    const start = from === null ? 0 : Math.max(0, from - 5);
    const end = from === null ? this.points.length : Math.min(this.points.length, from + 150);
    let index = start, best = Infinity;
    for (let i = start; i < end; i++) {
      const d = metersBetween(here, this.points[i]);
      if (d < best) { best = d; index = i; }
    }
    return { index, along: this.cum[index], dist: best };
  }

  // The point `along` metres from the start, with its direction of travel.
  pointAt(along) {
    const n = this.points.length;
    const i = Math.min(n - 1, Math.max(1, this.indexAt(along)));
    const a = this.points[i - 1], b = this.points[i];
    const span = this.cum[i] - this.cum[i - 1];
    const f = span ? Math.max(0, Math.min(1, (along - this.cum[i - 1]) / span)) : 1;
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, bearing: (bearingBetween(a, b) + 360) % 360 };
  }

  indexAt(along) {
    let lo = 0, hi = this.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] < along) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  limitAt(index) {
    return this.limit[index];
  }

  cruiseAt(index) {
    return this.points[index].cruise ?? Infinity;
  }
}
