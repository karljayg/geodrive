// Deer on the ground, from Agecraft's Test-3D herd (game3d/animals3d.js) and its view (public3d/animals-view.js).
// A block there is a metre here. They stroll near home, and bolt when someone comes inside what they see or hear.
// Planted along roads the same way as parked cars (spotsAlongRoads), farther off and half as often by default.
// The posed frames are baked from the same Quaternius models; the map cannot play a rig itself.
import { GAME } from './gameConfig.js';
import { spotsAlongRoads } from './worldCars.js';

const CLIPS = ['idle', 'walk', 'gallop'];
const ID_GRID = 2e-5; // degrees, about 2 m, same as planted cars

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rolls(text) {
  let s = hash(text);
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roll(deer) {
  deer.seed = Math.imul((deer.seed || hash(deer.id)) ^ 0x9e3779b9, 0x6d2b79f5) >>> 0;
  return (deer.seed >>> 8) / 16777216;
}

// Spots along these road ways, half as dense as cars when every is twice theirs. Same for everyone from the place.
export function plantDeer(ways, config = GAME.deer) {
  const deer = new Map();
  for (const spot of spotsAlongRoads(ways, { every: config.every, offset: config.verge }, 'deer')) {
    const id = `d_${Math.round(spot.lat / ID_GRID)}_${Math.round(spot.lng / ID_GRID)}`;
    if (deer.has(id)) continue;
    const rollOne = rolls(id);
    deer.set(id, { id, lat: spot.lat, lng: spot.lng, heading: spot.heading, stag: rollOne() < config.stagChance });
  }
  return [...deer.values()];
}

// Live state from a planted spot. x/y are metres east/north of that home.
export function newDeer(planted) {
  const id = planted.id, stag = !!planted.stag;
  return {
    id, stag, heading: planted.heading,
    homeLat: planted.lat, homeLng: planted.lng, x: 0, y: 0,
    goalX: null, goalY: null, speed: 0,
    alarmUntil: 0, fearAt: -1e9, nextWander: 1500, phase: stag ? 0.7 : 0, gait: 'idle', seed: hash(id),
  };
}

function bolt(deer, player, cfg) {
  const dx = player.x - deer.x, dy = player.y - deer.y, len = Math.hypot(dx, dy) || 1;
  deer.goalX = deer.x - (dx / len) * cfg.boltStep;
  deer.goalY = deer.y - (dy / len) * cfg.boltStep;
  deer.speed = cfg.fleeSpeed;
}

// player: { x, y } in metres from this deer's home, or null. now and alarm are milliseconds. dt is seconds.
export function stepDeer(deer, player, dt, now, cfg = GAME.deer) {
  if (!(dt > 0)) return deer;
  const notice = Math.max(cfg.hearing, cfg.vision);
  if (player && now - deer.fearAt >= cfg.fearEveryMs) {
    deer.fearAt = now;
    const dist = Math.hypot(player.x - deer.x, player.y - deer.y);
    if (dist <= notice) {
      deer.alarmUntil = now + cfg.alarmMs;
      bolt(deer, player, cfg);
    }
  }
  if (deer.goalX == null && now >= deer.alarmUntil && now >= deer.nextWander) {
    const away = Math.hypot(deer.x, deer.y);
    if (away > cfg.wanderRadius) {
      deer.goalX = 0;
      deer.goalY = 0;
    } else {
      const ang = roll(deer) * Math.PI * 2, r = roll(deer) * cfg.wanderRadius;
      deer.goalX = Math.cos(ang) * r;
      deer.goalY = Math.sin(ang) * r;
    }
    deer.speed = cfg.wanderSpeed;
    deer.nextWander = now + cfg.wanderWaitMs;
  }
  if (deer.goalX != null) {
    const dx = deer.goalX - deer.x, dy = deer.goalY - deer.y, len = Math.hypot(dx, dy), step = deer.speed * dt;
    if (len <= step || len < 0.05) {
      deer.x = deer.goalX;
      deer.y = deer.goalY;
      deer.goalX = null;
      deer.goalY = null;
    } else {
      deer.x += (dx / len) * step;
      deer.y += (dy / len) * step;
      deer.heading = (Math.atan2(dx, dy) * 180) / Math.PI;
      if (deer.heading < 0) deer.heading += 360;
    }
  }
  if (deer.goalX == null && now < deer.alarmUntil && player) bolt(deer, player, cfg);
  if (deer.goalX == null && now >= deer.alarmUntil) deer.speed = 0;
  deer.gait = deer.speed < cfg.idleBelow ? 'idle' : deer.speed < cfg.runAbove ? 'walk' : 'gallop';
  const pace = deer.gait === 'idle' ? 1 : Math.max(0.5, Math.min(deer.gait === 'gallop' ? 2.2 : 3, deer.speed / (deer.gait === 'walk' ? cfg.walkPace : cfg.runPace)));
  const dur = cfg.clips[deer.gait];
  deer.phase = (deer.phase + dt * pace) % dur;
  return deer;
}

// What can cook a piece. A house stove is the oven. proStove is a kitchen range. A microwave does one piece too.
export const COOKERS = ['stove', 'proStove', 'microwave'];

export const cookOffer = (item, hasRaw) => (COOKERS.includes(item) && hasRaw ? 'Cook the raw deer meat?' : null);

// Adds a stack, or more onto the one already there. False if a new kind won't fit.
export function stackInto(list, item, count, slots) {
  const known = list.find((i) => i.id === item.id);
  if (known) {
    known.count += count;
    return true;
  }
  if (list.length >= slots) return false;
  list.push({ id: item.id, name: item.name, count });
  return true;
}

export function takeOne(list, id) {
  const item = list.find((i) => i.id === id);
  if (!item || item.count < 1) return false;
  if (--item.count <= 0) list.splice(list.indexOf(item), 1);
  return true;
}

// One raw piece becomes one cooked piece. Null if there is no raw meat, or the cooked piece won't fit.
export function cookMeat(list, slots, cfg = GAME.deer) {
  if (!list.some((i) => i.id === cfg.raw && i.count > 0)) return null;
  takeOne(list, cfg.raw);
  if (!stackInto(list, { id: cfg.cooked, name: cfg.cooked }, 1, slots)) {
    stackInto(list, { id: cfg.raw, name: cfg.raw }, 1, slots + 1);
    return null;
  }
  return cfg.cooked;
}

export function frameOf(deer, cfg = GAME.deer) {
  const n = cfg.frames[deer.gait], dur = cfg.clips[deer.gait];
  if (!CLIPS.includes(deer.gait) || !n) return 0;
  return Math.floor(((deer.phase % dur) / dur) * n) % n;
}
