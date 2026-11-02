// Walking: the person, and what they can bump into, around the parked car. Outdoors the driving map is what you see, and main.js
// moves its camera and the person's model from here. Only a room is drawn here, because the map has no insides.
// The data, the person and the meshes are in footData, footWalker and footScene.
import { BuildingStore, dice, floorHeight, hashText, identify, isLocked, planLabel, typeName } from './buildings.js';
import { BODY_SHAPES } from './carModel.js';
import { tintAt } from './daylight.js';
import { FootGl, bearing, lookAt, multiply, perspective, swing, translate } from './footGl.js';
import { Place, fromLocal, parseTile, toLocal } from './footData.js';
import { SIT_FRAME, personFloats } from './footPerson.js';
import { SWITCH_REACH, outletSpots, switchNeedsKey, switchSpots, useSwitch, poseSpot, questionsFor, thingsNear, uniqueChoices, useThing, withoutTaken } from './footActions.js';
import { roomMesh } from './footScene.js';
import { FURNISHED, coreNear, coreOf, frameOf as buildingFrame, layoutFloor, plainFloor, solidsOf, upgradeFloor, worldBearing } from './furnish.js';
import { parseFurniture } from './furniture.js';
import { buildingWithin, carWalls, distanceToCar, enterBuilding, GET_IN_REACH, leaveBuilding, newWalker, frameOf, placeCamera, spawnSpot, stepClearOfThings, stepWalker, wayToCar } from './footWalker.js';
import { GAME } from './gameConfig.js';
import { Overture } from './overture.js';
import { TORCHES, lightMap, sunAt, windowsOn } from './roomLight.js';
import { Terrain } from './terrain.js';
import { vectorTileAt } from './vector.js';

const TILE_REACH = 200;      // m around the person that buildings and water must be known
const TERRAIN_ZOOM = 15;     // about 5 m a sample at these latitudes; the drive's zoom 12 is too coarse to walk on
const LOOK_EVERY = 1000;     // ms between checking which tiles are wanted
const RETRY_AFTER = 15000;   // ms before a tile that failed is tried again
const ROOM_SKY = [0.42, 0.58, 0.76];
const NEAR = 2, FAR = 400;   // m from the camera
const INDOOR_RANGE = 0.45;   // of the camera's distance outdoors, as furniture is small from there
export const PERSON_SIZE = 1.1; // times real size, which is hard to follow from the driving camera

let gl = null, shared = null; // one context for the visit, and the meshes that never change
let saved = null;             // the buildings this browser has been in
let furniture = null, furnitureLoading = false, furnitureFailed = -Infinity; // the models, once fetched
const GROUND_FLOOR = 1;
const PICK_REPEAT = 0.16;    // s between floors while W or S is held in a lift
const PICK_FAST = 10;        // floors a press moves with Shift held
const PLACE_REACH = 30;      // m around a building to ask about places, which can be just outside it
const LIE_HEIGHT = 0.72;     // m of a person lying on a bed, on the mattress rather than the height of the headboard
const TYPE_WINDOW = 1500;    // ms in which a second digit makes a two-figure floor

// The button in Settings. Buildings already identified on this walk stay as they are until the next one.
export function forgetBuildings() {
  (saved ||= new BuildingStore()).forget();
}
const terrain = new Terrain(undefined, TERRAIN_ZOOM);
const overture = new Overture();

function personMesh(frame) {
  shared ||= [];
  return shared[frame] ||= gl.mesh(personFloats(frame));
}

export class Foot {
  // tiles: the RoadTiles that fetches the same map tiles for driving. view: the camera to match.
  constructor({ canvas, origin, heading, profile, scale, tiles, view, onLocked, onFound, onSlept, hasKey, onUsed }) {
    this.hasKey = hasKey;
    this.onUsed = onUsed; // something in a room did something to the person's stats
    if (!gl) gl = new FootGl(canvas);
    gl.onRestored = () => this.rebuildAll();
    this.view = view;
    this.onLocked = onLocked;
    this.onFound = onFound;   // given a thing for the bag, returns false if there's no room
    this.onSlept = onSlept;
    this.pose = null;         // sitting or lying on something
    this.light = null;        // a flashlight or phone light that's on
    this.origin = origin;
    this.heading = heading;
    this.tiles = tiles;
    this.place = new Place(origin);
    this.tileFailed = new Map();
    this.tileLoading = new Set();
    this.lookedAt = -Infinity;
    this.terrainSeen = -1;
    this.zero = null;         // the height of the ground under the car, which is z = 0 here
    this.floors = new Map();
    this.room = null;
    this.alive = true;
    this.level = GROUND_FLOOR; // which floor the person is on
    this.picking = null;       // the floor being chosen in a lift
    this.world = { place: this.place, height: (x, y) => this.height(x, y), floor: (b) => this.floorOf(b) + this.rise(b) };
    this.setCar(profile, scale);
    this.loadTilesAt(0, 0);
    const shape = BODY_SHAPES[profile] || BODY_SHAPES.sport;
    const spot = spawnSpot(heading, shape.w * scale, shape.l * scale, (x, y) => !this.place.footprintAt(x, y) && !this.place.inWater(x, y));
    this.walker = newWalker(spot.x, spot.y, (heading * Math.PI) / 180);
    gl.clearAway();
  }

  // The parked car's outline, in whatever size the Settings panel has it right now.
  setCar(profile, scale) {
    const shape = BODY_SHAPES[profile] || BODY_SHAPES.sport;
    this.carWalls = this.world.carWalls = carWalls(this.heading, shape.w * scale, shape.l * scale);
  }

  // Height above the ground under the car, or null if that tile isn't here yet.
  height(x, y) {
    const { lat, lng } = fromLocal(this.origin, x, y), raw = terrain.heightNow(lat, lng);
    if (raw === null) return null;
    if (this.zero === null) {
      this.zero = terrain.heightNow(this.origin.lat, this.origin.lng);
      if (this.zero === null) return null;
    }
    return raw - this.zero;
  }

  // How far the current floor is above the ground floor.
  rise(piece) {
    return this.level > GROUND_FLOOR && piece.plan ? (this.level - GROUND_FLOOR) * floorHeight(piece.plan) : 0;
  }

  // A building's floor is level with the ground at one corner.
  floorOf(piece) {
    const building = piece.pieces?.[0] ?? piece, known = this.floors.get(building);
    if (known !== undefined) return known;
    const p = building.rings[0].pts[0];
    const h = this.height(p.x, p.y) ?? 0;
    this.floors.set(building, h);
    return h;
  }

  loadTile(x, y) {
    const key = `${x}_${y}`;
    if (this.place.tiles.has(key) || this.tileLoading.has(key) || Date.now() - (this.tileFailed.get(key) ?? -Infinity) < RETRY_AFTER) return;
    this.tileLoading.add(key);
    this.tiles.tileBytes(x, y).then((bytes) => {
      if (!this.alive) return;
      const began = performance.now();
      const parsed = bytes ? parseTile(bytes, x, y, this.origin) : { buildings: [], lands: [], waters: [], roads: [], pois: [] };
      this.place.addTile(key, parsed);
      this.floors.clear();
      this.tiles.onWork?.(performance.now() - began);
    }).catch((err) => {
      console.warn(`walking tile ${key}:`, err.message);
      this.tileFailed.set(key, Date.now());
    }).finally(() => this.tileLoading.delete(key));
  }

  loadTilesAt(x, y) {
    const seen = new Set();
    for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const { lat, lng } = fromLocal(this.origin, x + ox * TILE_REACH, y + oy * TILE_REACH), t = vectorTileAt(lat, lng), key = `${t.x}_${t.y}`;
      if (!seen.has(key)) {
        seen.add(key);
        this.loadTile(t.x, t.y);
      }
    }
  }

  // Asks Overture about the tiles around a building, and files what has come. Returns null until they've all answered,
  // then whether they all did, as a failed one means the building may be better known than it looks.
  placesAround(building) {
    const { pieces } = this.place.wholeOf(building), tiles = new Set();
    for (const { minX, maxX, minY, maxY } of pieces) {
      for (const [x, y] of [[minX - PLACE_REACH, minY - PLACE_REACH], [maxX + PLACE_REACH, minY - PLACE_REACH], [minX - PLACE_REACH, maxY + PLACE_REACH], [maxX + PLACE_REACH, maxY + PLACE_REACH]]) {
        const { lat, lng } = fromLocal(this.origin, x, y), t = vectorTileAt(lat, lng);
        tiles.add(`${t.x}_${t.y}`);
      }
    }
    let all = true, sure = true;
    for (const key of tiles) {
      const [x, y] = key.split('_').map(Number), result = overture.tile(x, y);
      if (!result) {
        overture.want(x, y);
        all = false;
        continue;
      }
      if (result.failed) sure = false;
      else this.place.addPlaces(`overture_${key}`, result.places.map((p) => ({ ...toLocal(this.origin, p.lat, p.lng), overture: true, category: p.category, name: p.name })));
    }
    return all ? { sure } : null;
  }

  // Works out what a building is, once every tile holding a piece of it and Overture have answered. Null until then.
  planOf(building) {
    if (building.plan) return building.plan;
    const { missing } = this.place.wholeOf(building);
    if (missing.length) {
      for (const key of missing) this.loadTile(...key.split('_').map(Number));
      return null;
    }
    const places = this.placesAround(building);
    return places && identify(this.place, building, saved ||= new BuildingStore(), Date.now(), places.sure);
  }

  // Someone a building filled in around needs to know what it is too.
  syncPlan() {
    if (this.walker.inside) this.planOf(this.walker.inside);
  }

  // A press of L at a building waits for its answer rather than asking for another press.
  syncWaiting() {
    if (!this.waiting) return;
    if (buildingWithin(this.walker, this.world)?.building !== this.waiting) {
      this.waiting = null;
      return;
    }
    if (!this.planOf(this.waiting)) return;
    this.waiting = null;
    const result = this.pressBuilding();
    if (result?.locked !== undefined) this.onLocked?.(result.locked);
  }

  // The models, fetched the first time a furnished building is entered. Until they're here, or if they fail, the room is just empty.
  loadFurniture() {
    if (furniture || furnitureLoading || Date.now() - furnitureFailed < RETRY_AFTER) return;
    furnitureLoading = true;
    fetch('furniture.bin').then((res) => {
      if (!res.ok) throw new Error(`furniture answered ${res.status}`);
      return res.arrayBuffer();
    }).then((buffer) => {
      furniture = parseFurniture(buffer);
    }).catch((err) => {
      console.warn('furniture:', err.message);
      furnitureFailed = Date.now();
    }).finally(() => { furnitureLoading = false; });
  }

  // This floor of a building as saved, or laid out now and saved if nobody has been here. Null if it has nothing to show.
  furnishingOf(building) {
    const { plan } = building;
    if (!plan || isLocked(plan)) return null; // someone a building filled in around sees it empty, and L takes them out
    const furnished = FURNISHED.has(plan.type);
    if (!furnished && plan.floors <= GROUND_FLOOR) return null;
    if (!furniture) {
      this.loadFurniture();
      return null;
    }
    const id = building.buildingId;
    if (plan.floors > GROUND_FLOOR && plan.core === undefined) {
      plan.core = coreOf(building.pieces, plan, furniture.models, dice(hashText(`${id}:core`)));
      if (!plan.core) plan.floors = GROUND_FLOOR; // too narrow for stairs, so what can be reached is all there is
      saved.saveIndex();
      if (!furnished && !plan.core) return null;
    }
    const cache = building.pieces[0].furnishing ||= new Map(), known = cache.get(this.level);
    if (known) return known;
    let record = furnished ? upgradeFloor(saved.floor(id, this.level)) : null;
    if (!record) {
      record = furnished ? layoutFloor(building.pieces, plan, this.level, furniture.models, dice(hashText(`${id}:${this.level}`))) : plainFloor(plan, this.level);
      if (furnished) saved.saveFloor(id, this.level, record); // with the building's look, which it has now if it hadn't
    }
    const furnishing = { record: withoutTaken(record, plan, this.level), furniture, level: this.level };
    cache.set(this.level, furnishing);
    return furnishing;
  }

  // The room is built level with z = 0 and drawn at the floor's height, so ground arriving late doesn't mean building it again.
  syncRoom() {
    const building = this.walker.inside, whole = building ? building.pieces?.[0] ?? building : null;
    const furnishing = building ? this.furnishingOf(building) : null;
    if (this.entering && furnishing) {
      // In by the building's own door, wherever they walked up to it.
      this.entering = false;
      const at = furnishing.record.entry && buildingFrame(building.pieces, furnishing.record.axis).toWorld(...furnishing.record.entry);
      if (at && this.place.footprintAt(at.x, at.y)) {
        this.walker.x = at.x;
        this.walker.y = at.y;
        stepClearOfThings(this.walker, this.world);
      }
    }
    if (this.room?.whole === whole && this.room?.furnishing === furnishing && this.room?.level === this.level && !this.room.stale) {
      if (this.room) this.room.floor = this.world.floor(building);
      return;
    }
    gl.free(this.room?.mesh);
    if (this.room && !building) gl.clearAway();
    this.room = building ? { whole, furnishing, level: this.level, floor: this.world.floor(building), mesh: gl.mesh(roomMesh(this.place, building, 0, furnishing)) } : null;
    this.world.inner = furnishing ? solidsOf(furnishing.record, buildingFrame(building.pieces, furnishing.record.axis), furnishing.furniture.models) : null;
    stepClearOfThings(this.walker, this.world);
  }

  // What could be done from here, to confirm before anything happens: { label, run }, run saying what happened. The nearest things first.
  choices() {
    const building = this.walker.inside, record = this.room?.furnishing?.record;
    if (!building?.plan || !record || !furniture || this.pose) return [];
    const list = [];
    if (this.switchHere()) list.push({ label: this.roomLightsOn() ? 'Turn off the lights?' : 'Turn on the lights?', run: () => this.useLightSwitch() });
    if (this.outletHere()) list.push({ label: this.charging ? 'Unplug?' : 'Plug in here?', run: () => this.useOutlet() });
    const near = thingsNear(record, buildingFrame(building.pieces, record.axis), furniture.models, this.walker.x, this.walker.y, this.walker.facing);
    for (const entry of near) for (const { label, second } of questionsFor(entry)) list.push({ label, run: () => this.useEntry(entry, second) });
    return uniqueChoices(list);
  }

  // What F will offer, for the hint.
  fHint() {
    const choices = this.choices();
    return choices.length > 1 ? `F to choose from ${choices.length}` : choices.length ? `F: ${choices[0].label}` : '';
  }

  // Does what was confirmed. Returns what to say.
  useEntry(entry, second) {
    const building = this.walker.inside, { plan } = building, result = useThing(entry, plan, this.level, building.buildingId, second);
    if (result.pose) return this.takePose(entry, result);
    if (result.effect) this.onUsed?.(result.effect, result.count);
    let say = result.say;
    if (result.give && this.onFound && !this.onFound(result.give)) {
      if (result.taken) plan.state[this.level].taken.pop();
      return 'Your bag is full.';
    }
    if (result.taken) {
      const { furnishing } = this.room, gone = entry;
      furnishing.record = { ...furnishing.record, items: furnishing.record.items.filter((other) => other !== gone) };
      this.room.stale = true;
    }
    saved.saveIndex();
    return say;
  }

  takePose(entry, result) {
    const building = this.walker.inside, record = this.room.furnishing.record, frame = buildingFrame(building.pieces, record.axis), spot = poseSpot(entry), at = frame.toWorld(spot.u, spot.v);
    const model = furniture.models[entry[1]], facing = worldBearing(spot.rot, record.axis);
    this.pose = { kind: result.pose, before: { x: this.walker.x, y: this.walker.y }, top: model.h, facing };
    this.walker.x = at.x;
    this.walker.y = at.y;
    this.walker.facing = facing;
    this.walker.height = 0;
    this.walker.rise = 0;
    if (result.pose === 'sleep') return `${this.onSlept?.() || 'You sleep.'} Press F or walk to get up.`;
    return 'Press F or walk to get up.';
  }

  standUp() {
    this.walker.x = this.pose.before.x;
    this.walker.y = this.pose.before.y;
    this.pose = null;
    return '';
  }

  // The stairs or lift within reach, or null.
  coreHere() {
    const building = this.walker.inside;
    if (!building?.plan?.core || !furniture) return null;
    return coreNear(building.plan, buildingFrame(building.pieces, building.plan.core.axis), furniture.models, this.walker.x, this.walker.y);
  }

  goToFloor(floor) {
    this.level = floor;
    this.picking = null;
  }

  // A digit while choosing a floor: 1 then 0 is the tenth, if it comes quickly and there is a tenth.
  typeFloor(digit, now = performance.now()) {
    if (!this.picking) return;
    const { floors } = this.walker.inside.plan, typed = now - (this.picking.typedAt ?? -Infinity) < TYPE_WINDOW ? Number(`${this.picking.floor}${digit}`) : Number(digit);
    const floor = typed >= GROUND_FLOOR && typed <= floors ? typed : Number(digit);
    if (floor >= GROUND_FLOOR && floor <= floors) this.picking.floor = floor;
    this.picking.typedAt = now;
  }

  // W and S choose a floor in a lift, and nothing else moves until L goes or cancels.
  pickFloor(dt, input) {
    const { floors } = this.walker.inside.plan, way = input.forward || 0;
    this.picking.wait -= dt;
    if (!way) this.picking.wait = 0;
    else if (this.picking.wait <= 0) {
      this.picking.floor = Math.max(GROUND_FLOOR, Math.min(floors, this.picking.floor + way * (input.run ? PICK_FAST : 1)));
      this.picking.wait = PICK_REPEAT;
    }
    return { ...input, forward: 0, strafe: 0 };
  }

  update(dt, input, hour) {
    if (!this.alive || gl.lost) return;
    const now = performance.now();
    if (now - this.lookedAt > LOOK_EVERY) {
      this.lookedAt = now;
      this.loadTilesAt(this.walker.x, this.walker.y);
    }
    if (terrain.changes !== this.terrainSeen) {
      this.terrainSeen = terrain.changes;
      this.floors.clear();
    }
    if (this.picking && !this.walker.inside) this.picking = null;
    if (this.pose) {
      if (input.forward || input.strafe || input.jump) this.standUp();
      else this.walker.yaw += input.lookX || 0;
    }
    if (!this.pose) stepWalker(this.walker, this.picking ? this.pickFloor(dt, input) : input, dt, this.world);
    this.syncPlan();
    this.syncWaiting();
    this.syncRoom();
    if (this.room) this.renderRoom(hour);
  }

  renderRoom(hour) {
    const view = { ...this.view, range: this.view.range * INDOOR_RANGE };
    const aspect = gl.fit(), { eye, target } = placeCamera(this.walker, view);
    const daylight = tintAt(hour).map((v) => v / 255), tint = [1, 1, 1], sky = ROOM_SKY.map((v, i) => v * daylight[i]);
    gl.begin({
      viewProj: multiply(perspective(this.view.fov, aspect, NEAR, FAR), lookAt(eye, target)),
      eye, tint, sky, fogFrom: FAR, fogTo: FAR * 2,
    });
    this.syncLightMap(hour);
    const carried = this.light && TORCHES[this.light], facing = this.walker.facing;
    gl.setLights(this.roomLightsOn() ? 1 : 0, carried ? { x: this.walker.x, y: this.walker.y, dirX: Math.sin(facing), dirY: Math.cos(facing), ...carried } : null);
    gl.draw(this.room.mesh, translate(0, 0, this.room.floor));
    const w = this.walker, n = PERSON_SIZE;
    const sized = [n, 0, 0, 0, 0, n, 0, 0, 0, 0, n, 0, 0, 0, 0, 1];
    if (this.pose?.kind === 'sleep') gl.draw(personMesh(0), multiply(multiply(multiply(translate(w.x, w.y, this.room.floor + LIE_HEIGHT), bearing(w.facing)), multiply(swing(Math.PI / 2), translate(0, 0, -0.85))), sized));
    else if (this.pose) gl.draw(personMesh(SIT_FRAME), multiply(multiply(translate(w.x, w.y, this.room.floor), bearing(w.facing)), sized));
    else gl.draw(personMesh(frameOf(w)), multiply(multiply(translate(w.x, w.y, w.z + w.height), bearing(w.facing)), sized));
  }

  // The floor's light from its windows, again as the hour changes or the room does.
  syncLightMap(hour) {
    const { room } = this, key = `${room.level}|${Math.round(hour * 2)}`;
    if (room.lightKey === key) return;
    room.lightKey = key;
    const building = this.walker.inside, pieces = building.pieces || [building], record = room.furnishing?.record, frame = record && buildingFrame(pieces, record.axis);
    const windows = pieces.flatMap((piece) => this.place.walls(piece).flatMap(windowsOn));
    const walls = record ? record.walls.map(([u0, v0, u1, v1]) => {
      const a = frame.toWorld(u0, v0), b = frame.toWorld(u1, v1);
      return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
    }) : [];
    const box = { minX: Math.min(...pieces.map((p) => p.minX)), maxX: Math.max(...pieces.map((p) => p.maxX)), minY: Math.min(...pieces.map((p) => p.minY)), maxY: Math.max(...pieces.map((p) => p.maxY)) };
    gl.setLightMap(lightMap(box, windows, walls, hour));
  }

  // A room with no plan has no switches to find, so it's simply lit.
  roomLightsOn() {
    const { plan } = this.walker.inside || {};
    return !plan || !!plan.state?.[this.level]?.lights;
  }

  // Whether the person is close enough to a light switch to use it.
  switchHere() {
    const building = this.walker.inside, record = this.room?.furnishing?.record;
    if (!building?.plan || !record) return false;
    const frame = buildingFrame(building.pieces, record.axis), { u, v } = frame.toFrame(this.walker.x, this.walker.y);
    return switchSpots(record, building.plan.core).some((spot) => Math.hypot(spot.u - u, spot.v - v) <= SWITCH_REACH);
  }

  // The power point in reach, or null.
  outletHere() {
    const building = this.walker.inside, record = this.room?.furnishing?.record;
    if (!building?.plan || !record) return null;
    const { u, v } = buildingFrame(building.pieces, record.axis).toFrame(this.walker.x, this.walker.y);
    return outletSpots(record, building.plan.core, building.buildingId, this.level).find((spot) => Math.hypot(spot.u - u, spot.v - v) <= GAME.outlets.reach) || null;
  }

  // F at a power point: plugged in until F again or walking away.
  useOutlet() {
    if (this.charging) {
      this.charging = false;
      return 'Unplugged.';
    }
    if (!this.outletHere().works) return 'This outlet has no power.';
    this.charging = true;
    return 'Charging. Stay close, or you\'ll unplug.';
  }

  // Whether something is plugged in, which walking out of reach ends.
  chargingNow() {
    if (this.charging && !this.outletHere()) {
      this.charging = false;
      return false;
    }
    return !!this.charging;
  }

  // What the person is doing, for how fast they tire.
  activity() {
    if (this.pose) return 'sitting';
    const { frame } = this.posture();
    return frame === 0 ? 'still' : frame <= 8 ? 'walking' : 'running';
  }

  useLightSwitch() {
    const building = this.walker.inside, pieces = building.pieces, footprint = pieces.reduce((sum, p) => sum + (p.maxX - p.minX) * (p.maxY - p.minY), 0);
    const said = useSwitch(building.plan, this.level, switchNeedsKey(building.plan, footprint, building.buildingId), this.hasKey?.());
    saved.saveIndex();
    return said;
  }

  // Which light is being carried: 'flash', 'phone', or null. Asking for the one that's on turns it off.
  toggleLight(kind) {
    this.light = this.light === kind ? null : kind;
    return this.light;
  }

  rebuildAll() {
    shared = null;
    this.room = null;
  }

  where() {
    return fromLocal(this.origin, this.walker.x, this.walker.y);
  }

  compass() {
    const degrees = (this.walker.yaw * 180) / Math.PI;
    return ((degrees % 360) + 360) % 360;
  }

  // Which way the person faces, and which of the model's frames fits the stride now.
  posture() {
    return { facing: (((this.walker.facing * 180) / Math.PI) % 360 + 360) % 360, frame: frameOf(this.walker), z: this.walker.z, height: this.walker.height, inside: !!this.walker.inside };
  }

  // L at a building: in if beside one, out if inside. False if there is nothing to go through here, or { locked } or { waiting } if it can't be gone into.
  // down: Shift was held, for the stairs on a floor that has both ways.
  pressBuilding(down = false) {
    if (this.picking) {
      this.goToFloor(this.picking.floor);
      return true;
    }
    if (this.pose) this.standUp();
    if (this.walker.inside) {
      const { plan } = this.walker.inside, near = this.coreHere();
      if (near === 'lift') {
        this.picking = { floor: this.level, wait: 0 };
        return true;
      }
      if (near === 'stairs') {
        const up = this.level < plan.floors && !down;
        if (up) this.level++;
        else if (this.level > GROUND_FLOOR) this.level--;
        return true;
      }
      if (this.level > GROUND_FLOOR) return true; // the only way down is the way the hint says
      const left = leaveBuilding(this.walker, this.world);
      if (left) {
        this.world.inner = null;
        this.entering = false;
      }
      return left;
    }
    const near = buildingWithin(this.walker, this.world);
    if (near) {
      const plan = this.planOf(near.building);
      if (!plan) {
        this.waiting = near.building;
        return { waiting: true };
      }
      if (isLocked(plan)) return { locked: typeName(plan) };
    }
    const entered = enterBuilding(this.walker, this.world);
    if (entered) {
      this.entering = true;
      stepClearOfThings(this.walker, this.world);
    }
    return entered;
  }

  distanceToCar() {
    return distanceToCar(this.walker, this.carWalls);
  }

  canGetIn() {
    return !this.walker.inside && distanceToCar(this.walker, this.carWalls) <= GET_IN_REACH;
  }

  // The short line on screen: where you are, and the way back to the car, as past the view it can't be seen.
  hint() {
    if (this.walker.inside) {
      const { plan } = this.walker.inside;
      if (!plan) return 'Inside · press L to go back out';
      if (this.picking) return `Lift · floor ${this.picking.floor} of ${plan.floors} · click a floor, or type it · L goes`;
      const here = planLabel(plan, this.level), near = this.coreHere();
      if (this.pose) return `${here} · press F or walk to get up`;
      const offered = this.fHint(), also = offered ? ` · ${offered}` : '';
      if (near === 'lift') return `${here} · press L for the lift${also}`;
      if (near === 'stairs') {
        if (this.level >= plan.floors) return `${here} · press L to go downstairs${also}`;
        return (this.level > GROUND_FLOOR ? `${here} · L upstairs, Shift+L downstairs` : `${here} · press L to go upstairs`) + also;
      }
      if (offered) return `${here}${this.charging ? ' · charging' : ''}${also}`;
      return this.level > GROUND_FLOOR ? `${here} · find the stairs to go down` : `${here} · press L to go back out`;
    }
    if (this.canGetIn()) return 'Press L to get in';
    const near = buildingWithin(this.walker, this.world);
    if (near) return near.building.plan && isLocked(near.building.plan) ? `${typeName(near.building.plan) || 'This building'} · locked` : this.waiting ? 'Checking this building…' : 'Press L to go inside';
    const { metres, direction } = wayToCar(this.walker);
    return `Car ${metres} m ${direction}`;
  }

  label() {
    return this.walker.inside ? 'INSIDE' : 'ON FOOT';
  }

  stats() {
    return { chunks: this.room ? 1 : 0, triangles: this.room ? this.room.mesh.count / 3 : 0 };
  }

  // The context and the meshes every walk shares stay, for the next time.
  stop() {
    this.alive = false;
    gl.free(this.room?.mesh);
    gl.clearAway();
    gl.onRestored = null;
  }
}
