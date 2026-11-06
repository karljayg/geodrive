// What fire looks like on the map: blasts, burning wrecks, buildings that smoke, burn and stand gutted, and the flash and streak of each shot.
// Frames are separate models with only one shown at a time, as the map won't play an animation. A site's models go on together, and only one
// new site a second, as the map stalls when many models arrive at once (see peopleView.js). Also keeps where light is coming from, for the
// glow drawn over the map (drawGlows in main.js).
import { BLAST_FRAMES, FLAME_FRAMES, SMOKE_FRAMES, SMOKE_HEIGHT, STREAK_LENGTH, blastFrames, buildFlamesGlb, buildGlowGlb, buildMuzzleGlb, buildRuinGlb, buildStreakGlb, smokeFrames } from './fireModels.js';
import { flameSpots } from './burning.js';
import { metresApart } from './protocol.js';
import { BODY_SHAPES } from './carModel.js';

const HIDDEN = 0.001;
const BLAST_MS = 1500, FLAME_MS = 95, SMOKE_MS = 170, FLICKER_MS = 70;
const MUZZLE_MS = 90, MUZZLE_SIZE = 3.4, BULLET_SPEED = 150; // m/s, far slower than a round, so the eye can follow it
const NEXT_SITE_AFTER = 1000; // ms
const METRES_PER_DEGREE = 111320;

const toward = (from, to) => {
  const dy = (to.lat - from.lat) * METRES_PER_DEGREE, dx = (to.lng - from.lng) * METRES_PER_DEGREE * Math.cos((from.lat * Math.PI) / 180);
  return { dx, dy, metres: Math.hypot(dx, dy), heading: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 };
};
const moved = (at, dx, dy) => ({ lat: at.lat + dy / METRES_PER_DEGREE, lng: at.lng + dx / (METRES_PER_DEGREE * Math.cos((at.lat * Math.PI) / 180)) });
const flicker = (now, seed) => 0.82 + 0.12 * Math.sin(now / 53 + seed) + 0.08 * Math.sin(now / 31 + seed * 3);

export class FireView {
  constructor({ maps3d, map, glbUrl }) {
    Object.assign(this, { maps3d, map, glbUrl });
    this.sites = new Map(); // key: { stage, parts: [{ elements, every, size, at }], glow, light }
    this.lights = [];       // { lat, lng, until, from, strength, radius, rgb }
    this.siteAt = -Infinity;
    this.sources = {};
  }

  source(name, make) {
    this.sources[name] ||= make();
    return this.sources[name];
  }

  frames(name, make) {
    return this.source(name, () => make().map((glb) => this.glbUrl(glb)));
  }

  model(position, src, scale, heading = 0, mode = 'RELATIVE_TO_GROUND') {
    const element = new this.maps3d.Model3DElement({ position, altitudeMode: mode, orientation: { heading, tilt: 0, roll: 0 }, scale });
    element.src = src;
    this.map.append(element);
    return element;
  }

  // A set of frames on one spot, the first shown. every: ms a frame.
  animated(position, urls, size, every, heading = 0) {
    return { elements: urls.map((url, i) => this.model(position, url, i ? HIDDEN : size, heading)), every, size, shown: 0, offset: Math.random() * 1000 };
  }

  // Something blew up here: a flash, a fireball rolling up into black smoke, pieces thrown out and a ring of dust. Fire after it comes from
  // the wreck (update), which lasts much longer.
  explode(at) {
    const urls = this.frames('blast', blastFrames), position = { lat: at.lat, lng: at.lng, altitude: 0 };
    const frames = urls.map((url, i) => this.model(position, url, i ? HIDDEN : 1));
    const began = performance.now();
    this.lights.push({ lat: at.lat, lng: at.lng, from: began, until: began + 1400, strength: 1, radius: 40, rgb: '255,190,110' });
    let shown = 0;
    const tick = () => {
      const t = (performance.now() - began) / BLAST_MS;
      if (t >= 1) {
        for (const frame of frames) frame.remove();
        return;
      }
      const next = Math.min(BLAST_FRAMES - 1, Math.floor(t * BLAST_FRAMES));
      if (next !== shown) {
        frames[shown].scale = HIDDEN;
        frames[next].scale = 1;
        shown = next;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  // A shot from `from` towards `to`, both { lat, lng }: the gun's flash, the streak of the round, and a moment of light around the shooter.
  shot(from, to) {
    const way = to ? toward(from, to) : { dx: 0, dy: 1, metres: 0, heading: from.heading ?? 0 }, along = way.metres || 1;
    const muzzle = moved(from, (way.dx / along) * 0.55, (way.dy / along) * 0.55), now = performance.now();
    const flash = this.model({ ...muzzle, altitude: 1.35 }, this.source('muzzle', () => this.glbUrl(buildMuzzleGlb())), MUZZLE_SIZE * (0.85 + Math.random() * 0.3), way.heading);
    setTimeout(() => flash.remove(), MUZZLE_MS);
    this.lights.push({ lat: muzzle.lat, lng: muzzle.lng, from: now, until: now + 110, strength: 1, radius: 14, rgb: '255,215,150' });
    if (!to || way.metres < 2) return;
    const streak = this.model({ ...muzzle, altitude: 1.3 }, this.source('streak', () => this.glbUrl(buildStreakGlb())), 1, way.heading);
    const flight = Math.max(120, ((way.metres - STREAK_LENGTH) / BULLET_SPEED) * 1000);
    const fly = () => {
      const t = (performance.now() - now) / flight;
      if (t >= 1) return streak.remove();
      const ahead = (way.metres - STREAK_LENGTH) * t;
      streak.position = { ...moved(muzzle, (way.dx / along) * ahead, (way.dy / along) * ahead), altitude: 1.3 - t * 0.6 };
      requestAnimationFrame(fly);
    };
    fly();
  }

  // Lights to draw over the map now: shots, blasts and fires, each { lat, lng, strength, radius, rgb }.
  glows(now) {
    this.lights = this.lights.filter((light) => light.until > now);
    const list = this.lights.map((light) => ({ ...light, strength: light.strength * (1 - (now - light.from) / (light.until - light.from)) }));
    for (const site of this.sites.values()) if (site.light) list.push({ ...site.light, strength: site.light.strength * flicker(now, site.light.radius) });
    return list;
  }

  // Each frame. burning: [{ key, kind: 'car' | 'building', stage, at: { lat, lng, heading }, type, fire, local }], nearest first, as many as may be shown.
  update(burning, now) {
    const wanted = new Set(burning.map((site) => site.key));
    for (const [key, site] of this.sites) {
      if (!wanted.has(key)) this.drop(key, site);
    }
    for (const site of burning) {
      const known = this.sites.get(site.key);
      if (known?.stage === site.stage) continue;
      if (known) this.drop(site.key, known);
      if (now - this.siteAt < NEXT_SITE_AFTER) continue; // the rest go on in the seconds to come
      this.siteAt = now;
      this.sites.set(site.key, site.kind === 'car' ? this.carSite(site) : this.buildingSite(site));
    }
    for (const site of this.sites.values()) this.animate(site, now);
  }

  drop(key, site) {
    for (const part of site.parts) for (const element of part.elements) element.remove();
    site.glow?.element.remove();
    this.sites.delete(key);
  }

  animate(site, now) {
    for (const part of site.parts) {
      if (part.elements.length < 2) continue;
      const next = Math.floor((now + part.offset) / part.every) % part.elements.length;
      if (next === part.shown) continue;
      part.elements[part.shown].scale = HIDDEN;
      part.elements[next].scale = part.size;
      part.shown = next;
    }
    if (site.glow && now - site.glow.at > FLICKER_MS) {
      site.glow.at = now;
      site.glow.element.scale = site.glow.size * flicker(now, site.glow.size);
    }
  }

  // A burning wreck: flames over its length, a glow beneath and a column of black smoke.
  carSite({ stage, at, type }) {
    const shape = BODY_SHAPES[type] || BODY_SHAPES.sport, position = { lat: at.lat, lng: at.lng, altitude: 0 };
    const spots = [-0.55, 0, 0.6].map((f, i) => ({ x: 0, y: shape.l * f, z: 0.4, size: [3.8, 5.2, 4.2][i] }));
    const flames = this.frames(`flames:car:${type}`, () => Array.from({ length: FLAME_FRAMES }, (_, frame) => buildFlamesGlb(spots, frame)));
    const parts = [
      this.animated(position, flames, 1, FLAME_MS, at.heading ?? 0),
      this.animated({ ...position, altitude: 2 }, this.frames('smoke:dark', () => smokeFrames(true)), 0.5, SMOKE_MS),
    ];
    const glow = { element: this.model({ ...position, altitude: 0.6 }, this.source('glow', () => this.glbUrl(buildGlowGlb())), 4), size: 4, at: 0 };
    return { stage, parts, glow, light: { lat: at.lat, lng: at.lng, strength: 0.55, radius: 16, rgb: '255,140,60' } };
  }

  // A building smoking, burning or burnt out, sized to its footprint and height.
  buildingSite({ key, stage, fire, local }) {
    const position = { lat: fire.lat, lng: fire.lng, altitude: 0 }, reach = Math.max(4, ...local.flat(2).map((v) => Math.abs(v))), height = fire.height;
    const parts = [];
    let glow = null, light = null;
    if (stage === 'smoke') {
      parts.push(this.animated({ ...position, altitude: height * 0.8 }, this.frames('smoke:light', () => smokeFrames(false)), Math.min(2.5, Math.max(0.45, reach / 9)), SMOKE_MS));
    } else {
      const burning = stage === 'fire';
      parts.push({ elements: [this.model(position, this.glbUrl(buildRuinGlb(local, height, burning)), 1)], every: 0, size: 1, shown: 0, offset: 0 });
      if (burning) {
        // On the fallen roof, so they rise out of the top of the shell.
        const size = Math.min(14, Math.max(3.5, height * 0.75)), spots = flameSpots(local, 7).slice(0, 9).map((spot, i) => ({ ...spot, z: height * 0.95, size: size * (0.7 + ((i * 37) % 10) / 20) }));
        parts.push(this.animated(position, this.frames(`flames:${key}`, () => Array.from({ length: FLAME_FRAMES }, (_, frame) => buildFlamesGlb(spots, frame))), 1, FLAME_MS));
        parts.push(this.animated({ ...position, altitude: height * 1.2 }, this.frames('smoke:dark', () => smokeFrames(true)), Math.min(3.5, Math.max(0.8, reach / 6)), SMOKE_MS));
        light = { lat: fire.lat, lng: fire.lng, strength: 0.8, radius: reach * 3 + 20, rgb: '255,130,50' };
      }
    }
    return { stage, parts, glow, light };
  }
}

// What's burning near here, nearest first and no more than `most` of each kind, and four times as many burnt-out buildings, which are one
// model each. Pure; main.js gives it the cars and fires it knows.
// cars: [{ id, lat, lng, heading, type, stage }]. fires: [{ fire, stage, local }].
export function burningNear(viewer, cars, fires, within, most) {
  const near = (list, at, count = most) => list.map((item) => ({ item, away: metresApart(viewer, at(item)) })).filter(({ away }) => away <= within).sort((a, b) => a.away - b.away).slice(0, count).map(({ item }) => item);
  return [
    ...near(cars.filter((car) => car.stage === 'fire'), (car) => car).map((car) => ({ key: `car:${car.id}`, kind: 'car', stage: car.stage, at: car, type: car.type })),
    ...[...near(fires.filter((site) => site.stage && site.stage !== 'charred'), (site) => site.fire), ...near(fires.filter((site) => site.stage === 'charred'), (site) => site.fire, most * 4)].map((site) => ({ key: `building:${site.fire.id}`, kind: 'building', stage: site.stage, fire: site.fire, local: site.local })),
  ];
}

export { SMOKE_FRAMES, SMOKE_HEIGHT };
