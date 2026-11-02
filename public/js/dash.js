// Drawing for the dashboard: round gauges and the navigation screen, both on canvas.

// The speedometer's top mark: 200 until past 150, then larger so the needle stays at or under 3/4 of the dial.
// It only comes back down once the needle is well under the smaller dial, so it doesn't flicker.
const SPEED_RANGES = [200, 300, 400, 500];
export function speedRange(mph, current = 200) {
  let at = SPEED_RANGES.indexOf(current);
  if (at < 0) at = 0;
  while (at < SPEED_RANGES.length - 1 && mph > SPEED_RANGES[at] * 0.75) at++;
  while (at > 0 && mph < SPEED_RANGES[at - 1] * 0.6) at--;
  return SPEED_RANGES[at];
}
export const speedStep = (max) => (max <= 300 ? 50 : 100);

// Tachometers end on a round thousand above the redline.
export const revRange = (redline) => Math.ceil(redline / 1000) * 1000;

// Where a point east/north of the car appears on a heading-up screen, in metres right of and up from the car.
export function headingUp(east, north, heading) {
  const a = (heading * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return [east * cos - north * sin, east * sin + north * cos];
}

// Asking an element its size makes the browser lay out any pending changes, so it's asked once and again after a resize.
let sizes = new WeakMap();
if (typeof window !== 'undefined') window.addEventListener('resize', () => { sizes = new WeakMap(); });

function fit(canvas) {
  let size = sizes.get(canvas);
  if (!size) {
    size = { w: canvas.clientWidth, h: canvas.clientHeight };
    if (size.w) sizes.set(canvas, size);
  }
  const dpr = Math.min(devicePixelRatio || 1, 2), { w, h } = size;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// options: { value, max, step (between numbered marks), scale (divides the marks' numbers), redFrom, big, small }
export function drawGauge(canvas, { value, max, step, scale = 1, redFrom = null, big, small }) {
  const { ctx, w, h } = fit(canvas);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 3;
  const from = Math.PI * 0.75, sweep = Math.PI * 1.5;
  const angle = (v) => from + sweep * Math.min(1, Math.max(0, v / max));

  ctx.lineCap = 'butt';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff30';
  ctx.beginPath(); ctx.arc(cx, cy, r, from, from + sweep); ctx.stroke();
  if (redFrom !== null) {
    ctx.strokeStyle = '#ff5a48';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, r - 1, angle(redFrom), from + sweep); ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.max(8, r * 0.14)}px system-ui, sans-serif`;
  for (let v = 0; v <= max + 1e-6; v += step) {
    const a = angle(v), c = Math.cos(a), s = Math.sin(a);
    ctx.strokeStyle = redFrom !== null && v >= redFrom ? '#ff5a48' : '#ffffffb0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + c * (r - 2), cy + s * (r - 2)); ctx.lineTo(cx + c * (r - 9), cy + s * (r - 9)); ctx.stroke();
    ctx.fillStyle = '#c8d6e0';
    ctx.fillText(String(Math.round(v / scale)), cx + c * (r - 19), cy + s * (r - 19));
  }
  const a = angle(value);
  ctx.strokeStyle = '#5cf0c0';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8); ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `750 ${r * (big.length > 3 ? 0.3 : 0.42)}px system-ui, sans-serif`;
  ctx.fillText(big, cx, cy + r * 0.34);
  ctx.fillStyle = '#9baebb';
  ctx.font = `600 ${Math.max(8, r * 0.15)}px system-ui, sans-serif`;
  ctx.fillText(small, cx, cy + r * 0.68);
}

// The roads, drawn north-up on a canvas of their own that is turned and slid under the car each time the screen updates.
// A full redraw is thousands of lines, so it happens only when the car nears the edge of what's drawn, the range changes,
// or new roads have arrived.
const LAYER_MARGIN = 0.4;     // of the screen's height, drawn beyond the corners; the car travels this far between redraws
const LAYER_REFRESH = 3000;   // ms at the least between redraws just for newly arrived roads
const SKIP_MINOR_FROM = 3000; // m of range from which service roads are too small to matter
const MIN_STEP = 1.5;         // px; points closer than this along a road add nothing
let layer = null;

function roadLayer(roads, pos, { radius, scale, half, margin, dpr }) {
  const now = performance.now(), M = 111320;
  const moved = layer && Math.hypot((pos.lng - layer.lng) * layer.k, pos.lat - layer.lat) * M * scale;
  const fresh = layer && layer.radius === radius && layer.half === half && moved < margin && (layer.changes === roads.changes || now - layer.at < LAYER_REFRESH);
  if (fresh) return layer;
  const size = half * 2 * dpr;
  const canvas = layer?.canvas || document.createElement('canvas');
  if (canvas.width !== size) canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, half * 2, half * 2);
  const k = Math.cos((pos.lat * Math.PI) / 180);
  const minor = new Path2D(), major = new Path2D(), bridge = new Path2D();
  let vertices = 0;
  roads.forEachWayNear(pos.lat, pos.lng, half / scale, (way) => {
    if (way.f & 4 && radius >= SKIP_MINOR_FROM) return;
    const path = way.f & 1 ? bridge : way.f & 4 ? minor : major, c = way.c, last = c.length - 2;
    let px = 0, py = 0;
    for (let i = 0; i <= last; i += 2) {
      const x = half + (c[i + 1] - pos.lng) * k * M * scale, y = half - (c[i] - pos.lat) * M * scale;
      if (i && i < last && Math.abs(x - px) + Math.abs(y - py) < MIN_STEP) continue;
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
      px = x; py = y;
      vertices++;
    }
  });
  ctx.strokeStyle = '#ffffff1c'; ctx.lineWidth = 1; ctx.stroke(minor);
  ctx.strokeStyle = '#8fa6b880'; ctx.lineWidth = 1.2; ctx.stroke(major);
  ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.6; ctx.stroke(bridge);
  layer = { canvas, radius, half, k, lat: pos.lat, lng: pos.lng, changes: roads.changes, at: now, vertices };
  return layer;
}

// True while roads have come or gone that the screen hasn't drawn yet, which is held back a few seconds at a time.
export const navBehind = (roads) => !!layer && layer.changes !== roads.changes;

// The navigation screen: a map from very high up, drawn from the road data already loaded, so it adds no map charges.
// options: { roads, pos, heading, route, routeIndex, radius (m from the car to the top of the screen), parked (where the car is while on foot) }
export function drawNav(canvas, { roads, pos, heading, parked, route, routeIndex, radius, hour, clock }) {
  const { ctx, w, h } = fit(canvas);
  if (!w || !h) return; // a layout with no room for the screen
  ctx.fillStyle = '#0a1420';
  ctx.fillRect(0, 0, w, h);
  const carX = w / 2, carY = h * 0.68;
  const scale = (h * 0.68) / radius; // px per metre
  const k = Math.cos((pos.lat * Math.PI) / 180), M = 111320;
  const toScreen = (lat, lng) => {
    const [x, y] = headingUp((lng - pos.lng) * k * M, (lat - pos.lat) * M, heading);
    return [carX + x * scale, carY - y * scale];
  };

  const layer = roadLayer(roads, pos, { radius, scale, half: Math.ceil(Math.hypot(w / 2, h * 0.68) + h * LAYER_MARGIN), margin: h * LAYER_MARGIN, dpr: Math.min(devicePixelRatio || 1, 2) });
  ctx.save();
  ctx.translate(carX, carY);
  ctx.rotate((-heading * Math.PI) / 180);
  ctx.translate(-layer.half - (pos.lng - layer.lng) * layer.k * M * scale, -layer.half + (pos.lat - layer.lat) * M * scale);
  ctx.drawImage(layer.canvas, 0, 0, layer.half * 2, layer.half * 2);
  ctx.restore();

  if (route) {
    ctx.strokeStyle = '#2f9bff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const points = route.points;
    for (let i = routeIndex ?? 0, first = true; i < points.length; i += 4, first = false) {
      const [x, y] = toScreen(points[i].lat, points[i].lng);
      if (first) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      if (Math.hypot(x - carX, y - carY) > Math.hypot(w, h) * 1.5) break;
    }
    const end = points[points.length - 1];
    const [ex, ey] = toScreen(end.lat, end.lng);
    ctx.stroke();
    ctx.fillStyle = '#ff5a48';
    ctx.beginPath(); ctx.arc(Math.max(4, Math.min(w - 4, ex)), Math.max(4, Math.min(h - 4, ey)), 4, 0, Math.PI * 2); ctx.fill();
  }

  // A quiet clock face at the bottom left, under the destination, showing the game's time of day in the screen's own colours.
  const faceR = Math.min(33, h * 0.255), fx = faceR + 8, fy = h - faceR - 6;
  ctx.fillStyle = '#0a1420cc';
  ctx.beginPath(); ctx.arc(fx, fy, faceR + 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8fa6b880';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(fx, fy, faceR, 0, Math.PI * 2); ctx.stroke();
  const hand = (turns, length, width) => {
    const a = turns * Math.PI * 2;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.sin(a) * length, fy - Math.cos(a) * length); ctx.stroke();
  };
  ctx.strokeStyle = '#8fa6b8';
  ctx.lineCap = 'round';
  hand((hour % 12) / 12, faceR * 0.52, 1.6);
  hand(hour % 1, faceR * 0.8, 1.1);
  ctx.fillStyle = '#8fa6b8';
  ctx.font = '600 13.5px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(clock, fx + faceR + 8, fy);

  if (parked) {
    const [px, py] = toScreen(parked.lat, parked.lng);
    ctx.fillStyle = '#ffd27a';
    ctx.strokeStyle = '#0a1420';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(Math.max(5, Math.min(w - 5, px)), Math.max(5, Math.min(h - 5, py)), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // The car always points up, and the map turns under it. N shows which way north is.
  ctx.fillStyle = '#5cf0c0';
  ctx.strokeStyle = '#0a1420';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(carX, carY - 8); ctx.lineTo(carX - 6, carY + 6); ctx.lineTo(carX, carY + 3); ctx.lineTo(carX + 6, carY + 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  const [nx, ny] = headingUp(0, 1, heading);
  ctx.fillStyle = '#ff8a7a';
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', w - 15 + nx * 9, 15 - ny * 9);
  return layer.vertices;
}
