// Share links: the drive and settings, compressed into the URL's # part, so no server is involved and the data
// never reaches one. A link can come from anyone, so everything read from it is checked. Pure, tested in node.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const num = (v, a, b, fallback) => (Number.isFinite(v) ? clamp(v, a, b) : fallback);
const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;
const text = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');
const latLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const TRIP_FIELDS = ['elapsed', 'moving', 'meters', 'fsdMeters', 'offRoadMeters', 'fsdSeconds', 'topSpeed', 'bridges', 'takeovers', 'signals', 'fuel'];
const RANGES = {
  carScale: [0.3, 5], masterVolume: [0, 1], engineVolume: [0, 1], enginePitch: [0.5, 1.5], radioVolume: [0, 1], musicVolume: [0, 1],
  signalVolume: [0, 1], roadVolume: [0, 1], windVolume: [0, 1], hour: [0, 24], mapMemory: [256, 2048], mapScale: [0.5, 1],
};
const CHOICES = {
  carProfile: ['sport', 'muscle', 'hatch', 'truck', 'electric'], engineSound: ['recorded', 'synth'],
  audioPreset: ['quiet', 'balanced', 'sport'], mapQuality: ['PERFORMANCE', 'FIDELITY'],
};
const SWITCHES = ['muted', 'roadFollow', 'headlights', 'radioOn', 'mapLabels', 'musicOff', 'musicWhenHidden'];

// Only what differs from the defaults goes in the link, which keeps it short.
export function packShare({ settings, defaults, session, start, defaultStart }) {
  const s = {};
  for (const [key, value] of Object.entries(settings)) {
    if (JSON.stringify(value) === JSON.stringify(defaults[key])) continue;
    s[key] = typeof value === 'number' ? round(value, 3) : value;
  }
  const pack = {
    p: [round(session.pos.lat, 5), round(session.pos.lng, 5), round(session.heading, 1)],
    l: session.label, c: session.camIndex, z: round(session.zoom, 2), b: session.fsdBoost, n: session.navRadius, a: session.lane,
    t: TRIP_FIELDS.map((f) => round(session.trip[f] || 0, 1)),
  };
  if (Object.keys(s).length) pack.s = s;
  if (session.destination) {
    pack.d = [round(session.destination.lat, 5), round(session.destination.lng, 5), session.destination.label];
    pack.f = session.fsd ? 1 : 0;
  }
  if (start.label !== defaultStart.label) pack.o = [round(start.lat, 5), round(start.lng, 5), round(start.heading, 1), start.label];
  return pack;
}

// Back to { settings, session, start }, keeping only values that are valid. Null if the link has no usable position.
export function unpackShare(pack) {
  if (!pack || !Array.isArray(pack.p) || !latLng(pack.p[0], pack.p[1])) return null;
  const settings = {};
  for (const [key, value] of Object.entries(pack.s && typeof pack.s === 'object' ? pack.s : {})) {
    if (RANGES[key] && Number.isFinite(value)) settings[key] = clamp(value, ...RANGES[key]);
    else if (CHOICES[key]?.includes(value)) settings[key] = value;
    else if (SWITCHES.includes(key) && typeof value === 'boolean') settings[key] = value;
    else if (key === 'carColor' && /^#[0-9a-f]{6}$/i.test(value)) settings[key] = value;
    else if (key === 'radioStation' && value && /^https:\/\//.test(value.url) && typeof value.id === 'string') {
      settings[key] = {
        id: text(value.id), name: text(value.name), url: text(value.url), local: true,
        band: ['FM', 'AM', 'WEB'].includes(value.band) ? value.band : 'WEB',
        frequency: Number.isFinite(value.frequency) ? value.frequency : null,
      };
    }
  }
  const trip = {};
  TRIP_FIELDS.forEach((f, i) => { trip[f] = num(pack.t?.[i], 0, 1e9, f === 'fuel' ? 100 : 0); });
  trip.fuel = clamp(trip.fuel, 0, 100);
  const hasDestination = Array.isArray(pack.d) && latLng(pack.d[0], pack.d[1]);
  const session = {
    pos: { lat: pack.p[0], lng: pack.p[1] },
    heading: num(pack.p[2], 0, 360, 0),
    label: text(pack.l) || 'Shared drive',
    camIndex: Math.round(num(pack.c, 0, 2, 0)),
    zoom: num(pack.z, 1, 8, 1),
    fsdBoost: num(pack.b, -200, 500, 0),
    navRadius: [800, 1500, 3000, 6000].includes(pack.n) ? pack.n : 1500,
    lane: num(pack.a, -3.5, 3.5, 0),
    destination: hasDestination ? { lat: pack.d[0], lng: pack.d[1], label: text(pack.d[2]) || 'Destination' } : null,
    fsd: hasDestination && pack.f === 1,
    trip,
  };
  const o = pack.o;
  const start = Array.isArray(o) && latLng(o[0], o[1]) ? { lat: o[0], lng: o[1], heading: num(o[2], 0, 360, 0), label: text(o[3]) || 'Shared start' } : null;
  return { settings, session, start };
}

const toBase64Url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const run = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export const encodeShare = async (pack) => toBase64Url(await run(new TextEncoder().encode(JSON.stringify(pack)), new CompressionStream('deflate-raw')));

export async function decodeShare(code) {
  try {
    const bytes = await run(fromBase64Url(code), new DecompressionStream('deflate-raw'));
    return unpackShare(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (err) {
    return null; // a damaged link
  }
}

// Plain-language rows saying what a link will load. All values have already been checked by unpackShare.
export function shareSummary({ settings, session }, defaults, { carName, clock }) {
  const s = { ...defaults, ...settings };
  const t = session.trip, rows = [['Location', session.label]];
  if (session.destination) rows.push(['Destination', `${session.destination.label}${session.fsd ? ' (the car drives itself there in FSD)' : ''}`]);
  rows.push(['Car', carName(s.carProfile)], ['Time of day', clock(s.hour)]);
  if (t.meters > 0) rows.push(['Trip so far', `${(t.meters / 1609.344).toFixed(1)} mi, top speed ${Math.round(t.topSpeed * 2.23694)} mph`]);
  const station = s.radioStation?.name || 'a radio station';
  if (!s.radioOn) rows.push(['Radio', `Off (tuned to ${station})`]);
  else if (s.muted) rows.push(['Radio', `${station}, but sound is muted`]);
  else rows.push(['Radio', `${station}. Music starts when you continue, at ${Math.round(s.radioVolume * s.masterVolume * 100)}% volume`]);
  return rows;
}
