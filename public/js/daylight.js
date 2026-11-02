// Time of day as a tint over the map. Google's 3D map is a photograph with fixed lighting and no lighting controls,
// so this darkens and colours it rather than moving the sun. Pure, tested in node.
const KEYS = [
  [0, [16, 22, 62]], [4.5, [16, 22, 62]], [6, [90, 80, 120]], [7, [255, 195, 160]], [8.5, [255, 255, 255]],
  [16.5, [255, 255, 255]], [18, [255, 180, 130]], [19.5, [80, 66, 120]], [21, [16, 22, 62]], [24, [16, 22, 62]],
];

// The multiply colour for an hour (0..24). White leaves the map as it is.
export function tintAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a, ca] = KEYS[i], [b, cb] = KEYS[i + 1];
    if (h >= a && h <= b) {
      const f = (h - a) / (b - a);
      return ca.map((v, c) => Math.round(v + (cb[c] - v) * f));
    }
  }
  return KEYS[0][1];
}

// 0 in full daylight, near 1 at night.
export const darknessAt = (hour) => {
  const [r, g, b] = tintAt(hour);
  return 1 - (0.3 * r + 0.59 * g + 0.11 * b) / 255;
};

// The one game clock, moved on by real seconds. At the wheel it keeps real time; on foot footRate is the game hours that pass in a real minute.
export function advanceHour(hour, seconds, onFoot, footRate) {
  return (hour + seconds * (onFoot ? footRate / 60 : 1 / 3600)) % 24;
}

export function clockText(hour) {
  const total = Math.round(hour * 60) % 1440;
  const h = Math.floor(total / 60), m = String(total % 60).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}
