// A line for the car to drive along, with the fastest safe speed at every point on it: slower for tight curves,
// and braking early enough to reach them. Corners are rounded into arcs that clip the inside. Used for navigation routes and for signalled turns. Pure, tested in node.

const M_PER_DEG = 111320;
const SPACING = 8;      // m between points, so curve speeds don't depend on how sparse the source line is
const DEFAULT_CRUISE = 15; // m/s, for ETAs where a route gives no speed
const SIMPLIFY = 1.5;   // m; bends smaller than this are mapping noise, and a corner drawn as several short pieces becomes one
const MERGE_WITHIN = 15; // m apart that bends count as one corner
const APEX_CUT = 5;     // m a corner's arc passes inside the mapped corner
const ARC_STEP = 2.5;   // m between points on an arc
const LANE_MARGIN = 3;  // m the car's lane can sit inside the mapped line, which tightens the arc it really drives
const AIM_AHEAD = 0.2;  // s the speed plan looks ahead, so braking is under way when the limit arrives
const BRAKE_GAIN = 6;   // m/s² per m/s over the target
const DRAW_EVERY = 6;   // on straights, one point in this many is kept when drawing the line
const DRAW_EVERY_ARC = 2; // and on corners, where they are closer together
const rad = (d) => (d * Math.PI) / 180;
const metersBetween = (a, b) => Math.hypot((b.lng - a.lng) * Math.cos(rad(a.lat)), b.lat - a.lat) * M_PER_DEG;
const bearingBetween = (a, b) => (Math.atan2((b.lng - a.lng) * Math.cos(rad(a.lat)), b.lat - a.lat) * 180) / Math.PI;

// Metres east and north from a to b.
const offset = (a, b) => [(b.lng - a.lng) * Math.cos(rad(a.lat)) * M_PER_DEG, (b.lat - a.lat) * M_PER_DEG];

function offLine(p, a, b) {
  const [bx, by] = offset(a, b), [px, py] = offset(a, p);
  const f = Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by || 1)));
  return Math.hypot(px - bx * f, py - by * f);
}

// Douglas-Peucker. Keeps every change of cruise speed, because each point's cruise covers the stretch leading to it.
// Uses its own stack, because a route across a country is too many points to recurse over.
function simplify(points) {
  const keep = new Uint8Array(points.length);
  const last = points.length - 1;
  keep[0] = keep[last] = 1;
  const stack = [];
  for (let i = 1, from = 0; i <= last; i++) {
    if (i < last && points[i].cruise === points[i + 1].cruise) continue;
    keep[i] = 1;
    stack.push([from, i]);
    from = i;
  }
  while (stack.length) {
    const [from, to] = stack.pop();
    let worst = SIMPLIFY, at = -1;
    for (let i = from + 1; i < to; i++) {
      const d = offLine(points[i], points[from], points[to]);
      if (d > worst) { worst = d; at = i; }
    }
    if (at < 0) continue;
    keep[at] = 1;
    stack.push([from, at], [at, to]);
  }
  return points.filter((_, i) => keep[i]);
}

// Each step of a route starts on the point the last one ended on. A zero-length piece has no direction, so it would lose the corner.
const dropRepeats = (points) => points.filter((p, i) => i === 0 || metersBetween(points[i - 1], p) > 0.01);

// A junction is often mapped as two or three bends a few metres apart. Each would get its own tiny arc, so pairs
// turning the same way are replaced by the single corner where the lines either side of them meet.
function mergeBends(source) {
  const points = source.slice();
  for (let i = 1; i < points.length - 2; i++) {
    const p = points[i], q = points[i + 1];
    const [sx, sy] = offset(p, q);
    if (Math.hypot(sx, sy) > MERGE_WITHIN) continue;
    const [ax, ay] = offset(points[i - 1], p), [bx, by] = offset(q, points[i + 2]);
    const crossIn = ax * sy - ay * sx, crossOut = sx * by - sy * bx, cross = ax * by - ay * bx;
    if (crossIn * crossOut <= 0 || Math.abs(cross) < 1e-6) continue;
    const f = (sx * by - sy * bx) / cross; // metres along the incoming line, as a share of its length, from p
    const x = ax * f, y = ay * f;
    if (f < 0 || Math.hypot(x, y) > MERGE_WITHIN) continue;
    points.splice(i, 2, { ...q, lat: p.lat + y / M_PER_DEG, lng: p.lng + x / (M_PER_DEG * Math.cos(rad(p.lat))) });
    i = Math.max(0, i - 2); // the new corner may pair with the one before it
  }
  return points;
}

// Replaces each corner with a circular arc, each point marked with its radius. The arc is as wide as APEX_CUT and
// the neighbouring corners allow, so a 90 degree junction clips its apex and a long bend keeps its own shape.
function roundCorners(given) {
  const source = dropRepeats(given);
  const points = source.length > 2 ? mergeBends(simplify(source)) : source;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const v = points[i], cruise = v.cruise;
    const [ax, ay] = offset(points[i - 1], v), [bx, by] = offset(v, points[i + 1]);
    const inLen = Math.hypot(ax, ay), outLen = Math.hypot(bx, by);
    const ux = ax / inLen, uy = ay / inLen, wx = bx / outLen, wy = by / outLen;
    const cross = ux * wy - uy * wx;
    const turn = Math.atan2(Math.abs(cross), ux * wx + uy * wy);
    if (turn < rad(1) || turn > rad(170)) {
      out.push(turn < rad(1) ? v : { ...v, radius: 0 }); // nearly straight, or a U-turn no arc fits
      continue;
    }
    const half = Math.tan(turn / 2);
    const radius = Math.min(APEX_CUT / (1 / Math.cos(turn / 2) - 1), Math.min(inLen, outLen) / 2 / half);
    const steps = Math.max(1, Math.ceil((radius * turn) / ARC_STEP));
    const nx = cross > 0 ? -uy : uy, ny = cross > 0 ? ux : -ux; // towards the inside of the corner
    const toLng = M_PER_DEG * Math.cos(rad(v.lat));
    for (let s = 0; s <= steps; s++) {
      const a = (turn * s) / steps;
      const along = radius * Math.sin(a) - radius * half, across = radius * (1 - Math.cos(a));
      out.push({ lat: v.lat + (uy * along + ny * across) / M_PER_DEG, lng: v.lng + (ux * along + nx * across) / toLng, cruise, radius });
    }
  }
  if (points.length > 1) out.push(points[points.length - 1]);
  return out;
}

// Ms to wait before asking for another new route, each of which is billed, after `recent` in a row. A car that
// can't stay on its route would otherwise pay every few seconds for as long as it drives.
export const rerouteWait = (recent) => Math.min(300000, 8000 * 2 ** recent);

// How hard to brake to get down to a target speed.
export const brakeFor = (speed, target) => (speed > target + 0.3 ? Math.min(40, (speed - target) * BRAKE_GAIN) : 0);

// Yaw in rad/s that carries a car along a circle through a point `dist` metres away, `errorDeg` off its heading.
export const pursuitYaw = (speed, errorDeg, dist) => (2 * speed * Math.sin(rad(errorDeg))) / Math.max(dist, 1);

export class Path {
  // points: [{ lat, lng, cruise? }] where cruise is the usual speed there in m/s. stopAtEnd: slow to a stop at the last point.
  constructor(source, { stopAtEnd = false, grip = 9, decel = 12, minSpeed = 6 } = {}) {
    this.points = [];
    const points = roundCorners(source);
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

    // Seconds from each point to the end at its cruise speed, for the ETA.
    this.secondsToEnd = new Float64Array(n);
    for (let i = n - 2; i >= 0; i--) this.secondsToEnd[i] = this.secondsToEnd[i + 1] + (this.cum[i + 1] - this.cum[i]) / (this.points[i + 1].cruise || DEFAULT_CRUISE);

    this.limit = new Float32Array(n).fill(1000);
    for (let i = 0; i < n; i++) {
      const r = this.points[i].radius;
      if (r !== undefined) this.limit[i] = Math.max(minSpeed, Math.sqrt(grip * Math.max(0, r - LANE_MARGIN)));
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
    // Slide along the segments either side, so distance along changes smoothly rather than a point at a time.
    let along = this.cum[index];
    const p = this.points[index], [hx, hy] = offset(p, here);
    const q = this.points[index + 1] || this.points[index - 1];
    if (q) {
      const [dx, dy] = offset(p, q), span = Math.hypot(dx, dy) || 1, side = this.points[index + 1] ? 1 : -1;
      const f = (hx * dx + hy * dy) / span;
      const prev = this.points[index - 1];
      if (f > 0) along += side * Math.min(f, span);
      else if (prev && side > 0) {
        const [bx, by] = offset(p, prev), back = Math.hypot(bx, by) || 1;
        along -= Math.max(0, Math.min((hx * bx + hy * by) / back, back));
      }
    }
    return { index, along, dist: best };
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

  // The speed to be doing now: the lowest limit from here to a moment ahead, so it brakes ahead of a corner and
  // only accelerates once clear of it.
  targetAt(along, speed) {
    const end = this.indexAt(along + Math.max(0, speed) * AIM_AHEAD);
    let target = Infinity;
    for (let i = this.indexAt(along); i <= end; i++) target = Math.min(target, this.limit[i]);
    return target;
  }

  // A light copy of the line for `metres` ahead of a point, for drawing: sparse on the straights, closer on corners.
  lineAhead(index, metres) {
    const line = [], end = this.cum[index] + metres;
    for (let i = index; i < this.points.length && this.cum[i] <= end; i++) {
      const p = this.points[i];
      const kept = i === index || i === this.points.length - 1 || (i - index) % (p.radius !== undefined ? DRAW_EVERY_ARC : DRAW_EVERY) === 0;
      if (kept) line.push({ lat: p.lat, lng: p.lng });
    }
    return line;
  }

  limitAt(index) {
    return this.limit[index];
  }

  cruiseAt(index) {
    return this.points[index].cruise ?? Infinity;
  }
}
