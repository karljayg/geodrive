// Walking: the person, and what they can bump into, around the parked car. Outdoors the driving map is what you see, and main.js
// moves its camera and the person's model from here. Only a room is drawn here, because the map has no insides.
// The data, the person and the meshes are in footData, footWalker and footScene.
import { BuildingStore, dice, floorHeight, hashText, identify, isLocked, planLabel, typeName } from './buildings.js';
import { BODY_SHAPES } from './carModel.js';
import { tintAt } from './daylight.js';
import { FootGl, bearing, lookAt, multiply, perspective, translate } from './footGl.js';
import { Place, fromLocal, parseTile } from './footData.js';
import { personFloats } from './footPerson.js';
import { roomMesh } from './footScene.js';
import { FLOOR_VERSION, FURNISHED, coreNear, coreOf, frameOf as buildingFrame, layoutFloor, plainFloor, solidsOf } from './furnish.js';
import { parseFurniture } from './furniture.js';
import { buildingWithin, carWalls, distanceToCar, enterBuilding, GET_IN_REACH, leaveBuilding, newWalker, frameOf, placeCamera, spawnSpot, stepClearOfThings, stepWalker, wayToCar } from './footWalker.js';
import { Terrain } from './terrain.js';
import { vectorTileAt } from './vector.js';

const TILE_REACH = 200;      // m around the person that buildings and water must be known
const TERRAIN_ZOOM = 15;     // about 5 m a sample at these latitudes; the drive's zoom 12 is too coarse to walk on
const LOOK_EVERY = 1000;     // ms between checking which tiles are wanted
const RETRY_AFTER = 15000;   // ms before a tile that failed is tried again
const ROOM_BACKDROP = [0.05, 0.06, 0.08];
const NEAR = 2, FAR = 400;   // m from the camera
const INDOOR_RANGE = 0.45;   // of the camera's distance outdoors, as furniture is small from there
export const PERSON_SIZE = 1.1; // times real size, which is hard to follow from the driving camera

let gl = null, shared = null; // one context for the visit, and the meshes that never change
let saved = null;             // the buildings this browser has been in
let furniture = null, furnitureLoading = false, furnitureFailed = -Infinity; // the models, once fetched
const GROUND_FLOOR = 1;
const PICK_REPEAT = 0.16;    // s between floors while W or S is held in a lift
const PICK_FAST = 10;        // floors a press moves with Shift held
const TYPE_WINDOW = 1500;    // ms in which a second digit makes a two-figure floor

// The button in Settings. Buildings already identified on this walk stay as they are until the next one.
export function forgetBuildings() {
  (saved ||= new BuildingStore()).forget();
}
const terrain = new Terrain(undefined, TERRAIN_ZOOM);

function personMesh(frame) {
  shared ||= [];
  return shared[frame] ||= gl.mesh(personFloats(frame));
}

export class Foot {
  // tiles: the RoadTiles that fetches the same map tiles for driving. view: the camera to match.
  constructor({ canvas, origin, heading, profile, scale, tiles, view }) {
    if (!gl) gl = new FootGl(canvas);
    gl.onRestored = () => this.rebuildAll();
    this.view = view;
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

  // Works out what the building being entered is, once every tile holding a piece of it is here.
  syncPlan() {
    const building = this.walker.inside;
    if (!building || building.plan) return;
    const { missing } = this.place.wholeOf(building);
    if (missing.length) {
      for (const key of missing) this.loadTile(...key.split('_').map(Number));
      return;
    }
    identify(this.place, building, saved ||= new BuildingStore());
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
    let record = furnished ? saved.floor(id, this.level) : null;
    if (record?.v !== FLOOR_VERSION) {
      record = furnished ? layoutFloor(building.pieces, plan, this.level, furniture.models, dice(hashText(`${id}:${this.level}`))) : plainFloor(plan, this.level);
      if (furnished) saved.saveFloor(id, this.level, record);
    }
    const furnishing = { record, furniture };
    cache.set(this.level, furnishing);
    return furnishing;
  }

  // The room is built level with z = 0 and drawn at the floor's height, so ground arriving late doesn't mean building it again.
  syncRoom() {
    const building = this.walker.inside, whole = building ? building.pieces?.[0] ?? building : null;
    const furnishing = building ? this.furnishingOf(building) : null;
    if (this.room?.whole === whole && this.room?.furnishing === furnishing && this.room?.level === this.level) {
      if (this.room) this.room.floor = this.world.floor(building);
      return;
    }
    gl.free(this.room?.mesh);
    if (this.room && !building) gl.clearAway();
    this.room = building ? { whole, furnishing, level: this.level, floor: this.world.floor(building), mesh: gl.mesh(roomMesh(this.place, building, 0, furnishing)) } : null;
    this.world.inner = furnishing ? solidsOf(furnishing.record, buildingFrame(building.pieces, furnishing.record.axis), furnishing.furniture.models) : null;
    stepClearOfThings(this.walker, this.world);
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
    stepWalker(this.walker, this.picking ? this.pickFloor(dt, input) : input, dt, this.world);
    this.syncPlan();
    this.syncRoom();
    if (this.room) this.renderRoom(hour);
  }

  renderRoom(hour) {
    const view = { ...this.view, range: this.view.range * INDOOR_RANGE };
    const aspect = gl.fit(), { eye, target } = placeCamera(this.walker, view);
    const tint = tintAt(hour).map((v) => 0.2 + 0.8 * (v / 255));
    gl.begin({
      viewProj: multiply(perspective(this.view.fov, aspect, NEAR, FAR), lookAt(eye, target)),
      eye, tint, sky: ROOM_BACKDROP, fogFrom: FAR, fogTo: FAR * 2,
    });
    gl.draw(this.room.mesh, translate(0, 0, this.room.floor));
    const w = this.walker, n = PERSON_SIZE;
    gl.draw(personMesh(frameOf(w)), multiply(multiply(translate(w.x, w.y, w.z + w.height), bearing(w.facing)), [n, 0, 0, 0, 0, n, 0, 0, 0, 0, n, 0, 0, 0, 0, 1]));
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
      if (left) this.world.inner = null;
      return left;
    }
    const near = buildingWithin(this.walker, this.world);
    if (near) {
      const plan = identify(this.place, near.building, saved ||= new BuildingStore());
      if (!plan) {
        for (const key of this.place.wholeOf(near.building).missing) this.loadTile(...key.split('_').map(Number));
        return { waiting: true };
      }
      if (isLocked(plan)) return { locked: typeName(plan) };
    }
    const entered = enterBuilding(this.walker, this.world);
    if (entered) stepClearOfThings(this.walker, this.world);
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
      if (near === 'lift') return `${here} · press L for the lift`;
      if (near === 'stairs') {
        if (this.level >= plan.floors) return `${here} · press L to go downstairs`;
        return this.level > GROUND_FLOOR ? `${here} · L upstairs, Shift+L downstairs` : `${here} · press L to go upstairs`;
      }
      return this.level > GROUND_FLOOR ? `${here} · find the stairs to go down` : `${here} · press L to go back out`;
    }
    if (this.canGetIn()) return 'Press L to get in';
    const near = buildingWithin(this.walker, this.world);
    if (near) return near.building.plan && isLocked(near.building.plan) ? `${typeName(near.building.plan)} · locked` : 'Press L to go inside';
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
