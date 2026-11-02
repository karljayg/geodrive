// What the browser and the world server say to each other, used by both so they can't disagree. See docs/MODE2_DESIGN.md. Pure, tested in node.
export const PROTOCOL = 1; // raise when either side can't understand the other; a client behind it is told to refresh

const PRESENCE_TYPE = 1;
export const PRESENCE_BYTES = 24;
export const FLAGS = { onFoot: 1, away: 2, indoors: 4, headlights: 8, brake: 16, signalLeft: 32, signalRight: 64, bridge: 128, running: 256, asleep: 512, riding: 1024 };
const DEGREES = 1e7, HEADING = 100, SPEED = 100, FRAME = 50; // whole numbers per degree, per degree, per m/s and per m (2 cm)

const clampInt = (value, low, high) => Math.max(low, Math.min(high, Math.round(Number.isFinite(value) ? value : 0)));

// One person's position and what they're doing, in 24 bytes. They're sent often, and only the newest matters. u and v: their place in a building, indoors only.
export function packPresence({ player = 0, seq = 0, lat, lng, heading = 0, speed = 0, flags = 0, gait = 0, floor = 0, u = 0, v = 0 }) {
  const bytes = new ArrayBuffer(PRESENCE_BYTES), view = new DataView(bytes);
  view.setUint8(0, PRESENCE_TYPE);
  view.setUint8(1, clampInt(player, 0, 255));
  view.setUint16(2, seq & 0xffff);
  view.setInt32(4, clampInt(lat * DEGREES, -90 * DEGREES, 90 * DEGREES));
  view.setInt32(8, clampInt(lng * DEGREES, -180 * DEGREES, 180 * DEGREES));
  view.setUint16(12, clampInt((((heading % 360) + 360) % 360) * HEADING, 0, 36000));
  view.setInt16(14, clampInt(speed * SPEED, -32768, 32767));
  view.setUint16(16, clampInt(flags, 0, 65535));
  view.setUint8(18, clampInt(gait, 0, 255));
  view.setInt8(19, clampInt(floor, -128, 127));
  view.setInt16(20, clampInt(u * FRAME, -32768, 32767));
  view.setInt16(22, clampInt(v * FRAME, -32768, 32767));
  return new Uint8Array(bytes);
}

const viewOf = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// Back to numbers, or null if it isn't one. A connection can send anything, so the size, kind and place are all checked.
export function unpackPresence(bytes) {
  if (!bytes || bytes.byteLength !== PRESENCE_BYTES) return null;
  const view = viewOf(bytes);
  if (view.getUint8(0) !== PRESENCE_TYPE) return null;
  const lat = view.getInt32(4) / DEGREES, lng = view.getInt32(8) / DEGREES;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    player: view.getUint8(1), seq: view.getUint16(2), lat, lng, heading: view.getUint16(12) / HEADING, speed: view.getInt16(14) / SPEED,
    flags: view.getUint16(16), gait: view.getUint8(18), floor: view.getInt8(19), u: view.getInt16(20) / FRAME, v: view.getInt16(22) / FRAME,
  };
}

// Stamps who it's from, as the server knows that and the sender's word doesn't count.
export const stampPresence = (bytes, player) => { bytes[1] = player; return bytes; };

// A later message replaces an earlier one, allowing for the count going round.
export const isNewer = (seq, than) => ((seq - than) & 0xffff) < 0x8000;

// --- Names and looks ------------------------------------------------------------------------------------------

export const NAME_LEAST = 2, NAME_MOST = 16;
export const LOOK_PARTS = ['skin', 'jacket', 'jeans', 'shoes', 'hair'];
export const FIGURES = ['male', 'female'];

export const nameKey = (name) => String(name).toLowerCase();

// What's wrong with a name, or null. No spaces, so `/w name message` can be read, and plain letters, so two names can't merely look alike.
export function nameProblem(name) {
  if (typeof name !== 'string' || name.length < NAME_LEAST) return 'too-short';
  if (name.length > NAME_MOST) return 'too-long';
  return /^[A-Za-z0-9_-]+$/.test(name) ? null : 'bad-characters';
}

// A look that's safe to keep and show, or null. Only the known parts, each a plain colour.
export function cleanLook(figure, colours) {
  if (!FIGURES.includes(figure) || !colours || typeof colours !== 'object') return null;
  const clean = {};
  for (const part of LOOK_PARTS) {
    if (typeof colours[part] !== 'string' || !/^#[0-9a-f]{6}$/i.test(colours[part])) return null;
    clean[part] = colours[part].toLowerCase();
  }
  return { figure, colours: clean };
}

// --- The clock ------------------------------------------------------------------------------------------------

// The hour from what the server said. at and now in ms by the server's clock. The server says when it stops, by sending a rate of 0.
export const clockHour = ({ hour, rate, at }, now) => (((hour + (rate * Math.max(0, now - at)) / 3600000) % 24) + 24) % 24;

// --- Chat -----------------------------------------------------------------------------------------------------

// What a typed line means: { to, text } with to null for the group, { error } if it can't be sent, or null for nothing to send. names: everyone else's names.
export function readChatLine(line, names, most = 400) {
  const text = String(line).trim();
  if (!text) return null;
  const whisper = text.match(/^\/w(?:\s+(\S+))?(?:\s+([\s\S]*))?$/i);
  if (!whisper) {
    if (text.startsWith('/')) return { error: 'unknown-command' };
    return text.length > most ? { error: 'too-long' } : { to: null, text };
  }
  const [, name, message] = whisper;
  if (!name) return { error: 'no-name' };
  const to = names.find((known) => nameKey(known) === nameKey(name));
  if (!to) return { error: 'unknown-name', name };
  if (!message?.trim()) return { error: 'no-message' };
  return message.trim().length > most ? { error: 'too-long' } : { to, text: message.trim() };
}

// The thread two people's messages are kept under, the same whoever sends. The group has its own.
export const GROUP_THREAD = 'group';
export const dmThread = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

// --- Distance -------------------------------------------------------------------------------------------------

const METRES_PER_DEGREE = 111320;
export function metresApart(a, b) {
  const across = (a.lng - b.lng) * METRES_PER_DEGREE * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((a.lat - b.lat) * METRES_PER_DEGREE, across);
}
