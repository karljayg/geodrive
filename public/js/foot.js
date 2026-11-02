// Walking: the person, and what they can bump into, around the parked car. Outdoors the driving map is what you see, and main.js
// moves its camera and the person's model from here. Only a room is drawn here, because the map has no insides.
// The data, the person and the meshes are in footData, footWalker and footScene.
import { dice, floorHeight, hashText, identify, isLocked, ownFrame, planLabel, typeName } from './buildings.js';
import { tintAt } from './daylight.js';
import { FootGl, bearing, lookAt, multiply, perspective, swing, translate } from './footGl.js';
import { Place, fromLocal, parseTile, toLocal } from './footData.js';
import { SIT_FRAME, personFloats } from './footPerson.js';
import { SWITCH_REACH, thingKey, actionsOf, breakThrough, canClimb, climbQuestion, wallAhead, outletSpots, switchNeedsKey, switchSpots, useSwitch, poseSpot, coreQuestions, modelNamed, inertNear, lookLine, pushFits, pushTarget, pushThing, questionsFor, thingsNear, uniqueChoices, useThing, withoutTaken } from './footActions.js';
import { CORE_SCHEME, roomMesh } from './footScene.js';
import { FURNISHED, colourFor, coreNear, coreOf, frameOf as buildingFrame, layoutFloor, plainFloor, solidsOf, upgradeFloor, worldBearing } from './furnish.js';
import { parseFurniture } from './furniture.js';
import { buildingWithin, byOutsideWall, carWalls, climbOver, distanceToCar, enterBuilding, GET_IN_REACH, leaveBuilding, newWalker, frameOf, placeCamera, spawnSpot, stepClearOfThings, stepWalker, wayToCar } from './footWalker.js';
import { parcelParts, thingParts } from './drops.js';
import { GAME } from './gameConfig.js';
import { FLAGS } from './protocol.js';
import { say } from './sayings.js';
import { SAYINGS } from './sayingsConfig.js';
import { footfall, stepSound } from './sounds.js';
import { Overture } from './overture.js';
import { TORCHES, darkHere, lightAt, lightMap, sunAt, windowsOn } from './roomLight.js';
import { Terrain } from './terrain.js';
import { vectorTileAt } from './vector.js';

const MOVING = 0.5; // m/s, or feet aren't really landing, as when pressed against a wall
const TILE_REACH = 200;      // m around the person that buildings and water must be known
const TERRAIN_ZOOM = 15;     // about 5 m a sample at these latitudes; the drive's zoom 12 is too coarse to walk on
const LOOK_EVERY = 1000;     // ms between checking which tiles are wanted
const RETRY_AFTER = 15000;   // ms before a tile that failed is tried again
const ROOM_SKY = [0.42, 0.58, 0.76];
const NEAR = 2, FAR = 400;   // m from the camera
const INDOOR_RANGE = 0.45;   // of the camera's distance outdoors, as furniture is small from there
export const PERSON_SIZE = 1.1; // times real size, which is hard to follow from the driving camera

const NAME_ABOVE = 2.15;     // m above the floor that a name goes indoors
const roomTags = new Map();  // member id: their name on screen
const otherMeshes = new Map(); // `${who}|${frame}`: how they look, walking, indoors
function otherMesh(id, look, frame) {
  const key = `${id}|${frame}`;
  if (!otherMeshes.has(key)) otherMeshes.set(key, gl.mesh(personFloats(frame, look)));
  return otherMeshes.get(key);
}

function clearRoomTags() {
  for (const tag of roomTags.values()) tag.remove();
  roomTags.clear();
}

let gl = null, shared = null, ownLook = null; // one context for the visit, the meshes that never change, and how this person looks
let furniture = null, furnitureLoading = false, furnitureFailed = -Infinity; // the models, once fetched
const GROUND_FLOOR = 1;
const PICK_REPEAT = 0.16;    // s between floors while W or S is held in a lift
const PICK_FAST = 10;        // floors a press moves with Shift held
const PLACE_REACH = 30;      // m around a building to ask about places, which can be just outside it
const LIE_HEIGHT = 0.72;     // m of a person lying on a bed, on the mattress rather than the height of the headboard
const TYPE_WINDOW = 1500;    // ms in which a second digit makes a two-figure floor

const terrain = new Terrain(undefined, TERRAIN_ZOOM);
const overture = new Overture();

function personMesh(frame) {
  shared ||= [];
  return shared[frame] ||= gl.mesh(personFloats(frame, ownLook));
}

export class Foot {
  // cars: those that can be walked up to, { x, y, heading, halfWidth, halfLength } in metres from the origin. tiles: the RoadTiles that fetches the same map tiles for driving. view: the camera to match.
  constructor({ canvas, origin, heading, cars, buildings, look, others, carsDriven, roomPeople, tiles, view, onLocked, onLoadCar, onFound, onSlept, roughChoices, drops, onDropsChanged, hasKey, hasHammer, onSay, onGetIn, onOpenBag, onUsed, onSound }) {
    this.saved = buildings; // the store of buildings entered, from the world
    this.carsDriven = carsDriven; // others' cars, moving, which block as parked ones do: (at) => [{ lat, lng, heading, halfWidth, halfLength }]
    this.gave = new Map();  // what's gone in the bag from each thing, in case someone else turns out to have got there first
    this.canvas = canvas;
    this.roomPeople = roomPeople; // who else is on this floor, in a shared world: (building, floor) => [{ member, place }]
    this.saved.onChange = (id, floor) => this.buildingChanged(id, floor);
    ownLook = look ?? null;
    this.hasKey = hasKey;
    this.hasHammer = hasHammer;
    this.onSay = onSay;
    this.onGetIn = onGetIn;
    this.onOpenBag = onOpenBag;
    this.drops = drops;
    this.onDropsChanged = onDropsChanged;
    this.onSound = onSound; // a name from sounds.js
    this.onUsed = onUsed; // something in a room did something to the person's stats
    if (!gl) gl = new FootGl(canvas);
    gl.onRestored = () => this.rebuildAll();
    this.view = view;
    this.onLocked = onLocked;
    this.onLoadCar = onLoadCar; // F at the car, answered yes
    this.onFound = onFound;   // given a thing for the bag, returns false if there's no room
    this.onSlept = onSlept;
    this.roughChoices = roughChoices; // sleeping or going where there's nothing for it, when they need to
    this.pose = null;         // sitting or lying on something
    this.light = null;        // a flashlight or phone light that's on
    this.origin = origin;
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
    // Who else is solid here. others: () => [{ lat, lng }], or nothing in a world with only one person in it. Indoors, those on this floor.
    this.world = { solidPeople: others ? () => (this.walker?.inside ? this.othersInRoom().filter(({ place }) => !(place.flags & FLAGS.away)).map(({ at }) => at) : others().map(({ lat, lng }) => toLocal(origin, lat, lng))) : null, place: this.place, height: (x, y) => this.height(x, y), floor: (b) => this.floorOf(b) + this.rise(b) };
    this.setCars(cars);
    this.loadTilesAt(0, 0);
    const beside = cars.find((car) => Math.hypot(car.x, car.y) < 1); // the car they've just got out of, not one that happens to be near
    const spot = beside ? spawnSpot(beside.heading, beside.halfWidth, beside.halfLength, (x, y) => !this.place.footprintAt(x, y) && !this.place.inWater(x, y)) : { x: 0, y: 0 };
    this.walker = newWalker(spot.x, spot.y, (heading * Math.PI) / 180);
    gl.clearAway();
  }

  // The parked cars' outlines, in whatever size the Settings panel has them right now.
  setCars(cars) {
    this.cars = cars;
    this.parkedWalls = cars.flatMap((car) => carWalls(car.heading, car.halfWidth, car.halfLength, car.x, car.y));
    this.world.carWalls = this.parkedWalls;
  }

  // Moving cars block too, wherever they've got to this frame.
  syncDrivenCars() {
    if (!this.carsDriven) return;
    const driven = this.carsDriven(this.where());
    if (!driven.length && this.world.carWalls === this.parkedWalls) return;
    this.world.carWalls = driven.length ? [...this.parkedWalls, ...driven.flatMap((car) => {
      const { x, y } = toLocal(this.origin, car.lat, car.lng);
      return carWalls(car.heading, car.halfWidth, car.halfLength, x, y);
    })] : this.parkedWalls;
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
      this.saved.watch?.(key); // what's known about the buildings here, and from now on what happens to them
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
    return places && identify(this.place, building, this.saved, Date.now(), places.sure);
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
      plan.core = coreOf(ownFrame(building.pieces, this.origin, id), plan, furniture.models, dice(hashText(`${id}:core`)));
      if (!plan.core) plan.floors = GROUND_FLOOR; // too narrow for stairs, so what can be reached is all there is
      this.saved.saveIndex();
      if (!furnished && !plan.core) return null;
    }
    const cache = building.pieces[0].furnishing ||= new Map(), known = cache.get(this.level);
    if (known) return known;
    let record = furnished ? upgradeFloor(this.saved.floor(id, this.level)) : null;
    if (!record) {
      record = furnished ? layoutFloor(ownFrame(building.pieces, this.origin, id), plan, this.level, furniture.models, dice(hashText(`${id}:${this.level}`))) : plainFloor(plan, this.level);
      if (furnished) this.saved.saveFloor(id, this.level, record); // with the building's look, which it has now if it hadn't
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
    if (this.room && !building) {
      gl.clearAway();
      clearRoomTags();
    }
    this.room = building ? { whole, furnishing, level: this.level, floor: this.world.floor(building), mesh: gl.mesh(roomMesh(this.place, building, 0, furnishing, this.dropsHere(building))) } : null;
    this.world.inner = furnishing ? solidsOf(furnishing.record, buildingFrame(building.pieces, furnishing.record.axis), furnishing.furniture.models) : null;
    stepClearOfThings(this.walker, this.world);
  }

  dropsHere(building) {
    return building.buildingId === undefined ? [] : this.drops?.inBuilding(building.buildingId, this.level) ?? [];
  }

  // Leaves something a step ahead, or at their feet if that's through a wall. Returns its id.
  placeDrop(name) {
    const w = this.walker, building = w.inside?.buildingId === undefined ? null : w.inside, facing = w.facing;
    const taken = this.dropsInReach().map((drop) => (building ? buildingFrame(building.pieces, drop.axis).toWorld(drop.u, drop.v) : toLocal(this.origin, drop.lat, drop.lng)));
    // Off to one side, as straight ahead is behind them from the camera.
    const spot = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8].map((turn) => ({ x: w.x + Math.sin(facing + turn) * GAME.drops.ahead, y: w.y + Math.cos(facing + turn) * GAME.drops.ahead }))
      .find((p) => !taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < GAME.drops.apart)) ?? { x: w.x + Math.sin(facing) * GAME.drops.ahead, y: w.y + Math.cos(facing) * GAME.drops.ahead };
    const aheadX = spot.x, aheadY = spot.y;
    if (!building) {
      const { lat, lng } = fromLocal(this.origin, aheadX, aheadY);
      return this.drops.add({ name, lat, lng, facing });
    }
    const clear = this.place.footprintAt(aheadX, aheadY) === building, axis = this.room?.furnishing?.record.axis ?? 0;
    const { u, v } = buildingFrame(building.pieces, axis).toFrame(clear ? aheadX : w.x, clear ? aheadY : w.y);
    const id = this.drops.add({ name, buildingId: building.buildingId, floor: this.level, axis, u, v, facing });
    if (this.room) this.room.stale = true;
    return id;
  }

  // Someone else got this first: what it gave, to take back out of the bag.
  takenBack(key) {
    const name = this.gave.get(key);
    this.gave.delete(key);
    return name;
  }

  // Someone else left or took something: the room shows it.
  dropsChanged() {
    if (this.room) this.room.stale = true;
  }

  // Takes one back off the ground or floor, for undoing a drop or picking it up.
  removeDrop(id) {
    const gone = this.drops.remove(id);
    if (gone && this.room) this.room.stale = true;
    return gone;
  }

  // What's been left within reach, the nearest first.
  dropsInReach() {
    const w = this.walker, building = w.inside?.buildingId === undefined ? null : w.inside, reach = GAME.drops.reach, found = [];
    if (building) {
      for (const drop of this.dropsHere(building)) {
        const { x, y } = buildingFrame(building.pieces, drop.axis).toWorld(drop.u, drop.v), away = Math.hypot(x - w.x, y - w.y);
        if (away <= reach) found.push({ drop, away });
      }
    } else if (!w.inside && this.drops) {
      const at = this.where();
      for (const drop of this.drops.around(at.lat, at.lng, reach, GAME.drops.mostShown)) {
        const { x, y } = toLocal(this.origin, drop.lat, drop.lng);
        found.push({ drop, away: Math.hypot(x - w.x, y - w.y) });
      }
    }
    return found.sort((a, b) => a.away - b.away).map((f) => f.drop);
  }

  pickUpDrop(drop) {
    if (this.onFound && !this.onFound(drop.name)) return say('bagFull');
    this.removeDrop(drop.id);
    this.onSound?.('pickup');
    this.onDropsChanged?.();
    return say('pickUp', { name: drop.name.toLowerCase() });
  }

  // How a dropped thing looks on the map, or null until the furniture is here, as it may have a model of its own.
  dropParts(name) {
    const key = modelNamed(name);
    if (!key) return parcelParts();
    this.loadFurniture();
    if (!furniture) return null;
    const model = furniture.models[key];
    return model ? thingParts(model, (mat) => colourFor(mat, CORE_SCHEME, 1, furniture.colours)) : parcelParts();
  }

  // What could be done from here, to confirm before anything happens: { label, run }, run saying what happened. The nearest things first.
  choices() {
    if (this.pose || this.busy) return [];
    const building = this.walker.inside, record = this.room?.furnishing?.record;
    const list = this.dropsInReach().map((drop) => ({ label: `Pick up the ${drop.name.toLowerCase()}?`, run: () => this.pickUpDrop(drop) }));
    if (!this.waiting) list.push(...(this.roughChoices?.() || []));
    if (this.canGetIn()) {
      list.unshift({ label: 'Get in the car?', run: () => { this.onGetIn?.(); return ''; } },
        { label: 'Load into car?', html: '<u>L</u>oad into car?', key: 'l', run: () => { this.onLoadCar?.(); return ''; } },
        { label: 'Open the car\'s storage?', run: () => { this.onOpenBag?.(); return ''; } });
    }
    if (!building) {
      const near = buildingWithin(this.walker, this.world);
      if (near) list.push({ label: near.building.plan && !isLocked(near.building.plan) ? 'Go inside?' : 'Try the door?', run: () => this.goInside() });
      return uniqueChoices(list);
    }
    const out = { label: 'Go outside?', run: () => { this.goOutside(); return ''; } };
    if (!building.plan || !record || !furniture) return uniqueChoices([...list, out]);
    for (const { label, down } of coreQuestions(this.coreHere(), this.level, building.plan.floors, GROUND_FLOOR)) list.push({ label, run: () => { this.pressBuilding(down); return ''; } });
    if (this.switchHere()) list.push({ label: this.roomLightsOn() ? 'Turn off the lights?' : 'Turn on the lights?', run: () => this.useLightSwitch() });
    if (this.outletHere()) list.push({ label: this.charging ? 'Unplug?' : 'Plug in here?', run: () => this.useOutlet() });
    const near = thingsNear(record, buildingFrame(building.pieces, record.axis), furniture.models, this.walker.x, this.walker.y, this.walker.facing);
    for (const entry of near) for (const { label, second } of questionsFor(entry)) list.push({ label, run: () => this.useEntry(entry, second) });
    const climb = this.climbHere();
    if (climb) list.push({ label: climbQuestion(climb.box.entry[0]), run: () => this.startClimb(climb) });
    if (this.hasHammer?.()) {
      const wall = this.wallHere();
      if (wall) list.push({ label: 'Break through the wall?', run: () => this.startBreaking(wall) });
    }
    if (this.level === GROUND_FLOOR && byOutsideWall(this.walker, this.world)) list.push(out);
    return uniqueChoices(list);
  }

  // What the nearest thing with no use is, for F to say. Null if there's nothing.
  lookHere() {
    if (!this.walker.inside) {
      const { kind, name } = this.place.whatsAround(this.walker.x, this.walker.y);
      return kind === 'land' ? say(SAYINGS[`lookLand_${name}`] ? `lookLand_${name}` : 'lookGround') : say(`look_${kind}`, { name });
    }
    const building = this.walker.inside, record = this.room?.furnishing?.record;
    if (!building?.plan || !record || !furniture) return null;
    const entry = inertNear(record, buildingFrame(building.pieces, record.axis), furniture.models, this.walker.x, this.walker.y);
    return entry ? lookLine(entry[0]) : null;
  }

  // From the street, as L does.
  goInside() {
    const done = this.pressBuilding();
    if (done?.locked !== undefined) this.onLocked?.(done.locked);
    return '';
  }

  goOutside() {
    const left = leaveBuilding(this.walker, this.world);
    if (left) {
      this.onSound?.('door');
      this.world.inner = null;
      this.entering = false;
    }
    return left;
  }

  // What F will offer, for the hint.
  fHint() {
    const choices = this.choices();
    return choices.length > 1 ? `F to choose from ${choices.length}` : choices.length ? `F: ${choices[0].label}` : '';
  }

  // Does what was confirmed. Returns what to say.
  useEntry(entry, second) {
    const building = this.walker.inside, { plan } = building, result = useThing(entry, plan, this.level, building.buildingId, second);
    if (result.pose) {
      this.onSound?.(result.sound);
      return this.takePose(entry, result);
    }
    if (result.push) return this.pushEntry(entry, result);
    if (result.effect) this.onUsed?.(result.effect, result.count);
    if (result.give && this.onFound && !this.onFound(result.give)) {
      if (result.taken) plan.state[this.level].taken.pop();
      this.onSound?.('ack');
      return say('bagFull');
    }
    if (result.give) this.gave.set(thingKey(entry), result.give);
    this.onSound?.(result.sound);
    if (result.taken) {
      const { furnishing } = this.room, gone = entry;
      furnishing.record = { ...furnishing.record, items: furnishing.record.items.filter((other) => other !== gone) };
      this.room.stale = true;
    }
    this.saved.saveIndex();
    return result.say;
  }

  // Away from the person, if there's room for it there.
  pushEntry(entry, result) {
    const building = this.walker.inside, { furnishing } = this.room, record = furnishing.record, frame = buildingFrame(building.pieces, record.axis);
    const { u, v } = frame.toFrame(this.walker.x, this.walker.y), to = pushTarget(entry, u, v, result.push);
    if (!pushFits(record, furniture.models, entry, to, this.insideOf(building, frame), building.plan.core)) {
      this.onSound?.('ack');
      return result.stuck;
    }
    furnishing.record = pushThing(record, building.plan, this.level, entry, to);
    this.room.stale = true;
    this.onSound?.(result.sound);
    this.saved.saveIndex();
    return result.say;
  }

  insideOf(building, frame) {
    return (u, v) => { const p = frame.toWorld(u, v); return this.place.footprintAt(p.x, p.y) === building; };
  }

  // What they could climb over from here. A thing that a push would shift needn't be climbed.
  climbHere() {
    const building = this.walker.inside, record = this.room?.furnishing?.record;
    if (!building?.plan || !record || !furniture) return null;
    const frame = buildingFrame(building.pieces, record.axis), { u, v } = frame.toFrame(this.walker.x, this.walker.y), inside = this.insideOf(building, frame);
    return climbOver(this.walker, this.world, ({ entry, top }) => {
      if (!canClimb(entry[0], top)) return true;
      return actionsOf(entry[0]).includes('move') && pushFits(record, furniture.models, entry, pushTarget(entry, u, v, GAME.push.step), inside, building.plan.core);
    });
  }

  // The inner wall they're facing, in reach, as wallAhead says, or null.
  wallHere() {
    const building = this.walker.inside, record = this.room?.furnishing?.record;
    if (!building?.plan || !record) return null;
    const frame = buildingFrame(building.pieces, record.axis), { u, v } = frame.toFrame(this.walker.x, this.walker.y);
    return wallAhead(record, building.plan.core, building.buildingId, this.level, u, v, this.walker.facing + frame.axis);
  }

  startClimb({ box, x, y }) {
    const { walker } = this;
    this.busy = { kind: 'climb', t: 0, building: walker.inside, level: this.level, fromX: walker.x, fromY: walker.y, x, y, top: box.top };
    this.onUsed?.({ energy: GAME.climb.energy });
    this.onSound?.('jump');
    return '';
  }

  startBreaking({ hole }) {
    if (!hole) {
      this.onSound?.('ack');
      return say('wallWiring');
    }
    this.busy = { kind: 'break', t: 0, building: this.walker.inside, level: this.level, hole, swings: 0 };
    return say('hammerStart');
  }

  // A climb or a hole under way. Walking stops swinging, but not a climb, which is over in moments.
  tickBusy(dt, input) {
    const { busy, walker } = this;
    busy.t += dt;
    if (walker.inside !== busy.building || this.level !== busy.level || !this.room?.furnishing) return this.endBusy();
    if (busy.kind === 'climb') {
      const p = Math.min(busy.t / GAME.climb.seconds, 1);
      walker.x = busy.fromX + (busy.x - busy.fromX) * p;
      walker.y = busy.fromY + (busy.y - busy.fromY) * p;
      walker.height = (busy.top + 0.1) * Math.sin(Math.PI * p);
      walker.rise = 0.01; // holds the stride someone in the air has
      if (p >= 1) {
        this.onSound?.('land');
        this.endBusy();
      }
      return;
    }
    if (input.forward || input.strafe) return this.endBusy();
    const { swings, swingEvery, energy } = GAME.hammer;
    while (busy.swings < swings && busy.t >= busy.swings * swingEvery) {
      busy.swings++;
      this.onSound?.('wallHit');
    }
    if (busy.t < swings * swingEvery) return;
    const { furnishing } = this.room;
    furnishing.record = breakThrough(furnishing.record, busy.building.plan, this.level, busy.hole);
    this.room.stale = true;
    this.onUsed?.({ energy });
    this.onSound?.('wallBreak');
    this.saved.saveIndex();
    this.onSay?.(say('wallBroken'));
    this.endBusy();
  }

  endBusy() {
    if (this.busy?.kind === 'climb') {
      this.walker.height = 0;
      this.walker.rise = 0;
    }
    this.busy = null;
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
    this.onSound?.('liftDing');
  }

  // A digit while choosing a floor: 1 then 0 is the tenth, if it comes quickly and there is a tenth.
  typeFloor(digit, now = performance.now()) {
    if (!this.picking) return;
    const { floors } = this.walker.inside.plan, typed = now - (this.picking.typedAt ?? -Infinity) < TYPE_WINDOW ? Number(`${this.picking.floor}${digit}`) : Number(digit);
    const floor = typed >= GROUND_FLOOR && typed <= floors ? typed : Number(digit);
    if (floor >= GROUND_FLOOR && floor <= floors) this.picking.floor = floor;
    this.picking.typedAt = now;
    this.onSound?.('beep');
  }

  // W and S choose a floor in a lift, and nothing else moves until L goes or cancels.
  pickFloor(dt, input) {
    const { floors } = this.walker.inside.plan, way = input.forward || 0;
    this.picking.wait -= dt;
    if (!way) this.picking.wait = 0;
    else if (this.picking.wait <= 0) {
      this.picking.floor = Math.max(GROUND_FLOOR, Math.min(floors, this.picking.floor + way * (input.run ? PICK_FAST : 1)));
      this.onSound?.('beep');
      this.picking.wait = PICK_REPEAT;
    }
    return { ...input, forward: 0, strafe: 0 };
  }

  update(dt, input, hour) {
    this.syncDrivenCars();
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
    if (this.busy) this.tickBusy(dt, input);
    if (this.busy) stepWalker(this.walker, { lookX: input.lookX }, 0, this.world);
    else if (!this.pose) {
      const { phase, rise } = this.walker;
      stepWalker(this.walker, this.picking ? this.pickFloor(dt, input) : input, dt, this.world);
      this.soundOfMoving(phase, rise);
    }
    this.syncPlan();
    this.syncWaiting();
    this.syncRoom();
    if (this.room) this.renderRoom(hour);
  }

  renderRoom(hour) {
    const view = { ...this.view, range: this.view.range * INDOOR_RANGE };
    const aspect = gl.fit(), { eye, target } = placeCamera(this.walker, view);
    const daylight = tintAt(hour).map((v) => v / 255), tint = [1, 1, 1], sky = ROOM_SKY.map((v, i) => v * daylight[i]);
    const viewProj = multiply(perspective(this.view.fov, aspect, NEAR, FAR), lookAt(eye, target));
    gl.begin({
      viewProj,
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
    this.drawOthers(sized, viewProj);
  }

  // Those on this floor, placed by where they say they are in the building's own frame.
  othersInRoom() {
    const building = this.walker.inside, axis = this.room?.furnishing?.record?.axis;
    if (!building?.buildingId || axis === undefined || !this.roomPeople) return [];
    const frame = buildingFrame(building.pieces, axis);
    return this.roomPeople(building.buildingId, this.level).map(({ member, place }) => ({ member, place, at: frame.toWorld(place.u, place.v) }));
  }

  drawOthers(sized, viewProj) {
    const shownNames = new Set();
    for (const { member, place, at } of this.othersInRoom()) {
      const look = { figure: member.figure, colours: member.colours }, asleep = place.flags & FLAGS.asleep;
      const facing = (place.heading * Math.PI) / 180, base = multiply(translate(at.x, at.y, this.room.floor + (asleep ? LIE_HEIGHT : 0)), bearing(facing));
      gl.draw(otherMesh(member.id, look, asleep ? 0 : place.gait), asleep ? multiply(multiply(base, multiply(swing(Math.PI / 2), translate(0, 0, -0.85))), sized) : multiply(base, sized));
      shownNames.add(member.id);
      this.placeRoomTag(member, at, viewProj);
    }
    for (const [id, tag] of roomTags) {
      if (shownNames.has(id)) continue;
      tag.remove();
      roomTags.delete(id);
    }
  }

  // A name over someone indoors: outdoors the map draws these, but here it's a label placed from the camera's own numbers.
  placeRoomTag(member, at, m) {
    const x = at.x, y = at.y, z = this.room.floor + NAME_ABOVE, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    let tag = roomTags.get(member.id);
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'roomTag';
      tag.textContent = member.name;
      document.getElementById('hud').append(tag);
      roomTags.set(member.id, tag);
    }
    if (w <= 0) {
      tag.style.display = 'none';
      return;
    }
    const { canvas } = this, sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) * 0.5 * canvas.clientWidth, sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5 * canvas.clientHeight;
    tag.style.display = 'block';
    tag.style.transform = `translate(calc(${Math.round(sx)}px - 50%), calc(${Math.round(sy)}px - 100%))`;
  }

  // Something changed in a building that wasn't this person's doing. floor: which, or null if it could be any.
  buildingChanged(id, floor) {
    this.onDropsChanged?.();
    const building = this.walker?.inside;
    if (building?.buildingId !== id) return;
    const cache = building.pieces?.[0].furnishing;
    if (floor === null) cache?.clear();
    else cache?.delete(floor);
    if (this.room && (floor === null || floor === this.level)) this.room.stale = true;
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
    room.lightMap = lightMap(box, windows, walls, hour);
    gl.setLightMap(room.lightMap);
  }

  // Whether the person is standing in the dark indoors, for the soundtrack. limits: below and above, from musicConfig.js.
  inDarkRoom(limits) {
    const map = this.walker.inside && this.room?.lightMap;
    this.dark = !!map && darkHere({ lightsOn: this.roomLightsOn(), win: lightAt(map, this.walker.x, this.walker.y), wasDark: this.dark }, limits);
    return this.dark;
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
    this.onSound?.('plugIn');
    if (this.charging) {
      this.charging = false;
      return say('unplugged');
    }
    if (!this.outletHere().works) return say('outletDead');
    this.charging = true;
    return say('charging');
  }

  // Whether something is plugged in, which walking out of reach ends.
  chargingNow() {
    if (this.charging && !this.outletHere()) {
      this.charging = false;
      return false;
    }
    return !!this.charging;
  }

  // Feet on the ground, leaving it and coming back to it.
  soundOfMoving(phase, rise) {
    const { walker } = this;
    if (rise <= 0 && walker.rise > 0) this.onSound?.('jump');
    else if (rise !== 0 && walker.rise === 0) this.onSound?.('land');
    else if (walker.rise === 0 && walker.speed > MOVING && footfall(phase, walker.phase)) this.onSound?.(stepSound(walker.running, !!walker.inside));
  }

  // What the person is doing, for how fast they tire.
  activity() {
    if (this.pose) return 'sitting';
    const { frame } = this.posture();
    return frame === 0 ? 'still' : frame <= 8 ? 'walking' : 'running';
  }

  useLightSwitch() {
    const building = this.walker.inside, pieces = building.pieces, footprint = pieces.reduce((sum, p) => sum + (p.maxX - p.minX) * (p.maxY - p.minY), 0);
    const needsKey = switchNeedsKey(building.plan, footprint, building.buildingId), said = useSwitch(building.plan, this.level, needsKey, this.hasKey?.());
    this.onSound?.(needsKey && !building.plan.switchesOn ? 'locked' : 'click');
    this.saved.saveIndex();
    return said;
  }

  // Which light is being carried: 'flash', 'phone', or null. Asking for the one that's on turns it off.
  toggleLight(kind) {
    this.light = this.light === kind ? null : kind;
    return this.light;
  }

  rebuildAll() {
    shared = null;
    otherMeshes.clear();
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
        this.onSound?.('beep');
        return true;
      }
      if (near === 'stairs') {
        const up = this.level < plan.floors && !down;
        this.onSound?.('stairs');
        if (up) this.level++;
        else if (this.level > GROUND_FLOOR) this.level--;
        return true;
      }
      if (this.level > GROUND_FLOOR) return true; // the only way down is the way the hint says
      return this.goOutside();
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
      this.onSound?.('door');
      this.entering = true;
      stepClearOfThings(this.walker, this.world);
    }
    return entered;
  }

  distanceToCar() {
    return distanceToCar(this.walker, this.world.carWalls);
  }

  canGetIn() {
    return !this.walker.inside && distanceToCar(this.walker, this.world.carWalls) <= GET_IN_REACH;
  }

  // The short line on screen: where you are, and the way back to the car, as past the view it can't be seen.
  hint() {
    if (this.walker.inside) {
      const { plan } = this.walker.inside;
      if (!plan) return 'Inside · press L to go back out';
      if (this.picking) return `Elevator · floor ${this.picking.floor} of ${plan.floors} · click a floor, or type it · L goes`;
      const near = this.coreHere();
      if (this.pose) return 'Press F or walk to get up';
      const offered = this.fHint(), also = offered ? ` · ${offered}` : '';
      if (near === 'lift') return `Press L for the elevator${also}`;
      if (near === 'stairs') {
        if (this.level >= plan.floors) return `Press L to go downstairs${also}`;
        return (this.level > GROUND_FLOOR ? 'L upstairs, Shift+L downstairs' : 'Press L to go upstairs') + also;
      }
      if (offered) return `${this.charging ? 'Charging · ' : ''}${offered}`;
      return this.level > GROUND_FLOOR ? 'Find the stairs to go down' : 'Press L to go back out';
    }
    if (this.canGetIn()) return `Press L to get in · ${this.fHint()}`;
    const near = buildingWithin(this.walker, this.world), outside = this.fHint();
    if (!near && outside) return outside;
    if (near) return near.building.plan && isLocked(near.building.plan) ? `${typeName(near.building.plan) || 'This building'} · locked` : this.waiting ? 'Checking this building…' : 'Press L to go inside';
    const way = this.carWay();
    return way ? `Car ${way.metres} m ${way.direction}` : '';
  }

  // Where this person is in the building they're in, for others on the same floor, or nothing outdoors.
  frameOfBuilding() {
    const building = this.walker.inside, axis = this.room?.furnishing?.record?.axis;
    if (!building?.pieces || axis === undefined) return {};
    return buildingFrame(building.pieces, axis).toFrame(this.walker.x, this.walker.y);
  }

  localOf(lat, lng) {
    return toLocal(this.origin, lat, lng);
  }

  // The nearest car within reach, or null.
  carHere() {
    if (this.walker.inside) return null;
    let best = null, bestAway = GET_IN_REACH;
    for (const car of this.cars) {
      const away = distanceToCar(this.walker, carWalls(car.heading, car.halfWidth, car.halfLength, car.x, car.y));
      if (away <= bestAway) {
        best = car;
        bestAway = away;
      }
    }
    return best;
  }

  // The way to the nearest car, or null with none about.
  carWay() {
    const nearest = this.cars.reduce((best, car) => (!best || Math.hypot(car.x - this.walker.x, car.y - this.walker.y) < Math.hypot(best.x - this.walker.x, best.y - this.walker.y) ? car : best), null);
    return nearest ? wayToCar(this.walker, nearest) : null;
  }

  label() {
    return this.walker.inside ? 'INSIDE' : 'ON FOOT';
  }

  // The building and floor, above the health panel. Empty outdoors.
  placeLabel() {
    const plan = this.walker.inside?.plan;
    return plan ? planLabel(plan, this.level) : '';
  }

  stats() {
    return { chunks: this.room ? 1 : 0, triangles: this.room ? this.room.mesh.count / 3 : 0 };
  }

  // The context and the meshes every walk shares stay, for the next time.
  stop() {
    this.alive = false;
    clearRoomTags();
    gl.free(this.room?.mesh);
    gl.clearAway();
    gl.onRestored = null;
  }
}
