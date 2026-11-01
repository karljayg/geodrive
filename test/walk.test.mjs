import test from 'node:test';
import assert from 'node:assert/strict';
import { readLayer } from '../public/js/vector.js';
import {
  COLOR, CHUNK, absorb, buildingHeight, coverAt, mergeTile, newArea, placeDoor, placesFromTile, treesForChunk, triangulate, wallSegments,
} from '../public/js/place.js';
import {
  VIEW_RADIUS, cameraBack, canLeaveCar, carRing, chunkChanges, chunksAround, groundView, indoorDistance, nearCar, newWalker, poseOf, stepWalker,
} from '../public/js/walker.js';

const square = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const flat = () => 0;

test('building height prefers the tile, then storeys, then the class', () => {
  assert.equal(buildingHeight({ render_height: 15.5 }), 15.5);
  assert.equal(buildingHeight({ levels: 3 }), 9);
  assert.equal(buildingHeight({ class: 'commercial' }), 12);
  assert.equal(buildingHeight({ class: 'house' }), 6);
  assert.equal(buildingHeight({ class: 'residential' }), 6);
  assert.equal(buildingHeight({}), 8);
});

test('a door faces the road, and otherwise the longest wall', () => {
  const withRoad = newArea();
  absorb(withRoad, 'a', {
    buildings: [{ cls: 'house', height: 6, lift: 0, ring: square(-5, -5, 5, 5) }],
    roads: [{ line: [{ x: -30, z: -20 }, { x: 30, z: -20 }], width: 8 }],
  });
  const door = withRoad.buildings[0].door;
  assert.ok(Math.abs(door.mz + 5) < 0.01, 'on the south wall');
  assert.ok(Math.abs(door.mx) < 0.01);
  assert.ok(door.nz < -0.9, 'opens outward, toward the road');
  assert.deepEqual(withRoad.buildings[0].objects, []);

  const plain = newArea();
  absorb(plain, 'b', { buildings: [{ cls: 'house', height: 6, lift: 0, ring: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 10 }, { x: 0, z: 10 }] }] });
  assert.ok(Math.abs(plain.buildings[0].door.mz) < 0.01, 'longest wall');
  assert.ok(plain.buildings[0].door.half <= 0.7);
  assert.equal(absorb(plain, 'b', {}), false, 'a tile is kept once');
});

test('trees stay inside the wood, off the road and out of buildings, and do not move between calls', () => {
  const area = newArea();
  absorb(area, 'wood', {
    lands: [{ cls: 'wood', color: COLOR.wood, rank: 3, trees: true, ring: square(0, 0, 80, 80) }],
    buildings: [{ cls: 'house', height: 6, lift: 0, ring: square(8, 8, 20, 20) }],
    roads: [{ line: [{ x: 0, z: 40 }, { x: 80, z: 40 }], width: 8 }],
    waters: [{ ring: square(60, 60, 78, 78) }],
  });
  const trees = treesForChunk('0_0', area);
  assert.ok(trees.length > 0 && trees.length <= 40);
  assert.deepEqual(trees, treesForChunk('0_0', area));
  for (const tree of trees) {
    assert.ok(tree.x > 0 && tree.x < 80 && tree.z > 0 && tree.z < 80);
    assert.ok(!(tree.x > 8 && tree.x < 20 && tree.z > 8 && tree.z < 20), 'not inside the house');
    assert.ok(!(tree.x > 60 && tree.x < 78 && tree.z > 60 && tree.z < 78), 'not in the water');
    assert.ok(Math.abs(tree.z - 40) > 5, 'not on the road');
  }
  assert.equal(coverAt(area, 4, 4), COLOR.wood);
  assert.equal(coverAt(area, 10, 40), COLOR.road);
  assert.equal(coverAt(area, 70, 70), COLOR.water);
  assert.equal(coverAt(area, -10, -10), COLOR.ground);
});

test('a roof polygon triangulates to the same area', () => {
  const areaOf = (ring) => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) a += ring[i].x * ring[(i + 1) % ring.length].z - ring[(i + 1) % ring.length].x * ring[i].z;
    return Math.abs(a) / 2;
  };
  const covered = (ring) => {
    const { verts, tris } = triangulate(ring);
    let a = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const p = verts[tris[i]], q = verts[tris[i + 1]], r = verts[tris[i + 2]];
      a += Math.abs((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)) / 2;
    }
    return a;
  };
  const box = square(0, 0, 4, 2);
  assert.equal(covered(box), areaOf(box));
  const ell = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 1, z: 1 }, { x: 1, z: 2 }, { x: 0, z: 2 }];
  assert.ok(Math.abs(covered(ell) - 3) < 1e-6);
});

test('the walk draws as far as the closest chase camera, and streams a few chunks at a time', () => {
  assert.equal(VIEW_RADIUS, groundView(130, 62, 35));
  assert.ok(VIEW_RADIUS > 180 && VIEW_RADIUS < 250);
  assert.ok(chunksAround(0, 0).includes('0_0'));
  assert.ok(!chunksAround(0, 0).includes('10_10'));
  assert.ok(chunksAround(-10, -10).includes('-1_-1'));
  const loaded = new Set(['0_0', '1_0']);
  assert.deepEqual(chunkChanges(loaded, ['1_0', '2_0', '3_0'], 1), { enter: ['2_0'], leave: ['0_0'] });
  assert.equal(CHUNK, 80);
});

test('the person spawns beside the car, walks with the camera, and stands still between steps', () => {
  assert.equal(canLeaveCar(0), true);
  assert.equal(canLeaveCar(5), false);
  const walker = newWalker(0);
  assert.ok(Math.abs(walker.x - 2.2) < 0.01 && Math.abs(walker.z) < 0.01);
  assert.equal(nearCar(walker), true);
  assert.equal(poseOf(walker).swing, 0);
  stepWalker(walker, { forward: 1 }, 1, { heightAt: flat, buildings: [], waters: [], trees: [] });
  assert.ok(walker.z > 0.05 && Math.abs(walker.x - 2.2) < 0.05, 'yaw 0 walks north');
  assert.equal(poseOf(walker).swing !== 0, true);
  const east = newWalker(0);
  east.yaw = Math.PI / 2;
  stepWalker(east, { forward: 1, run: true }, 1, { heightAt: flat, buildings: [], waters: [], trees: [] });
  assert.ok(east.x > east.z, 'facing east, forward goes east');
  const back = cameraBack(0, 0, 4);
  assert.ok(back.z < 0 && Math.abs(back.x) < 1e-6, 'the camera sits behind a north-facing view');
});

test('walls, water, trees, the car and a steep rise stop the person; a door does not', () => {
  const ring = square(5, -5, 15, 5);
  const door = { edge: 3, ax: 5, az: 0.7, bx: 5, bz: -0.7, nx: -1, nz: 0, mx: 5, mz: 0, half: 0.7 };
  assert.ok(wallSegments(ring, door).length >= 4);
  const building = { id: 'house', ring, door, lift: 0, floorY: 0, minX: 5, maxX: 15, minZ: -5, maxZ: 5 };
  const world = { heightAt: flat, buildings: [building], waters: [], trees: [], carRing: null };
  const blocked = newWalker(0);
  blocked.x = 4;
  blocked.z = 3;
  blocked.yaw = Math.PI / 2;
  for (let i = 0; i < 40; i++) stepWalker(blocked, { forward: 1, run: true }, 0.06, world);
  assert.ok(blocked.x < 4.8, 'the wall stops them');
  assert.equal(blocked.inside, null);

  const entering = newWalker(0);
  entering.x = 4.8;
  entering.z = 0;
  entering.yaw = Math.PI / 2;
  stepWalker(entering, { forward: 1, run: true }, 0.06, world);
  assert.equal(entering.inside, 'house');
  assert.ok(entering.x > 5, 'nudged inside');
  assert.ok(entering.doorWait > 0);

  const leaving = newWalker(0);
  leaving.x = 5.2;
  leaving.z = 0;
  leaving.inside = 'house';
  leaving.doorWait = 0;
  leaving.yaw = -Math.PI / 2;
  stepWalker(leaving, { forward: 1, run: true }, 0.06, world);
  assert.equal(leaving.inside, null);
  assert.ok(leaving.x < 5);

  const wet = newWalker(0);
  wet.z = 1;
  const lake = { ring: square(-10, 2, 10, 20), holes: [], minX: -10, maxX: 10, minZ: 2, maxZ: 20 };
  for (let i = 0; i < 30; i++) stepWalker(wet, { forward: 1, run: true }, 0.06, { heightAt: flat, buildings: [], waters: [lake], trees: [] });
  assert.ok(wet.z < 2.2);

  const grove = newWalker(0);
  for (let i = 0; i < 40; i++) stepWalker(grove, { forward: 1, run: true }, 0.06, { heightAt: flat, buildings: [], waters: [], trees: [{ x: 2.2, z: 3, r: 0.28 }] });
  assert.ok(grove.z < 3);

  const parked = newWalker(90);
  parked.x = 0;
  parked.z = 3;
  parked.yaw = Math.PI;
  const ringCar = carRing(0, { w: 1, l: 2 });
  for (let i = 0; i < 40; i++) stepWalker(parked, { forward: 1, run: true }, 0.06, { heightAt: flat, buildings: [], waters: [], trees: [], carRing: ringCar });
  assert.ok(parked.z > 2);

  const hill = newWalker(0);
  hill.x = 0;
  hill.z = 0;
  stepWalker(hill, { forward: 1, run: true }, 0.06, { heightAt: (x, z) => (z > 0.1 ? 5 : 0), buildings: [], waters: [], trees: [] });
  assert.equal(hill.z, 0);
  const curb = newWalker(0);
  stepWalker(curb, { forward: 1 }, 0.06, { heightAt: () => 0.2, buildings: [], waters: [], trees: [] });
  assert.equal(curb.y, 0.2);
  assert.equal(nearCar({ x: 0, z: 0, inside: 'house' }), false);
});

test('indoors the camera stays in the room', () => {
  const ring = square(-5, -5, 5, 5);
  assert.ok(indoorDistance(ring, 0, 0, 0, 2.6) > 2);
  const pulled = indoorDistance(ring, 0, 4, Math.PI, 2.6);
  assert.ok(pulled < 2);
});

// A tiny vector tile: one building with a float height, one hidden, a house, water, wood and a road.
function encodeWalkTile() {
  const varint = (v) => { const o = []; let n = v; while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
  const field = (n, bytes) => [...varint((n << 3) | 2), ...varint(bytes.length), ...bytes];
  const num = (n, v) => [...varint(n << 3), ...varint(v)];
  const text = (s) => [...new TextEncoder().encode(s)];
  const zig = (v) => (v < 0 ? -v * 2 - 1 : v * 2);
  const floatValue = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return [...varint((2 << 3) | 5), ...b]; };
  const ring = (pts) => {
    const cmds = [9, zig(pts[0][0]), zig(pts[0][1]), ((pts.length - 1) << 3) | 2];
    for (let i = 1; i < pts.length; i++) cmds.push(zig(pts[i][0] - pts[i - 1][0]), zig(pts[i][1] - pts[i - 1][1]));
    cmds.push(15);
    return cmds.flatMap(varint);
  };
  const line = (x0, y0, x1, y1) => [9, zig(x0), zig(y0), 10, zig(x1 - x0), zig(y1 - y0)].flatMap(varint);
  const keys = ['class', 'render_height', 'hide_3d'];
  const values = [field(1, text('commercial')), floatValue(15.5), num(7, 1), field(1, text('house')), field(1, text('wood')), field(1, text('primary'))];
  const tags = (pairs) => field(2, pairs.flatMap(varint));
  const feature = (type, tagPairs, geom) => [...num(3, type), ...tags(tagPairs), ...field(4, geom)];
  const box = [[2000, 2000], [2200, 2000], [2200, 2200], [2000, 2200]];
  const layer = (name, features) => [
    ...field(1, text(name)),
    ...features.flatMap((feat) => field(2, feat)),
    ...keys.flatMap((k) => field(3, text(k))),
    ...values.flatMap((v) => field(4, v)),
    ...num(5, 4096),
  ];
  const layers = [
    layer('building', [
      feature(3, [0, 0, 1, 1], ring(box)),
      feature(3, [0, 3, 2, 2], ring([[100, 100], [140, 100], [140, 140], [100, 140]])),
      feature(3, [0, 3], ring([[300, 300], [360, 300], [360, 360], [300, 360]])),
    ]),
    layer('landcover', [feature(3, [0, 4], ring([[10, 10], [400, 10], [400, 400], [10, 400]]))]),
    layer('water', [feature(3, [], ring([[2500, 2500], [2800, 2500], [2800, 2800], [2500, 2800]]))]),
    layer('transportation', [feature(2, [0, 5], line(0, 2048, 4096, 2048))]),
  ];
  return new Uint8Array(layers.flatMap((part) => field(3, part)));
}

test('a vector tile yields buildings, cover, water and a road', () => {
  const bytes = encodeWalkTile();
  assert.equal(readLayer(bytes, 'building').features.length, 3);
  assert.equal(readLayer(bytes, 'building').features[0].tags.render_height, 15.5);
  assert.equal(readLayer(bytes, 'building').features[1].tags.hide_3d, true);
  const geo = placesFromTile(bytes, 0, 0);
  assert.equal(geo.buildings.length, 2, 'the hidden building is dropped');
  assert.equal(geo.buildings[0].height, 15.5);
  assert.equal(geo.buildings[1].height, 6);
  assert.equal(geo.lands.length, 1);
  assert.equal(geo.lands[0].trees, true);
  assert.equal(geo.waters.length, 1);
  assert.equal(geo.roads.length, 1);
  assert.equal(geo.roads[0].width, 10);
  const area = newArea();
  assert.equal(mergeTile(area, bytes, 0, 0, { lat: 0, lng: 0 }), true);
  assert.equal(mergeTile(area, bytes, 0, 0, { lat: 0, lng: 0 }), false);
  assert.equal(area.buildings.length, 2);
  assert.ok(area.buildings[0].door);
  assert.equal(placeDoor(square(0, 0, 1, 1), []), null, 'a wall shorter than a door gets none');
});
