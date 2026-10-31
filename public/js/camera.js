// Chase camera geometry. Map3DElement orbits its `center`, so changing `heading` spins the world around
// whatever point is at `center`. To spin around the car while showing it low on screen, `center` sits a
// fixed distance ahead of the car along the camera heading: the car's place in the camera frame then
// depends only on that distance, tilt and range, never on the heading.

const EARTH = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function move(lat, lng, bearing, meters) {
  const d = meters / EARTH, t = rad(bearing), p = rad(lat), l = rad(lng);
  const p2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(t));
  const l2 = l + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(p2));
  return { lat: deg(p2), lng: deg(l2) };
}

export function distance(lat1, lng1, lat2, lng2) {
  const dp = rad(lat2 - lat1), dl = rad(lng2 - lng1);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}

// How far ahead of the car `center` must be for the car to appear `below` (0..1 = centre..bottom edge)
// on screen. fovY is the vertical field of view in degrees, tilt 0 looks straight down.
export function leadDistance(range, tiltDeg, fovYDeg, below) {
  const f = 1 / Math.tan(rad(fovYDeg) / 2), t = rad(tiltDeg);
  return (below * range) / (f * Math.cos(t) + below * Math.sin(t));
}

// Shortest-way easing between compass angles.
export function easeAngle(from, to, amount) {
  const d = ((to - from + 540) % 360) - 180;
  return (from + d * amount + 360) % 360;
}
