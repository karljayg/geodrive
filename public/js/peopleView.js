// Other people on the map: a model for each frame of their walk, in their colours, and a name tag. Measured on 2026-11-02 (docs/SHARED_WORLD.md): moving them costs
// little, but the map froze for 8.8 s when 153 models went on within 5 s, and didn't when people went on about 6 s apart. So only one person's models go on at a time.
import { buildCarGlb, buildPersonGlb } from './carModel.js';
import { coastPlace } from './carDamage.js';
import { FLAGS, metresApart } from './protocol.js';
import { FRAME_COUNT, personParts } from './footPerson.js';
import { GAME } from './gameConfig.js';

const MODELS_WITHIN = 300, LET_GO_BEYOND = 600; // m
const NEXT_PERSON_AFTER = 6000;                 // ms after one person's models are all on
const TAG_HEIGHT = 2.2, TAG_FONT = 15;          // m, px
const HIDDEN = 0.001, SHOWN = 1.1;              // the same size as this player's own person, whom the camera has to find
const WRECK_COLOUR = '#17120f', FIRE_ORANGE = [1, 0.42, 0.05], FIRE_YELLOW = [1, 0.85, 0.25], FIRE_TIME = 1100; // ms
const PARKED_LOOK_EVERY = 1000;                 // ms
const CAR_SIZE = 0.9;
const TAG_MOVES = 1e-6;                         // degrees, about 10 cm

// A ball one metre across, as a model part.
function ballPart(colour) {
  const pos = [], nor = [], rings = 8, sides = 12, point = (a, b) => [Math.sin(a) * Math.cos(b), Math.sin(a) * Math.sin(b), Math.cos(a)];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a0 = (i / rings) * Math.PI, a1 = ((i + 1) / rings) * Math.PI, b0 = (j / sides) * Math.PI * 2, b1 = ((j + 1) / sides) * Math.PI * 2;
      for (const [a, b] of [[a0, b0], [a1, b0], [a1, b1], [a0, b0], [a1, b1], [a0, b1]]) {
        const p = point(a, b);
        pos.push(...p);
        nor.push(...p);
      }
    }
  }
  return { pos, nor, colour };
}

// A name tag: dark, rounded, white text, the same size on screen wherever it is. The name goes in as text, so it can't be anything else.
export function nameTag(maps3d, position, name) {
  const width = 16 + name.length * 9, svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), template = document.createElement('template');
  const marker = new maps3d.Marker3DElement({ position, altitudeMode: 'RELATIVE_TO_GROUND', extruded: false, sizePreserved: true, drawsWhenOccluded: true });
  svg.setAttribute('width', width);
  svg.setAttribute('height', 24);
  svg.setAttribute('viewBox', `0 0 ${width} 24`);
  svg.innerHTML = `<rect width="${width}" height="24" rx="5" fill="#000" fill-opacity=".55"/><text x="${width / 2}" y="17" font-family="system-ui,sans-serif" font-size="${TAG_FONT}" font-weight="600" text-anchor="middle" fill="#fff"></text>`;
  svg.querySelector('text').textContent = name;
  template.content.append(svg);
  marker.append(template);
  return marker;
}

export class PeopleView {
  // people: from world.js. glbUrl: turns a model into an address.
  constructor({ maps3d, map, people, glbUrl, cars, mine, offset }) {
    Object.assign(this, { maps3d, map, people, glbUrl, cars, mine, offset });
    this.carModels = new Map(); // car id: { element, tag, source key }
    this.carSources = new Map();
    this.parkedAt = -Infinity;
    this.parkedList = [];
    this.shown = new Map();   // member id: { frames: [], wanted, current, tag, lat, lng, heading }
    this.sources = new Map(); // a look: its 17 model addresses, shared by anyone who chose the same
    this.building = null;     // who's getting their models now
    this.nextAt = 0;
  }

  sourcesFor(look) {
    const key = JSON.stringify(look);
    if (!this.sources.has(key)) this.sources.set(key, Array.from({ length: FRAME_COUNT }, (_, frame) => this.glbUrl(buildPersonGlb(personParts(frame, look)))));
    return this.sources.get(key);
  }

  model(position, source, scale) {
    const element = new this.maps3d.Model3DElement({ position, altitudeMode: 'RELATIVE_TO_GROUND', orientation: { heading: 0, tilt: 0, roll: 0 }, scale });
    element.src = source;
    this.map.append(element);
    return element;
  }

  remove(id) {
    const person = this.shown.get(id);
    if (!person) return;
    for (const frame of person.frames) frame?.remove();
    person.tag?.remove();
    this.shown.delete(id);
    if (this.building === id) this.building = null;
  }

  // Each frame. viewer: where this player is. now: performance.now().
  update(viewer, now) {
    for (const id of this.shown.keys()) if (!this.people.member(id)?.online) this.remove(id);
    for (const member of this.people.othersOnline) this.updatePerson(member, viewer, now);
    this.addNextModel(now);
    this.updateCars(viewer, now);
  }

  clockOffset() {
    return this.offset?.() ?? 0;
  }

  carsChanged() {
    this.parkedAt = -Infinity;
  }

  carSource(car) {
    const colour = car.wrecked ? WRECK_COLOUR : car.colour, key = `${car.type}${colour}`;
    if (!this.carSources.has(key)) this.carSources.set(key, this.glbUrl(buildCarGlb(car.type, colour)));
    return this.carSources.get(key);
  }

  // A fireball where something blew up: two balls that swell and go, so it needs nothing but the map.
  explode(at) {
    this.fireSources ||= [FIRE_ORANGE, FIRE_YELLOW].map((colour) => this.glbUrl(buildPersonGlb([ballPart(colour)])));
    const balls = this.fireSources.map((source) => this.model({ lat: at.lat, lng: at.lng, altitude: 1 }, source, 0.1));
    const began = performance.now();
    const grow = () => {
      const t = (performance.now() - began) / FIRE_TIME;
      if (t >= 1) {
        for (const ball of balls) ball.remove();
        return;
      }
      balls[0].scale = 1 + t * 9;
      balls[1].scale = Math.max(0.1, 0.8 + t * 6 * (1 - t));
      requestAnimationFrame(grow);
    };
    grow();
  }

  // Parked cars near this person, and those others are driving, at their drivers. One new parked car a frame, as with people.
  updateCars(viewer, now) {
    if (now - this.parkedAt > PARKED_LOOK_EVERY) {
      this.parkedAt = now;
      const { shownWithin, mostShown } = GAME.worldCars;
      this.parkedList = this.cars.around(viewer, shownWithin, mostShown).filter((car) => car.id !== this.mine());
    }
    const wanted = new Set();
    let added = false;
    for (const car of this.parkedList) {
      wanted.add(car.id);
      if (this.carModels.has(car.id) || added) continue;
      added = true;
      this.placeCarModel(car, car);
    }
    for (const member of this.people.othersOnline) {
      const there = this.people.drawnAt(member.id, now);
      if (!there || there.flags & (FLAGS.onFoot | FLAGS.indoors)) continue;
      const car = [...this.cars.records.values()].find((known) => known.driver === member.id);
      if (!car || metresApart(viewer, there) > GAME.world.peopleShownWithin) continue;
      wanted.add(car.id);
      const shown = this.carModels.get(car.id) ?? this.placeCarModel(car, there);
      this.moveCar(shown, there, viewer, member);
    }
    for (const [id, shown] of this.carModels) {
      if (wanted.has(id)) continue;
      shown.element.remove();
      shown.tag?.remove();
      this.carModels.delete(id);
    }
    // A parked car someone has just left stays where it stopped.
    for (const car of this.parkedList) {
      const shown = this.carModels.get(car.id);
      if (shown && !!car.wrecked !== shown.wrecked) {
        shown.element.src = this.carSource(car);
        shown.wrecked = !!car.wrecked;
      }
      if (shown && car.coast) { // rolling to a stop with nobody at the wheel
        const place = coastPlace(car.coast, Date.now() + this.clockOffset());
        this.moveCar(shown, place, viewer);
        if (place.done) car.coast = null;
      } else if (shown && (shown.lat !== car.lat || shown.lng !== car.lng)) this.moveCar(shown, car, viewer);
      if (shown?.tag) {
        shown.tag.remove();
        shown.tag = null;
      }
    }
  }

  placeCarModel(car, at) {
    const element = this.model({ lat: at.lat, lng: at.lng, altitude: 0 }, this.carSource(car), CAR_SIZE);
    element.orientation = { heading: at.heading, tilt: 0, roll: 0 };
    const shown = { element, tag: null, lat: at.lat, lng: at.lng, heading: at.heading, wrecked: !!car.wrecked };
    this.carModels.set(car.id, shown);
    return shown;
  }

  moveCar(shown, at, viewer, driver) {
    if (Math.abs(at.lat - shown.lat) > 1e-7 || Math.abs(at.lng - shown.lng) > 1e-7) {
      shown.element.position = { lat: at.lat, lng: at.lng, altitude: 0 };
      shown.lat = at.lat;
      shown.lng = at.lng;
    }
    if (Math.abs(at.heading - shown.heading) > 0.1) {
      shown.element.orientation = { heading: at.heading, tilt: 0, roll: 0 };
      shown.heading = at.heading;
    }
    const mode = at.flags & FLAGS.bridge ? 'RELATIVE_TO_MESH' : 'RELATIVE_TO_GROUND';
    if (shown.element.altitudeMode !== mode) shown.element.altitudeMode = mode;
    if (!driver) return;
    const position = { lat: at.lat, lng: at.lng, altitude: TAG_HEIGHT };
    if (metresApart(viewer, at) > GAME.world.nameTagsWithin) {
      shown.tag?.remove();
      shown.tag = null;
    } else if (!shown.tag) {
      shown.tag = nameTag(this.maps3d, position, driver.name);
      this.map.append(shown.tag);
    } else shown.tag.position = position;
  }

  updatePerson(member, viewer, now) {
    const there = this.people.drawnAt(member.id, now), person = this.shown.get(member.id);
    const indoors = !there || (there.flags & FLAGS.indoors) || !(there.flags & FLAGS.onFoot), away = there ? metresApart(viewer, there) : Infinity; // driving counts: they're in the car
    if (indoors || away > LET_GO_BEYOND) {
      if (person && (away > LET_GO_BEYOND || !there)) this.remove(member.id);
      else if (person) this.hideAll(person);
      return;
    }
    if (!person) {
      if (away <= MODELS_WITHIN) this.begin(member, there);
      return;
    }
    const wanted = person.frames[there.gait] ? there.gait : 0, position = { lat: there.lat, lng: there.lng, altitude: 0 };
    if (person.current !== wanted) {
      if (person.frames[person.current]) person.frames[person.current].scale = HIDDEN;
      person.current = wanted;
      person.frames[wanted].scale = SHOWN;
    }
    if (Math.abs(there.lat - person.lat) > 1e-7 || Math.abs(there.lng - person.lng) > 1e-7 || Math.abs(there.heading - person.heading) > 0.5 || person.hidden) {
      person.frames[wanted].position = position;
      person.frames[wanted].orientation = { heading: there.heading, tilt: 0, roll: 0 };
      Object.assign(person, { lat: there.lat, lng: there.lng, heading: there.heading, hidden: false });
      if (person.frames[wanted].scale !== SHOWN) person.frames[wanted].scale = SHOWN;
    }
    this.syncTag(member, person, there, away);
  }

  hideAll(person) {
    if (person.hidden) return;
    person.hidden = true;
    if (person.frames[person.current]) person.frames[person.current].scale = HIDDEN;
    person.tag?.remove();
    person.tag = null;
  }

  syncTag(member, person, there, away) {
    if (away > GAME.world.nameTagsWithin) {
      person.tag?.remove();
      person.tag = null;
      return;
    }
    const position = { lat: there.lat, lng: there.lng, altitude: TAG_HEIGHT };
    if (!person.tag) {
      person.tag = nameTag(this.maps3d, position, member.name);
      this.map.append(person.tag);
      person.tagLat = there.lat;
      person.tagLng = there.lng;
    } else if (Math.abs(there.lat - person.tagLat) + Math.abs(there.lng - person.tagLng) > TAG_MOVES) {
      person.tag.position = position;
      person.tagLat = there.lat;
      person.tagLng = there.lng;
    }
  }

  // They show at once, standing: only the rest of their walk has to wait.
  begin(member, there) {
    const sources = this.sourcesFor({ figure: member.figure, colours: member.colours });
    const frames = new Array(FRAME_COUNT).fill(null);
    frames[0] = this.model({ lat: there.lat, lng: there.lng, altitude: 0 }, sources[0], SHOWN);
    this.shown.set(member.id, { frames, sources, current: 0, tag: null, lat: there.lat, lng: there.lng, heading: there.heading, next: 1 });
  }

  // One model a frame, for one person at a time, the next one a while after.
  addNextModel(now) {
    let person = this.building && this.shown.get(this.building);
    if (!person) {
      if (now < this.nextAt) return;
      const waiting = [...this.shown.entries()].find(([, other]) => other.next < FRAME_COUNT);
      if (!waiting) return;
      [this.building, person] = waiting;
    }
    person.frames[person.next] = this.model({ lat: person.lat, lng: person.lng, altitude: 0 }, person.sources[person.next], HIDDEN);
    person.next++;
    if (person.next >= FRAME_COUNT) {
      this.building = null;
      this.nextAt = now + NEXT_PERSON_AFTER;
    }
  }

  // Badges for a map: where each person is, in the order of the list. For the nav screen and the phone's Map.
  badges(initialsOf, colourOf) {
    return this.people.others.flatMap((member) => {
      const place = member.lives > 0 && member.online ? this.people.lastKnown(member.id) : null;
      return place ? [{ lat: place.lat, lng: place.lng, text: initialsOf(member.name), colour: colourOf(member) }] : [];
    });
  }
}
