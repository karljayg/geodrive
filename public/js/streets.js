// Where street names go on a map: along a road, only where the whole name fits on a straight enough stretch
// and clear of everything else. Anything that doesn't fit is left off. Pure, no DOM, so test/streets.test.mjs can run it.

const STEP = 24;        // px between the places tried along a road, counted from its start so a label holds still as the map moves
const MAX_BEND = 3;     // px a road may stray from a straight line under its name
const PADDING = 6;      // px of road beyond the text
const EDGE = 8;         // px kept clear of the screen's edge
const CLEARANCE = 7;    // px around the line of a label, about half the text's height
const MAX_LABELS = 24;  // so a dense city can't take the whole screen, or the frame

const LAST_WORDS = { Street: 'St', Road: 'Rd', Avenue: 'Ave', Boulevard: 'Blvd', Drive: 'Dr', Lane: 'Ln', Court: 'Ct', Place: 'Pl', Parkway: 'Pkwy', Highway: 'Hwy', Circle: 'Cir', Terrace: 'Ter', Square: 'Sq', Trail: 'Trl', Turnpike: 'Tpke', Expressway: 'Expy' };
const FIRST_WORDS = { North: 'N', South: 'S', East: 'E', West: 'W', Northeast: 'NE', Northwest: 'NW', Southeast: 'SE', Southwest: 'SW' };

// The usual short form, for a name too long to fit in full. "West Street" stays a street called West: it becomes "West St".
export function shortName(name) {
  const words = name.split(' '), last = words.length - 1;
  if (last > 0 && LAST_WORDS[words[last]]) words[last] = LAST_WORDS[words[last]];
  if (last > 1 && FIRST_WORDS[words[0]]) words[0] = FIRST_WORDS[words[0]];
  return words.join(' ');
}

const clearOf = (dots, placed, avoid) => dots.every(([x, y]) =>
  placed.every((other) => other.every(([ox, oy]) => Math.hypot(x - ox, y - oy) >= CLEARANCE * 2))
  && avoid.every((spot) => Math.hypot(x - spot.x, y - spot.y) >= CLEARANCE + spot.r));

// The screen line of a road with the distance along it at each point, or null if none of it is on screen.
function trace(c, toScreen, w, h) {
  const points = [], along = [];
  let seen = false;
  for (let i = 0; i < c.length; i += 2) {
    const point = toScreen(c[i], c[i + 1]);
    seen ||= point[0] >= 0 && point[0] <= w && point[1] >= 0 && point[1] <= h;
    along.push(i ? along[along.length - 1] + Math.hypot(point[0] - points[points.length - 1][0], point[1] - points[points.length - 1][1]) : 0);
    points.push(point);
  }
  return seen ? { points, along } : null;
}

function pointAlong({ points, along }, s) {
  let i = 1;
  while (i < along.length - 1 && along[i] < s) i++;
  const f = (s - along[i - 1]) / ((along[i] - along[i - 1]) || 1);
  return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f];
}

// True if the road between these two distances runs close enough to the straight line between them.
function straightBetween({ points, along }, from, to, a, b) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 0; i < points.length; i++) {
    if (along[i] <= from || along[i] >= to) continue;
    if (Math.abs((points[i][0] - a[0]) * (b[1] - a[1]) - (points[i][1] - a[1]) * (b[0] - a[0])) / length > MAX_BEND) return false;
  }
  return true;
}

// The spot nearest the middle of the screen where a text this wide fits on one of these roads.
function bestSpot(roads, width, { w, h, placed, avoid }) {
  const need = width + PADDING;
  let best = null;
  for (const road of roads) {
    const length = road.along[road.along.length - 1];
    for (let s = need / 2; s <= length - need / 2; s += STEP) {
      const a = pointAlong(road, s - need / 2), b = pointAlong(road, s + need / 2);
      if (Math.min(a[0], b[0]) < EDGE || Math.max(a[0], b[0]) > w - EDGE || Math.min(a[1], b[1]) < EDGE || Math.max(a[1], b[1]) > h - EDGE) continue;
      const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2, away = Math.hypot(x - w / 2, y - h / 2);
      if (best && away >= best.away) continue;
      if (!straightBetween(road, s - need / 2, s + need / 2, a, b)) continue;
      const count = Math.max(2, Math.ceil(need / CLEARANCE) + 1);
      const dots = Array.from({ length: count }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (count - 1), a[1] + ((b[1] - a[1]) * i) / (count - 1)]);
      if (!clearOf(dots, placed, avoid)) continue;
      best = { x, y, away, dots, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
  }
  return best;
}

// lines: [{ name, rank, c: [lat, lng, ...] }], lower ranks being bigger roads, which choose first.
// options: { w, h, toScreen (lat, lng) -> [x, y], measure (text) -> px, avoid: [{ x, y, r }] }.
// Returns [{ text, x, y, angle }] with angle in radians and never upside down. A street is named once.
export function placeStreetLabels(lines, { w, h, toScreen, measure, avoid = [] }) {
  const streets = new Map();
  for (const line of lines) {
    const street = streets.get(line.name);
    if (street) { street.lines.push(line); street.rank = Math.min(street.rank, line.rank); }
    else streets.set(line.name, { name: line.name, rank: line.rank, lines: [line] });
  }
  const order = [...streets.values()].sort((a, b) => a.rank - b.rank || (a.name < b.name ? -1 : 1));
  const labels = [], placed = [];
  for (const street of order) {
    if (labels.length >= MAX_LABELS) break;
    const roads = street.lines.map((line) => trace(line.c, toScreen, w, h)).filter(Boolean);
    if (!roads.length) continue;
    const short = shortName(street.name);
    let text = street.name, spot = bestSpot(roads, measure(text), { w, h, placed, avoid });
    if (!spot && short !== text) {
      text = short;
      spot = bestSpot(roads, measure(text), { w, h, placed, avoid });
    }
    if (!spot) continue;
    placed.push(spot.dots);
    const angle = spot.angle > Math.PI / 2 ? spot.angle - Math.PI : spot.angle < -Math.PI / 2 ? spot.angle + Math.PI : spot.angle;
    labels.push({ text, x: spot.x, y: spot.y, angle });
  }
  return labels;
}
