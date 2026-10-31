import { newCar, stepCar } from './physics.js';
import { distance, easeAngle, leadDistance, move } from './camera.js';
import { FLAG_ONEWAY, RoadNet } from './road.js';
import { Path } from './route.js';
import { CAR_PROFILES, profileFor } from './cars.js';
import { drawGauge, drawNav } from './dash.js';
import { EngineSound } from './engineSound.js';
import { newGearbox, stepGearbox } from './gearbox.js';
import { frequencyText, Radio } from './radio.js';
import { DEFAULTS, saveSettings, settings } from './settings.js';
import { RoadTiles } from './tiles.js';
import { newTrip, tripFigures, updateTrip } from './trip.js';

const ORIGINAL_START = { label: 'Saarinen Circle, Dulles Airport, Virginia', lat: 38.9555, lng: -77.4475, heading: 270 };
const START_STORE = 'geodrive_start_v1';
const MPS_TO_MPH = 2.23694;
const CAR_BELOW_CENTRE = 0.45; // where the car sits on screen: 0 = centre, 1 = bottom edge
const FOV_Y = 35;             // the map's vertical field of view, degrees
const GROUND_SAMPLE_EVERY = 250; // m driven between elevation lookups at normal speeds
const BRIDGE_LIFT = 6;        // m the camera rises on a bridge, a typical deck height
const ZOOM_OUT_MAX = 8;       // the furthest zoom, as a multiple of the camera's range
const ZOOM_OUT_TIME = 1.6;    // seconds of holding Space to get from no zoom to the maximum
const FOLLOW_GAIN = 4;        // how hard the car turns toward the road, per second
const FOLLOW_MAX_YAW = 1.6;   // rad/s
const LANE_OFFSET = 3;        // m right of the centre line on two-way roads
const LANE_WIDTH = 3.5;       // m; a lane change moves the car this far sideways
const LANE_SHIFT_RATE = 2;    // m/s sideways during a lane change
const SIGNAL_BLINK_AFTER_LANE = 2500; // ms the signal stays on after a lane change
const SIGNAL_REACH = 12;      // seconds ahead, at the current speed, a signal looks for its turn
const SIGNAL_MIN_REACH = 300; // m
const PLAN_DECEL = 12;        // m/s² the turn and route speed plans brake at
const OFF_PATH = 40;          // m from a path that counts as having left it
const REROUTE_EVERY = 8000;   // ms at the least between route requests
const FSD_SPEED_STEP = 10;    // mph per press of - or =
const CRUISE_FACTOR = 1.4;    // a route's step times include stopping at lights, and FSD doesn't stop, so it runs above the average
const CRUISE_MIN = 11;        // m/s (25 mph)
const CRUISE_MAX = 45;        // m/s (100 mph)
const SNAP_DISTANCE = 100;    // m to the road for a saved start to go on to it
const SNAP_WAIT = 4000;       // ms a saved start will wait for road data
const ADDRESS_WAIT = 12000;   // ms a new address will wait for road data
const CAMERAS = [
  { name: 'CHASE', tilt: 62, range: 130 },
  { name: 'HIGH CHASE', tilt: 45, range: 320 },
  { name: 'TOP DOWN', tilt: 0, range: 700 },
];

const el = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rad = (d) => (d * Math.PI) / 180;
const keys = new Set();
const car = newCar();
const pos = { lat: ORIGINAL_START.lat, lng: ORIGINAL_START.lng };
const roads = new RoadNet();
const tiles = new RoadTiles(roads);
let start = loadStart();
let map = null, model = null, maps3d = null, camIndex = 0, camHeading = 0, zoom = 1, tilt = CAMERAS[0].tilt, range = CAMERAS[0].range;
let last = 0, dialogOpen = false, pendingSnap = false, match = null, recentWays = null, onBridge = false, tilesCheckedAt = 0;
let ground = 88, groundTarget = 88, elevation = null, geocoder = null, routesLib = null, sampledAt = null; // m above sea level
let signal = null; // { side, path, index, until } while a turn signal is on
let lane = 0, laneNow = LANE_OFFSET; // lane: metres chosen off the usual line; laneNow: the sideways offset right now
let destination = null, route = null, routeIndex = null, routeLine = null, routing = false, routedAt = 0, fsd = false, fsdBoost = 0, arriving = false;
let paused = false, trip = newTrip();
const engine = new EngineSound();
const gearbox = newGearbox();
const radio = new Radio(renderRadio);
let navDrawnAt = 0, navRadius = 1500, signalWasLit = false, radioArea = null;
const NAV_RANGES = [800, 1500, 3000, 6000]; // m from the car to the top of the nav screen
const RADIO_RESEARCH = 50000; // m driven before looking for stations again
const groundCache = new Map();
const debug = { hold: false, car, pos, keys, roads, tiles }; // window.__geodrive, for checks from the console

function loadStart() {
  try {
    const saved = JSON.parse(localStorage.getItem(START_STORE));
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) && Number.isFinite(saved.heading) && saved.label) return saved;
  } catch (err) {
    console.warn('saved start:', err);
  }
  return ORIGINAL_START;
}

function saveStart(value) {
  start = value;
  try {
    if (value === ORIGINAL_START) localStorage.removeItem(START_STORE);
    else localStorage.setItem(START_STORE, JSON.stringify(value));
  } catch (err) {
    console.warn('saving start:', err); // it still applies for this visit
  }
}

function input() {
  const left = keys.has('a') || keys.has('arrowleft'), right = keys.has('d') || keys.has('arrowright');
  return {
    throttle: keys.has('w') || keys.has('arrowup') ? 1 : 0,
    reverse: keys.has('s') || keys.has('arrowdown'),
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    handbrake: keys.has('shift'),
    brake: 0,
  };
}

// Map3DElement's center altitude is above sea level, so at altitude 0 it orbits a point far underground and
// the world swings past the car. Keeping it at ground height puts the pivot on the car, hence this lookup.
async function sampleGround() {
  if (!elevation) return;
  const moved = sampledAt ? distance(sampledAt.lat, sampledAt.lng, pos.lat, pos.lng) : Infinity;
  const speed = Math.abs(car.speed);
  if (moved < Math.max(GROUND_SAMPLE_EVERY, speed * 3)) return; // at most one lookup every 3 s, however fast
  sampledAt = { ...pos };
  const ahead = move(pos.lat, pos.lng, car.speed >= 0 ? car.heading : car.heading + 180, speed > 1 ? Math.max(120, speed * 1.5) : 0);
  const cell = ahead.lat.toFixed(3) + ',' + ahead.lng.toFixed(3);
  if (!groundCache.has(cell)) {
    try {
      const { results } = await elevation.getElevationForLocations({ locations: [ahead] });
      groundCache.set(cell, results[0].elevation);
    } catch (err) {
      console.warn('elevation:', err); // keep the last known height
      return;
    }
  }
  groundTarget = groundCache.get(cell);
}

// --- Turn signals ---------------------------------------------------------------------------------------------

// One press: take the next turn on that side if there is one coming up, otherwise change lanes that way.
function pressSignal(side) {
  if (signal && signal.side === side) return cancelSignal();
  cancelSignal();
  trip.signals++;
  const speed = Math.max(0, car.speed);
  const found = match && roads.findTurn(match, side, Math.max(SIGNAL_MIN_REACH, speed * SIGNAL_REACH), (speed * speed) / (2 * PLAN_DECEL) + 5);
  if (found) {
    signal = { side, path: new Path(found.points, { decel: PLAN_DECEL }), index: null };
    return;
  }
  changeLane(side);
}

function changeLane(side) {
  const twoWay = match && !(match.way.f & FLAG_ONEWAY);
  const next = lane + side * LANE_WIDTH;
  // No lane data is available, so this allows one lane either way, and never across a two-way road's centre line.
  if (Math.abs(next) > LANE_WIDTH || (twoWay && next < 0)) return notice(side < 0 ? 'No lane to the left, and no left turn coming up.' : 'No lane to the right, and no right turn coming up.', 3000);
  lane = next;
  signal = { side, path: null, until: performance.now() + SIGNAL_BLINK_AFTER_LANE };
}

function cancelSignal() {
  signal = null;
}

// --- Navigation -----------------------------------------------------------------------------------------------

const toLatLng = (p) => ({ lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng });

async function requestRoute(force = false) {
  if (!destination || routing || (!force && performance.now() - routedAt < REROUTE_EVERY)) return false;
  routing = true;
  routedAt = performance.now();
  try {
    const { routes } = await routesLib.Route.computeRoutes({
      origin: { lat: pos.lat, lng: pos.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode: 'DRIVING',
      polylineQuality: 'HIGH_QUALITY',
      fields: ['path', 'distanceMeters', 'durationMillis', 'legs'],
    });
    if (!routes || !routes.length) throw new Error('no route');
    const points = [];
    for (const leg of routes[0].legs || []) {
      for (const step of leg.steps || []) {
        const cruise = step.staticDurationMillis ? clamp(CRUISE_FACTOR * (step.distanceMeters / (step.staticDurationMillis / 1000)), CRUISE_MIN, CRUISE_MAX) : undefined;
        for (const p of step.path || []) points.push({ ...toLatLng(p), cruise });
      }
    }
    const usable = points.length > 1 ? points : routes[0].path.map(toLatLng);
    if (destination) {
      route = new Path(usable, { stopAtEnd: true, decel: PLAN_DECEL });
      routeIndex = null;
      drawRoute(routes[0].path.map(toLatLng));
    }
    return true;
  } catch (err) {
    console.warn('route:', err);
    notice('Could not get a route just now. It will try again, or press F to retry.', 4000);
    return false;
  } finally {
    routing = false;
  }
}

function drawRoute(path) {
  if (routeLine) routeLine.remove();
  routeLine = null;
  if (!map || !maps3d.Polyline3DElement || !path) return;
  routeLine = new maps3d.Polyline3DElement({ path, altitudeMode: 'CLAMP_TO_GROUND', strokeColor: '#2f9bffcc', strokeWidth: 8 });
  map.append(routeLine);
}

function setFsd(on, message) {
  if (on && !destination) return notice('Enter a destination first: press G.', 3000);
  fsd = on;
  if (on) {
    cancelSignal();
    // Coming back after an override: if the car has left the route, get a fresh one.
    const away = !route || route.locate(pos.lat, pos.lng, null).dist > OFF_PATH;
    if (away) requestRoute(true);
    else routeIndex = null;
  }
  if (message) notice(message, 3000);
}

function clearDestination() {
  destination = null;
  route = null;
  routeIndex = null;
  fsd = false;
  drawRoute(null);
}

// What the car is following right now, if not just the road: a signalled turn first, then the route.
function currentGuide() {
  if (signal && signal.path) {
    const at = signal.path.locate(pos.lat, pos.lng, signal.index);
    signal.index = at.index;
    if (at.along >= signal.path.length - 5 || at.dist > OFF_PATH) {
      cancelSignal(); // turn done, or missed
      lane = 0;
    } else {
      return { path: signal.path, at, cruise: Infinity };
    }
  }
  if (fsd && route) {
    const at = route.locate(pos.lat, pos.lng, routeIndex);
    routeIndex = at.index;
    if (at.along >= route.length - 6) {
      const where = destination.label;
      clearDestination();
      arriving = true;
      notice(`Arrived at ${where}.`, 6000);
      return null;
    }
    if (at.dist > OFF_PATH) {
      requestRoute();
      return null;
    }
    return { path: route, at, cruise: route.cruiseAt(at.index) };
  }
  return null;
}

// Plans the speed along the guide. FSD works the pedals; a signalled turn only brakes, so the driver's right foot
// still works. W in FSD lifts the cruise speed, like pressing the accelerator in the real thing, but curves still apply.
function applySpeed(controls, guide) {
  if (!guide) return;
  const curve = guide.path.limitAt(guide.at.index);
  const v = car.speed;
  let target = curve;
  if (fsd) {
    const cruise = controls.throttle ? Infinity : Math.max(3, guide.cruise + fsdBoost / MPS_TO_MPH);
    target = Math.min(curve, cruise);
    controls.throttle = clamp((target - v) / 3, 0, 1);
  } else if (v >= target) {
    controls.throttle = 0;
  }
  if (v > target + 0.5) controls.brake = clamp((v - target) * 3, 0, 40);
}

function steerToward(target, dt) {
  const dx = (target.lng - pos.lng) * Math.cos(rad(pos.lat)), dy = target.lat - pos.lat;
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  const error = ((bearing - car.heading + 540) % 360) - 180;
  const maxYaw = (Math.min(FOLLOW_MAX_YAW, (car.speed * Math.tan(0.6)) / 2.7) * 180) / Math.PI; // no sharper than the wheels allow at low speed
  car.heading = (car.heading + clamp(error * FOLLOW_GAIN, -maxYaw, maxYaw) * dt + 360) % 360;
}

// Finds the road under the car and, unless the driver is steering, turns the car along the guide or the road.
// Holding a steering key always wins: that's how to take a junction or leave the road, and it picks up the new road on release.
function followRoad(steering, guide, dt) {
  match = roads.match(pos.lat, pos.lng, car.speed >= 0 ? car.heading : car.heading + 180, recentWays);
  onBridge = !!match && match.bridge && match.dist < 15;
  const look = match ? roads.ahead(match, Math.max(12, Math.abs(car.speed) * 0.55)) : null;
  if (look) recentWays = look.ways;

  // Keep to the right on two-way roads, plus any lane the driver has chosen.
  const wanted = (look && !look.oneway ? LANE_OFFSET : 0) + lane;
  laneNow += clamp(wanted - laneNow, -LANE_SHIFT_RATE * dt, LANE_SHIFT_RATE * dt);

  if (steering || car.speed <= 1) return;
  const aim = guide ? guide.path.pointAt(guide.at.along + Math.max(8, car.speed * 0.45)) : look;
  if (!aim) return;
  steerToward(laneNow ? move(aim.lat, aim.lng, aim.bearing + 90, laneNow) : aim, dt);
}

function syncScene(dt) {
  const cam = CAMERAS[camIndex];
  // The camera trails the car's yaw slightly, so you see the nose turn in, and the world always pivots on the car.
  camHeading = dt ? easeAngle(camHeading, car.heading, 1 - Math.exp(-dt * 9)) : car.heading;
  // Zoom only changes while a key is held, so the view stays wherever it is let go.
  const zoomStep = Math.exp((dt * Math.log(ZOOM_OUT_MAX)) / ZOOM_OUT_TIME);
  if (keys.has(' ')) zoom = Math.min(ZOOM_OUT_MAX, zoom * zoomStep);
  if (keys.has('z')) zoom = Math.max(1, zoom / zoomStep);
  const ease = dt ? 1 - Math.exp(-dt * 5) : 1;
  tilt += (cam.tilt - tilt) * ease;
  range += (cam.range * zoom - range) * ease;

  const groundGoal = groundTarget + (onBridge ? BRIDGE_LIFT : 0);
  ground = dt ? ground + (groundGoal - ground) * (1 - Math.exp(-dt * 1.2)) : groundGoal;

  const lead = leadDistance(range, tilt, FOV_Y, CAR_BELOW_CENTRE);
  const center = move(pos.lat, pos.lng, camHeading, lead);
  map.heading = camHeading;
  map.tilt = tilt;
  map.range = range;
  map.center = { lat: center.lat, lng: center.lng, altitude: ground };
  if (model) {
    model.position = { lat: pos.lat, lng: pos.lng, altitude: 0 };
    model.orientation = { heading: car.heading, tilt: 0, roll: 0 };
    // The ground under a bridge is the valley floor, so on bridges the car rides on the 3D mesh instead. Only on
    // bridges: everywhere else the mesh includes tree tops and overpasses the car would climb on to.
    const mode = onBridge ? 'RELATIVE_TO_MESH' : 'RELATIVE_TO_GROUND';
    if (model.altitudeMode !== mode) model.altitudeMode = mode;
  }
}

function updateHud(t) {
  el('heading').textContent = String(Math.round(car.heading) % 360).padStart(3, '0') + '°';
  el('from').textContent = (distance(start.lat, start.lng, pos.lat, pos.lng) / 1609.344).toFixed(2) + ' mi';
  const figures = tripFigures(trip);
  for (const id of ['elapsed', 'miles', 'top', 'average']) el('hud-' + id).textContent = figures[id];
  el('road').textContent = onBridge ? 'ON BRIDGE' : match ? 'ON ROAD' : tiles.hasRoads(pos.lat, pos.lng) ? 'OFF ROAD' : 'LOADING ROADS';

  const blinkOn = Math.floor(t / 400) % 2 === 0;
  el('signalLeft').classList.toggle('on', !!signal && signal.side < 0 && blinkOn);
  el('signalRight').classList.toggle('on', !!signal && signal.side > 0 && blinkOn);
  const lit = !!signal && blinkOn;
  if (lit !== signalWasLit && signal) engine.tick(settings.muted ? 0 : settings.signalVolume * settings.masterVolume);
  signalWasLit = lit;
  drawDash(t);

  const nav = el('nav');
  nav.classList.toggle('active', !!destination);
  nav.classList.toggle('engaged', fsd);
  if (destination) {
    const remaining = route ? route.length - (routeIndex === null ? 0 : route.cum[routeIndex]) : null;
    const miles = remaining === null ? '…' : (remaining / 1609.344).toFixed(1) + ' mi';
    const boost = fsdBoost ? ` · ${fsdBoost > 0 ? '+' : ''}${fsdBoost} mph` : '';
    el('navState').textContent = fsd ? `FSD ON${boost}` : 'FSD OFF · press F';
    el('navWhere').textContent = `${destination.label} · ${miles}`;
  }
}

function drawDash(t) {
  const profile = profileFor(settings.carProfile);
  const mph = Math.abs(car.speed) * MPS_TO_MPH;
  drawGauge(el('speedGauge'), { value: mph, max: 500, step: 100, redFrom: null, big: String(Math.round(mph)), small: 'MPH' });
  const revStep = profile.redline > 10000 ? 3000 : 1000;
  drawGauge(el('revGauge'), { value: gearbox.rpm, max: profile.redline, step: revStep, scale: 1000, redFrom: profile.whine ? null : profile.redline * 0.9, big: gearbox.label, small: 'x1000 RPM' });
  if (t - navDrawnAt > 200) {
    navDrawnAt = t;
    drawNav(el('navScreen'), { roads, pos, heading: car.heading, route: fsd || destination ? route : null, routeIndex, radius: navRadius });
  }
}

// Looks for stations when the radio is first turned on, and again after a long drive.
async function refreshStations() {
  if (radioArea && distance(radioArea.lat, radioArea.lng, pos.lat, pos.lng) < RADIO_RESEARCH) return;
  radioArea = { lat: pos.lat, lng: pos.lng };
  let state = null, country = 'US';
  try {
    const { results } = await geocoder.geocode({ location: radioArea });
    for (const part of results[0]?.address_components || []) {
      if (part.types.includes('administrative_area_level_1')) state = part.long_name;
      if (part.types.includes('country')) country = part.short_name;
    }
  } catch (err) {
    console.warn('radio area:', err); // nearby stations still work without it
  }
  try {
    await radio.search(radioArea.lat, radioArea.lng, state, country);
  } catch (err) {
    console.warn('radio:', err);
    radio.say('Radio directory unavailable');
  }
}

function renderRadio() {
  const power = el('radioPower');
  power.textContent = radio.on ? 'Radio on' : 'Radio off';
  power.setAttribute('aria-pressed', String(radio.on));
  for (const b of document.querySelectorAll('.bands button')) b.classList.toggle('on', b.dataset.band === radio.band);
  const list = radio.list();
  const current = radio.current && radio.current.band === radio.band ? radio.current : null;
  el('radioFreq').textContent = radio.on && current ? frequencyText(current) : radio.on ? radio.band : '– – –';
  const state = radio.status === 'Playing' ? '' : `${radio.status}${current ? ' · ' : ''}`;
  el('radioName').textContent = radio.on ? `${state}${current ? current.name : ''}` : 'Off';

  const select = el('radioList');
  const signature = list.map((s) => s.id).join();
  if (select.dataset.signature !== signature) {
    select.dataset.signature = signature;
    select.replaceChildren(...list.map((s) => {
      const option = document.createElement('option');
      option.value = s.id;
      option.textContent = `${s.frequency ? frequencyText(s) + ' · ' : ''}${s.name}${s.local ? '' : ` (${radio.area})`}`;
      return option;
    }));
  }
  if (current) select.value = current.id;
  select.disabled = !list.length;

  const dial = el('radioDial');
  const tunable = list.filter((s) => s.frequency);
  dial.disabled = !tunable.length;
  if (radio.band === 'AM') { dial.min = 530; dial.max = 1700; dial.step = 10; } else { dial.min = 87.5; dial.max = 108; dial.step = 0.2; }
  if (current && current.frequency) dial.value = current.frequency;
}

function setRadioPower(on) {
  engine.start();
  applySound();
  radio.setPower(on);
  if (on) refreshStations();
}

function applySound() {
  radio.setVolume(settings.muted ? 0 : settings.radioVolume * settings.masterVolume);
  el('radioVolumeDash').value = settings.radioVolume;
}

function frame(t) {
  const dt = Math.min((t - last) / 1000 || 0, 0.06);
  last = t;
  if (map && !debug.hold && !dialogOpen && !paused) {
    const controls = input();
    // The driver can take over at any moment. Steering or braking drops FSD, and steering cancels a signal.
    if (controls.steer) cancelSignal();
    if (fsd && (controls.steer || controls.reverse || controls.handbrake)) {
      trip.takeovers++;
      setFsd(false, controls.steer ? 'FSD off: you are steering. Press F to go back to it.' : 'FSD off: you braked. Press F to go back to it.');
    }
    if (signal && !signal.path && t > signal.until) signal = null;

    const guide = currentGuide();
    applySpeed(controls, guide);
    // Pull up at the destination, unless the driver has already taken over.
    if (arriving && (controls.throttle || controls.reverse || controls.steer || car.speed <= 0)) arriving = false;
    if (arriving) controls.brake = PLAN_DECEL;
    const meters = stepCar(car, controls, dt);
    followRoad(!!controls.steer, guide, dt);
    if (meters) Object.assign(pos, move(pos.lat, pos.lng, car.heading, meters));
    updateTrip(trip, dt, meters, { speed: car.speed, fsd, onRoad: !!match, onBridge });
    const profile = profileFor(settings.carProfile);
    stepGearbox(gearbox, profile, car.speed, controls.throttle, dt);
    engine.update({ rpm: gearbox.rpm, load: gearbox.load, car: profile, volume: settings.muted ? 0 : settings.engineVolume * settings.masterVolume, pitch: settings.enginePitch, running: true });
    if (radio.on) refreshStations();
    if (t - tilesCheckedAt > 1000) {
      tilesCheckedAt = t;
      tiles.ensure(pos.lat, pos.lng, car.heading, car.speed);
    }
    lateSnap();
    sampleGround();
    syncScene(dt);
    updateHud(t);
  } else if (map) {
    // Paused or in a dialog: the engine goes quiet and the radio carries on.
    const profile = profileFor(settings.carProfile);
    engine.update({ rpm: gearbox.rpm, load: 0, car: profile, volume: 0, pitch: settings.enginePitch, running: false });
  }
  requestAnimationFrame(frame);
}

// --- Start point and destination ------------------------------------------------------------------------------

// An address placed before its roads arrived: move the car on to the road, as long as it is still sitting there.
function lateSnap() {
  if (!pendingSnap) return;
  if (Math.abs(car.speed) > 0.5) { pendingSnap = false; return; }
  if (!tiles.hasRoads(pos.lat, pos.lng)) return;
  pendingSnap = false;
  const road = roads.nearest(pos.lat, pos.lng, car.heading);
  if (!road) return;
  saveStart({ label: start.label, lat: road.lat, lng: road.lng, heading: road.heading });
  placeCar(start);
}

// Puts the car at `where`, on the road if one is right there, and settles the camera at once.
async function placeCar(where) {
  // Road data gets a moment to arrive, but a busy server shouldn't hold up the start.
  await Promise.race([tiles.loadNear(where.lat, where.lng), new Promise((r) => setTimeout(r, SNAP_WAIT))]);
  const road = roads.nearest(where.lat, where.lng, where.heading, SNAP_DISTANCE);
  Object.assign(pos, road ? { lat: road.lat, lng: road.lng } : { lat: where.lat, lng: where.lng });
  Object.assign(car, newCar(), { heading: road ? road.heading : where.heading });
  camHeading = car.heading;
  match = null;
  recentWays = null;
  onBridge = false;
  sampledAt = null;
  zoom = 1;
  lane = 0;
  fsd = false;
  arriving = false;
  route = null;
  drawRoute(null);
  cancelSignal();
  trip = newTrip();
  el('where').textContent = where.label;
  tiles.ensure(pos.lat, pos.lng, car.heading, 0);
  await sampleGround();
  ground = groundTarget;
  if (map) syncScene(0);
}

function reset() {
  placeCar(start);
}

function switchCamera() {
  camIndex = (camIndex + 1) % CAMERAS.length;
  el('cam').textContent = CAMERAS[camIndex].name;
}

// Resolves an address to the nearest road. Without road data (the servers can be busy) the address itself is used.
async function findStart(address) {
  const { results } = await geocoder.geocode({ address });
  const location = results[0].geometry.location, lat = location.lat(), lng = location.lng();
  const label = results[0].formatted_address;
  setStatus('start', `Found ${label}. Finding the nearest road…`);
  await Promise.race([tiles.loadNear(lat, lng), new Promise((r) => setTimeout(r, ADDRESS_WAIT))]);
  const road = tiles.hasRoads(lat, lng) ? roads.nearest(lat, lng, 0) : null;
  if (road) return { start: { label, lat: road.lat, lng: road.lng, heading: road.heading }, late: false };
  return { start: { label, lat, lng, heading: 0 }, late: true };
}

function setStatus(which, message, bad = false) {
  const box = el(which + 'Status');
  box.textContent = message;
  box.classList.toggle('bad', bad);
}

const lookupError = (err) => (err.code === 'ZERO_RESULTS' ? 'No match for that address. Try adding the city or state.' : 'Could not look up that address. Please try again.');

let closeDialog = null, openId = null;
function openDialog(id) {
  dialogOpen = true;
  openId = id;
  keys.clear();
  setStatus(id, '');
  if (id === 'start') {
    el('startDefault').textContent = start.label;
    el('resetDefault').style.display = start === ORIGINAL_START ? 'none' : 'inline';
  } else {
    el('destClear').style.display = destination ? 'inline-block' : 'none';
  }
  el(id).classList.add('open');
  el(id === 'start' ? 'startAddress' : 'destAddress').focus();
  return new Promise((resolve) => { closeDialog = resolve; });
}

function finishDialog() {
  el(openId).classList.remove('open');
  dialogOpen = false;
  openId = null;
  document.activeElement?.blur();
  if (closeDialog) closeDialog();
  closeDialog = null;
}

el('useDefault').addEventListener('click', async () => {
  await placeCar(start);
  finishDialog();
});
el('resetDefault').addEventListener('click', () => {
  saveStart(ORIGINAL_START);
  el('startDefault').textContent = start.label;
  el('resetDefault').style.display = 'none';
});
el('startForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = el('startAddress').value.trim();
  if (!address) return setStatus('start', 'Enter an address first.', true);
  el('startGo').disabled = el('useDefault').disabled = true;
  setStatus('start', 'Looking up the address…');
  try {
    const found = await findStart(address);
    saveStart(found.start);
    await placeCar(found.start);
    el('startAddress').value = '';
    finishDialog();
    if (found.late) {
      pendingSnap = true;
      notice('Road data is not available right now, so the car is at the address itself. It will move on to the nearest road when the data arrives, if it has not driven off.', 10000);
    }
  } catch (err) {
    console.warn('address:', err);
    setStatus('start', lookupError(err), true);
  } finally {
    el('startGo').disabled = el('useDefault').disabled = false;
  }
});
el('changeStart').addEventListener('click', () => { if (!dialogOpen) openDialog('start'); });

el('destForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = el('destAddress').value.trim();
  if (!address) return setStatus('dest', 'Enter an address first.', true);
  el('destGo').disabled = true;
  setStatus('dest', 'Finding a route…');
  try {
    const { results } = await geocoder.geocode({ address });
    const location = results[0].geometry.location;
    const previous = destination;
    destination = { label: results[0].formatted_address, lat: location.lat(), lng: location.lng() };
    if (!(await requestRoute(true))) {
      destination = previous;
      setStatus('dest', 'Could not find a route there.', true);
      return;
    }
    el('destAddress').value = '';
    finishDialog();
    setFsd(true);
  } catch (err) {
    console.warn('destination:', err);
    setStatus('dest', lookupError(err), true);
  } finally {
    el('destGo').disabled = false;
  }
});
el('destCancel').addEventListener('click', finishDialog);
el('destClear').addEventListener('click', () => { clearDestination(); finishDialog(); });
el('changeDest').addEventListener('click', () => { if (!dialogOpen) openDialog('dest'); });

// --- Pause ----------------------------------------------------------------------------------------------------

function renderTrip() {
  const figures = tripFigures(trip);
  for (const box of document.querySelectorAll('#tripStats [data-stat]')) box.textContent = figures[box.dataset.stat];
}

function setPaused(on) {
  if (!map || dialogOpen) return;
  paused = on;
  keys.clear();
  el('pause').classList.toggle('open', on);
  el('pauseButton').textContent = on ? 'Resume' : 'Pause';
  if (on) renderTrip();
}

el('pauseButton').addEventListener('click', () => setPaused(!paused));
el('touchPause').addEventListener('click', () => setPaused(!paused));
el('resume').addEventListener('click', () => setPaused(false));
el('tripReset').addEventListener('click', () => {
  trip = newTrip();
  renderTrip();
  updateHud(0);
});

// --- Settings -------------------------------------------------------------------------------------------------

// The game pauses while the panel is open, and the panel leaves the map in view so changes can be seen as they're made.
// Every control marked data-setting edits the setting of that name.
const settingText = {
  carScale: (v) => `${v.toFixed(1)}× real size`,
  enginePitch: (v) => `${Math.round(v * 100)}%`,
};
const percent = (v) => `${Math.round(v * 100)}%`;

function showSettings() {
  for (const control of document.querySelectorAll('[data-setting]')) {
    const name = control.dataset.setting;
    if (control.type === 'checkbox') control.checked = settings[name];
    else control.value = settings[name];
    const label = document.querySelector(`[data-value="${name}"]`);
    if (label) label.textContent = (settingText[name] || percent)(settings[name]);
  }
  if (model) model.scale = settings.carScale; // fixed in world units, so the car shrinks with the map when zooming out
  applySound();
}

el('carProfile').replaceChildren(...Object.entries(CAR_PROFILES).map(([id, car]) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = car.name;
  return option;
}));
for (const control of document.querySelectorAll('[data-setting]')) {
  control.addEventListener('input', () => {
    const name = control.dataset.setting;
    settings[name] = control.type === 'checkbox' ? control.checked : control.type === 'range' ? Number(control.value) : control.value;
    showSettings();
    previewEngine();
  });
}

// Moving a sound control while paused should still let you hear the engine: a short blip of revs.
let previewUntil = 0;
function previewEngine() {
  engine.start();
  previewUntil = performance.now() + 900;
  const profile = profileFor(settings.carProfile);
  const blip = () => {
    const left = previewUntil - performance.now();
    if (left <= 0 || !dialogOpen) return;
    engine.update({ rpm: profile.redline * (0.3 + 0.35 * Math.sin((left / 900) * Math.PI)), load: 0.8, car: profile, volume: settings.muted ? 0 : settings.engineVolume * settings.masterVolume, pitch: settings.enginePitch, running: true });
    setTimeout(blip, 50);
  };
  blip();
}

function openSettings() {
  dialogOpen = true;
  keys.clear();
  showSettings();
  el('settings').classList.add('open');
}

function closeSettings() {
  el('settings').classList.remove('open');
  dialogOpen = false;
  saveSettings();
}

el('settingsReset').addEventListener('click', () => {
  Object.assign(settings, DEFAULTS);
  showSettings();
});
el('settingsDone').addEventListener('click', closeSettings);
el('openSettings').addEventListener('click', () => { if (!dialogOpen) openSettings(); });

// --- Dashboard ------------------------------------------------------------------------------------------------

el('radioPower').addEventListener('click', () => setRadioPower(!radio.on));
for (const b of document.querySelectorAll('.bands button')) b.addEventListener('click', () => radio.setBand(b.dataset.band));
el('radioPrev').addEventListener('click', () => radio.seek(-1));
el('radioNext').addEventListener('click', () => radio.seek(1));
el('radioList').addEventListener('change', () => { radio.tuneId(el('radioList').value); el('radioList').blur(); });
el('radioDial').addEventListener('change', () => { radio.tuneFrequency(Number(el('radioDial').value)); el('radioDial').blur(); });
el('radioVolumeDash').addEventListener('input', () => {
  settings.radioVolume = Number(el('radioVolumeDash').value);
  applySound();
  saveSettings();
});
el('radioVolumeDash').addEventListener('change', () => el('radioVolumeDash').blur());
el('navScreen').addEventListener('click', () => {
  navRadius = NAV_RANGES[(NAV_RANGES.indexOf(navRadius) + 1) % NAV_RANGES.length];
  navDrawnAt = 0;
});
el('helpButton').addEventListener('click', () => el('help').classList.toggle('open'));
// Browsers only allow sound after the first click or key press.
for (const kind of ['pointerdown', 'keydown']) document.addEventListener(kind, () => engine.start(), { capture: true });

// --- Input ----------------------------------------------------------------------------------------------------

const DRIVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'z', 'shift']);
document.addEventListener('keydown', (e) => {
  if (el('settings').classList.contains('open') && (e.key === 'Escape' || e.key.toLowerCase() === 'o')) { e.preventDefault(); return closeSettings(); }
  if (dialogOpen) return; // the keys belong to the open dialog
  const k = e.key.toLowerCase();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (paused) {
    if ((k === 'p' || k === 'escape') && !e.repeat) { e.preventDefault(); setPaused(false); }
    return;
  }
  if (k === 'p' && !e.repeat) { e.preventDefault(); return setPaused(true); }
  if (DRIVE_KEYS.has(k)) { keys.add(k); e.preventDefault(); e.stopPropagation(); }
  if (e.repeat) return;
  if (k === 'c') switchCamera();
  if (k === 'r') reset();
  if (k === 'l') { e.preventDefault(); openDialog('start'); }
  if (k === 'g') { e.preventDefault(); openDialog('dest'); }
  if (k === 'o') { e.preventDefault(); openSettings(); }
  if (k === 'n') setRadioPower(!radio.on);
  if (k === '[') radio.seek(-1);
  if (k === ']') radio.seek(1);
  if (k === 'h') el('help').classList.toggle('open');
  if (k === 'm') { settings.muted = !settings.muted; applySound(); saveSettings(); notice(settings.muted ? 'Sound muted. Press M to turn it back on.' : 'Sound on.', 2000); }
  if (k === 'q') pressSignal(-1);
  if (k === 'e') pressSignal(1);
  if (k === 'f') setFsd(!fsd);
  if (k === '=' || k === '+') fsdBoost += FSD_SPEED_STEP;
  if (k === '-') fsdBoost -= FSD_SPEED_STEP;
}, { capture: true });
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()), { capture: true });
window.addEventListener('blur', () => keys.clear());
for (const b of document.querySelectorAll('#touch button[data-key]')) {
  const k = b.dataset.key;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(k); b.setPointerCapture(e.pointerId); });
  b.addEventListener('pointerup', () => keys.delete(k));
  b.addEventListener('pointercancel', () => keys.delete(k));
}
el('touchQ').addEventListener('click', () => pressSignal(-1));
el('touchE').addEventListener('click', () => pressSignal(1));
el('touchF').addEventListener('click', () => setFsd(!fsd));

let noticeTimer = null;
function notice(message, hideAfter = 0) {
  el('notice').textContent = message;
  el('notice').style.display = 'block';
  clearTimeout(noticeTimer);
  if (hideAfter) noticeTimer = setTimeout(() => { el('notice').style.display = 'none'; }, hideAfter);
}
window.gm_authFailure = () => notice('Google Maps rejected this API key. Check that the Maps JavaScript, Map Tiles, Elevation, Geocoding and Routes APIs and billing are on, and that the key allows this site in its HTTP referrer list.');

function loadGoogle(key, channel) {
  return new Promise((resolve, reject) => {
    window.__geoReady = resolve;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=${channel}&libraries=maps3d&loading=async&callback=__geoReady`;
    script.onerror = () => reject(new Error('The Google Maps script failed to load.'));
    document.head.appendChild(script);
  });
}

async function boot() {
  let key = null;
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (res.ok) key = (await res.json()).googleMapsApiKey;
  } catch (err) {
    console.warn('config.json:', err);
  }
  if (!key || /^YOUR_/i.test(key)) return notice('No Google Maps key: copy config.example.json to config.json and set googleMapsApiKey.');
  try {
    await loadGoogle(key, new URLSearchParams(location.search).get('v') || 'weekly');
    maps3d = await google.maps.importLibrary('maps3d');
    elevation = new (await google.maps.importLibrary('elevation')).ElevationService();
    geocoder = new (await google.maps.importLibrary('geocoding')).Geocoder();
    routesLib = await google.maps.importLibrary('routes');
    await openDialog('start'); // the map itself loads only once the start is chosen
    map = new maps3d.Map3DElement({ center: { ...pos, altitude: ground }, heading: car.heading, tilt, range, fov: FOV_Y, mode: 'HYBRID', defaultUIHidden: true });
    map.style.width = map.style.height = '100%';
    el('map').replaceChildren(map);
    if (maps3d.Model3DElement) {
      model = new maps3d.Model3DElement({ src: new URL('assets/car.glb', location.href).href, position: { ...pos, altitude: 0 }, altitudeMode: 'RELATIVE_TO_GROUND', orientation: { heading: car.heading, tilt: 0, roll: 0 }, scale: settings.carScale });
      map.append(model);
    }
    syncScene(0);
    window.__geodrive = Object.assign(debug, {
      gearbox, engine, radio, map, model, ground: () => ground, match: () => match, onBridge: () => onBridge, placeCar, pressSignal,
      trip: () => trip, paused: () => paused, nav: () => ({ fsd, destination, route, routeIndex, signal, lane, laneNow }),
    });
  } catch (err) {
    notice('Could not load the map: ' + err.message);
  }
}

applySound();
renderRadio();
requestAnimationFrame(frame);
boot();
