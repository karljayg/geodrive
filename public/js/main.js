import { newCar, stepCar } from './physics.js';
import { distance, easeAngle, leadDistance, move } from './camera.js';
import { FLAG_ONEWAY, RoadNet } from './road.js';
import { Path, brakeFor, pursuitYaw, rerouteWait } from './route.js';
import { CAR_PROFILES, hornFor, profileFor } from './cars.js';
import { engineFadeAt } from './engineMix.js';
import { BODY_SHAPES, buildCarGlb, buildPersonGlb, carPicture } from './carModel.js';
import { beamPools, brakeLit, drawDots, drawPools, tailDots } from './headlights.js';
import { clockText, darknessAt, tintAt } from './daylight.js';
import { drawGauge, drawNav, navBehind, revRange, speedRange, speedStep } from './dash.js';
import { EngineAudio } from './engineSound.js';
import { apiPanelRows, describeMachine, observeBrowser, PerfLog } from './perflog.js';
import { newGearbox, stepGearbox } from './gearbox.js';
import { frequencyText, Radio } from './radio.js';
import { clearRoute, loadRoute, loadSession, saveRoute, saveSession } from './session.js';
import { DEFAULTS, saveSettings, settings } from './settings.js';
import { decodeShare, encodeShare, packShare, shareSummary } from './share.js';
import { RoadTiles } from './tiles.js';
import { Terrain } from './terrain.js';
import { placeFrom } from './town.js';
import { burnFuel, newTrip, tripFigures, updateTrip } from './trip.js';

const ORIGINAL_START = { label: 'Saarinen Circle, Dulles Airport, Virginia', lat: 38.9555, lng: -77.4475, heading: 270 };
const START_STORE = 'geodrive_start_v1';
const MPS_TO_MPH = 2.23694;
const CAR_BELOW_CENTRE = 0.45; // where the car sits on screen: 0 = centre, 1 = bottom edge
const FOV_Y = 35;             // the map's vertical field of view, degrees
const GROUND_SAMPLE_EVERY = 250; // m driven between looking up the ground's height
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
const PLAN_DECEL = 8;         // m/s² the turn and route speed plans brake at, firm but not an emergency stop
const OFF_PATH = 40;          // m from a path that counts as having left it
const REROUTE_CALM = 600000;  // ms after which a new route no longer counts as following the last one
const FSD_SPEED_STEP = 10;    // mph per press of - or =
const CRUISE_FACTOR = 1.4;    // a route's step times include stopping at lights, and FSD doesn't stop, so it runs above the average
const CRUISE_MIN = 11;        // m/s (25 mph)
const CRUISE_MAX = 45;        // m/s (100 mph)
const SNAP_DISTANCE = 100;    // m to the road for a saved start to go on to it
const SNAP_WAIT = 4000;       // ms a saved start will wait for road data
const ADDRESS_WAIT = 12000;   // ms a new address will wait for road data
const ROUTE_DRAWN = 8000;     // m of route drawn on the map ahead of the car
const ROUTE_REDRAW = 2000;    // m driven before that stretch moves on
const TOWN_EVERY = 8000;      // m driven between looking up the town, as each lookup is billed
const TOWN_WAIT = 60000;      // ms at the least between lookups
const STOPPED_MPH = 1;        // slower than this counts as stopped, for getting out
const LOOK_SENSITIVITY = 0.0025; // radians per pixel of mouse
const FOOT_RANGE_SHARE = 0.5; // how close the view is on foot, as a share of the closest driving camera's range
const HIDDEN_PERSON = 0.001;
const FOOT_TURN = 1.5;        // radians a second that Q and E turn the view on foot
const TOUCH_LOOK = 1.6;       // a drag on a touch screen goes further than the same mouse move
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
let ground = 88, groundTarget = 88, groundKnown = false, geocoder = null, routesLib = null, sampledAt = null; // m above sea level
let signal = null; // { side, path, index, until } while a turn signal is on
let lane = 0, laneNow = LANE_OFFSET; // lane: metres chosen off the usual line; laneNow: the sideways offset right now
let destination = null, route = null, routeIndex = null, routeLine = null, routing = false, routedAt = 0, reroutes = 0, fsd = false, fsdBoost = 0, arriving = false;
let paused = false, trip = newTrip();
const engine = new EngineAudio();
let soundThrottle = 0, savedAt = 0, radioResume = false, radioHeld = false;
const SOUND_THROTTLE_RISE = 1.1; // s for a held W to reach full throttle in the sound; the car's acceleration doesn't change
const SAVE_EVERY = 2000; // ms between saving the trip
const gearbox = newGearbox();
const radio = new Radio(renderRadio, showSong);
let gaugesDrawnAt = 0, speedMax = 200, navDrawnAt = 0, navRadius = 1500, signalWasLit = false, radioArea = null;
const NAV_RANGES = [800, 1500, 3000, 6000]; // m from the car to the top of the nav screen
const TUNE_STEP = 12; // px of knob turn per station
const RADIO_RESEARCH = 50000; // m driven before looking for stations again
const terrain = new Terrain();
function logStore() {
  try {
    return localStorage;
  } catch (err) {
    return { getItem: () => null, setItem() {}, removeItem() {} }; // storage is blocked, so the log lasts this visit at most
  }
}
const perfLog = new PerfLog(logStore());
tiles.onWork = (ms) => perfLog.spend('tile', ms);
let lineVertices = 0, lineAlong = 0, navVertices = 0;
let hudTextAt = 0, startLabel = '', town = null, townAt = null, townAsked = -Infinity, townBusy = false;
let lockedTimer = 0;
const LOCKED_TIME = 2800; // ms
let carRadio = null; // what the car's radio was doing when they got out
let pocket = null; // the phone, compass, notepad and bag, made the first time someone gets out
let people = null, foot = null, footLoading = false, lookX = 0, lookY = 0, touchLook = null; // the walk in progress, while out of the car
const debug = { hold: false, car, pos, keys, roads, tiles, perfLog }; // window.__geodrive, for checks from the console

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
// Google is only the fallback for a first height when terrain tiles aren't answering: the camera can't start without one,
// and each Google lookup is billed. After that it keeps the last height until the tiles are back.
async function googleGround(at) {
  try {
    if (!window.google?.maps) return null;
    const service = new (await google.maps.importLibrary('elevation')).ElevationService();
    perfLog.count('elevations');
    const { results } = await service.getElevationForLocations({ locations: [at] });
    return results[0].elevation;
  } catch (err) {
    console.warn('elevation:', err);
    return null;
  }
}

async function sampleGround() {
  const moved = sampledAt ? distance(sampledAt.lat, sampledAt.lng, pos.lat, pos.lng) : Infinity;
  const speed = Math.abs(car.speed);
  if (moved < GROUND_SAMPLE_EVERY) return;
  const asked = sampledAt = { ...pos };
  const ahead = move(pos.lat, pos.lng, car.speed >= 0 ? car.heading : car.heading + 180, speed > 1 ? Math.max(120, speed * 1.5) : 0);
  let height = await terrain.heightAt(ahead.lat, ahead.lng);
  if (height === null && !groundKnown) height = await googleGround(ahead);
  if (height === null || asked !== sampledAt) return;
  groundKnown = true;
  groundTarget = height;
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
  const since = performance.now() - routedAt;
  if (!destination || routing || (!force && since < rerouteWait(reroutes))) return false;
  // Asked for by the driver, it's always answered. Only the automatic ones back off.
  if (!force) reroutes = since > REROUTE_CALM ? 0 : reroutes + 1;
  routing = true;
  routedAt = performance.now();
  perfLog.count('routes');
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
      useRoute(usable, 'google');
      drawRoute();
      saveRoute(destination, usable);
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

function useRoute(points, source) {
  const began = performance.now();
  route = new Path(points, { stopAtEnd: true, decel: PLAN_DECEL });
  routeIndex = null;
  perfLog.event('route', { source, from: points.length, points: route.points.length, km: Math.round(route.length / 1000), buildMs: Math.round(performance.now() - began) });
}

// A refresh carries on with the route it had, as asking again is billed. Off that route, FSD asks for a new one as usual.
function resumeRoute() {
  const saved = loadRoute(destination);
  if (!saved) return false;
  useRoute(saved, 'saved');
  routeIndex = route.locate(pos.lat, pos.lng).index;
  drawRoute();
  return true;
}

// Only the stretch ahead goes on the map, because a line clamped to the ground costs the map for every point it holds,
// and a route between states has tens of thousands. The nav screen shows the way beyond it.
function drawRoute() {
  if (!route) {
    routeLine?.remove();
    routeLine = null;
    lineVertices = 0;
    return;
  }
  if (!map || !maps3d.Polyline3DElement) return;
  const from = routeIndex ?? 0, path = route.lineAhead(from, ROUTE_DRAWN);
  lineAlong = route.cum[from];
  lineVertices = path.length;
  if (routeLine) {
    routeLine.path = path;
  } else {
    routeLine = new maps3d.Polyline3DElement({ path, altitudeMode: 'CLAMP_TO_GROUND', strokeColor: '#2f9bffcc', strokeWidth: 8 });
    map.append(routeLine);
  }
}

// Keeps the drawn stretch ahead of the car, on FSD or driving by hand. By hand the car may leave the line and rejoin
// anywhere, so a point too far from the last one searches the whole route.
function advanceRouteLine() {
  if (!route) return;
  if (!fsd) {
    const near = route.locate(pos.lat, pos.lng, routeIndex);
    routeIndex = (near.dist > OFF_PATH ? route.locate(pos.lat, pos.lng) : near).index;
  }
  if (routeIndex !== null && Math.abs(route.cum[routeIndex] - lineAlong) > ROUTE_REDRAW) drawRoute();
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
  clearRoute();
  destination = null;
  route = null;
  routeIndex = null;
  fsd = false;
  drawRoute();
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
  const v = car.speed;
  const curve = guide.path.targetAt(guide.at.along, v);
  let target = curve;
  if (fsd) {
    const cruise = controls.throttle ? Infinity : Math.max(3, guide.cruise + fsdBoost / MPS_TO_MPH);
    target = Math.min(curve, cruise);
    controls.throttle = clamp((target - v) / 3, 0, 1);
  } else if (v >= target) {
    controls.throttle = 0;
  }
  const brake = brakeFor(v, target);
  if (brake) controls.brake = brake;
}

// exact: drive the circle through the target, which holds a curved line without wobble, rather than swinging at it.
function steerToward(target, dt, exact = false) {
  const dx = (target.lng - pos.lng) * Math.cos(rad(pos.lat)), dy = target.lat - pos.lat;
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  const error = ((bearing - car.heading + 540) % 360) - 180;
  const maxYaw = (Math.min(FOLLOW_MAX_YAW, (car.speed * Math.tan(0.6)) / 2.7) * 180) / Math.PI; // no sharper than the wheels allow at low speed
  const wanted = exact ? (pursuitYaw(car.speed, error, Math.hypot(dx, dy) * 111320) * 180) / Math.PI : error * FOLLOW_GAIN;
  car.heading = (car.heading + clamp(wanted, -maxYaw, maxYaw) * dt + 360) % 360;
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
  const aim = guide ? guide.path.pointAt(guide.at.along + Math.max(6, car.speed * 0.45)) : settings.roadFollow ? look : null;
  if (!aim) return;
  steerToward(laneNow ? move(aim.lat, aim.lng, aim.bearing + 90, laneNow) : aim, dt, !!guide);
}

// Each write to the map is work for it even at the same value, so a parked car leaves it alone. True if `value` has
// moved by at least `by` since it was last written, which here means about a centimetre or a hundredth of a degree.
const sceneShown = {};
function moved(name, value, by) {
  if (Math.abs(value - (sceneShown[name] ?? Infinity)) < by) return false;
  sceneShown[name] = value;
  return true;
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
  if (moved('heading', camHeading, 0.01)) map.heading = camHeading;
  if (moved('tilt', tilt, 0.01)) map.tilt = tilt;
  if (moved('range', range, 0.05)) map.range = range;
  if (moved('centerLat', center.lat, 1e-7) | moved('centerLng', center.lng, 1e-7) | moved('ground', ground, 0.01)) map.center = { lat: center.lat, lng: center.lng, altitude: ground };
  applyDaylight();
  if (model) {
    if (moved('carLat', pos.lat, 1e-7) | moved('carLng', pos.lng, 1e-7)) model.position = { lat: pos.lat, lng: pos.lng, altitude: 0 };
    if (moved('carHeading', car.heading, 0.01)) model.orientation = { heading: car.heading, tilt: 0, roll: 0 };
    // The ground under a bridge is the valley floor, so on bridges the car rides on the 3D mesh instead. Only on
    // bridges: everywhere else the mesh includes tree tops and overpasses the car would climb on to.
    const mode = onBridge ? 'RELATIVE_TO_MESH' : 'RELATIVE_TO_GROUND';
    if (model.altitudeMode !== mode) model.altitudeMode = mode;
  }
}

// Writing text, even the same text, makes the browser lay the page out again, so only real changes are written.
const HUD_TEXT_EVERY = 100; // ms between updates of the figures, which is as fast as anyone can read them
const shownText = new Map();
function show(id, text) {
  if (shownText.get(id) === text) return;
  shownText.set(id, text);
  el(id).textContent = text;
}

// The header names the town the car is in. Until the first answer, it names where the trip started.
function showPlace() {
  const name = town || startLabel;
  show('where', name);
  show('navTown', town || '');
  document.title = name ? `${name} · GeoDrive` : 'GeoDrive';
}

function setStartLabel(label) {
  startLabel = label;
  town = null;
  townAt = null;
  showPlace();
}

// The town and the radio both want to know where the car is, so they share an answer rather than each paying for one.
let placeAsked = null, placeKnown = null; // placeKnown is saved with the trip, so a refresh needn't pay to ask again
function lookUpPlace(at) {
  if (placeKnown && distance(placeKnown.at.lat, placeKnown.at.lng, at.lat, at.lng) < TOWN_EVERY) return Promise.resolve(placeKnown);
  if (placeAsked) return placeAsked;
  perfLog.count('geocodes');
  placeAsked = geocoder.geocode({ location: at }).then(({ results }) => (placeKnown = { at, ...placeFrom(results) })).finally(() => { placeAsked = null; });
  return placeAsked;
}

async function refreshTown() {
  if (!geocoder || townBusy || performance.now() - townAsked < TOWN_WAIT) return;
  if (townAt && distance(townAt.lat, townAt.lng, pos.lat, pos.lng) < TOWN_EVERY) return;
  townBusy = true;
  townAsked = performance.now();
  const asked = townAt = { lat: pos.lat, lng: pos.lng };
  try {
    const { town: name } = await lookUpPlace(asked);
    if (asked === townAt && name && name !== town) { // otherwise the car was moved to a new start while waiting
      town = name;
      perfLog.event('town', name);
      showPlace();
    }
  } catch (err) {
    console.warn('town:', err); // the last answer stays up
  } finally {
    townBusy = false;
  }
}

function updateHud(t) {
  if (!t || t - hudTextAt >= HUD_TEXT_EVERY) {
    hudTextAt = t;
    show('heading', String(Math.round(foot ? foot.compass() : car.heading) % 360).padStart(3, '0') + '°');
    show('from', (distance(start.lat, start.lng, pos.lat, pos.lng) / 1609.344).toFixed(2) + ' mi');
    const figures = tripFigures(trip);
    for (const id of ['elapsed', 'miles', 'top', 'average']) show('hud-' + id, figures[id]);
    if (foot) {
      show('road', '–');
      show('cam', foot.label());
      show('footHint', foot.hint());
    } else show('road', onBridge ? 'ON BRIDGE' : match ? 'ON ROAD' : tiles.hasRoads(pos.lat, pos.lng) ? 'OFF ROAD' : 'LOADING ROADS');
  }

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
    show('navState', fsd ? `FSD ON${boost}` : 'FSD OFF · press F');
    show('navWhere', destination.label);
  }
}

// A dial is only redrawn when its needle or figures would visibly move.
let gaugesShown = {}, fuelShown = '', navShown = '';
function gauge(id, key, options) {
  if (gaugesShown[id] === key) return;
  gaugesShown[id] = key;
  drawGauge(el(id), options);
}

function drawDash(t) {
  if (t - gaugesDrawnAt < 40) return; // 25 times a second is plenty for needles
  gaugesDrawnAt = t;
  const profile = profileFor(settings.carProfile);
  const mph = Math.abs(car.speed) * MPS_TO_MPH;
  speedMax = speedRange(mph, speedMax);
  gauge('speedGauge', `${Math.round(mph * 2)}|${speedMax}`, { value: mph, max: speedMax, step: speedStep(speedMax), big: String(Math.round(mph)), small: 'MPH' });
  const electric = !profile.cylinders;
  const charge = Math.round(trip.fuel);
  if (electric) {
    // Electric cars have no meaningful revs, so this dial is the battery.
    gauge('revGauge', `charge|${charge}`, { value: trip.fuel, max: 100, step: 25, big: `${charge}%`, small: 'CHARGE' });
  } else {
    const max = revRange(profile.redline);
    gauge('revGauge', `${Math.round(gearbox.rpm / 25)}|${gearbox.label}|${max}|${profile.redline}`, { value: gearbox.rpm, max, step: max > 6000 ? 2000 : 1000, scale: 1000, redFrom: profile.redline, big: gearbox.label, small: 'x1000 RPM' });
  }
  if (fuelShown !== `${electric}|${charge}`) {
    fuelShown = `${electric}|${charge}`;
    el('fuel').style.visibility = electric ? 'hidden' : 'visible';
    el('fuel').classList.toggle('low', trip.fuel < 15);
    el('fuelBar').style.width = `${charge}%`;
    show('fuelValue', `${charge}%`);
  }
  if (t - navDrawnAt > 333) {
    navDrawnAt = t;
    const navRoute = fsd || destination ? route : null;
    const navPos = foot ? foot.where() : pos, navHeading = foot ? foot.compass() : car.heading;
    const navKey = `${navPos.lat.toFixed(6)}|${navPos.lng.toFixed(6)}|${navHeading.toFixed(1)}|${navRadius}|${navRoute?.length}|${routeIndex}|${settings.hour}|${roads.changes}`;
    if (navKey !== navShown || navBehind(roads)) { // parked, nothing on it has changed
      navShown = navKey;
      const navBegan = performance.now();
      navVertices = drawNav(el('navScreen'), { roads, pos: navPos, heading: navHeading, parked: foot ? pos : null, route: navRoute, routeIndex, radius: navRadius, hour: settings.hour, clock: clockText(settings.hour) });
      perfLog.spend('nav', performance.now() - navBegan);
    }
    const now = new Date();
    const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    show('clock', time(now));
    let eta = '';
    if (destination && route) {
      const at = routeIndex ?? 0, seconds = route.secondsToEnd[at], miles = (route.length - route.cum[at]) / 1609.344;
      const left = seconds < 3600 ? `${Math.max(1, Math.round(seconds / 60))} min` : `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
      eta = `ETA ${time(new Date(now.getTime() + seconds * 1000))} · ${left} · ${miles.toFixed(1)} mi`;
    }
    show('eta', eta);
  }
}

// Looks for stations when the radio is first turned on, and again after a long drive.
async function refreshStations() {
  if (radioArea && distance(radioArea.lat, radioArea.lng, pos.lat, pos.lng) < RADIO_RESEARCH) return;
  radioArea = { lat: pos.lat, lng: pos.lng };
  let state = null, country = 'US';
  try {
    const place = await lookUpPlace(radioArea);
    state = place.state;
    country = place.country || country;
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
  if (!foot && radio.current && radio.current.id !== settings.radioStation?.id) {
    settings.radioStation = radio.current; // the driver's own choice replaces the default
    saveSettings();
  }
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

// Measured only when the song changes, as asking for a width makes the browser lay out the page.
function showSong(song) {
  const box = el('radioSong'), text = box.firstElementChild;
  text.textContent = song ? `♪ ${song}` : '';
  el('radioList').title = song || '';
  const over = text.scrollWidth - box.clientWidth;
  box.classList.toggle('scrolling', over > 0);
  if (over > 0) {
    text.style.setProperty('--slide', `-${over}px`);
    text.style.setProperty('--slide-time', `${Math.round(6 + over / 10)}s`);
  }
}

function setRadioPower(on) {
  settings.radioOn = on;
  saveSettings();
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
  requestAnimationFrame(frame); // first, so an error in one frame can't stop the car for good
  const began = performance.now();
  measureFrame(t);
  const dt = Math.min((t - last) / 1000 || 0, 0.06);
  last = t;
  if (foot) runFoot(t, dt);
  if (map && !foot && !debug.hold && !dialogOpen && !paused) {
    const driveBegan = performance.now();
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
    braking = brakeLit(car.speed, controls, arriving);
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
      refreshTown();
      advanceRouteLine();
    }
    lateSnap();
    sampleGround();
    const sceneBegan = performance.now();
    perfLog.spend('drive', sceneBegan - driveBegan);
    syncScene(dt);
    const dashBegan = performance.now();
    perfLog.spend('scene', dashBegan - sceneBegan);
    updateHud(t);
    perfLog.spend('dash', performance.now() - dashBegan);
  } else if (map && !foot) {
    // Paused or in a dialog: the engine goes quiet. Pause also holds the radio (see setPaused).
    const profile = profileFor(settings.carProfile);
    if (!previewing()) engine.update({ rpm: gearbox.rpm, load: 0, speedMph: 0, car: profile, running: false });
  }
  perfLog.frame(t, performance.now() - began);
  if (perfLog.due(t)) sampleLog(t);
}

// --- On foot --------------------------------------------------------------------------------------------------

function footInput(dt) {
  const input = {
    forward: (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0),
    strafe: (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0),
    run: keys.has('shift'), walkSpeed: settings.walkSpeed, runSpeed: settings.runSpeed, lookX: lookX * LOOK_SENSITIVITY + ((keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0)) * FOOT_TURN * dt,
  };
  lookX = lookY = 0;
  return input;
}

// The person on the map, one model per frame of the walk and run, as a model can't move its own parts.
// All stay on the map and only one has any size, because swapping a model's source reloads it.
async function makePeople() {
  if (people) return;
  const { FRAME_COUNT, personParts } = await import('./footPerson.js');
  people = Array.from({ length: FRAME_COUNT }, (_, frame) => {
    const person = new maps3d.Model3DElement({ position: { ...pos, altitude: 0 }, altitudeMode: 'RELATIVE_TO_GROUND', scale: HIDDEN_PERSON });
    person.src = glbUrl(buildPersonGlb(personParts(frame)));
    return person;
  });
}

let personSizeNow = 1, shownFrame = -1;
function showPerson(size) {
  personSizeNow = size;
  for (const p of people) map.append(p);
}

// The driving map's camera, on the person instead of the car.
function syncFootScene(dt) {
  const ease = dt ? 1 - Math.exp(-dt * 5) : 1, at = foot.where(), posture = foot.posture();
  camHeading = foot.compass();
  tilt += (CAMERAS[0].tilt - tilt) * ease;
  range += (foot.view.range - range) * ease;
  const center = move(at.lat, at.lng, camHeading, leadDistance(range, tilt, FOV_Y, CAR_BELOW_CENTRE));
  if (moved('heading', camHeading, 0.01)) map.heading = camHeading;
  if (moved('tilt', tilt, 0.01)) map.tilt = tilt;
  if (moved('range', range, 0.05)) map.range = range;
  const altitude = ground + posture.z;
  if (moved('centerLat', center.lat, 1e-7) | moved('centerLng', center.lng, 1e-7) | moved('ground', altitude, 0.01)) map.center = { lat: center.lat, lng: center.lng, altitude };
  // Only the frame showing is kept up to date; hundreds of map updates a second would cost more than the walk.
  const showing = posture.inside ? -1 : posture.frame;
  if (shownFrame !== showing && people[shownFrame]) people[shownFrame].scale = HIDDEN_PERSON;
  const person = people[showing];
  if (person) {
    person.position = { lat: at.lat, lng: at.lng, altitude: 0 };
    person.orientation = { heading: posture.facing, tilt: 0, roll: 0 };
    if (shownFrame !== showing) person.scale = personSizeNow;
  }
  shownFrame = showing;
  applyDaylight();
}

// While paused or in a dialog the walk still draws, so a change to the time of day in Settings shows, but nothing moves.
function runFoot(t, dt) {
  const began = performance.now(), live = !debug.hold && !dialogOpen && !paused;
  foot.update(live ? dt : 0, live ? footInput(dt) : {}, settings.hour);
  syncFootScene(dt);
  // The radio, road and wind stay in the car, though the phone can play music. The engine idles on, fading with distance.
  const profile = profileFor(settings.carProfile);
  if (!previewing()) engine.update({ rpm: profile.idle, load: 0, speedMph: 0, car: profile, running: live, outside: true, reach: engineFadeAt(foot.distanceToCar()) });
  perfLog.spend('drive', performance.now() - began);
  if (!live) return;
  if (radio.on) refreshStations();
  const walker = foot.walker;
  pocket.update(t, { x: walker.x, y: walker.y, facing: foot.compass(), where: foot.where() }, { roads, parked: pos, hour: settings.hour });
  if (t - tilesCheckedAt > 1000) {
    tilesCheckedAt = t;
    const at = foot.where();
    tiles.ensure(at.lat, at.lng, 0, 0); // for the nav screen
  }
  const dashBegan = performance.now();
  updateHud(t);
  perfLog.spend('dash', performance.now() - dashBegan);
}

function releaseMouse() {
  if (document.pointerLockElement) document.exitPointerLock();
}

// L gets out of a stopped car. The map stays in the page, hidden and untouched, so getting back in costs no new map load.
async function getOut() {
  if (!map || foot || footLoading) return;
  if (Math.abs(car.speed) * MPS_TO_MPH >= STOPPED_MPH) return notice('Stop the car first, then press L to get out.', 2500);
  if (onBridge) return notice('There is nothing to stand on here. Get off the bridge first.', 3000);
  footLoading = true;
  try {
    const [{ Foot, PERSON_SIZE: personSize }, { Pocket }] = await Promise.all([import('./foot.js'), import('./pocket.js')]); // only those who walk load any of this
    await makePeople();
    pocket ||= new Pocket(el('pockets'), radio, {
      music: (on) => {
        engine.start();
        applySound();
        if (on) {
          radio.playBand('FM');
          refreshStations();
        } else radio.setPower(false);
      },
      setRadioVolume: (value) => { settings.radioVolume = value; applySound(); saveSettings(); },
      radioVolume: () => settings.radioVolume,
      muted: () => settings.muted,
      onOpen: releaseMouse, // the mouse is needed to use them
      onTyping: () => keys.clear(), // or a key held down would keep walking
    });
    foot = new Foot({ canvas: el('foot'), origin: { lat: pos.lat, lng: pos.lng }, heading: car.heading, profile: settings.carProfile, scale: settings.carScale, tiles, view: { tilt: CAMERAS[0].tilt, range: CAMERAS[0].range * FOOT_RANGE_SHARE, fov: FOV_Y, below: CAR_BELOW_CENTRE } });
    showPerson(personSize);
  } catch (err) {
    console.warn('getting out:', err);
    return notice('Could not get out of the car here: ' + err.message, 5000);
  } finally {
    footLoading = false;
  }
  // The car's radio stays in the car, as it was, and the phone's Music uses the same player until they're back.
  carRadio = radio.snapshot();
  if (radio.on) radio.setPower(false);
  pocket.start();
  // Nothing is left running that would drive off on return.
  car.speed = 0;
  setFsd(false);
  arriving = false;
  cancelSignal();
  braking = false;
  keys.clear();
  lightKey = '';
  document.body.classList.add('onFoot');
  applySound();
  mapBox = null;
  navDrawnAt = 0;
  perfLog.event('foot', { on: true });
  notice('WASD walks, Shift runs. Q and E turn the view, to see round a building.', 5000);
}

function stopFoot() {
  if (!foot) return;
  foot.stop();
  foot = null;
  pocket?.close();
  if (carRadio) radio.putBack(carRadio);
  carRadio = null;
  for (const p of people || []) { p.scale = HIDDEN_PERSON; p.remove(); }
  shownFrame = -1;
  releaseMouse();
  keys.clear();
  lookX = lookY = 0;
  document.body.classList.remove('onFoot');
  applySound();
  show('cam', CAMERAS[camIndex].name);
  navDrawnAt = 0;
  mapBox = null;
  lightKey = '';
  applyDaylight();
  perfLog.event('foot', { on: false });
}

// The big message for a building with nothing inside yet.
function showLocked(type) {
  el('lockedType').textContent = type;
  const box = el('locked');
  box.classList.add('show');
  clearTimeout(lockedTimer);
  lockedTimer = setTimeout(() => box.classList.remove('show'), LOCKED_TIME);
}

function pressL() {
  if (!foot) return getOut();
  if (foot.canGetIn()) return stopFoot();
  const done = foot.pressBuilding(keys.has('shift'));
  if (done?.locked) return showLocked(done.locked);
  if (done?.waiting) return notice('Just a moment, the map of this building is still loading.', 2000);
  if (done) return;
  notice('Walk up to a building, or back to the car, then press L.', 2500);
}

el('foot').addEventListener('pointerdown', (e) => {
  if (!foot) return;
  if (e.pointerType === 'mouse') {
    Promise.resolve(el('foot').requestPointerLock()).catch(() => {}); // refused just after Esc; the next click works
  } else {
    el('foot').setPointerCapture(e.pointerId);
    touchLook = { x: e.clientX, y: e.clientY };
  }
});
el('foot').addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') {
    if (!touchLook) return;
    lookX += (e.clientX - touchLook.x) * TOUCH_LOOK;
    lookY += (e.clientY - touchLook.y) * TOUCH_LOOK;
    touchLook = { x: e.clientX, y: e.clientY };
  } else if (document.pointerLockElement === el('foot') || e.buttons) { // holding a button still looks if the browser refused the lock
    lookX += e.movementX;
    lookY += e.movementY;
  }
});
for (const kind of ['pointerup', 'pointercancel']) el('foot').addEventListener(kind, () => { touchLook = null; });

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
  stopFoot();
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
  drawRoute();
  cancelSignal();
  trip = newTrip();
  setStartLabel(where.label);
  tiles.ensure(pos.lat, pos.lng, car.heading, 0);
  await sampleGround();
  ground = groundTarget;
  if (map) syncScene(0);
}

// --- Saved trip -----------------------------------------------------------------------------------------------

const tripState = () => ({ pos, heading: car.heading, zoom, camIndex, destination, fsd, fsdBoost, trip, lane, navRadius, label: startLabel, place: placeKnown });

function saveTrip() {
  saveSession({
    ...tripState(),
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
  show('cam', CAMERAS[camIndex].name);
  destination = saved.destination;
  fsd = saved.fsd;
  fsdBoost = saved.fsdBoost;
  trip = { ...newTrip(), ...saved.trip };
  lane = saved.lane;
  navRadius = saved.navRadius;
  setStartLabel(saved.label);
  if (Number.isFinite(saved.place?.at?.lat) && Number.isFinite(saved.place?.at?.lng)) {
    placeKnown = saved.place;
    townAt = placeKnown.at;
    town = placeKnown.town;
    showPlace();
  }
  tiles.ensure(pos.lat, pos.lng, car.heading, 0);
  await sampleGround();
  ground = groundTarget;
}

// Copies a link to this drive and these settings. Everything is in the link's # part, which browsers don't send to servers.
async function shareDrive() {
  if (!map) return;
  const code = await encodeShare(packShare({ settings, defaults: DEFAULTS, session: tripState(), start, defaultStart: ORIGINAL_START }));
  const link = `${location.origin}${location.pathname}#d=${code}`;
  debug.lastShare = link;
  try {
    await navigator.clipboard.writeText(link);
    notice('Link copied. Whoever opens it gets this drive and these settings.', 4000);
  } catch (err) {
    window.prompt('Copy this link:', link);
  }
}

// Says what a link will load and waits for an answer. Nothing changes unless they accept.
let answerShared = null;
function askAboutShare(shared) {
  const rows = shareSummary(shared, DEFAULTS, { carName: (id) => CAR_PROFILES[id]?.name || id, clock: clockText });
  el('sharedStats').replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }));
  dialogOpen = true;
  el('shared').classList.add('open');
  el('sharedYes').focus();
  return new Promise((resolve) => {
    answerShared = (yes) => {
      answerShared = null;
      el('shared').classList.remove('open');
      dialogOpen = false;
      document.activeElement?.blur();
      resolve(yes);
    };
  });
}
el('sharedYes').addEventListener('click', () => answerShared?.(true));
el('sharedNo').addEventListener('click', () => answerShared?.(false));
el('shared').addEventListener('click', (e) => { if (e.target === el('shared')) answerShared?.(false); });

// An accepted link replaces this browser's settings and trip. The link is taken out of the address bar either way,
// so a refresh carries on from the saved copy rather than asking again.
async function openSharedLink() {
  const code = location.hash.match(/^#d=([\w-]+)/)?.[1];
  if (!code) return false;
  history.replaceState(null, '', location.pathname + location.search);
  radioResume = false; // the answer below decides what plays
  const shared = await decodeShare(code);
  if (!shared) {
    radioResume = settings.radioOn;
    notice('That share link is damaged, so it was ignored.', 5000);
    return false;
  }
  if (!(await askAboutShare(shared))) {
    radioResume = settings.radioOn;
    return false;
  }
  Object.assign(settings, DEFAULTS, shared.settings);
  saveSettings();
  if (shared.start) saveStart(shared.start);
  saveSession(shared.session);
  radio.restore(settings.radioStation);
  applySound();
  renderRadio();
  return true;
}

function reset() {
  placeCar(start);
}

function switchCamera() {
  camIndex = (camIndex + 1) % CAMERAS.length;
  show('cam', CAMERAS[camIndex].name);
}

// Resolves an address to the nearest road. Without road data (the servers can be busy) the address itself is used.
async function findStart(address) {
  perfLog.count('geocodes');
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
  releaseMouse();
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
el('changeStart').addEventListener('click', () => {
  closeSettings();
  openDialog('start');
});

el('destForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = el('destAddress').value.trim();
  if (!address) return setStatus('dest', 'Enter an address first.', true);
  el('destGo').disabled = true;
  setStatus('dest', 'Finding a route…');
  try {
    perfLog.count('geocodes');
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
el('changeDest').addEventListener('click', () => {
  if (foot) notice('Get back in the car first.', 2500);
  else if (!dialogOpen) openDialog('dest');
});
el('changeStartHeader').addEventListener('click', () => { if (!dialogOpen) openDialog('start'); });
el('resetButton').addEventListener('click', () => { if (!dialogOpen) reset(); });

// --- Pause ----------------------------------------------------------------------------------------------------

function renderTrip() {
  const figures = tripFigures(trip);
  for (const box of document.querySelectorAll('#tripStats [data-stat]')) box.textContent = figures[box.dataset.stat];
}

function setPaused(on) {
  if (!map || dialogOpen) return;
  paused = on;
  keys.clear();
  if (on) releaseMouse();
  el('pause').classList.toggle('open', on);
  el('pauseButton').textContent = on ? 'Resume' : 'Pause';
  if (on) {
    renderTrip();
    // Mute the radio while paused, but remember it so resume can bring it back.
    radioHeld = radio.on;
    if (radioHeld) radio.hold();
  } else if (radioHeld) {
    radioHeld = false;
    if (radio.on) radio.release();
  }
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

// A data: URL, because the map doesn't load models from blob: URLs.
function glbUrl(glb) {
  let text = '';
  for (let i = 0; i < glb.length; i += 8192) text += String.fromCharCode.apply(null, glb.subarray(i, i + 8192));
  return `data:model/gltf-binary;base64,${btoa(text)}`;
}

// The model is rebuilt only when the type or colour changes, and a colour drag settles before it swaps.
let carLookKey = '', carLookTimer = null;
function applyCarLook() {
  if (!model) return;
  clearTimeout(carLookTimer);
  const key = settings.carProfile + settings.carColor;
  if (key === carLookKey) return;
  carLookTimer = setTimeout(() => {
    carLookKey = key;
    model.src = glbUrl(buildCarGlb(settings.carProfile, settings.carColor));
  }, carLookKey ? 150 : 0);
}

// The tint covers the map, and the headlight beams are cut out of it and lightly added on top. The car's place on
// screen is fixed; the beams are sized from the car, zoom with the map and turn with the car against the camera.
let lightKey = '', braking = false, mapBox = null;
window.addEventListener('resize', () => { mapBox = null; gaugesShown = {}; navShown = ''; });
function applyDaylight() {
  const dark = darknessAt(settings.hour), lit = settings.headlights && !foot; // nobody at the wheel on foot, and the beams sit where the car does on screen
  mapBox ||= { width: el('map').clientWidth, height: el('map').clientHeight }; // asking every frame would force a layout
  const { width, height } = mapBox;
  const angle = ((car.heading - camHeading + 540) % 360) - 180;
  // Only the headlights and brake lights depend on the view, so with neither on nothing redraws while driving.
  const moving = lit || braking ? `${Math.round(range / 2)}|${Math.round(tilt)}|${Math.round(angle * 2)}` : '';
  const key = `${settings.hour}|${lit}|${braking}|${settings.carScale}|${settings.carProfile}|${width}x${height}|${moving}`;
  if (key === lightKey) return;
  lightKey = key;
  el('lightsButton').setAttribute('aria-pressed', String(settings.headlights));
  const night = el('night'), beam = el('beam');
  for (const canvas of [night, beam]) {
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }
  night.style.display = dark > 0.005 ? 'block' : 'none';
  beam.style.display = lit ? 'block' : 'none';
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
  const tails = el('tails');
  if (tails.width !== width || tails.height !== height) { tails.width = width; tails.height = height; }
  const dots = tails.getContext('2d');
  dots.clearRect(0, 0, width, height);
  const shown = tailDots(view, length, carWidth, lit, braking);
  drawDots(dots, shown);
  tails.style.display = shown.length ? 'block' : 'none'; // an empty canvas over the map still costs the compositor
}

let graphicsLogged = '';
function applyGraphics() {
  if (!map) return;
  if (map.qualityMode !== settings.mapQuality) map.qualityMode = settings.mapQuality;
  if (map.maxMemoryMegabytes !== settings.mapMemory) map.maxMemoryMegabytes = settings.mapMemory;
  const mode = settings.mapLabels ? 'HYBRID' : 'SATELLITE';
  if (map.mode !== mode) map.mode = mode;
  // The map is laid out larger or smaller than its box and scaled to fit, as it draws one pixel per pixel it thinks it has.
  const size = `${100 / settings.mapScale}%`;
  if (map.style.width !== size) {
    map.style.width = map.style.height = size;
    map.style.transformOrigin = '0 0';
    map.style.transform = `scale(${settings.mapScale})`;
  }
  const graphics = `${settings.mapQuality} ${settings.mapMemory} ${settings.mapScale} ${mode}`;
  if (graphics !== graphicsLogged) perfLog.event('graphics', graphics);
  graphicsLogged = graphics;
}

// Frames per second, the slowest frame in the last second, and JavaScript memory where the browser reports it
// (Chrome). That memory excludes the 3D map's graphics, which is usually most of what a tab uses.
let perfFrames = 0, perfSince = 0, perfSlowest = 0, perfLast = 0, apiBadge = '';
const callCount = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
function callTable(rows) {
  return `<table>${rows.map(({ label, note, n }) => `<tr><th title="${note}">${label}</th><td>${callCount(n)}</td></tr>`).join('')}</table>`;
}

// The number is cheap. The table walks every kind of call, so it is drawn when the page opens and again on hover.
function updateApiBadge() {
  const billed = perfLog.billedTotal();
  const text = `API ${billed}`;
  if (text === apiBadge) return;
  apiBadge = text;
  const summary = el('apiSummary');
  summary.textContent = text;
  summary.title = billed
    ? `Billed this page: ${perfLog.totals.geocodes || 0} geocode, ${perfLog.totals.routes || 0} routes, ${perfLog.totals.elevations || 0} elevation. Hover for the list.`
    : 'No billed calls yet this page. Hover for the list.';
}

function renderApiDetail() {
  const { other, billed } = apiPanelRows(perfLog.totals);
  el('apiDetail').innerHTML = `<p class="head">Other calls</p>${callTable(other)}<p class="head billed">Billed</p>${callTable(billed)}<p class="note">Since this page opened. The API number is the three billed calls. Map tiles are files for the view. Opening the page is one map charge, not listed here.</p>`;
}

function measureFrame(t) {
  perfSlowest = Math.max(perfSlowest, t - perfLast);
  perfLast = t;
  perfFrames++;
  if (t - perfSince < 1000) return;
  updateApiBadge();
  const fps = Math.round((perfFrames * 1000) / (t - perfSince));
  const heap = performance.memory ? ` · JS ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : '';
  const box = el('perf');
  box.textContent = `${fps} FPS · slowest ${Math.round(perfSlowest)} ms${heap}`;
  box.classList.toggle('slow', fps < 30 || perfSlowest > 100);
  debug.perf = { fps, slowest: Math.round(perfSlowest) };
  perfFrames = 0;
  perfSince = t;
  perfSlowest = 0;
}

// One row of the log. state: 0 driving, 1 paused or in a dialog, 2 tab hidden, when browsers throttle it and the numbers mean little, 3 on foot.
function sampleLog(t) {
  const walk = foot?.stats(), at = foot ? foot.where() : pos;
  perfLog.sample(t, {
    state: document.hidden ? 2 : dialogOpen || paused ? 1 : foot ? 3 : 0,
    lat: at.lat,
    lng: at.lng,
    footChunks: walk?.chunks ?? 0,
    footTriangles: walk?.triangles ?? 0,
    mph: Math.abs(car.speed) * MPS_TO_MPH,
    heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0,
    ways: roads.ways.size,
    tiles: tiles.loaded.size,
    tilesLoading: tiles.loading.size,
    navVertices,
    routePoints: route ? route.points.length : 0,
    lineVertices,
    range,
    cam: camIndex,
    fsd: fsd ? 1 : 0,
    lights: settings.headlights ? 1 : 0,
    dark: darknessAt(settings.hour),
  });
}

async function sendLog() {
  const button = el('sendLog');
  button.disabled = true;
  perfLog.event('sent', { town, mapScale: settings.mapScale });
  try {
    const report = perfLog.report({ ...describeMachine(), settings, town, trip, route: route ? { km: Math.round(route.length / 1000), points: route.points.length } : null });
    const res = await fetch('log.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
    if (!res.ok) throw new Error(`server answered ${res.status}`);
    const { name, rows } = await res.json();
    perfLog.clear();
    notice(`Log sent: ${rows} samples, saved as ${name}.`, 6000);
  } catch (err) {
    console.warn('send log:', err);
    notice('Could not send the log, so it was kept. Please try again.', 5000);
  } finally {
    button.disabled = false;
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
  walkSpeed: (v) => `${v.toFixed(1)} m/s`,
  runSpeed: (v) => `${v.toFixed(1)} m/s`,
  hour: clockText,
  mapMemory: (v) => `${v} MB`,
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
  applyGraphics();
  el('settingsStart').textContent = startLabel || start.label;
  if (model) model.scale = settings.carScale; // fixed in world units, so the car shrinks with the map when zooming out
  foot?.setCar(settings.carProfile, settings.carScale);
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
  releaseMouse();
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
el('forgetBuildings').addEventListener('click', async () => {
  const { forgetBuildings } = await import('./foot.js');
  forgetBuildings();
  notice('Buildings forgotten. They will be furnished afresh the next time you get out of the car.', 3000);
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
el('shareButton').addEventListener('click', shareDrive);
el('sendLog').addEventListener('click', sendLog);
// A link opened in a tab already on the game changes only the # part, which wouldn't otherwise reload the page.
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#d=')) location.reload(); });
el('helpButton').addEventListener('click', () => el('help').classList.toggle('open'));
// Browsers only allow sound after the first click or key press.
for (const kind of ['pointerdown', 'keydown']) {
  document.addEventListener(kind, (event) => {
    engine.start();
    applySound();
    if (radioResume) {
      radioResume = false;
      if (!(kind === 'pointerdown' && el('radioPower').contains(event.target))) setRadioPower(true);
    }
  }, { capture: true });
}
window.addEventListener('pagehide', () => {
  if (map) saveTrip();
  perfLog.flush();
});

// --- Dismissing popups ----------------------------------------------------------------------------------------

// Escape or a click outside closes any popup. The first start dialog can't just vanish, because the game
// needs a start, so there it takes the default.
function dismissStart() {
  if (el('useDefault').disabled) return; // an address is being looked up
  if (map) finishDialog();
  else el('useDefault').click();
}

function dismissPopup() {
  if (answerShared) { answerShared(false); return true; }
  if (openId === 'dest') { finishDialog(); return true; }
  if (openId === 'start') { dismissStart(); return true; }
  if (el('help').classList.contains('open')) { el('help').classList.remove('open'); return true; }
  if (el('notice').style.display === 'block') { el('notice').style.display = 'none'; return true; }
  return false;
}

el('start').addEventListener('click', (e) => { if (e.target === el('start')) dismissStart(); });
el('dest').addEventListener('click', (e) => { if (e.target === el('dest')) finishDialog(); });
el('pause').addEventListener('click', (e) => { if (e.target === el('pause')) setPaused(false); });
document.addEventListener('pointerdown', (e) => {
  if (el('help').classList.contains('open') && !el('help').contains(e.target) && !el('helpButton').contains(e.target)) el('help').classList.remove('open');
}, { capture: true });

el('settingsCopy').addEventListener('click', async () => {
  const text = JSON.stringify(settings);
  try {
    await navigator.clipboard.writeText(text);
    notice('Settings copied. Paste them to Claude to make them the new-player defaults.', 5000);
  } catch (err) {
    window.prompt('Copy these settings:', text);
  }
});

// --- Input ----------------------------------------------------------------------------------------------------

const DRIVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'z', 'shift']);
const DRIVING_ONLY = new Set(['b', 'c', 'g', 'q', 'e', 'f', '=', '+', '-']);
document.addEventListener('keydown', (e) => {
  if (el('settings').classList.contains('open') && (e.key === 'Escape' || e.key.toLowerCase() === 'o')) { e.preventDefault(); return closeSettings(); }
  if (e.key === 'Escape' && dismissPopup()) { e.preventDefault(); return; }
  if (dialogOpen) return; // the keys belong to the open dialog
  if (e.target.matches?.('#pockets textarea, #pockets input[type=text]')) { // typing a note or a message
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (foot && e.key === 'Escape' && pocket?.close()) { e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (paused) {
    if ((k === 'p' || k === 'escape') && !e.repeat) { e.preventDefault(); setPaused(false); }
    return;
  }
  if (k === 'p' && !e.repeat) { e.preventDefault(); return setPaused(true); }
  if (k === 'l' && !e.repeat) { e.preventDefault(); return pressL(); }
  if (foot && !e.repeat && pocket?.pressKey(k)) { e.preventDefault(); return; }
  if (foot && (k === 'q' || k === 'e')) keys.add(k);
  if (DRIVE_KEYS.has(k)) { keys.add(k); e.preventDefault(); e.stopPropagation(); }
  if (e.repeat || (foot && DRIVING_ONLY.has(k))) return;
  if (k === 'c') switchCamera();
  if (k === 'g') { e.preventDefault(); openDialog('dest'); }
  if (k === 'o') { e.preventDefault(); openSettings(); }
  if (k === 'n') setRadioPower(!radio.on);
  if (k === 'h') setHeadlights(!settings.headlights);
  if (k === 'b') hornDown();
  if (k === 't') {
    settings.hour = (settings.hour + 1) % 24;
    applyDaylight();
    saveSettings();
    notice(clockText(settings.hour), 1500);
  }
  if (k === '[') radio.seek(-1);
  if (k === ']') radio.seek(1);
  if (k === 'k') el('help').classList.toggle('open');
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
window.addEventListener('blur', () => { keys.clear(); hornUp(); lookX = lookY = 0; });
for (const b of document.querySelectorAll('#touch button[data-key]')) {
  const k = b.dataset.key;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(k); b.setPointerCapture(e.pointerId); });
  b.addEventListener('pointerup', () => keys.delete(k));
  b.addEventListener('pointercancel', () => keys.delete(k));
}
el('touchQ').addEventListener('click', () => { if (!foot) pressSignal(-1); });
el('touchE').addEventListener('click', () => { if (!foot) pressSignal(1); });
el('touchF').addEventListener('click', () => { if (!foot) setFsd(!fsd); });
el('touchL').addEventListener('click', pressL);

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
    geocoder = new (await google.maps.importLibrary('geocoding')).Geocoder();
    routesLib = await google.maps.importLibrary('routes');
    const fromLink = await openSharedLink();
    const saved = loadSession();
    if (saved) await restoreTrip(saved);
    else await openDialog('start'); // the map itself loads only once the start is chosen
    // Accepting was the click browsers require, so a shared drive's radio can start straight away.
    if (fromLink && settings.radioOn) setRadioPower(true);
    map = new maps3d.Map3DElement({ center: { ...pos, altitude: ground }, heading: car.heading, tilt, range, fov: FOV_Y, mode: 'HYBRID', defaultUIHidden: true });
    applyGraphics();
    el('map').replaceChildren(map);
    if (maps3d.Model3DElement) {
      model = new maps3d.Model3DElement({ position: { ...pos, altitude: 0 }, altitudeMode: 'RELATIVE_TO_GROUND', orientation: { heading: car.heading, tilt: 0, roll: 0 }, scale: settings.carScale });
      map.append(model);
    }
    applyCarLook();
    syncScene(0);
    applyDaylight();
    if (saved) {
      if (destination && !resumeRoute()) requestRoute(true);
      notice(`${fromLink ? 'Shared drive loaded' : 'Trip restored'}${destination ? `, heading to ${destination.label}` : ''}. Use Start in the header for a new start.`, 6000);
    }
    window.__geodrive = Object.assign(debug, {
      foot: () => foot, settings, gearbox, saveTrip, engine, radio, map, model, ground: () => ground, match: () => match, onBridge: () => onBridge, placeCar, pressSignal,
      trip: () => trip, paused: () => paused, nav: () => ({ fsd, destination, route, routeIndex, signal, lane, laneNow }),
    });
  } catch (err) {
    notice('Could not load the map: ' + err.message);
  }
}

observeBrowser(perfLog);
perfLog.event('load', { saved: !!loadSession(), version: 1 });
updateApiBadge();
renderApiDetail();
el('apiPanel').addEventListener('pointerenter', renderApiDetail);
el('apiPanel').addEventListener('focusin', renderApiDetail);

// The saved or default station, ready to play at the first click or key press, as browsers require.
radio.restore(settings.radioStation);
radioResume = settings.radioOn;
applySound();
renderRadio();
requestAnimationFrame(frame);
boot();
