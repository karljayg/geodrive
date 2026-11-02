// Light in a room when its lights are off: the sky through its windows, and the sun through those that face it, which is east in the
// morning and west in the afternoon. Worked out once into a small map of the floor, since it only changes as the hour does. Pure, tested in node.
const WINDOW_EVERY = 3.4;
export const WINDOW_WIDTH = 1.5, WINDOW_LOW = 0.95, WINDOW_HIGH = 2.3; // m
const SUNRISE = 6, SUNSET = 18;
const SKY_REACH = 14;      // m a window lights a room
const SKY_SOFT = 6;        // m² in how fast that falls away
const SKY_GAIN = 0.36, SUN_GAIN = 1;
const MAP_MOST = 96;       // texels along the longer side
const MAP_CELL = 0.5;      // m a texel, at finest

// Where the sun is: bearing and height. Rises east, south at noon, sets west. sky: how bright outside is, 0 to 1.
export function sunAt(hour) {
  const day = (hour - SUNRISE) / (SUNSET - SUNRISE), up = day > 0 && day < 1;
  const height = up ? Math.sin(day * Math.PI) : 0, bearing = (90 + day * 180) * (Math.PI / 180);
  return {
    x: Math.sin(bearing), y: Math.cos(bearing), // towards the sun, x east, y north
    slope: Math.tan(height * 1.05), // of the sun's rays, from about 60 degrees up at noon
    strength: up ? Math.min(1, height * 2.5) : 0,
    sky: up ? 0.25 + 0.75 * Math.min(1, height * 2) : Math.max(0, 0.25 - Math.min(Math.abs(hour - SUNSET), Math.abs(hour + 24 - SUNSET), Math.abs(hour - SUNRISE)) * 0.25),
  };
}

// The windows on one outside wall, whose room is on its left going from a to b: their middles, which way is into the room (nx, ny) and along the wall (ux, uy).
export function windowsOn(wall) {
  const length = Math.hypot(wall.bx - wall.ax, wall.by - wall.ay);
  if (length < WINDOW_EVERY * 0.7) return [];
  const count = Math.max(1, Math.round(length / WINDOW_EVERY)), ux = (wall.ax - wall.bx) / length, uy = (wall.ay - wall.by) / length, out = [];
  for (let n = 0; n < count; n++) {
    const along = (length * (n + 0.5)) / count;
    out.push({ x: wall.bx + ux * along, y: wall.by + uy * along, ux, uy, nx: uy, ny: -ux });
  }
  return out;
}

const crosses = (ax, ay, bx, by, s) => {
  const e = (s.bx - s.ax) * (by - ay) - (s.by - s.ay) * (bx - ax);
  if (Math.abs(e) < 1e-9) return false;
  const t = ((ax - s.ax) * (by - ay) - (ay - s.ay) * (bx - ax)) / e, n = ((ax - s.ax) * (s.by - s.ay) - (ay - s.ay) * (s.bx - s.ax)) / e;
  return t > 0 && t < 1 && n > 0.001 && n < 0.999;
};

// A floor's light map. box: minX, maxX, minY, maxY. windows: from windowsOn. walls: inner walls, which shut light out. Values are 0 to 255, for 0 to 1.
export function lightMap(box, windows, walls, hour) {
  const sizeX = box.maxX - box.minX, sizeY = box.maxY - box.minY, cell = Math.max(MAP_CELL, Math.max(sizeX, sizeY) / MAP_MOST);
  const width = Math.max(2, Math.ceil(sizeX / cell)), height = Math.max(2, Math.ceil(sizeY / cell)), raw = new Float32Array(width * height), sun = sunAt(hour);
  const blockedBetween = (ax, ay, bx, by) => walls.some((s) => crosses(ax, ay, bx, by, s));
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x = box.minX + (i + 0.5) * cell, y = box.minY + (j + 0.5) * cell;
      let light = 0;
      for (const w of windows) {
        const dx = x - w.x, dy = y - w.y, into = dx * w.nx + dy * w.ny, dist2 = dx * dx + dy * dy;
        if (into <= 0 || dist2 > SKY_REACH * SKY_REACH) continue;
        const facing = into / Math.max(0.3, Math.sqrt(dist2));
        const toward = -(sun.x * w.nx + sun.y * w.ny); // how much the window faces the sun
        const sky = (sun.sky * SKY_GAIN * facing * (1 + 1.3 * Math.max(0, toward) * sun.strength)) / (1 + dist2 / SKY_SOFT); // what the sun lands on bounces round the room
        // The sun, if this window faces it: follow the ray from here back towards the sun and see if it comes in through the glass.
        let direct = 0;
        if (sun.strength > 0 && toward > 0.05) {
          const run = into / toward, hitX = x + sun.x * run, hitY = y + sun.y * run, side = (hitX - w.x) * w.ux + (hitY - w.y) * w.uy, up = run * sun.slope;
          if (Math.abs(side) <= WINDOW_WIDTH / 2 && up >= WINDOW_LOW && up <= WINDOW_HIGH) direct = sun.strength * SUN_GAIN * toward;
        }
        if ((sky > 0.004 || direct > 0) && blockedBetween(x, y, w.x, w.y)) continue;
        light += sky + direct;
      }
      raw[i + j * width] = light;
    }
  }
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      let sum = 0, count = 0; // a little blur, so patches of sun have soft edges
      for (let b = Math.max(0, j - 1); b <= Math.min(height - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(width - 1, i + 1); a++) { sum += raw[a + b * width]; count++; }
      data[i + j * width] = Math.round(Math.min(1, sum / count) * 255);
    }
  }
  return { data, width, height, minX: box.minX, minY: box.minY, spanX: width * cell, spanY: height * cell };
}

export const lightAt = (map, x, y) => map.data[Math.min(map.width - 1, Math.max(0, Math.floor(((x - map.minX) / map.spanX) * map.width))) + Math.min(map.height - 1, Math.max(0, Math.floor(((y - map.minY) / map.spanY) * map.height))) * map.width] / 255;

// Is it dark here? win: the light map's value here. Only the room's lights or daylight end it: a flashlight or phone doesn't. wasDark keeps it as it was between the limits.
export function darkHere({ lightsOn, win, wasDark }, { below, above }) {
  if (lightsOn) return false;
  return win < (wasDark ? above : below);
}

// What the person can carry a light as: a flashlight's wide beam, or a phone's that only reaches about a person's height ahead.
export const TORCHES = {
  flash: { reach: 13, cone: 0.86, strength: 0.8 },
  phone: { reach: 1.8, cone: 0.72, strength: 0.65 },
};
