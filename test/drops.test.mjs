import test from 'node:test';
import assert from 'node:assert/strict';
import { Drops, PARCEL, parcelParts, thingParts } from '../public/js/drops.js';
import { modelNamed } from '../public/js/footActions.js';
import { roomMesh } from '../public/js/footScene.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('a drop stays where it was left, across a reload, and can be taken back', () => {
  const storage = memory(), drops = new Drops(storage);
  const outside = drops.add({ name: 'Microwave', lat: 39, lng: -77, facing: 0 });
  const inside = drops.add({ name: 'Milk', buildingId: 'b1', floor: 2, axis: 0, u: 1, v: 2, facing: 0 });
  const again = new Drops(storage);
  assert.equal(again.list.length, 2);
  assert.deepEqual(again.inBuilding('b1', 2).map((d) => d.name), ['Milk']);
  assert.equal(again.inBuilding('b1', 1).length, 0, 'only on its floor');
  assert.equal(again.inBuilding('other', 2).length, 0);
  assert.equal(again.remove(inside), true);
  assert.equal(again.remove(inside), false);
  assert.notEqual(again.add({ name: 'X', lat: 39, lng: -77, facing: 0 }), outside, 'ids are not reused');
});

test('outdoor drops are found by distance, nearest first, without those in buildings', () => {
  const drops = new Drops(memory()), metre = 1 / 111320;
  drops.add({ name: 'Far', lat: 39 + 500 * metre, lng: -77, facing: 0 });
  drops.add({ name: 'Near', lat: 39 + 10 * metre, lng: -77, facing: 0 });
  drops.add({ name: 'Nearer', lat: 39 + 2 * metre, lng: -77, facing: 0 });
  drops.add({ name: 'Indoors', buildingId: 'b', floor: 1, axis: 0, u: 0, v: 0, facing: 0 });
  assert.deepEqual(drops.around(39, -77, 100, 10).map((d) => d.name), ['Nearer', 'Near']);
  assert.deepEqual(drops.around(39, -77, 100, 1).map((d) => d.name), ['Nearer']);
});

test('broken saved data loses only the saving', () => {
  const storage = memory();
  storage.setItem('geodrive_drops_v1', '{not json');
  assert.equal(new Drops(storage).list.length, 0);
});

test('things picked up in rooms know their models, and found things do not', () => {
  assert.ok(modelNamed('Microwave'));
  assert.ok(modelNamed('Toaster'));
  assert.equal(modelNamed('Milk'), null);
});

test('a parcel for the map stands on the ground with its top facing up', () => {
  const [body] = parcelParts();
  const zs = body.pos.filter((_, i) => i % 3 === 2);
  assert.equal(Math.min(...zs), 0);
  assert.equal(Math.max(...zs), PARCEL.height);
  assert.equal(body.pos.length, body.nor.length);
  // Each triangle's winding agrees with its stated normal, or it would be see-through from outside.
  for (let i = 0; i < body.pos.length; i += 9) {
    const p = body.pos.slice(i, i + 9), n = body.nor.slice(i, i + 3);
    const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2], vx = p[6] - p[0], vy = p[7] - p[1], vz = p[8] - p[2];
    const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    assert.ok(dot > 0, `triangle ${i / 9}`);
  }
});

test('a furniture model for the map keeps its size and winding', () => {
  const model = { parts: [{ mat: 'metal', points: [0, 0, 0, 1000, 0, 0, 0, 1000, 0] }] };
  const [part] = thingParts(model, () => [1, 0, 0]);
  assert.deepEqual(part.pos, [0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.deepEqual(part.nor.slice(0, 3), [0, 0, 1]);
  assert.deepEqual(part.colour, [1, 0, 0]);
});

test('a room draws what was left on its floor, at the place it was left', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const building = { rings: [{ pts, seam: pts.map(() => false) }], minX: 0, maxX: 10, minY: 0, maxY: 10 };
  const place = { walls: () => [] };
  const empty = roomMesh(place, building, 0, null), withDrop = roomMesh(place, building, 0, null, [{ name: 'Milk', axis: 0, u: 2, v: 3, facing: 0 }]);
  assert.ok(withDrop.length > empty.length);
  const added = withDrop.slice(empty.length), xs = [], ys = [];
  for (let i = 0; i < added.length; i += 9) { xs.push(added[i]); ys.push(added[i + 1]); }
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 7) < 0.01, 'at 2 from the middle, along the frame');
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 8) < 0.01);
});
