import { newCar, stepCar } from './physics.js';
import { distance, easeAngle, leadDistance, move } from './camera.js';
import { FLAG_ONEWAY, RoadNet } from './road.js';
import { Path } from './route.js';
import { CAR_PROFILES, hornFor, profileFor } from './cars.js';
import { BODY_SHAPES, buildCarGlb, carPicture } from './carModel.js';
import { beamPools, drawPools, tailPools } from './headlights.js';
import { clockText, darknessAt, tintAt } from './daylight.js';
import { drawGauge, drawNav, revRange, speedRange, speedStep } from './dash.js';
import { EngineAudio } from './engineSound.js';
import { newGearbox, stepGearbox } from './gearbox.js';
import { frequencyText, Radio } from './radio.js';
import { loadSession, saveSession } from './session.js';
import { DEFAULTS, saveSettings, settings } from './settings.js';
import { RoadTiles } from './tiles.js';
import { burnFuel, newTrip, tripFigures, updateTrip } from './trip.js';

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
const HEADLIGHT_WIDTH = 7;     // m, half width of the pool of light
const HEADLIGHT_LENGTH = 11;   // m, half length
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
const engine = new EngineAudio();
let soundThrottle = 0, savedAt = 0, radioResume = false;
const SOUND_THROTTLE_RISE = 1.1; // s for a held W to reach full throttle in the sound; the car's acceleration doesn't change
const SAVE_EVERY = 2000; // ms between saving the trip
const gearbox = newGearbox();
const radio = new Radio(renderRadio);
let speedMax = 200, navDrawnAt = 0, navRadius = 1500, signalWasLit = false, radioArea = null;
const NAV_RANGES = [800, 1500, 3000, 6000]; // m from the car to the top of the nav screen
const TUNE_STEP = 12; // px of knob turn per station
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
  const aim = guide ? guide.path.pointAt(guide.at.along + Math.max(8, car.speed * 0.45)) : settings.roadFollow ? look : null;
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
  applyDaylight();
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
  if (lit !== signalWasLit && signal) engine.tick();
  signalWasLit = lit;
  drawDash(t);

  const nav = el('nav');
  nav.classList.toggle('active', !!destination);
  nav.classList.toggle('engaged', fsd);
  if (destination) {
    const boost = fsdBoost ? ` · ${fsdBoost > 0 ? '+' : ''}${fsdBoost} mph` : '';
    el('navState').textContent = fsd ? `FSD ON${boost}` : 'FSD OFF · press F';
    el('navWhere').textContent = destination.label;
  }
}

function drawDash(t) {
  const profile = profileFor(settings.carProfile);
  const mph = Math.abs(car.speed) * MPS_TO_MPH;
  speedMax = speedRange(mph, speedMax);
  drawGauge(el('speedGauge'), { value: mph, max: speedMax, step: speedStep(speedMax), big: String(Math.round(mph)), small: 'MPH' });
  const electric = !profile.cylinders;
  const charge = Math.round(trip.fuel);
  if (electric) {
    // Electric cars have no meaningful revs, so this dial is the battery.
    drawGauge(el('revGauge'), { value: trip.fuel, max: 100, step: 25, big: `${charge}%`, small: 'CHARGE' });
  } else {
    const max = revRange(profile.redline);
    drawGauge(el('revGauge'), { value: gearbox.rpm, max, step: max > 6000 ? 2000 : 1000, scale: 1000, redFrom: profile.redline, big: gearbox.label, small: 'x1000 RPM' });
  }
  el('fuel').style.visibility = electric ? 'hidden' : 'visible';
  el('fuel').classList.toggle('low', trip.fuel < 15);
  el('fuelBar').style.width = `${trip.fuel}%`;
  el('fuelValue').textContent = `${charge}%`;
  if (t - navDrawnAt > 200) {
    navDrawnAt = t;
    drawNav(el('navScreen'), { roads, pos, heading: car.heading, route: fsd || destination ? route : null, routeIndex, radius: navRadius });
    const now = new Date();
    const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    el('clock').textContent = time(now);
    let eta = '';
    if (destination && route) {
      const at = routeIndex ?? 0, seconds = route.secondsToEnd[at], miles = (route.length - route.cum[at]) / 1609.344;
      const left = seconds < 3600 ? `${Math.max(1, Math.round(seconds / 60))} min` : `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
      eta = `ETA ${time(new Date(now.getTime() + seconds * 1000))} · ${left} · ${miles.toFixed(1)} mi`;
    }
    el('eta').textContent = eta;
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

}

function setRadioPower(on) {
  engine.start();
  applySound();
  radio.setPower(on);
  if (on) refreshStations();
}

function turnKnob(element, degrees) {
  element.style.transform = `rotate(${degrees}deg)`;
}

function applySound() {
  radio.setVolume(settings.muted ? 0 : settings.radioVolume * settings.masterVolume);
  engine.applySettings(settings);
  turnKnob(el('volumeKnob'), -135 + settings.radioVolume * 270);
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
    braking = car.speed > 0.5 && (controls.reverse || controls.handbrake || controls.brake > 0 || arriving);
    // Pull up at the destination, unless the driver has already taken over.
    if (arriving && (controls.throttle || controls.reverse || controls.steer || car.speed <= 0)) arriving = false;
    if (arriving) controls.brake = PLAN_DECEL;
    const meters = stepCar(car, controls, dt);
    followRoad(!!controls.steer, guide, dt);
    if (meters) Object.assign(pos, move(pos.lat, pos.lng, car.heading, meters));
    updateTrip(trip, dt, meters, { speed: car.speed, fsd, onRoad: !!match, onBridge });
    burnFuel(trip, dt);
    const profile = profileFor(settings.carProfile);
    soundThrottle = controls.throttle > soundThrottle
      ? Math.min(controls.throttle, soundThrottle + dt / SOUND_THROTTLE_RISE)
      : Math.max(controls.throttle, soundThrottle - dt * 6);
    stepGearbox(gearbox, profile, car.speed, soundThrottle, dt);
    engine.update({ rpm: gearbox.rpm, load: gearbox.load, speedMph: Math.abs(car.speed) * MPS_TO_MPH, car: profile, running: true });
    if (t - savedAt > SAVE_EVERY) {
      savedAt = t;
      saveTrip();
    }
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
    if (!previewing()) engine.update({ rpm: gearbox.rpm, load: 0, speedMph: 0, car: profile, running: false });
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

// --- Saved trip -----------------------------------------------------------------------------------------------

function saveTrip() {
  saveSession({
    pos, heading: car.heading, zoom, camIndex, destination, fsd, fsdBoost, trip, lane, navRadius, label: el('where').textContent,
    radio: { on: radio.on, band: radio.band, stationId: radio.current?.id ?? null },
  });
}

// Puts everything back as it was. The car is stopped, and FSD carries on if it was driving.
async function restoreTrip(saved) {
  Object.assign(pos, saved.pos);
  Object.assign(car, newCar(), { heading: saved.heading });
  camHeading = saved.heading;
  zoom = saved.zoom;
  camIndex = saved.camIndex;
  tilt = CAMERAS[camIndex].tilt;
  range = CAMERAS[camIndex].range * zoom;
  el('cam').textContent = CAMERAS[camIndex].name;
  destination = saved.destination;
  fsd = saved.fsd;
  fsdBoost = saved.fsdBoost;
  trip = { ...newTrip(), ...saved.trip };
  lane = saved.lane;
  navRadius = saved.navRadius;
  el('where').textContent = saved.label;
  radio.band = saved.radio.band;
  radio.resumeId = saved.radio.stationId;
  radioResume = saved.radio.on; // browsers need a click or key press before sound can start
  renderRadio();
  tiles.ensure(pos.lat, pos.lng, car.heading, 0);
  await sampleGround();
  ground = groundTarget;
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
  if (!openId) return; // already closed by a double click
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

// --- Car look, time of day, lights, horn -----------------------------------------------------------------------

// The model is rebuilt only when the type or colour changes, and a colour drag settles before it swaps.
let carLookKey = '', carLookTimer = null;
function applyCarLook() {
  if (!model) return;
  clearTimeout(carLookTimer);
  const key = settings.carProfile + settings.carColor;
  if (key === carLookKey) return;
  carLookTimer = setTimeout(() => {
    carLookKey = key;
    // A data: URL, because the map doesn't load models from blob: URLs.
    const glb = buildCarGlb(settings.carProfile, settings.carColor);
    let text = '';
    for (let i = 0; i < glb.length; i += 8192) text += String.fromCharCode.apply(null, glb.subarray(i, i + 8192));
    model.src = `data:model/gltf-binary;base64,${btoa(text)}`;
  }, carLookKey ? 150 : 0);
}

// The tint covers the map, and the headlight beams are cut out of it and lightly added on top. The car's place on
// screen is fixed; the beams are sized from the car, zoom with the map and turn with the car against the camera.
let lightKey = '', braking = false;
function applyDaylight() {
  const dark = darknessAt(settings.hour), lit = settings.headlights;
  el('lightsButton').setAttribute('aria-pressed', String(lit));
  const box = el('map'), width = box.clientWidth, height = box.clientHeight;
  const angle = ((car.heading - camHeading + 540) % 360) - 180;
  const key = `${settings.hour}|${lit}|${Math.round(range)}|${Math.round(tilt)}|${settings.carScale}|${settings.carProfile}|${width}x${height}|${angle.toFixed(1)}|${braking}`;
  if (key === lightKey) return;
  lightKey = key;
  const night = el('night'), beam = el('beam');
  for (const canvas of [night, beam]) {
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }
  night.style.display = dark > 0.005 ? 'block' : 'none';
  beam.style.display = lit || braking ? 'block' : 'none';
  const shape = BODY_SHAPES[settings.carProfile] || BODY_SHAPES.sport;
  const length = shape.l * 2 * settings.carScale, carWidth = shape.w * 2 * settings.carScale;
  const view = {
    x: width / 2,
    y: height * (0.5 + CAR_BELOW_CENTRE / 2),
    perMetre: height / (2 * Math.tan(rad(FOV_Y / 2)) * Math.max(range, 1)),
    foreshorten: Math.cos(rad(tilt)),
    angle,
  };
  const pools = beamPools(length, carWidth);
  const tint = night.getContext('2d');
  tint.globalCompositeOperation = 'source-over';
  tint.fillStyle = `rgb(${tintAt(settings.hour).join(',')})`;
  tint.fillRect(0, 0, width, height);
  const light = beam.getContext('2d');
  light.clearRect(0, 0, width, height);
  if (lit) {
    tint.globalCompositeOperation = 'destination-out';
    drawPools(tint, pools, view, 0.32);
    // The car's own body, so it can be seen at night. Only the body: this isn't light on the road.
    tint.save();
    tint.translate(view.x, view.y);
    tint.scale(view.perMetre, view.perMetre * view.foreshorten);
    tint.rotate(rad(angle));
    tint.scale(carWidth * 0.6, length * 0.55);
    tint.fillStyle = 'rgba(0,0,0,0.55)';
    tint.beginPath();
    tint.arc(0, 0, 1, 0, Math.PI * 2);
    tint.fill();
    tint.restore();
    light.globalCompositeOperation = 'lighter';
    drawPools(light, pools, view, 0.03 + dark * 0.05, '255,240,190');
  }
  if (lit || braking) {
    const tails = tailPools(length, carWidth, lit, braking);
    tint.globalCompositeOperation = 'destination-out';
    drawPools(tint, tails, view, 1);
    light.globalCompositeOperation = 'lighter';
    drawPools(light, tails, view, 1, '255,30,20');
  }
}

function setHeadlights(on) {
  settings.headlights = on;
  applyDaylight();
  saveSettings();
}

function hornDown(button = el('hornButton')) {
  engine.start();
  applySound();
  engine.hornOn(hornFor(settings.carProfile));
  button.classList.add('on');
}

function hornUp(button = el('hornButton')) {
  engine.hornOff();
  button.classList.remove('on');
}

// --- Settings -------------------------------------------------------------------------------------------------

// The game pauses while the panel is open, and the panel leaves the map in view so changes can be seen as they're made.
// Every control marked data-setting edits the setting of that name.
const settingText = {
  carScale: (v) => `${v.toFixed(1)}× real size`,
  hour: clockText,
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
  el('carPreview').innerHTML = carPicture(settings.carProfile, settings.carColor);
  applyCarLook();
  applyDaylight();
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
    saveSettings();
    previewEngine();
  });
}

// Moving a sound control while paused should still let you hear the engine: a short blip of revs.
let previewUntil = 0;
const previewing = () => performance.now() < previewUntil;
function previewEngine() {
  engine.start();
  previewUntil = performance.now() + 900;
  const profile = profileFor(settings.carProfile);
  const blip = () => {
    const left = previewUntil - performance.now();
    if (left <= 0 || !dialogOpen) return;
    engine.update({ rpm: profile.redline * (0.3 + 0.35 * Math.sin((left / 900) * Math.PI)), load: 0.8, speedMph: 0, car: profile, running: true });
    setTimeout(blip, 50);
  };
  blip();
}

el('newTrip').addEventListener('click', () => { trip = newTrip(); updateHud(0); });

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
  saveSettings();
});
el('settingsDone').addEventListener('click', closeSettings);
el('openSettings').addEventListener('click', () => {
  if (el('settings').classList.contains('open')) closeSettings();
  else if (!dialogOpen) openSettings();
});
// Clicking anywhere outside the panel closes it; changes have already saved.
document.addEventListener('pointerdown', (e) => {
  const panel = el('settings');
  if (!panel.classList.contains('open') || panel.contains(e.target) || el('openSettings').contains(e.target)) return;
  closeSettings();
}, { capture: true });

// --- Dashboard ------------------------------------------------------------------------------------------------

el('lightsButton').addEventListener('click', () => setHeadlights(!settings.headlights));
el('hornButton').addEventListener('pointerdown', (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); hornDown(); });
for (const kind of ['pointerup', 'pointercancel']) el('hornButton').addEventListener(kind, () => hornUp());
el('radioPower').addEventListener('click', () => setRadioPower(!radio.on));
for (const b of document.querySelectorAll('.bands button')) b.addEventListener('click', () => radio.setBand(b.dataset.band));
el('radioList').addEventListener('change', () => { radio.tuneId(el('radioList').value); el('radioList').blur(); });
// Knobs turn by dragging up and down, or with the scroll wheel. `onTurn` gets the change in pixels.
function knob(element, onTurn) {
  let lastY = null;
  element.addEventListener('pointerdown', (e) => { e.preventDefault(); lastY = e.clientY; element.setPointerCapture(e.pointerId); });
  element.addEventListener('pointermove', (e) => {
    if (lastY === null) return;
    onTurn(lastY - e.clientY);
    lastY = e.clientY;
  });
  for (const kind of ['pointerup', 'pointercancel']) element.addEventListener(kind, () => { lastY = null; });
  element.addEventListener('wheel', (e) => { e.preventDefault(); onTurn(-Math.sign(e.deltaY) * 12); }, { passive: false });
}
knob(el('volumeKnob'), (pixels) => {
  settings.radioVolume = clamp(settings.radioVolume + pixels / 120, 0, 1);
  applySound();
  saveSettings();
});
// Tune clicks from station to station, in frequency order.
let tuneAngle = 0, tunePixels = 0;
knob(el('tuneKnob'), (pixels) => {
  tunePixels += pixels;
  tuneAngle += pixels * 3;
  turnKnob(el('tuneKnob'), tuneAngle);
  while (Math.abs(tunePixels) >= TUNE_STEP) {
    radio.seek(Math.sign(tunePixels));
    tunePixels -= Math.sign(tunePixels) * TUNE_STEP;
  }
});
el('navScreen').addEventListener('click', () => {
  navRadius = NAV_RANGES[(NAV_RANGES.indexOf(navRadius) + 1) % NAV_RANGES.length];
  navDrawnAt = 0;
});
el('helpButton').addEventListener('click', () => el('help').classList.toggle('open'));
// Browsers only allow sound after the first click or key press.
for (const kind of ['pointerdown', 'keydown']) {
  document.addEventListener(kind, () => {
    engine.start();
    applySound();
    if (radioResume) { radioResume = false; setRadioPower(true); }
  }, { capture: true });
}
window.addEventListener('pagehide', () => { if (map) saveTrip(); });

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
  if (k === 'j') setHeadlights(!settings.headlights);
  if (k === 'b') hornDown();
  if (k === 't') {
    settings.hour = (settings.hour + 1) % 24;
    applyDaylight();
    saveSettings();
    notice(clockText(settings.hour), 1500);
  }
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
document.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'b') hornUp();
}, { capture: true });
window.addEventListener('blur', () => { keys.clear(); hornUp(); });
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
    const saved = loadSession();
    if (saved) await restoreTrip(saved);
    else await openDialog('start'); // the map itself loads only once the start is chosen
    map = new maps3d.Map3DElement({ center: { ...pos, altitude: ground }, heading: car.heading, tilt, range, fov: FOV_Y, mode: 'HYBRID', defaultUIHidden: true });
    map.style.width = map.style.height = '100%';
    el('map').replaceChildren(map);
    if (maps3d.Model3DElement) {
      model = new maps3d.Model3DElement({ position: { ...pos, altitude: 0 }, altitudeMode: 'RELATIVE_TO_GROUND', orientation: { heading: car.heading, tilt: 0, roll: 0 }, scale: settings.carScale });
      map.append(model);
    }
    applyCarLook();
    syncScene(0);
    applyDaylight();
    if (saved) {
      if (destination) requestRoute(true);
      notice(`Trip restored${destination ? `, heading to ${destination.label}` : ''}. Press L for a new start.${radioResume ? ' The radio comes back at your first key press.' : ''}`, 6000);
    }
    window.__geodrive = Object.assign(debug, {
      settings, gearbox, saveTrip, engine, radio, map, model, ground: () => ground, match: () => match, onBridge: () => onBridge, placeCar, pressSignal,
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
