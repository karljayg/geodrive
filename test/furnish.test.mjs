import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BuildingStore, dice, hashText } from '../public/js/buildings.js';
import { Place, inRings } from '../public/js/footData.js';
import { Mesh, clipToRect, lowWall, roomMesh } from '../public/js/footScene.js';
import { FLOOR_VERSION, upgradeFloor, axisOf, colourFor, coreNear, coreOf, frameOf, layoutFloor, plainFloor, solidsOf, worldBearing } from '../public/js/furnish.js';
import { ITEMS, bake, isSolid, parseFurniture, triangleCount, usedModels } from '../public/js/furniture.js';
import { JUMP_HEIGHT, frameOf as walkerFrame, newWalker, stepClearOfThings, stepWalker } from '../public/js/footWalker.js';

const bytes = readFileSync(new URL('../public/furniture.bin', import.meta.url));
const { models, colours } = parseFurniture(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
const ORIGIN = { lat: 38.9, lng: -77 };

const boundsOf = (pts) => ({ minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) });
const piece = (pts, holes = []) => {
  const rings = [pts, ...holes].map((ring) => ({ pts: ring, seam: ring.map(() => false) }));
  return { rings, height: 6, known: false, ground: true, ...boundsOf(pts) };
};
const rectangle = (w, d) => piece([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }]);
const turned = (w, d, degrees) => {
  const a = (degrees * Math.PI) / 180, at = (x, y) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
  return piece([at(0, 0), at(w, 0), at(w, d), at(0, d)]);
};
const lShape = piece([{ x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 16 }, { x: 0, y: 16 }]);
const SHAPES = { small: rectangle(6, 5), house: rectangle(13, 9), big: rectangle(20, 14), turned: turned(14, 10, 33), lShape };
const lay = (p, seed = 1, plan = { floors: 1, style: 'modern' }, floor = 1) => layoutFloor([p], { type: 'home', ...plan }, floor, models, dice(seed));

const reachableArea = (p, walls) => {
  // Walks a fine grid by real geometry: what a person of this width can reach from the largest clear area.
  // The points sit off any round number, so none lands exactly on a wall.
  const step = 0.25, off = 0.0917, cells = new Map(), key = (i, j) => `${i},${j}`, rings = p.rings.map((r) => r.pts), segs = walls;
  const hitsWall = (ax, ay, bx, by) => segs.some((w) => {
    const d = (w.bx - w.ax) * (by - ay) - (w.by - w.ay) * (bx - ax);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((ax - w.ax) * (by - ay) - (ay - w.ay) * (bx - ax)) / d, u = ((ax - w.ax) * (w.by - w.ay) - (ay - w.ay) * (w.bx - w.ax)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  });
  for (let i = Math.floor(p.minX / step); i <= Math.ceil(p.maxX / step); i++) for (let j = Math.floor(p.minY / step); j <= Math.ceil(p.maxY / step); j++) {
    if (inRings(rings, i * step + off, j * step + off)) cells.set(key(i, j), [i, j]);
  }
  const seen = new Set(), first = [...cells.keys()][0], stack = [first];
  seen.add(first);
  while (stack.length) {
    const [i, j] = cells.get(stack.pop());
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(i + di, j + dj);
      if (!cells.has(k) || seen.has(k) || hitsWall(i * step + off, j * step + off, (i + di) * step + off, (j + dj) * step + off)) continue;
      seen.add(k);
      stack.push(k);
    }
  }
  return seen.size / cells.size;
};

test('the furniture file holds every model the catalogue names, at a sensible size, standing on the floor', () => {
  for (const name of usedModels()) assert.ok(models[name], name);
  assert.ok(models.chair.h > 0.8 && models.chair.h < 1.1, `a chair is ${models.chair.h} m tall`);
  assert.ok(models.bedDouble.d > 1.9 && models.bedDouble.d < 2.4, `a bed is ${models.bedDouble.d} m long`);
  assert.ok(models.kitchenFridge.h > 1.6 && models.kitchenFridge.h < 2.1);
  assert.ok(models.bathtub.w < 2, 'not the 2.4 m bath twice the kit would give');
  for (const [name, model] of Object.entries(models)) assert.ok(triangleCount(model) > 0, name);
});

test('faces point outwards and models are not mirrored: a chair\'s back is behind it, and its seat faces +y', () => {
  // The back is where the top of a chair is, and the front of a model is +y.
  const { parts } = models.chair, top = [];
  for (const { points } of parts) for (let i = 0; i < points.length; i += 3) if (points[i + 2] > 800) top.push(points[i + 1]);
  assert.ok(top.reduce((a, b) => a + b, 0) / top.length < -100, 'the top of the chair is at its back, towards -y');
  // A closed model has positive volume only if its triangles wind the right way.
  for (const name of ['kitchenCabinet', 'kitchenFridge', 'bedDouble', 'loungeSofa', 'desk']) {
    let volume = 0;
    for (const { points: p } of models[name].parts) {
      for (let i = 0; i < p.length; i += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.slice(i, i + 9);
        volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
      }
    }
    assert.ok(volume > 0, name);
  }
});

test('turning a model is a compass bearing: at 90 degrees its front is east', () => {
  const mesh = new Mesh();
  bake(mesh, models.chair, 10, 20, 0, Math.PI / 2, () => [1, 1, 1]);
  const xs = [], at = mesh.data;
  for (let i = 0; i < at.length; i += 9) if (at[i + 2] > 0.8) xs.push(at[i]);
  assert.ok(xs.reduce((a, b) => a + b, 0) / xs.length < 10 - 0.1, 'facing east, its back is to the west');
});

test('a colour comes from the room for wood and fabric, and the kit for the rest', () => {
  const scheme = { wood: '808080', fabric: 'ff0000', accent: '00ff00', floor: '000000' };
  assert.deepEqual(colourFor('carpet', scheme, 1, colours), [1, 0, 0]);
  assert.deepEqual(colourFor('carpetBlue', scheme, 1, colours), [0, 1, 0]);
  assert.ok(colourFor('wood', scheme, 1, colours)[0] > 0.49);
  assert.ok(colourFor('woodDark', scheme, 1, colours)[0] < colourFor('wood', scheme, 1, colours)[0]);
  assert.deepEqual(colourFor('glass', scheme, 1, colours), colours.glass);
});

test('the frame runs along the longest wall, and turns back exactly', () => {
  const p = turned(14, 10, 33), axis = axisOf([p]);
  assert.ok(Math.abs(axis - (33 * Math.PI) / 180) < 1e-4);
  const frame = frameOf([p], axis), { u, v } = frame.toFrame(3, 7), back = frame.toWorld(u, v);
  assert.ok(Math.abs(back.x - 3) < 1e-9 && Math.abs(back.y - 7) < 1e-9);
  // In the frame, a thing facing north (bearing 0, +v) must face along +v in the world too.
  const b = worldBearing(0, axis), inWorld = { x: Math.sin(b), y: Math.cos(b) }, vDir = { x: frame.toWorld(0, 1).x - frame.toWorld(0, 0).x, y: frame.toWorld(0, 1).y - frame.toWorld(0, 0).y };
  assert.ok(Math.abs(inWorld.x - vDir.x) < 1e-6 && Math.abs(inWorld.y - vDir.y) < 1e-6);
});

test('the same building and seed lay out the same, and other seeds differ', () => {
  assert.deepEqual(lay(SHAPES.house, 5), lay(SHAPES.house, 5));
  assert.notDeepEqual(lay(SHAPES.house, 5).items, lay(SHAPES.house, 6).items);
});

test('a layout survives being saved as text, at a sensible size', () => {
  const record = lay(SHAPES.big, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
  assert.ok(JSON.stringify(record).length < 15000, `${JSON.stringify(record).length} characters`);
});

test('every home has the basics, whatever its shape', () => {
  for (const [name, p] of Object.entries(SHAPES)) {
    for (let seed = 0; seed < 25; seed++) {
      const record = lay(p, hashText(`${name}${seed}`)), zones = record.zones.map((z) => z[0]), items = record.items.map((i) => i[0]);
      const open = zones.includes('openLiving');
      assert.ok(zones.includes('living') || open, `${name} ${seed} rooms ${zones}`);
      if (name !== 'small') for (const wanted of open ? ['bathroom'] : ['kitchen', 'bathroom']) assert.ok(zones.includes(wanted), `${name} ${seed} rooms ${zones}`);
      assert.ok(items.includes('sofa') || items.includes('tvStand'), `${name} ${seed}: ${items}`);
      if (zones.includes('bathroom')) assert.ok(items.includes('toilet'), `${name} ${seed}: no toilet in ${items}`);
      if (zones.includes('kitchen')) assert.ok(items.includes('stove') || items.includes('fridge'), `${name} ${seed}: no kitchen in ${items}`);
      if (zones.includes('bedroom')) assert.ok(items.includes('bed'), `${name} ${seed}: no bed in ${items}`);
    }
  }
});

test('each room gets about its share of the floor, whichever end it lands at', () => {
  for (let seed = 0; seed < 60; seed++) {
    const { zones } = lay(SHAPES.big, hashText(`share${seed}`)), areaOf = (name) => zones.filter((z) => z[0] === name).map((z) => (z[3] - z[1]) * (z[4] - z[2]));
    assert.ok(Math.max(...areaOf('living')) > Math.max(...areaOf('bathroom')), `seed ${seed}: living ${areaOf('living')} bathroom ${areaOf('bathroom')}`);
    assert.ok(Math.max(...areaOf('kitchen')) < 45, `seed ${seed}: a kitchen of ${areaOf('kitchen')} m²`);
  }
});

test('a house with an upstairs keeps its beds there', () => {
  const ground = lay(SHAPES.house, 2, { floors: 2, style: 'luxury' }, 1), upper = lay(SHAPES.house, 2, { floors: 2, style: 'luxury' }, 2);
  assert.ok(!ground.zones.some((z) => z[0] === 'bedroom'));
  assert.ok(upper.zones.some((z) => z[0] === 'bedroom'));
  assert.ok(!upper.zones.some((z) => z[0] === 'kitchen'));
});

test('solid things never overlap, stay inside the walls and keep out of doorways, in every shape', () => {
  for (const [name, p] of Object.entries(SHAPES)) {
    for (let seed = 0; seed < 25; seed++) {
      const record = lay(p, hashText(`solid${name}${seed}`)), frame = frameOf([p], record.axis), rings = p.rings.map((r) => r.pts);
      const boxes = record.items.filter(([item]) => isSolid(item)).map(([item, model, u, v, , rot]) => {
        const m = models[model], quarter = Math.round(rot / 90) % 2 === 0;
        return { item, u0: u - (quarter ? m.w : m.d) / 2, u1: u + (quarter ? m.w : m.d) / 2, v0: v - (quarter ? m.d : m.w) / 2, v1: v + (quarter ? m.d : m.w) / 2 };
      });
      boxes.forEach((a, i) => {
        for (const b of boxes.slice(i + 1)) {
          const across = Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0), along = Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0);
          assert.ok(across <= 0.02 || along <= 0.02, `${name} ${seed}: ${a.item} on ${b.item}`);
        }
        for (const [u, v] of [[a.u0, a.v0], [a.u1, a.v0], [a.u1, a.v1], [a.u0, a.v1]]) {
          const { x, y } = frame.toWorld(u, v);
          assert.ok(inRings(rings, x, y), `${name} ${seed}: ${a.item} through the wall`);
        }
      });
    }
  }
});

test('things stand with their backs to a wall and their fronts to the room', () => {
  const record = lay(SHAPES.house, 11);
  const bed = record.items.find(([item]) => item === 'bed') || lay(SHAPES.big, 12).items.find(([item]) => item === 'bed');
  assert.ok(bed, 'a bed');
  const [, model, u, v, , rot] = bed, room = (record.items.includes(bed) ? record : lay(SHAPES.big, 12)).zones[bed[6]];
  const [, u0, v0, u1, v1] = room, m = models[model];
  const gapBehind = { 0: v - m.d / 2 - v0, 180: v1 - (v + m.d / 2), 90: u - m.d / 2 - u0, 270: u1 - (u + m.d / 2) }[Math.round(rot)];
  assert.ok(gapBehind >= -0.01 && gapBehind < 0.7, `${gapBehind} m behind the bed`);
});

test('every room can be reached through doorways, in every shape', () => {
  for (const [name, p] of Object.entries(SHAPES)) {
    for (let seed = 0; seed < 25; seed++) {
      const record = lay(p, hashText(`reach${name}${seed}`)), frame = frameOf([p], record.axis);
      const walls = record.walls.map(([u0, v0, u1, v1]) => {
        const a = frame.toWorld(u0, v0), b = frame.toWorld(u1, v1);
        return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
      });
      assert.ok(reachableArea(p, walls) > 0.99, `${name} ${seed} shuts off part of the floor`);
      if (record.zones.length > 1) assert.ok(walls.length, `${name} ${seed} has no walls`);
    }
  }
});

const worldFor = (p, record) => {
  const place = new Place(ORIGIN);
  place.addTile('t', { buildings: [p], lands: [], waters: [], roads: [] });
  return { place, carWalls: [], height: () => 0, floor: () => 0, inner: solidsOf(record, frameOf([p], record.axis), models) };
};

test('a thing stops you, and a wall does, but not a doorway', () => {
  const p = rectangle(13, 9), record = lay(p, 21), world = worldFor(p, record);
  const sofa = record.items.find(([item]) => item === 'sofa'), frame = frameOf([p], record.axis);
  const { x, y } = frame.toWorld(sofa[2], sofa[3]), start = frame.toWorld(sofa[2], sofa[3]);
  // From in front of the sofa, walk straight at it.
  const b = worldBearing(sofa[5], record.axis), walker = newWalker(start.x + Math.sin(b) * 1.6, start.y + Math.cos(b) * 1.6, b + Math.PI);
  walker.inside = p;
  for (let t = 0; t < 2; t += 1 / 60) stepWalker(walker, { forward: 1 }, 1 / 60, world);
  assert.ok(Math.hypot(walker.x - x, walker.y - y) > models[sofa[1]].d / 2 + 0.2, `got ${Math.hypot(walker.x - x, walker.y - y)} m from the middle of it`);
});

test('arriving where a thing stands moves you beside it', () => {
  const p = rectangle(13, 9), record = lay(p, 21), world = worldFor(p, record), sofa = record.items.find(([item]) => item === 'sofa');
  const { x, y } = frameOf([p], record.axis).toWorld(sofa[2], sofa[3]), walker = newWalker(x, y, 0);
  walker.inside = p;
  assert.equal(stepClearOfThings(walker, world), true);
  assert.equal(stepClearOfThings(walker, world), false, 'and then it is clear');
  assert.ok(world.place.footprintAt(walker.x, walker.y) === p);
});

test('a room mesh holds its furniture, and things no longer in the catalogue are left out', () => {
  const p = rectangle(13, 9), record = lay(p, 8), place = new Place(ORIGIN);
  place.addTile('t', { buildings: [p], lands: [], waters: [], roads: [] });
  const empty = roomMesh(place, p, 0).length, full = roomMesh(place, p, 0, { record, furniture: { models, colours } }).length;
  assert.ok(full > empty * 10);
  const fewer = { ...record, items: record.items.map((i) => ['gone', ...i.slice(1)]) };
  assert.ok(roomMesh(place, p, 0, { record: fewer, furniture: { models, colours } }).length < full);
  assert.ok(full / 9 / 3 < 30000, `${full / 27} triangles`);
});

test('a low wall\'s faces point outwards and it is below the person\'s view', () => {
  const mesh = new Mesh();
  lowWall(mesh, 0, 0, 5, 0, [1, 1, 1]);
  for (let i = 0; i < mesh.data.length; i += 9) {
    const [x, y, z, nx, ny, nz] = mesh.data.slice(i, i + 6);
    assert.ok(z <= 1.5);
    assert.ok(nz >= 0, 'nothing faces down');
    if (nz === 0 && Math.abs(ny) > 0.5) assert.ok(y * ny > 0, 'the sides face away from the middle');
    void x; void nx;
  }
});

test('a triangle cut to a rectangle keeps only what is inside', () => {
  const tri = [{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 0, v: 10 }], area = (ps) => Math.abs(ps.reduce((sum, a, i) => sum + a.u * ps[(i + 1) % ps.length].v - ps[(i + 1) % ps.length].u * a.v, 0)) / 2;
  assert.ok(Math.abs(area(clipToRect(tri, { u0: 0, v0: 0, u1: 5, v1: 5 })) - 25) < 1e-9);
  assert.equal(clipToRect(tri, { u0: 20, v0: 20, u1: 30, v1: 30 }).length, 0);
  assert.ok(Math.abs(area(clipToRect(tri, { u0: -5, v0: -5, u1: 50, v1: 50 })) - 50) < 1e-9);
});

const memory = () => {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v), removeItem: (k) => items.delete(k), items };
};

test('a floor is saved and comes back as it was', () => {
  const storage = memory(), store = new BuildingStore(storage), record = lay(SHAPES.house, 4);
  store.remember('b', { type: 'home', floors: 1, style: 'cheap' }, 1);
  assert.equal(store.floor('b', 1), null);
  store.saveFloor('b', 1, record);
  assert.deepEqual(new BuildingStore(storage).floor('b', 1), record);
});

test('over the limit, the buildings seen longest ago lose their floors but not what they are', () => {
  const storage = memory(), store = new BuildingStore(storage), big = { axis: 0, zones: [], walls: [], items: 'x'.repeat(600000) };
  store.remember('old', { type: 'home', floors: 1, style: 'cheap' }, 1);
  store.remember('mid', { type: 'home', floors: 1, style: 'cheap' }, 2);
  store.remember('new', { type: 'home', floors: 1, style: 'cheap' }, 3);
  store.saveFloor('old', 1, big);
  store.saveFloor('mid', 1, big);
  store.saveFloor('new', 1, big);
  assert.equal(store.floor('old', 1), null);
  assert.ok(store.floor('mid', 1));
  assert.ok(store.floor('new', 1));
  assert.equal(new BuildingStore(storage).get('old').type, 'home');
});

test('forgetting clears the lot, and full storage only loses the saving', () => {
  const storage = memory(), store = new BuildingStore(storage);
  store.remember('b', { type: 'home', floors: 1, style: 'cheap' }, 1);
  store.saveFloor('b', 1, { axis: 0, zones: [], walls: [], items: [] });
  store.forget();
  assert.equal(storage.items.size, 0);
  assert.equal(new BuildingStore(storage).get('b'), null);
  const full = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} }, tight = new BuildingStore(full);
  tight.remember('b', { type: 'home', floors: 1, style: 'cheap' }, 1);
  tight.saveFloor('b', 1, { axis: 0, zones: [], walls: [], items: [] });
  assert.equal(tight.floor('b', 1), null);
});

test('everything in the catalogue says what it could do, or nothing, and every shape exists', () => {
  for (const [name, item] of Object.entries(ITEMS)) {
    assert.ok(item.models.length, name);
    if (item.use) assert.ok(item.use.length, name);
  }
});

const withCore = (p, floors, seed = 1) => {
  const plan = { type: 'home', floors, style: 'modern' };
  plan.core = coreOf([p], plan, models, dice(seed));
  return plan;
};
const coreIn = (record) => record.items.filter(([item]) => ['stairs', 'stairwell', 'lift'].includes(item));

test('you walk up the stairs from their front: the low end is towards +y and the high end away', () => {
  const low = [], high = [], { parts, h } = models.stairs;
  for (const { points } of parts) {
    for (let i = 0; i < points.length; i += 3) {
      if (points[i + 2] > h * 800) high.push(points[i + 1]);
      if (points[i + 2] < h * 150) low.push(points[i + 1]);
    }
  }
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  assert.ok(mean(low) > 300 && mean(high) < -300, `low ${mean(low)}, high ${mean(high)}`);
  assert.ok(models.stairs.d > models.stairs.w, 'the flight runs front to back');
  assert.equal(models.stairwell.d, models.stairs.d, 'and the head of them above is the same size');
});

test('stairs stand in the same place on every floor, with their head on the top one', () => {
  for (const [name, p] of Object.entries(SHAPES)) {
    const plan = withCore(p, 3);
    if (!plan.core) { assert.equal(name, 'small'); continue; }
    const floors = [1, 2, 3].map((floor) => lay(p, 40 + floor, plan, floor));
    assert.deepEqual(coreIn(floors[0]).map((i) => i[0]), ['stairs']);
    assert.deepEqual(coreIn(floors[1]).map((i) => i[0]), ['stairs']);
    assert.deepEqual(coreIn(floors[2]).map((i) => i[0]), ['stairwell']);
    const where = (record) => coreIn(record)[0].slice(2, 6);
    assert.deepEqual(where(floors[0]), where(floors[1]));
    assert.deepEqual(where(floors[0]), where(floors[2]));
    for (const record of floors) assert.equal(record.v, FLOOR_VERSION);
  }
});

test('only a building of 4 floors or more has a lift, beside the stairs and clear of them', () => {
  const p = rectangle(30, 20);
  assert.equal(withCore(p, 3).core.parts.length, 1);
  const { core } = withCore(p, 4);
  assert.deepEqual(core.parts.map((part) => part.item), ['stairs', 'lift']);
  const [a, b] = core.parts;
  assert.equal(a.rot, b.rot);
  assert.ok(Math.hypot(a.u - b.u, a.v - b.v) > models.lift.w / 2 + models.stairs.w / 2, 'not overlapping');
  assert.ok(Math.hypot(a.u - b.u, a.v - b.v) < 3);
});

test('nothing stands in the way to the stairs, no wall crosses it, and the stairs can be reached', () => {
  for (const [name, p] of Object.entries(SHAPES)) {
    for (let seed = 0; seed < 25; seed++) {
      const plan = withCore(p, 2, hashText(`core${name}${seed}`));
      if (!plan.core) continue;
      const record = lay(p, hashText(`corefloor${name}${seed}`), plan, 1), [u0, v0, u1, v1] = plan.core.clear, stairs = plan.core.parts[0];
      const m = models.stairs, q = stairs.rot % 180 === 0, box = { u0: stairs.u - (q ? m.w : m.d) / 2, u1: stairs.u + (q ? m.w : m.d) / 2, v0: stairs.v - (q ? m.d : m.w) / 2, v1: stairs.v + (q ? m.d : m.w) / 2 };
      for (const [item, model, u, v, , rot] of record.items) {
        if (!isSolid(item) || coreIn({ items: [[item]] }).length) continue;
        const r = Math.round(rot / 90) % 2 === 0, hu = (r ? models[model].w : models[model].d) / 2, hv = (r ? models[model].d : models[model].w) / 2;
        const inWay = (b) => u - hu < b.u1 - 0.01 && u + hu > b.u0 + 0.01 && v - hv < b.v1 - 0.01 && v + hv > b.v0 + 0.01;
        assert.ok(!inWay({ u0, v0, u1, v1 }) && !inWay(box), `${name} ${seed}: ${item} in the way of the stairs`);
      }
      for (const [a0, b0, a1, b1] of record.walls) {
        const crosses = Math.min(a0, a1) < box.u1 - 0.01 && Math.max(a0, a1) > box.u0 + 0.01 && Math.min(b0, b1) < box.v1 - 0.01 && Math.max(b0, b1) > box.v0 + 0.01;
        assert.ok(!crosses, `${name} ${seed}: a wall through the stairs`);
      }
    }
  }
});

test('a building too narrow for stairs has none, and L only uses them from close by', () => {
  const plan = { type: 'home', floors: 2, style: 'modern' };
  assert.equal(coreOf([rectangle(2.5, 3)], plan, models, dice(1)), null);
  const p = rectangle(20, 14), withStairs = withCore(p, 8), frame = frameOf([p], withStairs.core.axis), [stairs, lift] = withStairs.core.parts;
  const at = ({ u, v }, by = 0) => frame.toWorld(u + by, v);
  assert.equal(coreNear(withStairs, frame, models, at(lift).x, at(lift).y), 'lift');
  assert.equal(coreNear(withStairs, frame, models, at(stairs).x, at(stairs).y), 'stairs');
  assert.equal(coreNear(withStairs, frame, models, at(stairs, 9).x + 40, at(stairs).y + 40), null);
});

test('a type with no furniture yet still has its stairs and lift on every floor, and they block', () => {
  const p = rectangle(30, 20), plan = { type: 'office', floors: 12, style: 'modern' };
  plan.core = coreOf([p], plan, models, dice(3));
  const middle = plainFloor(plan, 6), top = plainFloor(plan, 12), frame = frameOf([p], middle.axis);
  assert.deepEqual(coreIn(middle).map((i) => i[0]), ['stairs', 'lift']);
  assert.deepEqual(coreIn(top).map((i) => i[0]), ['stairwell', 'lift']);
  assert.ok(solidsOf(middle, frame, models).boxes.length === 2);
  const place = new Place(ORIGIN);
  place.addTile('t', { buildings: [p], lands: [], waters: [], roads: [] });
  assert.ok(roomMesh(place, p, 0, { record: top, furniture: { models, colours } }).length > roomMesh(place, p, 0).length, 'and they are drawn, with no room to take a colour from');
});

const TYPE_MUST = {
  gym: 'weightRack', pool: 'poolWater', cinema: 'cinemaScreen', theatre: 'stagePlatform', stadium: 'fieldMarks', bar: 'barCounter', fastFood: 'booth', bakery: 'breadRack', laundromat: 'washer', departmentStore: 'clothesRack', station: 'railTrack', gasStation: 'fridgeCase', carGarage: 'carLift',
  fireStation: 'fireEngine', police: 'policeCell', postOffice: 'tellerCounter', communityCentre: 'stagePlatform', library: 'bookStack', kindergarten: 'tinyTable', dorm: 'frontDesk',
  clinic: 'examTable', vet: 'petCage', pharmacy: 'storeShelf', salon: 'salonChair', nursingHome: 'sofa', parking: 'bayMark', shed: 'workbench', apartments: 'frontDesk', hotel: 'frontDesk', office: 'frontDesk', bank: 'tellerCounter', restaurant: 'diningTable', cafe: 'barCounter', shop: 'clothesRack', supermarket: 'storeShelf',
  mall: 'barCounter', school: 'schoolDesk', hospital: 'frontDesk', worship: 'pew', museum: 'displayCase', warehouse: 'palletRack', factory: 'machine', hangar: 'plane', terminal: 'checkInDesk',
};
const typeShape = (type) => ({ gym: rectangle(26, 16), pool: rectangle(30, 20), cinema: rectangle(30, 20), theatre: rectangle(36, 24), stadium: rectangle(90, 70), bar: rectangle(16, 11), fastFood: rectangle(18, 11), bakery: rectangle(13, 9), laundromat: rectangle(12, 8), departmentStore: rectangle(50, 30), station: rectangle(50, 26), gasStation: rectangle(14, 10), carGarage: rectangle(30, 18), fireStation: rectangle(24, 18), police: rectangle(28, 18), postOffice: rectangle(16, 12), communityCentre: rectangle(30, 20), library: rectangle(30, 20), kindergarten: rectangle(24, 14), dorm: rectangle(30, 16), clinic: rectangle(18, 12), vet: rectangle(16, 12), pharmacy: rectangle(16, 11), salon: rectangle(12, 9), nursingHome: rectangle(40, 22), parking: rectangle(50, 30), shed: rectangle(6, 5), cafe: rectangle(13, 9), restaurant: rectangle(16, 12), bank: rectangle(16, 14), shop: rectangle(14, 10), apartments: rectangle(24, 16), hotel: rectangle(30, 20), office: rectangle(30, 22) }[type] ?? rectangle(45, 30));
const solidsClear = (record, label) => {
  const boxes = record.items.filter(([item]) => isSolid(item) && !['stairs', 'lift', 'stairwell'].includes(item)).map(([item, model, u, v, , rot]) => {
    const m = models[model], q = Math.round(rot / 90) % 2 === 0;
    return { item, u0: u - (q ? m.w : m.d) / 2, u1: u + (q ? m.w : m.d) / 2, v0: v - (q ? m.d : m.w) / 2, v1: v + (q ? m.d : m.w) / 2 };
  });
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) assert.ok(Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) <= 0.03 || Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) <= 0.03, `${label}: ${a.item} on ${b.item}`);
  });
};

test('every code-made model is real, and its faces point outwards', () => {
  for (const [item, spec] of Object.entries(ITEMS)) {
    for (const name of spec.models) {
      const model = models[name];
      assert.ok(model && model.w > 0 && model.d > 0 && model.h > 0, `${item}: ${name}`);
      if (!spec.built) continue;
      for (const { points: p } of model.parts) {
        for (let i = 0; i < p.length; i += 9) {
          const nz = (p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) - (p[i + 4] - p[i + 1]) * (p[i + 6] - p[i]);
          assert.ok(nz >= 0, `${name}: a face pointing down`);
        }
      }
    }
  }
});

test('every type of building is furnished with what it should have, in rooms that can be reached', () => {
  for (const [type, wanted] of Object.entries(TYPE_MUST)) {
    const p = typeShape(type);
    let found = 0;
    for (let seed = 0; seed < 12; seed++) {
      const record = layoutFloor([p], { type, floors: 1, style: 'modern' }, 1, models, dice(hashText(`${type}${seed}`)));
      assert.ok(record.zones.length >= 1, type);
      if (record.items.some(([item]) => item === wanted)) found++;
      solidsClear(record, `${type} ${seed}`);
      const frame = frameOf([p], record.axis), walls = record.walls.map(([u0, v0, u1, v1]) => {
        const a = frame.toWorld(u0, v0), b = frame.toWorld(u1, v1);
        return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
      });
      assert.ok(reachableArea(p, walls) > (type === 'bank' ? 0.8 : 0.99), `${type} ${seed} shuts off part of the floor`);
      assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
    }
    assert.ok(found >= 10, `${type}: ${wanted} in only ${found} of 12`);
  }
});

test('a bank in a tower is a bank downstairs and offices above', () => {
  const p = rectangle(30, 22), plan = { type: 'office', ground: 'bank', floors: 12, style: 'luxury' };
  plan.core = coreOf([p], plan, models, dice(2));
  const down = layoutFloor([p], plan, 1, models, dice(3)), up = layoutFloor([p], plan, 5, models, dice(4));
  assert.ok(down.items.some(([item]) => item === 'tellerCounter'));
  assert.ok(down.zones.some((z) => z[0] === 'vault'));
  assert.ok(up.items.some(([item]) => item === 'desk'));
  assert.ok(!up.items.some(([item]) => item === 'tellerCounter'));
  assert.ok(up.items.some(([item]) => item === 'lift'));
});

test('a huge floor stays cheap: limits on how much it holds and how long it takes', () => {
  const p = rectangle(300, 200), plan = { type: 'warehouse', floors: 1, style: 'cheap' }, began = performance.now();
  const record = layoutFloor([p], plan, 1, models, dice(9)), took = performance.now() - began;
  assert.ok(took < 3000, `${took} ms`);
  assert.ok(record.items.filter(([item]) => isSolid(item)).length <= 241);
  assert.ok(JSON.stringify(record).length < 30000, `${JSON.stringify(record).length} characters`);
  const place = new Place(ORIGIN);
  place.addTile('t', { buildings: [p], lands: [], waters: [], roads: [] });
  const triangles = roomMesh(place, p, 0, { record, furniture: { models, colours } }).length / 27;
  assert.ok(triangles < 40000, `${triangles} triangles`);
});

const flatFloor = (p, floor, seed, floors = 5) => {
  const plan = { type: 'apartments', floors, style: 'modern' };
  plan.core = coreOf([p], plan, models, dice(seed));
  return { plan, record: layoutFloor([p], plan, floor, models, dice(hashText(`flat${seed}:${floor}`))) };
};
const FLAT_SHAPES = { block: rectangle(24, 16), long: rectangle(40, 18), deep: rectangle(40, 40), bent: piece([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 16 }, { x: 18, y: 16 }, { x: 18, y: 40 }, { x: 0, y: 40 }]) };

test('upstairs in an apartment building, each flat has a front door and its own kitchen, bathroom, living room and bedroom', () => {
  for (const [name, p] of Object.entries(FLAT_SHAPES)) {
    for (let seed = 0; seed < 10; seed++) {
      const { record } = flatFloor(p, 3, seed), zones = record.zones.map((z) => z[0]), count = (zone) => zones.filter((z) => z === zone).length;
      assert.ok(count('corridor') >= 1 && count('landing') === 1, `${name} ${seed}: ${zones}`);
      const flats = count('kitchen');
      assert.ok(flats >= 2 && flats <= 12, `${name} ${seed}: ${flats} flats`);
      for (const zone of ['bathroom', 'living', 'bedroom']) assert.equal(count(zone), flats, `${name} ${seed}: ${zone}`);
      assert.equal(record.items.filter(([item]) => item === 'frontDoor').length, flats, `${name} ${seed}: front doors`);
      const inRoom = (zone, item) => record.items.filter((i) => i[0] === item && record.zones[i[6]]?.[0] === zone).length;
      assert.ok(inRoom('bathroom', 'toilet') >= flats - 1, `${name} ${seed}: toilets`);
      assert.ok(inRoom('bedroom', 'bed') >= flats - 2, `${name} ${seed}: beds ${inRoom('bedroom', 'bed')} of ${flats}`);
      solidsClear(record, `${name} ${seed}`);
    }
  }
});

test('the ground floor of an apartment building has a lobby and mailboxes, and every room can be reached on every floor', () => {
  for (const [name, p] of Object.entries(FLAT_SHAPES)) {
    for (let seed = 0; seed < 8; seed++) {
      const ground = flatFloor(p, 1, seed).record;
      for (const [zone, item] of [['lobby', 'frontDesk'], ['mailroom', 'mailboxes']]) {
        assert.ok(ground.zones.some((z) => z[0] === zone), `${name} ${seed}: ${zone}`);
        assert.ok(ground.items.some((i) => i[0] === item), `${name} ${seed}: ${item}`);
      }
      for (const record of [ground, flatFloor(p, 3, seed).record]) {
        const frame = frameOf([p], record.axis), walls = record.walls.map(([u0, v0, u1, v1]) => {
          const a = frame.toWorld(u0, v0), b = frame.toWorld(u1, v1);
          return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
        });
        assert.ok(reachableArea(p, walls) > 0.99, `${name} ${seed} shuts off part of the floor`);
      }
    }
  }
});

test('a front door stands in the corridor wall, with its open leaf inside the flat', () => {
  const p = rectangle(24, 16), { record } = flatFloor(p, 3, 1);
  for (const [, , u, v, , rot] of record.items.filter(([item]) => item === 'frontDoor')) {
    const kitchen = record.zones.find((z) => z[0] === 'kitchen' && u >= z[1] && u <= z[3] && v >= z[2] - 0.01 && v <= z[4] + 0.01);
    assert.ok(kitchen, 'it leads into a kitchen');
    const back = { 0: [0, -1], 180: [0, 1], 90: [-1, 0], 270: [1, 0] }[rot], leafU = u + back[0] * 0.5, leafV = v + back[1] * 0.5;
    assert.ok(leafU >= kitchen[1] && leafU <= kitchen[3] && leafV >= kitchen[2] && leafV <= kitchen[4], 'and swings into it, not the corridor');
  }
});

test('stairs and lift are clear on an apartment floor, in the landing, and a narrow building is still divided somehow', () => {
  const p = rectangle(40, 18), { plan, record } = flatFloor(p, 3, 2), [u0, v0, u1, v1] = plan.core.clear, stairs = plan.core.parts[0];
  const landing = record.zones.find((z) => z[0] === 'landing');
  assert.ok(stairs.u >= landing[1] - 3 && stairs.u <= landing[3] + 3 && stairs.v >= landing[2] - 3 && stairs.v <= landing[4] + 3);
  for (const [a0, b0, a1, b1] of record.walls) assert.ok(!(Math.min(a0, a1) < u1 - 0.01 && Math.max(a0, a1) > u0 + 0.01 && Math.min(b0, b1) < v1 - 0.01 && Math.max(b0, b1) > v0 + 0.01), 'a wall across the way to the stairs');
  const narrow = layoutFloor([rectangle(14, 6)], { type: 'apartments', floors: 1, style: 'cheap' }, 1, models, dice(4));
  assert.ok(narrow.zones.length >= 1);
});

const garageFloor = (p, floor, seed, floors = 4) => {
  const plan = { type: 'parking', floors, style: 'modern' };
  plan.core = floors > 1 ? coreOf([p], plan, models, dice(seed)) : null;
  return { plan, record: layoutFloor([p], plan, floor, models, dice(hashText(`garage${seed}:${floor}`))) };
};
const GARAGES = { small: rectangle(36, 18), usual: rectangle(60, 34), big: rectangle(90, 60), turned: turned(60, 34, 27), bent: piece([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 24 }, { x: 30, y: 24 }, { x: 30, y: 60 }, { x: 0, y: 60 }]) };

test('every car model is a whole car with its nose towards +y, longer than wide', () => {
  for (const name of ITEMS.parkedCar.models) {
    const m = models[name];
    assert.ok(m.d > 3.5 && m.d < 5.2 && m.w > 1.6 && m.w < 2.1 && m.h > 1.3 && m.h < 2, `${name} ${m.w} x ${m.d} x ${m.h}`);
  }
  assert.ok(models.bayMark.w > models.carSuv_carpet.w && models.bayMark.d > models.carSuv_carpet.d, 'the biggest car fits a bay');
});

test('a garage floor has marked bays, parked cars, pillars and lanes', () => {
  for (const [name, p] of Object.entries(GARAGES)) {
    for (let seed = 0; seed < 8; seed++) {
      for (const floor of [1, 2, 4]) {
        const { record } = garageFloor(p, floor, seed), count = (item) => record.items.filter((i) => i[0] === item).length;
        assert.ok(count('bayMark') >= 8 && count('bayMark') <= 130, `${name} ${seed}: ${count('bayMark')} bays`);
        assert.ok(count('parkedCar') >= 2 && count('parkedCar') <= count('bayMark'), `${name} ${seed}: ${count('parkedCar')} cars`);
        assert.ok(count('pillar') >= 2, `${name}: pillars`);
        assert.ok(count('laneArrow') >= 1, `${name}: arrows`);
        assert.ok(count('ticketMachine') >= 1, `${name}: ticket machine`);
        assert.equal(count('barrierGate') >= 1, floor === 1, `${name}: barrier on the ground floor only`);
        solidsClear(record, `${name} ${seed} floor ${floor}`);
        assert.ok(JSON.stringify(record).length < 30000);
      }
    }
  }
});

test('a garage has a ramp up on each floor but the top, where it ends, and none with one floor', () => {
  const p = GARAGES.usual, ramp = (record) => record.items.filter((i) => i[0] === 'carRamp').length, top = (record) => record.items.filter((i) => i[0] === 'rampTop').length;
  for (let seed = 0; seed < 8; seed++) {
    assert.equal(ramp(garageFloor(p, 1, seed).record), 1, `seed ${seed}`);
    assert.equal(ramp(garageFloor(p, 3, seed).record), 1, `seed ${seed}`);
    assert.equal(ramp(garageFloor(p, 4, seed).record), 0);
    assert.equal(top(garageFloor(p, 4, seed).record), 1, `seed ${seed}`);
    const one = garageFloor(p, 1, seed, 1).record;
    assert.equal(ramp(one) + top(one), 0);
  }
});

test('nobody is shut in by parked cars: all the free floor of a garage joins up', () => {
  for (const [name, p] of Object.entries(GARAGES)) {
    for (let seed = 0; seed < 6; seed++) {
      const { record } = garageFloor(p, 2, seed), frame = frameOf([p], record.axis), { boxes } = solidsOf(record, frame, models), rings = p.rings.map((r) => r.pts), step = 0.35;
      const free = (x, y) => inRings(rings, x, y) && !boxes.some((box) => {
        const dx = x - box.x, dy = y - box.y;
        return Math.abs(dx * box.c - dy * box.s) < box.hw + 0.35 && Math.abs(dx * box.s + dy * box.c) < box.hd + 0.35;
      });
      const cells = new Set(), key = (i, j) => `${i},${j}`;
      for (let i = Math.floor(p.minX / step); i <= p.maxX / step; i++) for (let j = Math.floor(p.minY / step); j <= p.maxY / step; j++) if (free(i * step, j * step)) cells.add(key(i, j));
      const groups = [], seen = new Set();
      for (const start of cells) {
        if (seen.has(start)) continue;
        let size = 0;
        const stack = [start];
        seen.add(start);
        while (stack.length) {
          const [i, j] = stack.pop().split(',').map(Number);
          size++;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const next = key(i + di, j + dj);
            if (cells.has(next) && !seen.has(next)) { seen.add(next); stack.push(next); }
          }
        }
        groups.push(size);
      }
      const largest = Math.max(...groups), total = groups.reduce((a, b) => a + b, 0);
      assert.ok(largest / total > 0.97, `${name} ${seed}: only ${(largest / total).toFixed(3)} of the free floor joins up`);
    }
  }
});

test('stairs stay clear in a garage, and one too small for lanes still has cars', () => {
  const { plan, record } = garageFloor(GARAGES.usual, 2, 3), [u0, v0, u1, v1] = plan.core.clear;
  for (const [item, name, u, v, , rot] of record.items) {
    if (!isSolid(item) || coreIn({ items: [[item]] }).length) continue;
    const q = Math.round(rot / 90) % 2 === 0, hu = (q ? models[name].w : models[name].d) / 2, hv = (q ? models[name].d : models[name].w) / 2;
    assert.ok(!(u - hu < u1 - 0.01 && u + hu > u0 + 0.01 && v - hv < v1 - 0.01 && v + hv > v0 + 0.01), `${item} in the way of the stairs`);
  }
  const tiny = layoutFloor([rectangle(9, 8)], { type: 'parking', floors: 1, style: 'cheap' }, 1, models, dice(3));
  assert.ok(tiny.items.some(([item]) => item === 'parkedCar'));
});

test('a hospital has reception downstairs, and wards, nurses and an operating room in rooms of their own upstairs', () => {
  const p = rectangle(60, 30);
  for (let seed = 0; seed < 8; seed++) {
    const plan = { type: 'hospital', floors: 4, style: 'modern' };
    plan.core = coreOf([p], plan, models, dice(seed));
    const down = layoutFloor([p], plan, 1, models, dice(hashText(`hd${seed}`))), up = layoutFloor([p], plan, 2, models, dice(hashText(`hu${seed}`)));
    const zones = (r) => r.zones.map((z) => z[0]), inZone = (r, zone, item) => r.items.some((i) => i[0] === item && r.zones[i[6]]?.[0] === zone);
    assert.ok(inZone(down, 'hospitalWaiting', 'frontDesk'), `${seed} reception: ${zones(down)}`);
    assert.ok(inZone(down, 'examRoom', 'examTable'), `${seed} exam room`);
    assert.ok(inZone(up, 'operatingRoom', 'operatingTable'), `${seed} operating table: ${zones(up)}`);
    assert.ok(inZone(up, 'ward', 'hospitalBed'), `${seed} beds`);
    assert.ok(inZone(up, 'nurseStation', 'frontDesk'), `${seed} nurses`);
  }
});

test('a pocket behind the stairs does not stop the rest of the floor being furnished', () => {
  for (let seed = 0; seed < 12; seed++) {
    const p = rectangle(24, 14), plan = { type: 'kindergarten', floors: 2, style: 'modern' };
    plan.core = coreOf([p], plan, models, dice(seed));
    const record = layoutFloor([p], plan, 1, models, dice(hashText(`pocket${seed}`)));
    assert.ok(record.items.filter(([item]) => item === 'tinyTable').length >= 2, `seed ${seed}: ${record.items.map((i) => i[0])}`);
  }
});

test('no room name means two different things', () => {
  const source = readFileSync(new URL('../public/js/furnish.js', import.meta.url), 'utf8'), block = source.slice(source.indexOf('const RECIPES = {'), source.indexOf('// A colour for each thing'));
  const names = [...block.matchAll(/^  (\w+): \[$/gm)].map((m) => m[1]);
  assert.equal(new Set(names).size, names.length, names.filter((n, i) => names.indexOf(n) !== i).join());
});

const hopWorld = (boxes, walls = []) => {
  const place = new Place(ORIGIN);
  const outer = rectangle(40, 40);
  place.addTile('t', { buildings: [outer], lands: [], waters: [], roads: [] });
  const made = boxes.map(({ x, y, hw, hd, top }) => ({ x, y, c: 1, s: 0, hw, hd, top }));
  const segments = made.flatMap(({ x, y, hw, hd, top }) => {
    const pts = [[x - hw, y - hd], [x + hw, y - hd], [x + hw, y + hd], [x - hw, y + hd]];
    return pts.map((a, i) => ({ ax: a[0], ay: a[1], bx: pts[(i + 1) % 4][0], by: pts[(i + 1) % 4][1], top }));
  });
  return { place, carWalls: [], height: () => 0, floor: () => 0, inner: { walls: [...segments, ...walls], boxes: made } };
};
const hopAcross = (world, input) => {
  const walker = newWalker(20, 15, 0); // walking north, towards y = 20
  let jumped = false;
  for (let t = 0; t < 4; t += 1 / 60) {
    const press = !jumped && walker.y > 18.4;
    if (press) jumped = true;
    stepWalker(walker, { forward: 1, ...input, jump: press }, 1 / 60, world);
  }
  return walker;
};

test('a jump clears a chair or a table, and comes back to the floor', () => {
  const world = hopWorld([{ x: 20, y: 20, hw: 1.5, hd: 0.3, top: 0.94 }]);
  const walked = newWalker(20, 15, 0);
  for (let t = 0; t < 4; t += 1 / 60) stepWalker(walked, { forward: 1 }, 1 / 60, world);
  assert.ok(walked.y < 20, `walking doesn't pass it: ${walked.y}`);
  const hopped = hopAcross(world, {});
  assert.ok(hopped.y > 20.7, `jumping does: ${hopped.y}`);
  assert.equal(hopped.height, 0, 'and lands on the floor');
});

test('a jump does not clear a wardrobe, or a wall', () => {
  assert.ok(hopAcross(hopWorld([{ x: 20, y: 20, hw: 1.5, hd: 0.3, top: 1.7 }]), {}).y < 20, 'a wardrobe');
  const wall = { ax: 10, ay: 20, bx: 30, by: 20 };
  assert.ok(hopAcross(hopWorld([], [wall]), {}).y < 20, 'a wall has no top to get over');
});

test('someone can stand on a table, walk off it, and jump again from it', () => {
  const world = hopWorld([{ x: 20, y: 20, hw: 1.5, hd: 1.5, top: 0.75 }]), walker = newWalker(20, 17.8, 0);
  let on = 0;
  for (let t = 0; t < 1.2; t += 1 / 60) {
    stepWalker(walker, { forward: t < 0.3 ? 1 : 0, jump: t < 0.02 }, 1 / 60, world);
    if (walker.height === 0.75) on++;
  }
  assert.ok(on > 0, `landed on it: ${walker.y}, ${walker.height}`);
  assert.equal(walker.height, 0.75);
  for (let t = 0; t < 2; t += 1 / 60) stepWalker(walker, { forward: 1 }, 1 / 60, world);
  assert.equal(walker.height, 0, 'walked off the end, and fell');
});

test('a jump reaches about its height, and shows in the frame', () => {
  const world = hopWorld([]), walker = newWalker(20, 20, 0);
  let peak = 0, frame = 0;
  for (let t = 0; t < 1.5; t += 1 / 60) {
    stepWalker(walker, { jump: true }, 1 / 60, world);
    if (t < 0.7) { peak = Math.max(peak, walker.height); if (walker.height > 0.3) frame = walkerFrame(walker); }
    if (t >= 0.7) break;
  }
  assert.ok(Math.abs(peak - JUMP_HEIGHT) < 0.08, `${peak}`);
  assert.ok(frame > 0, 'not the standing frame');
});

test('a tall building has a lobby on its ground floor for its lift, whatever it is', () => {
  const p = rectangle(40, 30);
  for (const type of ['office', 'hotel', 'hospital', 'school', 'library']) {
    const plan = { type, floors: 8, style: 'modern' };
    plan.core = coreOf([p], plan, models, dice(1));
    const record = layoutFloor([p], plan, 1, models, dice(2));
    assert.ok(record.zones.some((z) => z[0] === 'lobby'), `${type}: ${record.zones.map((z) => z[0])}`);
    assert.ok(record.items.some((i) => i[0] === 'lift'), `${type} lift`);
  }
  const bank = { type: 'office', ground: 'bank', floors: 8, style: 'modern' };
  bank.core = coreOf([p], bank, models, dice(1));
  assert.ok(layoutFloor([p], bank, 1, models, dice(2)).zones.some((z) => z[0] === 'bankLobby'), 'a bank has its own');
  const small = { type: 'office', floors: 2, style: 'modern' };
  small.core = coreOf([p], small, models, dice(1));
  assert.ok(!layoutFloor([p], small, 1, models, dice(2)).items.some((i) => i[0] === 'lift'), 'no lift in a small one');
});

const planned = (type, p, floors, seed = 1) => {
  const plan = { type, floors, style: 'modern' };
  if (floors > 1) plan.core = coreOf([p], plan, models, dice(seed));
  return plan;
};
const gapToWall = (part, w, d) => Math.min(part.u + w / 2, w / 2 - part.u, part.v + d / 2, d / 2 - part.v);

test('a garage has its stairs in a corner, not in the lanes, and other buildings at a wall, but towers in the middle', () => {
  for (let seed = 0; seed < 8; seed++) {
    const garage = planned('parking', rectangle(60, 34), 4, seed).core.parts[0];
    assert.ok(gapToWall(garage, 60, 34) < 2.5, `${gapToWall(garage, 60, 34)} m from a wall`);
    assert.ok(Math.abs(garage.u) > 22 || Math.abs(garage.v) > 12, 'towards an end');
    const shop = planned('shop', rectangle(30, 20), 2, seed).core.parts[0];
    assert.ok(gapToWall(shop, 30, 20) < 3, 'a shop keeps them at a wall');
    const tower = planned('office', rectangle(40, 30), 12, seed).core.parts[0];
    assert.ok(gapToWall(tower, 40, 30) > 5, 'an office tower has them at its core');
  }
});

test('a building is entered by a door in an outside wall, into its entrance room', () => {
  for (const [type, zone] of [['home', 'hall'], ['hotel', 'lobby'], ['bank', 'bankLobby'], ['office', 'lobby']]) {
    const p = rectangle(30, 20), inside = [], door = [];
    for (let seed = 0; seed < 6; seed++) {
      const plan = planned(type, p, type === 'home' ? 2 : 6, seed), record = layoutFloor([p], plan, 1, models, dice(hashText(`e${type}${seed}`)));
      assert.ok(record.entry, `${type} has a way in`);
      const room = record.zones.find((z) => record.entry[0] >= z[1] && record.entry[0] <= z[3] && record.entry[1] >= z[2] && record.entry[1] <= z[4]);
      inside.push(room[0]);
      door.push(record.items.filter((i) => i[0] === 'frontDoor').length);
      assert.equal(isSolid('frontDoor'), false);
    }
    assert.ok(inside.filter((n) => n === zone).length >= 4, `${type}: comes in to ${inside}`);
    assert.ok(door.every((n) => n >= 1));
  }
  assert.ok(garageFloor(rectangle(60, 34), 1, 1).record.entry, 'a garage too');
});

test('in a home the bedrooms are away from the way in, and upstairs if there is one', () => {
  let further = 0, total = 0;
  for (let seed = 0; seed < 30; seed++) {
    const p = rectangle(16, 12), record = lay(p, hashText(`bed${seed}`));
    const centre = (z) => [(z[1] + z[3]) / 2, (z[2] + z[4]) / 2], hall = record.zones.find((z) => z[0] === 'hall'), beds = record.zones.filter((z) => z[0] === 'bedroom'), living = record.zones.find((z) => z[0] === 'living');
    if (!hall || !beds.length || !living) continue;
    total++;
    const from = (z) => Math.hypot(centre(z)[0] - centre(hall)[0], centre(z)[1] - centre(hall)[1]);
    if (Math.max(...beds.map(from)) > from(living)) further++;
    if (record.entry) assert.ok(!record.zones.some((z) => z[0] === 'bedroom' && record.entry[0] >= z[1] && record.entry[0] <= z[3] && record.entry[1] >= z[2] && record.entry[1] <= z[4]), 'not straight into a bedroom');
  }
  assert.ok(total >= 10 && further / total > 0.7, `${further} of ${total}`);
});

test('a bank has a lobby, little offices and a vault nobody can walk into', () => {
  const p = rectangle(30, 20);
  for (let seed = 0; seed < 8; seed++) {
    const plan = planned('bank', p, 2, seed), record = layoutFloor([p], plan, 1, models, dice(hashText(`v${seed}`))), frame = frameOf([p], record.axis);
    const zones = record.zones.map((z) => z[0]);
    for (const zone of ['bankLobby', 'bankHall', 'vault']) assert.ok(zones.includes(zone), `${seed}: ${zones}`);
    assert.ok(zones.filter((z) => z === 'privateOffice').length >= 2, 'offices');
    const vault = record.zones.find((z) => z[0] === 'vault'), walls = record.walls;
    const closed = (test) => { let run = 0; for (const [a0, b0, a1, b1] of walls) if (test(a0, b0, a1, b1)) run += Math.hypot(a1 - a0, b1 - b0); return run; };
    const inner = (x, lo, hi) => Math.abs(x) < 1e9 && lo < hi;
    const sides = [[1, 3, 2, 4]].flatMap(() => [
      vault[1] > -14.9 ? closed((a0, b0, a1, b1) => Math.abs(a0 - vault[1]) < 0.02 && Math.abs(a1 - vault[1]) < 0.02) >= vault[4] - vault[2] - 0.6 : true,
      vault[3] < 14.9 ? closed((a0, b0, a1, b1) => Math.abs(a0 - vault[3]) < 0.02 && Math.abs(a1 - vault[3]) < 0.02) >= vault[4] - vault[2] - 0.6 : true,
      vault[2] > -9.9 ? closed((a0, b0, a1, b1) => Math.abs(b0 - vault[2]) < 0.02 && Math.abs(b1 - vault[2]) < 0.02) >= vault[3] - vault[1] - 0.6 : true,
      vault[4] < 9.9 ? closed((a0, b0, a1, b1) => Math.abs(b0 - vault[4]) < 0.02 && Math.abs(b1 - vault[4]) < 0.02) >= vault[3] - vault[1] - 0.6 : true,
    ]);
    assert.ok(sides.every(Boolean), `seed ${seed}: an open side`);
    void frame; void inner;
  }
});

test('hotels and schools have rooms off corridors, and a hotel room has its own bathroom', () => {
  const hotel = planned('hotel', rectangle(40, 20), 6), upstairs = layoutFloor([rectangle(40, 20)], hotel, 3, models, dice(5)), count = (zone) => upstairs.zones.filter((z) => z[0] === zone).length;
  assert.ok(count('corridor') >= 1 && count('hotelRoom') >= 6, upstairs.zones.map((z) => z[0]).join());
  assert.equal(count('bathroom'), count('hotelRoom'));
  assert.equal(upstairs.items.filter((i) => i[0] === 'frontDoor').length, count('hotelRoom'));
  const lobby = layoutFloor([rectangle(40, 20)], hotel, 1, models, dice(6));
  assert.ok(lobby.items.some((i) => i[0] === 'frontDesk') && lobby.items.some((i) => i[0] === 'lift'), 'a reception and a lift downstairs');
  const school = planned('school', rectangle(60, 30), 3), floor2 = layoutFloor([rectangle(60, 30)], school, 2, models, dice(7));
  assert.ok(floor2.zones.some((z) => z[0] === 'corridor') && floor2.zones.filter((z) => z[0] === 'classroom').length >= 4);
});

test('every building has its own look, kept with it and used by its rooms', () => {
  const looks = new Set(), p = rectangle(13, 9);
  for (let seed = 0; seed < 40; seed++) {
    const plan = { type: 'home', floors: 2, style: 'modern' };
    plan.core = coreOf([p], plan, models, dice(seed));
    const record = layoutFloor([p], plan, 1, models, dice(hashText(`look${seed}`)));
    looks.add(`${record.look.wall}${plan.look.wood}${plan.look.fabrics}`);
    assert.match(record.look.wall, /^[0-9a-f]{6}$/);
    for (const zone of record.zones) {
      assert.equal(zone[5].wood, plan.look.wood, 'one wood through a house');
      assert.ok(plan.look.fabrics.includes(zone[5].fabric));
    }
    const up = layoutFloor([p], plan, 2, models, dice(9));
    assert.equal(up.look.wall, record.look.wall, 'and the same upstairs');
  }
  assert.equal(looks.size, 40, 'no two alike');
});

test('one room does not use up a floor: a big office floor still furnishes its other rooms', () => {
  const p = rectangle(60, 40), plan = planned('office', p, 3), record = layoutFloor([p], plan, 2, models, dice(3));
  const empty = record.zones.filter((z, i) => (z[3] - z[1]) * (z[4] - z[2]) > 12 && !record.items.some((it) => it[6] === i));
  assert.deepEqual(empty.map((z) => z[0]), []);
});

test('every room can be walked to from the way in without jumping, whatever the furniture', () => {
  for (const [type, w, d] of [['home', 14, 10], ['home', 20, 14], ['office', 36, 24], ['restaurant', 18, 12], ['cafe', 12, 9], ['shop', 14, 10], ['bank', 24, 18], ['hospital', 50, 30], ['library', 30, 20], ['gym', 26, 16], ['bar', 16, 11]]) {
    for (let seed = 0; seed < 8; seed++) {
      const p = rectangle(w, d), plan = { type, floors: 2, style: 'modern' };
      plan.core = coreOf([p], plan, models, dice(seed));
      const record = layoutFloor([p], plan, 1, models, dice(hashText(`walk${type}${seed}`))), frame = frameOf([p], record.axis), { walls, boxes } = solidsOf(record, frame, models);
      const step = 0.2, off = 0.07, blocked = (x, y) => boxes.some((box) => {
        const dx = x - box.x, dy = y - box.y;
        return Math.abs(dx * box.c - dy * box.s) < box.hw + 0.3 && Math.abs(dx * box.s + dy * box.c) < box.hd + 0.3;
      });
      const crosses = (ax, ay, bx, by) => walls.some((s) => {
        const e = (s.bx - s.ax) * (by - ay) - (s.by - s.ay) * (bx - ax);
        if (Math.abs(e) < 1e-9) return false;
        const t = ((ax - s.ax) * (by - ay) - (ay - s.ay) * (bx - ax)) / e, n = ((ax - s.ax) * (s.by - s.ay) - (ay - s.ay) * (s.bx - s.ax)) / e;
        return t >= 0 && t <= 1 && n >= 0 && n <= 1;
      });
      const start = frame.toWorld(...record.entry), key = (i, j) => i * 10000 + j, begin = [Math.round((start.x - off) / step), Math.round((start.y - off) / step)];
      const seen = new Set([key(...begin)]), stack = [begin];
      while (stack.length) {
        const [i, j] = stack.pop(), x = i * step + off, y = j * step + off;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj, nx = ni * step + off, ny = nj * step + off;
          if (seen.has(key(ni, nj)) || nx < 0.3 || ny < 0.3 || nx > w - 0.3 || ny > d - 0.3 || blocked(nx, ny) || crosses(x, y, nx, ny)) continue;
          seen.add(key(ni, nj));
          stack.push([ni, nj]);
        }
      }
      for (const z of record.zones) {
        if (z[0] === 'vault') continue;
        let reached = false;
        for (let u = z[1] + 0.1; u < z[3] && !reached; u += 0.2) for (let v = z[2] + 0.1; v < z[4] && !reached; v += 0.2) {
          const at = frame.toWorld(u, v);
          if (seen.has(key(Math.round((at.x - off) / step), Math.round((at.y - off) / step)))) reached = true;
        }
        assert.ok(reached, `${type} ${w}x${d} seed ${seed}: can't walk to the ${z[0]}`);
      }
    }
  }
});

test('a saved floor survives: it is kept as found, and only ones the game can no longer read are redone', () => {
  const record = lay(SHAPES.house, 3);
  assert.equal(record.v, FLOOR_VERSION);
  assert.equal(upgradeFloor(JSON.parse(JSON.stringify(record))).items.length, record.items.length);
  assert.ok(upgradeFloor({ ...record, v: FLOOR_VERSION + 5 }), 'a later version is fine too');
  assert.equal(upgradeFloor({ ...record, v: 2 }), null);
  assert.equal(upgradeFloor(null), null);
});

test('over the limit, a building someone has done things in keeps its floors longest', () => {
  const items = new Map(), storage = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v), removeItem: (k) => items.delete(k) }, store = new BuildingStore(storage), big = { axis: 0, zones: [], walls: [], items: 'x'.repeat(600000) };
  store.remember('touched', { type: 'home', floors: 1, style: 'cheap', state: { 1: { taken: ['a'], opened: [] } } }, 1);
  store.remember('later', { type: 'home', floors: 1, style: 'cheap' }, 2);
  store.remember('newest', { type: 'home', floors: 1, style: 'cheap' }, 3);
  store.saveFloor('touched', 1, big);
  store.saveFloor('later', 1, big);
  store.saveFloor('newest', 1, big);
  assert.ok(store.floor('touched', 1), 'though it is the oldest');
  assert.equal(store.floor('later', 1), null);
});

test('a mall has a walkway with different shops off it, an airport has security and baggage, and a warehouse loading bays', () => {
  const zones = (type, w, d, floor = 1, floors = 2) => {
    const p = rectangle(w, d), plan = { type, floors, style: 'modern' };
    plan.core = coreOf([p], plan, models, dice(1));
    const record = layoutFloor([p], plan, floor, models, dice(hashText(`second${type}`)));
    return { names: record.zones.map((z) => z[0]), items: record.items.map((i) => i[0]) };
  };
  const mall = zones('mall', 100, 60);
  assert.ok(mall.names.includes('corridor') && mall.names.includes('foodCourt'), mall.names.join());
  assert.ok(new Set(mall.names.filter((n) => ['shopUnit', 'groceryUnit', 'restaurantDining', 'marketHall', 'cafe', 'salonFloor', 'pharmacyFloor', 'bakeryShop', 'fastFoodFloor'].includes(n))).size >= 2, 'not all the same shop');
  const airport = zones('terminal', 200, 80);
  for (const zone of ['checkIn', 'security', 'baggage']) assert.ok(airport.names.includes(zone), airport.names.join());
  assert.ok(airport.items.includes('securityArch') && airport.items.includes('baggageBelt'));
  const shed = zones('warehouse', 100, 60, 1, 1);
  assert.ok(shed.names.includes('loadingBay') && shed.items.includes('rollerDoor') && shed.items.includes('forklift'), shed.names.join());
  assert.ok(zones('supermarket', 50, 35).items.includes('produceStand'));
  assert.ok(zones('museum', 50, 30).items.includes('wallPicture'));
});

test('outside walls have windows facing into the room, on the same side as the wall', () => {
  const p = rectangle(20, 10), place = new Place(ORIGIN);
  place.addTile('t', { buildings: [p], lands: [], waters: [], roads: [] });
  const data = roomMesh(place, p, 0), glass = [];
  for (let i = 0; i < data.length; i += 9) if (Math.abs(data[i + 6] - 0.62) < 0.01 && Math.abs(data[i + 8] - 0.95) < 0.01) glass.push([data[i], data[i + 1], data[i + 2], data[i + 3], data[i + 4]]);
  assert.ok(glass.length >= 6 * 8, `${glass.length} glass vertices`);
  for (const [x, y, z, nx, ny] of glass) {
    assert.ok(z >= 0.9 && z <= 2.4);
    const inward = (x + nx - 10) ** 2 + (y + ny - 5) ** 2 < (x - 10) ** 2 + (y - 5) ** 2;
    assert.ok(inward, 'a window faces the room, or culling would hide it');
    assert.ok(x > 0 && x < 20 && y > 0 && y < 10, `and stands inside the wall, or the wall hides it: ${x}, ${y}`);
  }
});

test('homes come in different shapes, by size and chance, saved in the plan', () => {
  const kinds = {}, sizes = [[9, 7], [14, 10], [22, 14]];
  for (const [w, d] of sizes) {
    for (let seed = 0; seed < 30; seed++) {
      const plan = { type: 'home', floors: 1, style: 'modern' }, p = rectangle(w, d), record = layoutFloor([p], plan, 1, models, dice(hashText(`kind${w}${seed}`)));
      (kinds[w] ||= {})[plan.homeKind] = ((kinds[w] || {})[plan.homeKind] || 0) + 1;
      if (plan.homeKind === 'openPlan') {
        const items = record.items.map((i) => i[0]);
        assert.ok(record.zones.some((z) => z[0] === 'openLiving'), record.zones.map((z) => z[0]).join());
        for (const item of ['stove', 'sofa', 'diningTable']) assert.ok(items.includes(item), `open plan has a ${item}: ${items}`);
      }
    }
  }
  assert.deepEqual(Object.keys(kinds[9]), ['cottage']);
  assert.deepEqual(Object.keys(kinds[22]), ['large']);
  assert.ok(kinds[14].openPlan >= 3 && kinds[14].standard >= 10, JSON.stringify(kinds[14]));
  const big = layoutFloor([rectangle(22, 14)], { type: 'home', floors: 1, style: 'modern' }, 1, models, dice(4));
  assert.ok(big.zones.filter((z) => z[0] === 'bedroom').length >= 2);
});
