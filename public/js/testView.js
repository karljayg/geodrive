// Looks for judging weather and a ruined world. On only when the address has ?testview=
// (off, rain, snow, apocalypse, vines, cracks, ruin, or a comma list such as rain,cracks).
// The map is a photograph, so colour, rain and snow are drawn over it, cracks are drawn on
// the ground in this view, and vines are models standing on the map. None of it is solid,
// and indoors the overlay hides so a room stays clear of it.

import { buildPersonGlb } from './carModel.js';

const M_PER_DEG = 111320;
const EAST_SCALE = M_PER_DEG * Math.cos((38.95 * Math.PI) / 180);
const GRADES = ['rain', 'snow', 'apocalypse', 'vines', 'cracks'];

const VIEWS = {
  off: {},
  rain: { grade: 'rain', drops: 'rain' },
  snow: { grade: 'snow', drops: 'snow', litter: 'snow' },
  apocalypse: { grade: 'apocalypse', drops: 'ash', litter: 'ash', scratches: true },
  vines: { grade: 'vines', vines: true, litter: 'weeds' },
  cracks: { grade: 'cracks', cracks: true },
  ruin: { grade: 'apocalypse', drops: 'ash', litter: 'ash', scratches: true, vines: true, deadVines: true, cracks: true },
};

const BUTTONS = [
  ['off', 'Off', 'No treatment'],
  ['rain', 'Rain', 'Gloom and falling rain'],
  ['snow', 'Snow', 'Cold grade, flakes and snow on the ground'],
  ['apocalypse', 'Apocalypse', 'Dirty grade, ash, scratches'],
  ['vines', 'Vines', 'Green grade and plants on the map'],
  ['cracks', 'Cracks', 'Cracks drawn on the ground'],
  ['ruin', 'Ruin', 'Apocalypse, dead vines and cracks together'],
];

const WASH = {
  rain: 'rgba(22, 40, 62, 0.28)',
  snow: 'rgba(214, 228, 238, 0.22)',
  apocalypse: 'rgba(86, 52, 24, 0.18)',
  vines: 'rgba(28, 52, 16, 0.12)',
  cracks: 'rgba(18, 14, 10, 0.06)',
};

const VIGNETTE = {
  rain: 'rgba(6, 12, 20, 0.38)',
  snow: 'rgba(214, 226, 234, 0.2)',
  apocalypse: 'rgba(0, 0, 0, 0.58)',
  vines: 'rgba(8, 18, 4, 0.3)',
  cracks: 'rgba(0, 0, 0, 0.22)',
};

const LITTER = {
  snow: { cell: 9, chance: 0.45, r0: 0.05, r1: 0.16 },
  ash: { cell: 14, chance: 0.32, r0: 0.06, r1: 0.22 },
  weeds: { cell: 16, chance: 0.3, r0: 0.15, r1: 0.45 },
};

const DROP_COUNT = { rain: 460, snow: 420, ash: 200 };

const SCRATCHES = Array.from({ length: 16 }, (_, i) => ({
  x: hash2(i, 11), y: hash2(i, 12),
  dx: (hash2(i, 13) - 0.5) * 0.55, dy: (hash2(i, 14) - 0.5) * 0.12,
  w: 0.7 + hash2(i, 15), a: 0.045 + hash2(i, 16) * 0.08,
}));

function blank() {
  return { grade: null, drops: null, litter: null, scratches: false, vines: false, deadVines: false, cracks: false };
}

// Stable 0..1 from two integers, so a crack stays put as the car moves.
export function hash2(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function readTestView(search) {
  const params = new URLSearchParams(search);
  if (!params.has('testview')) return null;
  return resolveView(params.get('testview'));
}

export function resolveView(raw) {
  const names = String(raw ?? '').split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (names.length === 1 && VIEWS[names[0]]) return { name: names[0], ...blank(), ...VIEWS[names[0]] };
  const out = blank();
  out.name = names.length ? names.join(',') : 'off';
  for (const name of names) {
    const part = VIEWS[name];
    if (!part) continue;
    if (part.grade) out.grade = part.grade;
    if (part.drops) out.drops = part.drops;
    if (part.litter) out.litter = part.litter;
    out.scratches ||= !!part.scratches;
    out.vines ||= !!part.vines;
    out.deadVines ||= !!part.deadVines;
    out.cracks ||= !!part.cracks;
  }
  return out;
}

export function worldMetres(lat, lng) {
  return { east: lng * EAST_SCALE, north: lat * M_PER_DEG };
}

export function worldLatLng(east, north) {
  return { lat: north / M_PER_DEG, lng: east / EAST_SCALE };
}

// ahead: metres in front of the viewer along the camera heading. side: metres to the right.
export function toCamera(east, north, headingDeg) {
  const h = (headingDeg * Math.PI) / 180;
  return { ahead: east * Math.sin(h) + north * Math.cos(h), side: east * Math.cos(h) - north * Math.sin(h) };
}

// Where a point on the ground falls on screen. Same framing as the chase camera: tilt 0 looks straight down.
export function groundOnScreen(ahead, side, view) {
  const { width, height, tilt, range, fovY, below } = view;
  const fov = (fovY * Math.PI) / 180, t = (tilt * Math.PI) / 180;
  const f = 1 / Math.tan(fov / 2);
  const denom = f * Math.cos(t) + below * Math.sin(t);
  if (!(denom > 0.05) || !(range > 1)) return null;
  const lead = (below * range) / denom;
  const scale = height / (2 * Math.tan(fov / 2));
  const fromCentre = ahead - lead;
  const depth = range + fromCentre * Math.sin(t);
  if (depth < range * 0.15) return null;
  return {
    x: width / 2 + (scale * side) / depth,
    y: height * 0.5 - (scale * fromCentre * Math.cos(t)) / depth,
    perMetre: scale / depth,
  };
}

// How far to build ground detail so the whole view, and a margin past it, is already filled.
// The horizon is the top of the picture. A ring that ends on screen shows up there as you drive.
export function groundReach(view) {
  const { width, height, tilt, range, fovY, below } = view;
  const fov = (fovY * Math.PI) / 180, t = (tilt * Math.PI) / 180, k = Math.tan(fov / 2);
  const denom = (1 / k) * Math.cos(t) + below * Math.sin(t);
  if (!(denom > 0.05) || !(range > 1) || !(height > 1)) return 500;
  const lead = (below * range) / denom, scale = height / (2 * k);
  const distanceAt = (x, y) => {
    const dy = height / 2 - y;
    const div = scale * Math.cos(t) - dy * Math.sin(t);
    if (!(div > 1)) return 900;
    const fromCentre = (dy * range) / div;
    const depth = range + fromCentre * Math.sin(t);
    if (!(depth > 1)) return null;
    return Math.hypot(fromCentre + lead, ((x - width / 2) * depth) / scale);
  };
  const far = Math.max(120, distanceAt(width / 2, 2) || 0, distanceAt(2, 2) || 0, distanceAt(width - 2, 2) || 0, distanceAt(width / 2, height * 0.2) || 0);
  return Math.min(1000, far * 1.5);
}

export function crackPaths(lat, lng, reach = 150) {
  const here = worldMetres(lat, lng), cell = 14;
  const span = Math.ceil(reach / cell);
  const ix = Math.floor(here.east / cell), iy = Math.floor(here.north / cell);
  const paths = [];
  for (let y = iy - span; y <= iy + span; y++) {
    for (let x = ix - span; x <= ix + span; x++) {
      if (hash2(x, y) > 0.34) continue;
      const ox = x * cell, oy = y * cell;
      if (Math.hypot(ox + cell / 2 - here.east, oy + cell / 2 - here.north) > reach) continue;
      paths.push(crackLine(x, y, ox, oy, cell));
      if (hash2(x + 5, y - 4) < 0.22) paths.push(crackLine(x + 90, y - 70, ox + cell * 0.4, oy + cell * 0.35, cell * 0.55));
    }
  }
  return paths;
}

function crackLine(x, y, ox, oy, cell) {
  const pts = [];
  let px = ox + cell * (0.12 + hash2(x, y + 1) * 0.76);
  let py = oy + cell * (0.12 + hash2(x + 1, y) * 0.76);
  const n = 4 + Math.floor(hash2(x + 2, y + 2) * 2);
  for (let i = 0; i <= n; i++) {
    pts.push({ east: px, north: py });
    const ang = hash2(x + i * 3, y - i) * Math.PI * 2;
    const step = cell * (0.14 + hash2(x - i, y + i * 2) * 0.1);
    px += Math.cos(ang) * step;
    py += Math.sin(ang) * step;
  }
  return { pts, width: 0.04 + hash2(x - 4, y + 6) * 0.07 };
}

export function vinePlaces(lat, lng, reach = 600, cap = 100) {
  const here = worldMetres(lat, lng), cell = 70;
  const span = Math.ceil(reach / cell);
  const ix = Math.floor(here.east / cell), iy = Math.floor(here.north / cell);
  const spots = [];
  for (let y = iy - span; y <= iy + span; y++) {
    for (let x = ix - span; x <= ix + span; x++) {
      const rank = hash2(x, y);
      if (rank > 0.2) continue;
      const east = x * cell + cell * (0.2 + hash2(x + 9, y) * 0.6);
      const north = y * cell + cell * (0.2 + hash2(x, y + 9) * 0.6);
      const dist = Math.hypot(east - here.east, north - here.north);
      if (dist < 8 || dist > reach) continue;
      spots.push({
        id: `${x},${y}`,
        ...worldLatLng(east, north),
        kind: hash2(x + 2, y + 2) < 0.4 ? 'vine' : 'bush',
        scale: 0.26 + hash2(x + 4, y - 3) * 0.28,
        heading: hash2(y, x) * 360,
        dist,
        rank,
      });
    }
  }
  // Which cells have a plant never depends on where you stand, so driving does not reshuffle them.
  if (spots.length > cap) {
    spots.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
    spots.length = cap;
  }
  return spots;
}

export function litterSpecks(lat, lng, kind, reach = 400) {
  const spec = LITTER[kind];
  if (!spec) return [];
  const here = worldMetres(lat, lng), { cell, chance, r0, r1 } = spec;
  const span = Math.ceil(reach / cell);
  const ix = Math.floor(here.east / cell), iy = Math.floor(here.north / cell);
  const specks = [];
  for (let y = iy - span; y <= iy + span; y++) {
    for (let x = ix - span; x <= ix + span; x++) {
      const h = hash2(x, y + 17);
      if (h > chance) continue;
      const east = x * cell + cell * hash2(x + 3, y);
      const north = y * cell + cell * hash2(x, y - 3);
      if (Math.hypot(east - here.east, north - here.north) > reach) continue;
      specks.push({ east, north, r: r0 + hash2(x - 2, y + 8) * (r1 - r0), tint: hash2(x + 6, y + 1) });
    }
  }
  return specks;
}

function litterColor(kind, tint) {
  if (kind === 'snow') return `rgba(255,255,255,${0.3 + tint * 0.4})`;
  if (kind === 'weeds') return `rgba(${18 + tint * 24},${78 + tint * 40},${16},${0.13 + tint * 0.1})`;
  return `rgba(${36 + tint * 28},${28 + tint * 12},${20},${0.22 + tint * 0.28})`;
}

export function makeDrops(kind, width, height, rand = Math.random) {
  const n = DROP_COUNT[kind] || 0;
  const drops = [];
  for (let i = 0; i < n; i++) drops.push(makeDrop(kind, width, height, rand, true));
  return drops;
}

function makeDrop(kind, width, height, rand, anywhere) {
  const x = rand() * width, y = anywhere ? rand() * height : -rand() * 36;
  if (kind === 'snow') return { x, y, r: 0.35 + rand() * 0.75, s: 16 + rand() * 32, phase: rand() * Math.PI * 2, wobble: 0.4 + rand() };
  if (kind === 'ash') return { x, y, r: 0.3 + rand() * 0.7, s: 8 + rand() * 22, drift: (rand() - 0.5) * 16, a: 0.18 + rand() * 0.35 };
  return { x, y, len: 5 + rand() * 9, s: 700 + rand() * 800, slant: 1.2 + rand() * 3.2, w: 0.6 };
}

export function stepDrops(drops, dt, width, height, kind, rand = Math.random) {
  for (const drop of drops) {
    if (kind === 'snow') {
      drop.phase += dt * drop.wobble;
      drop.y += drop.s * dt;
      drop.x += Math.sin(drop.phase) * 10 * dt;
    } else if (kind === 'ash') {
      drop.y += drop.s * dt;
      drop.x += drop.drift * dt;
    } else {
      drop.y += drop.s * dt;
      drop.x += drop.slant * 8 * dt;
    }
    if (drop.y > height + 20 || drop.x < -40 || drop.x > width + 40) {
      drop.y = -10 - rand() * 28;
      drop.x = rand() * width;
    }
  }
  return drops;
}

function addBall(part, cx, cy, cz, r, rings, sides) {
  const point = (a, b) => {
    const st = Math.sin(a), ct = Math.cos(a), sp = Math.sin(b), cp = Math.cos(b);
    return [cx + st * cp * r, cy + st * sp * r, cz + ct * r, st * cp, st * sp, ct];
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a0 = (i / rings) * Math.PI, a1 = ((i + 1) / rings) * Math.PI;
      const b0 = (j / sides) * Math.PI * 2, b1 = ((j + 1) / sides) * Math.PI * 2;
      for (const [a, b] of [[a0, b0], [a1, b0], [a1, b1], [a0, b0], [a1, b1], [a0, b1]]) {
        const p = point(a, b);
        part.pos.push(p[0], p[1], p[2]);
        part.nor.push(p[3], p[4], p[5]);
      }
    }
  }
}

// Scale 1 is a clump a few metres across, or a vine about 9 m tall. Big on purpose: the chase camera sits far back.
export function plantParts(kind, dead) {
  const leaf = dead ? [0.32, 0.34, 0.16] : [0.22, 0.62, 0.16];
  const dark = dead ? [0.24, 0.26, 0.12] : [0.1, 0.4, 0.1];
  const wood = [0.28, 0.18, 0.1];
  if (kind === 'vine') {
    const stem = { pos: [], nor: [], colour: wood }, leaves = { pos: [], nor: [], colour: dead ? dark : leaf };
    for (let i = 0; i < 9; i++) {
      const z = 0.4 + i * 1.05;
      const x = Math.sin(i * 1.15) * 0.7, y = Math.cos(i * 0.9) * 0.55;
      addBall(stem, x * 0.65, y * 0.65, z, 0.14 + (8 - i) * 0.02, 4, 6);
      addBall(leaves, x, y, z + 0.2, i % 2 ? 0.55 : 0.85, 4, 6);
    }
    return [stem, leaves];
  }
  const a = { pos: [], nor: [], colour: leaf }, b = { pos: [], nor: [], colour: dark };
  addBall(a, 0, 0, 1.5, 2.1, 5, 7);
  addBall(a, 1.7, 0.6, 1.1, 1.45, 4, 6);
  addBall(a, -1.5, 0.5, 1.05, 1.35, 4, 6);
  addBall(b, 0.3, -1.6, 0.9, 1.25, 4, 6);
  return [a, b];
}

function projectList(here, heading, view, points) {
  const out = [];
  for (const point of points) {
    const cam = toCamera(point.east - here.east, point.north - here.north, heading);
    const at = groundOnScreen(cam.ahead, cam.side, view);
    if (!at || at.x < -120 || at.x > view.width + 120 || at.y < -120 || at.y > view.height + 120) out.push(null);
    else out.push(at);
  }
  return out;
}

function paint(ctx, spec, view, drops, paths, specks) {
  const { width, height } = view;
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  if (spec.grade && WASH[spec.grade]) {
    ctx.fillStyle = WASH[spec.grade];
    ctx.fillRect(0, 0, width, height);
  }
  if (spec.drops === 'snow' || spec.drops === 'rain' || spec.drops === 'ash') {
    const g = ctx.createLinearGradient(0, 0, 0, height * 0.55);
    const haze = spec.drops === 'snow' ? 'rgba(230,238,244,0.34)' : spec.drops === 'ash' ? 'rgba(72,48,28,0.28)' : 'rgba(18,28,40,0.22)';
    g.addColorStop(0, haze);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height * 0.55);
  }
  const here = worldMetres(view.lat, view.lng);
  const flat = Math.max(0.18, Math.cos((view.tilt * Math.PI) / 180));
  const onView = (east, north) => {
    const cam = toCamera(east - here.east, north - here.north, view.heading);
    if (cam.ahead < -40) return null;
    if (Math.abs(cam.side) > 70 + Math.max(cam.ahead, 0) * 0.85) return null;
    return cam;
  };
  if (specks.length) {
    for (const speck of specks) {
      if (!onView(speck.east, speck.north)) continue;
      const [at] = projectList(here, view.heading, view, [speck]);
      if (!at) continue;
      ctx.fillStyle = litterColor(spec.litter, speck.tint);
      const rx = at.perMetre * speck.r;
      if (rx < 0.3) continue;
      const draw = Math.min(1.7, rx);
      ctx.beginPath();
      ctx.ellipse(at.x, at.y, draw, Math.max(0.3, draw * flat), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (paths.length) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const path of paths) {
      const head = path.pts[0], tail = path.pts[path.pts.length - 1];
      if (!onView(head.east, head.north) && !onView(tail.east, tail.north)) continue;
      const pts = projectList(here, view.heading, view, path.pts);
      const sample = pts.find(Boolean);
      if (!sample) continue;
      const px = Math.min(1.6, Math.max(0.4, sample.perMetre * path.width));
      ctx.strokeStyle = 'rgba(12,10,8,0.75)';
      ctx.lineWidth = px;
      ctx.beginPath();
      let on = false, any = false;
      for (const point of pts) {
        if (!point) { on = false; continue; }
        if (on) ctx.lineTo(point.x, point.y);
        else ctx.moveTo(point.x, point.y);
        on = true;
        any = true;
      }
      if (any) ctx.stroke();
    }
  }
  const edge = spec.grade && VIGNETTE[spec.grade];
  if (edge) {
    const g = ctx.createRadialGradient(width / 2, height * 0.45, height * 0.2, width / 2, height * 0.45, height * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, edge);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  if (spec.scratches) {
    ctx.strokeStyle = 'rgba(255,244,220,0.14)';
    for (const line of SCRATCHES) {
      ctx.globalAlpha = line.a;
      ctx.lineWidth = line.w;
      ctx.beginPath();
      ctx.moveTo(line.x * width, line.y * height);
      ctx.lineTo((line.x + line.dx) * width, (line.y + line.dy) * height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 48; i++) {
      ctx.fillStyle = `rgba(40,32,24,${0.04 + Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
    }
  }
  if (spec.drops === 'rain') {
    ctx.strokeStyle = 'rgba(226,236,246,0.55)';
    ctx.lineCap = 'butt';
    for (const drop of drops) {
      ctx.lineWidth = drop.w;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + drop.slant * 0.35, drop.y + drop.len);
      ctx.stroke();
    }
  } else if (spec.drops === 'snow') {
    for (const drop of drops) {
      ctx.fillStyle = `rgba(255,255,255,${0.45 + drop.r})`;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (spec.drops === 'ash') {
    for (const drop of drops) {
      ctx.fillStyle = `rgba(70,58,44,${drop.a})`;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function mountTestView({ canvas, bar, box, view, search }) {
  const initial = readTestView(search ?? location.search);
  if (!initial) return { tick() {}, attach() {} };
  let spec = initial;
  let map = null, maps3d = null, glbUrl = null, attached = false;
  let drops = [], dropKind = '', sized = '';
  let pathKey = '', paths = [], speckKey = '', specks = [];
  let plantKey = '', look = '', queue = [];
  const plants = new Map(), kinds = new Map();
  let bushUrl = '', vineUrl = '';

  bar.replaceChildren();
  const title = document.createElement('span');
  title.textContent = 'Test view';
  bar.append(title);
  const buttons = BUTTONS.map(([name, label, hint]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.view = name;
    button.textContent = label;
    button.title = hint;
    button.addEventListener('click', () => { setMode(name); button.blur(); });
    bar.append(button);
    return button;
  });
  bar.hidden = false;
  bar.classList.add('open');
  bar.title = 'Switch the look without reloading. The address can also be ?testview=snow, rain, apocalypse, vines, cracks or ruin.';
  apply(spec);

  function pressed() {
    const names = new Set(String(spec.name || '').split(','));
    for (const button of buttons) button.setAttribute('aria-pressed', String(names.has(button.dataset.view)));
  }

  function apply(next) {
    spec = next;
    document.body.classList.remove(...GRADES.map((grade) => `tv-${grade}`));
    if (spec.grade) document.body.classList.add(`tv-${spec.grade}`);
    pressed();
    if (!spec.vines) clearPlants();
    else plantKey = '';
  }

  function setMode(name) {
    const url = new URL(location.href);
    url.searchParams.set('testview', name);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    apply(resolveView(name));
  }

  function clearPlants() {
    for (const element of plants.values()) element.remove();
    plants.clear();
    kinds.clear();
    queue = [];
    plantKey = '';
  }

  function urls() {
    const dead = !!spec.deadVines;
    if (look === (dead ? 'dead' : 'live') && bushUrl) return;
    look = dead ? 'dead' : 'live';
    bushUrl = glbUrl(buildPersonGlb(plantParts('bush', dead)));
    vineUrl = glbUrl(buildPersonGlb(plantParts('vine', dead)));
    for (const [element, kind] of kinds) element.src = kind === 'vine' ? vineUrl : bushUrl;
  }

  function syncPlants(at) {
    if (!spec.vines || !map || !maps3d?.Model3DElement || !glbUrl) return;
    urls();
    const spots = vinePlaces(at.lat, at.lng, groundReach(at));
    const key = spots.map((spot) => spot.id).join('|');
    if (key !== plantKey) {
      plantKey = key;
      const keep = new Set(spots.map((spot) => spot.id));
      for (const [id, element] of plants) {
        if (keep.has(id)) continue;
        element.remove();
        plants.delete(id);
        kinds.delete(element);
      }
      queue = spots.filter((spot) => !plants.has(spot.id));
    }
    for (let n = 0; n < 12 && queue.length; n++) {
      const place = queue.shift();
      const element = new maps3d.Model3DElement({
        position: { lat: place.lat, lng: place.lng, altitude: 0 },
        altitudeMode: 'RELATIVE_TO_GROUND',
        orientation: { heading: place.heading, tilt: 0, roll: 0 },
        scale: place.scale,
      });
      element.src = place.kind === 'vine' ? vineUrl : bushUrl;
      map.append(element);
      plants.set(place.id, element);
      kinds.set(element, place.kind);
    }
  }

  function tick(dt) {
    if (!attached) return;
    const at = view();
    const show = !at.indoors && (spec.drops || spec.cracks || spec.litter || spec.scratches || spec.grade);
    canvas.style.display = show ? 'block' : 'none';
    const width = Math.max(1, box().clientWidth), height = Math.max(1, box().clientHeight);
    const frame = { ...at, width, height };
    syncPlants(frame);
    if (!show) return;
    const size = `${width}x${height}`;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (dropKind !== spec.drops || sized !== size) {
      dropKind = spec.drops || '';
      sized = size;
      drops = spec.drops ? makeDrops(spec.drops, width, height) : [];
    } else if (drops.length) stepDrops(drops, dt, width, height, spec.drops);
    const here = worldMetres(at.lat, at.lng);
    const reach = groundReach(frame);
    const step = Math.max(70, reach * 0.18);
    const bucket = `${Math.round(here.east / step)}|${Math.round(here.north / step)}|${Math.round(reach / 40)}`;
    if (spec.cracks) {
      const key = `c|${bucket}`;
      if (key !== pathKey) { pathKey = key; paths = crackPaths(at.lat, at.lng, reach); }
    } else { pathKey = ''; paths = []; }
    if (spec.litter) {
      const key = `${spec.litter}|${bucket}`;
      if (key !== speckKey) { speckKey = key; specks = litterSpecks(at.lat, at.lng, spec.litter, reach); }
    } else { speckKey = ''; specks = []; }
    paint(canvas.getContext('2d'), spec, frame, drops, paths, specks);
  }

  return {
    tick,
    attach(api) {
      map = api.map;
      maps3d = api.maps3d;
      glbUrl = api.glbUrl;
      attached = true;
    },
  };
}
