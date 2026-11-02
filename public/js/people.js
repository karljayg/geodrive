// The other players: where each was last told to be, where to draw them, and what to say about them on a phone. Pure, tested in node. The models are in peopleView.js.
import { FLAGS, isNewer, metresApart } from './protocol.js';

export const DRAW_BEHIND = 150;  // ms in the past to draw someone, so there's always a later place to move towards
const KEPT = 8;                  // places remembered per person
const GUESS_AHEAD = 300;         // ms to carry someone on past their last place before waiting for news
const TELEPORT = 100;            // m between two places that is a jump, not a walk
export const QUIET = 5000;       // ms with no news before someone fades
const NEAR = 100;                // m; within this, places go out fastest
const METRES_PER_DEGREE = 111320;

const shortestTurn = (from, to) => ((to - from + 540) % 360) - 180;

// Someone moved on by their speed: where they'd be this long after that place, by dead reckoning.
function carriedOn(place, seconds) {
  const r = (place.heading * Math.PI) / 180, metres = place.speed * seconds;
  return { lat: place.lat + (Math.cos(r) * metres) / METRES_PER_DEGREE, lng: place.lng + (Math.sin(r) * metres) / (METRES_PER_DEGREE * Math.cos((place.lat * Math.PI) / 180)) };
}

// Where someone is at this time, from places oldest first, each with its own { at }. Null with no places.
export function placeAt(places, time) {
  if (!places.length) return null;
  const last = places[places.length - 1];
  if (time >= last.at) return { ...last, ...carriedOn(last, Math.min(time - last.at, GUESS_AHEAD) / 1000) };
  for (let i = places.length - 1; i > 0; i--) {
    const a = places[i - 1], b = places[i];
    if (time < a.at) continue;
    if (metresApart(a, b) > TELEPORT) return b;
    const t = (time - a.at) / (b.at - a.at || 1);
    return { ...b, lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, heading: (a.heading + shortestTurn(a.heading, b.heading) * t + 360) % 360, speed: a.speed + (b.speed - a.speed) * t, u: (a.u ?? 0) + ((b.u ?? 0) - (a.u ?? 0)) * t, v: (a.v ?? 0) + ((b.v ?? 0) - (a.v ?? 0)) * t };
  }
  return places[0];
}

export class People {
  // me: this player's member id.
  constructor(me) {
    this.me = me;
    this.members = new Map(); // id: what the server says about them
    this.byOrder = new Map(); // their number in this world: id
    this.places = new Map();  // id: { list, seq }
    this.changes = 0;         // goes up when the list of people changes, so a phone knows to redraw
  }

  setMembers(list) {
    for (const member of list) this.setMember(member);
  }

  setMember(member) {
    this.members.set(member.id, member);
    this.byOrder.set(member.order, member.id);
    this.changes++;
  }

  member(id) {
    return this.members.get(id) ?? null;
  }

  // Everyone but this player.
  get others() {
    return [...this.members.values()].filter((member) => member.id !== this.me);
  }

  get othersOnline() {
    return this.others.filter((member) => member.online);
  }

  byName(name) {
    return this.others.find((member) => member.name === name) ?? null;
  }

  // The place someone just sent, unpacked. now: when it arrived, in ms. Older news than what's here is dropped.
  heard(place, now) {
    const id = this.byOrder.get(place.player);
    if (!id || id === this.me) return;
    const known = this.places.get(id) ?? { list: [], seq: null };
    if (known.seq !== null && !isNewer(place.seq, known.seq) && now - known.list.at(-1).at < QUIET) return;
    known.seq = place.seq;
    known.list.push({ ...place, at: now });
    if (known.list.length > KEPT) known.list.shift();
    this.places.set(id, known);
  }

  // Where to draw them now, or null if there's nothing recent to go on.
  drawnAt(id, now) {
    const known = this.places.get(id);
    if (!known || now - known.list.at(-1).at > QUIET) return null;
    return placeAt(known.list, now - DRAW_BEHIND);
  }

  // Where they are right now, as best anyone can tell: their last place carried on by their speed, not the smoothed picture drawn a moment ago. For collisions.
  nowAt(id, now) {
    const known = this.places.get(id);
    if (!known || now - known.list.at(-1).at > QUIET) return null;
    return placeAt(known.list, now);
  }

  // Their best known place, however old, for a phone: the latest news, or where they were when they left.
  lastKnown(id) {
    const known = this.places.get(id)?.list.at(-1), member = this.members.get(id);
    if (known && member?.online) return known;
    return Number.isFinite(member?.lat) && member.lat !== null ? { lat: member.lat, lng: member.lng } : known ?? null;
  }

  forget(id) {
    this.places.delete(id);
  }

  // Whether anyone is close enough for places to go out at the fastest rate.
  someoneNear(at, now) {
    return this.othersOnline.some((member) => {
      const there = this.drawnAt(member.id, now);
      return there && metresApart(at, there) < NEAR;
    });
  }

  // Those who can be walked into now: { lat, lng }. Someone away isn't solid, so nobody who's gone for lunch can seal a room.
  solidNow(now) {
    return this.othersOnline.flatMap((member) => {
      const there = this.drawnAt(member.id, now);
      return there && there.flags & FLAGS.onFoot && !(there.flags & (FLAGS.away | FLAGS.indoors)) ? [there] : []; // a car has its own shape
    });
  }
}

// Places a second to send.
export function presenceRate({ moving, onFoot, away, near }) {
  if (away || !moving) return 1;
  if (near) return 20;
  return onFoot ? 5 : 10;
}

// --- What a phone says ------------------------------------------------------------------------------------------

export const initialsOf = (name) => {
  const parts = String(name).split(/[-_]/).filter(Boolean);
  return ((parts.length > 1 ? parts[0][0] + parts[1][0] : String(name).slice(0, 2)) || '?').toUpperCase();
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function bearingBetween(from, to) {
  const across = (to.lng - from.lng) * Math.cos((((from.lat + to.lat) / 2) * Math.PI) / 180);
  return ((Math.atan2(across, to.lat - from.lat) * 180) / Math.PI + 360) % 360;
}
export const compassPoint = (bearing) => COMPASS[Math.round(bearing / 45) % 8];

const FEET_PER_METRE = 3.28084, METRES_PER_MILE = 1609.344;
export const farText = (metres) => (metres < 305 ? `${Math.round((metres * FEET_PER_METRE) / 10) * 10} ft` : `${(metres / METRES_PER_MILE).toFixed(1)} mi`);

export function agoText(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

// The line under someone's name, such as "1.2 mi NE · Driving". place: their lastKnown. me: where this player is. wallNow: the time, for how long they've been gone.
export function statusLine(member, place, me, wallNow) {
  if (member.lives <= 0) return 'Dead';
  if (!member.online) return `Last seen ${agoText(wallNow - member.lastSeen)}`;
  if (!place) return 'Online';
  const flags = place.flags ?? 0;
  if (flags & FLAGS.indoors) return place.floor > 1 ? `In a building, floor ${place.floor}` : 'In a building';
  const doing = flags & FLAGS.away ? 'Away' : flags & FLAGS.onFoot ? 'On foot' : 'Driving';
  return me ? `${farText(metresApart(me, place))} ${compassPoint(bearingBetween(me, place))} · ${doing}` : doing;
}
