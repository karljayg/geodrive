// Walking: the person, and what they can bump into, around the parked car. Outdoors the driving map is what you see, and main.js
// moves its camera and the person's model from here. Only a room is drawn here, because the map has no insides.
// The data, the person and the meshes are in footData, footWalker and footScene.
import { BODY_SHAPES } from './carModel.js';
import { tintAt } from './daylight.js';
import { FootGl, bearing, lookAt, multiply, perspective, translate } from './footGl.js';
import { Place, fromLocal, parseTile } from './footData.js';
import { personFloats } from './footPerson.js';
import { roomMesh } from './footScene.js';
import { buildingWithin, carWalls, distanceToCar, enterBuilding, GET_IN_REACH, leaveBuilding, newWalker, frameOf, placeCamera, spawnSpot, stepWalker, wayToCar } from './footWalker.js';
import { Terrain } from './terrain.js';
import { vectorTileAt } from './vector.js';

const TILE_REACH = 200;      // m around the person that buildings and water must be known
const TERRAIN_ZOOM = 15;     // about 5 m a sample at these latitudes; the drive's zoom 12 is too coarse to walk on
const LOOK_EVERY = 1000;     // ms between checking which tiles are wanted
const RETRY_AFTER = 15000;   // ms before a tile that failed is tried again
const ROOM_BACKDROP = [0.05, 0.06, 0.08];
const NEAR = 2, FAR = 400;   // m from the camera
export const PERSON_SIZE = 1.1; // times real size, which is hard to follow from the driving camera

let gl = null, shared = null; // one context for the visit, and the meshes that never change
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
    this.world = { place: this.place, height: (x, y) => this.height(x, y), floor: (b) => this.floorOf(b) };
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

  // A building's floor is level with the ground at one corner.
  floorOf(building) {
    const known = this.floors.get(building);
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
      const parsed = bytes ? parseTile(bytes, x, y, this.origin) : { buildings: [], lands: [], waters: [], roads: [] };
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

  syncRoom() {
    const building = this.walker.inside, floor = building ? this.floorOf(building) : null;
    if (this.room?.building === building && this.room?.floor === floor) return;
    gl.free(this.room?.mesh);
    if (this.room && !building) gl.clearAway();
    this.room = building ? { building, floor, mesh: gl.mesh(roomMesh(this.place, building, floor)) } : null;
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
    stepWalker(this.walker, input, dt, this.world);
    this.syncRoom();
    if (this.room) this.renderRoom(hour);
  }

  renderRoom(hour) {
    const aspect = gl.fit(), { eye, target } = placeCamera(this.walker, this.view);
    const tint = tintAt(hour).map((v) => 0.2 + 0.8 * (v / 255));
    gl.begin({
      viewProj: multiply(perspective(this.view.fov, aspect, NEAR, FAR), lookAt(eye, target)),
      eye, tint, sky: ROOM_BACKDROP, fogFrom: FAR, fogTo: FAR * 2,
    });
    gl.draw(this.room.mesh);
    const w = this.walker, n = PERSON_SIZE;
    gl.draw(personMesh(frameOf(w)), multiply(multiply(translate(w.x, w.y, w.z), bearing(w.facing)), [n, 0, 0, 0, 0, n, 0, 0, 0, 0, n, 0, 0, 0, 0, 1]));
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
    return { facing: (((this.walker.facing * 180) / Math.PI) % 360 + 360) % 360, frame: frameOf(this.walker), z: this.walker.z, inside: !!this.walker.inside };
  }

  // L at a building: in if beside one, out if inside. False if there is nothing to go through here.
  pressBuilding() {
    return this.walker.inside ? leaveBuilding(this.walker, this.world) : enterBuilding(this.walker, this.world);
  }

  canGetIn() {
    return !this.walker.inside && distanceToCar(this.walker, this.carWalls) <= GET_IN_REACH;
  }

  // The short line on screen: where you are, and the way back to the car, as past the view it can't be seen.
  hint() {
    if (this.walker.inside) return 'Inside · press L to go back out';
    if (this.canGetIn()) return 'Press L to get in';
    if (buildingWithin(this.walker, this.world)) return 'Press L to go inside';
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
