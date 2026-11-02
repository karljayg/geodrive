// A full shared world's worth of other players on the real map, to see what this machine makes of it before they exist: seven others on foot with name tags,
// seven driving and twenty parked cars, added the way the game will add them. Run from the console with __geodrive.crowdTest(), full screen, with the car
// parked. It needs nothing but the map already loaded, so it adds no Google call, and it removes everything after. Loaded only when it's run.
import { buildCarGlb, buildPersonGlb } from './carModel.js';
import { FRAME_COUNT, personParts } from './footPerson.js';
import { fromLocal } from './footData.js';

export const CROWD = { others: 7, parked: 20, walkRange: 40, driveRange: 120, parkedRange: 250 }; // m around the camera's centre
const MEASURE = 6000; // ms
const THROTTLED = 500; // ms between frames with nothing added
const STRIDES = 8;    // walking frames a second
const TAG = { height: 2.2, size: 15 };
const COLOURS = ['#ff5533', '#3388ff', '#33cc66', '#ffcc33', '#cc55ff', '#33cccc', '#ffffff'];

// The frame rate and how even it was, while step runs each frame.
function measure(ms, step) {
  return new Promise((done) => {
    const gaps = [], began = performance.now();
    let last = began, spent = 0;
    const frame = () => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
      const before = performance.now();
      step?.(now);
      spent += performance.now() - before;
      if (now - began < ms) return requestAnimationFrame(frame);
      const sorted = gaps.slice().sort((a, b) => a - b);
      done({ fps: Math.round((gaps.length / (now - began)) * 10000) / 10, p50: Math.round(sorted[sorted.length >> 1] * 10) / 10, p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10, worst: Math.round(sorted[sorted.length - 1]), scriptMs: Math.round((spent / gaps.length) * 100) / 100 });
    };
    requestAnimationFrame(frame);
  });
}

function tagMarker(maps3d, position, name) {
  const width = 16 + name.length * 9, svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), marker = new maps3d.Marker3DElement({ position, altitudeMode: 'RELATIVE_TO_GROUND', extruded: false, sizePreserved: true, drawsWhenOccluded: true }), template = document.createElement('template');
  svg.setAttribute('width', width);
  svg.setAttribute('height', 24);
  svg.setAttribute('viewBox', `0 0 ${width} 24`);
  svg.innerHTML = `<rect width="${width}" height="24" rx="5" fill="#000" fill-opacity=".55"/><text x="${width / 2}" y="17" font-family="system-ui,sans-serif" font-size="${TAG.size}" font-weight="600" text-anchor="middle" fill="#fff"></text>`;
  svg.querySelector('text').textContent = name;
  template.content.append(svg);
  marker.append(template);
  return marker;
}

export async function runCrowdTest({ maps3d, map, at, glbUrl, log, spinCamera = true }) {
  const results = { window: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency };
  const added = [], people = [], cars = [], pending = [];
  const local = (range, turn) => fromLocal(at, Math.sin(turn) * range, Math.cos(turn) * range);
  const groundAt = (range, turn, altitude = 0) => ({ ...local(range, turn), altitude });
  const add = (element) => { map.append(element); added.push(element); return element; };
  const model = (position, src, scale) => {
    const element = new maps3d.Model3DElement({ position, altitudeMode: 'RELATIVE_TO_GROUND', orientation: { heading: 0, tilt: 0, roll: 0 }, scale });
    element.src = src;
    return element;
  };
  const headingFirst = map.heading;
  try {
    results.nobody = await measure(MEASURE);
    // A window out of sight gets a frame now and then, which says nothing about the map.
    if (document.hidden || results.nobody.worst > THROTTLED) {
      results.notInView = true;
      console.warn('The window seems to be out of sight or throttled, so these figures mean little. Run it again with the window in front.');
    }

    // What building one person's looks costs, in their own colours.
    const shapes = Array.from({ length: FRAME_COUNT }, (_, frame) => personParts(frame));
    const bakeBegan = performance.now();
    const carSources = COLOURS.map((colour) => glbUrl(buildCarGlb('sport', colour)));
    const personSources = COLOURS.map((colour) => {
      const hex = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255);
      return shapes.map((parts) => glbUrl(buildPersonGlb(parts.map((part, i) => (i === 1 ? { ...part, colour: hex } : part)))));
    });
    results.bakeAllMs = Math.round(performance.now() - bakeBegan);

    // Everything goes on one at a time, one a frame, as the game will.
    for (let i = 0; i < CROWD.others; i++) {
      const turn = (i / CROWD.others) * Math.PI * 2, frames = [];
      for (let f = 0; f < FRAME_COUNT; f++) pending.push(() => { frames[f] = add(model(groundAt(CROWD.walkRange, turn), personSources[i][f], f === 0 ? 1.1 : 0.001)); });
      pending.push(() => people.push({ frames, tag: add(tagMarker(maps3d, groundAt(CROWD.walkRange, turn, TAG.height), `Player${i + 2}`)), turn, shown: 0 }));
      pending.push(() => cars.push({ element: add(model(groundAt(CROWD.driveRange, turn), carSources[i], 0.9)), turn }));
    }
    for (let i = 0; i < CROWD.parked; i++) {
      pending.push(() => add(model(groundAt(30 + (i / CROWD.parked) * CROWD.parkedRange, i * 2.4), carSources[i % carSources.length], 0.9)));
    }
    const models = pending.length;
    results.adding = await measure(Math.max(MEASURE, (models / 30) * 1000), () => pending.shift()?.());
    results.models = added.length;
    results.stillToAdd = pending.length;
    while (pending.length) pending.shift()();

    results.allStanding = await measure(MEASURE);

    let stride = -1;
    const everyoneMoves = (now) => {
      const nextStride = Math.floor((now / 1000) * STRIDES);
      for (const person of people) {
        const turn = person.turn + now / 9000, position = groundAt(CROWD.walkRange, turn), shown = 1 + (nextStride % 8);
        if (nextStride !== stride) {
          person.frames[person.shown].scale = 0.001;
          person.frames[shown].scale = 1.1;
          person.shown = shown;
        }
        person.frames[shown].position = position;
        person.frames[shown].orientation = { heading: ((turn * 180) / Math.PI + 90) % 360, tilt: 0, roll: 0 };
        person.tag.position = groundAt(CROWD.walkRange, turn, TAG.height);
      }
      stride = nextStride;
      for (const { element, turn } of cars) {
        const along = turn + now / 3000;
        element.position = groundAt(CROWD.driveRange, along);
        element.orientation = { heading: ((along * 180) / Math.PI + 90) % 360, tilt: 0, roll: 0 };
      }
    };
    results.allMoving = await measure(MEASURE, everyoneMoves);
    if (spinCamera) {
      results.allMovingCameraTurning = await measure(MEASURE, (now) => {
        everyoneMoves(now);
        map.heading = (headingFirst + (now % 36000) / 100) % 360;
      });
    }
  } finally {
    pending.length = 0;
    for (const element of added) element.remove();
    map.heading = headingFirst;
  }
  log?.event('crowd', results);
  console.table(Object.fromEntries(Object.entries(results).filter(([, value]) => value && typeof value === 'object')));
  return results;
}
