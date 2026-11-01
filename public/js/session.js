// The current trip, kept in this browser's localStorage so a refresh carries on where it left off.
const STORE = 'geodrive_session_v1';

export function saveSession(state) {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch (err) {
    console.warn('saving trip:', err);
  }
}

// The saved trip, or null if there isn't a usable one.
export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    return s && Number.isFinite(s.pos?.lat) && Number.isFinite(s.pos?.lng) && Number.isFinite(s.heading) ? s : null;
  } catch (err) {
    console.warn('saved trip:', err);
    return null;
  }
}

// The route's source line, kept apart from the trip because it's large and only changes when a new route comes,
// so a refresh can rebuild it instead of paying for it again. As whole numbers, each the change from the last point.
const ROUTE_STORE = 'geodrive_route_v1';
const NO_CRUISE = -1;

export function packRoute(points) {
  const flat = [];
  let lat = 0, lng = 0, cruise = 0;
  for (const p of points) {
    const y = Math.round(p.lat * 1e5), x = Math.round(p.lng * 1e5), c = p.cruise === undefined ? NO_CRUISE : Math.round(p.cruise * 10);
    flat.push(y - lat, x - lng, c - cruise);
    lat = y; lng = x; cruise = c;
  }
  return flat.join();
}

export function unpackRoute(text) {
  const flat = text.split(',').map(Number), points = [];
  let lat = 0, lng = 0, cruise = 0;
  for (let i = 0; i + 2 < flat.length; i += 3) {
    lat += flat[i]; lng += flat[i + 1]; cruise += flat[i + 2];
    points.push(cruise === NO_CRUISE ? { lat: lat / 1e5, lng: lng / 1e5 } : { lat: lat / 1e5, lng: lng / 1e5, cruise: cruise / 10 });
  }
  return points;
}

export function saveRoute(destination, points) {
  try {
    localStorage.setItem(ROUTE_STORE, JSON.stringify({ lat: destination.lat, lng: destination.lng, line: packRoute(points) }));
  } catch (err) {
    console.warn('saving route:', err); // a refresh will ask for it again instead
  }
}

// The saved line, if it's for this destination.
export function loadRoute(destination) {
  try {
    const saved = JSON.parse(localStorage.getItem(ROUTE_STORE));
    if (!saved || saved.lat !== destination.lat || saved.lng !== destination.lng) return null;
    const points = unpackRoute(saved.line);
    return points.length > 1 && points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) ? points : null;
  } catch (err) {
    console.warn('saved route:', err);
    return null;
  }
}

export function clearRoute() {
  try {
    localStorage.removeItem(ROUTE_STORE);
  } catch (err) {
    console.warn('clearing route:', err);
  }
}
