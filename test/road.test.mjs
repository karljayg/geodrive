import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadNet, FLAG_BRIDGE, FLAG_MINOR, FLAG_ONEWAY } from '../public/js/road.js';
import { Path, brakeFor, pursuitYaw, rerouteWait } from '../public/js/route.js';
import { Terrain, heightFromPixel, heightsFromPixels, sampleHeights, tilePoint } from '../public/js/terrain.js';
import { CAR, newCar, stepCar } from '../public/js/physics.js';
import { RoadTiles } from '../public/js/tiles.js';
import { readLayer, roadsFromTile, vectorTileAt } from '../public/js/vector.js';

// A road running east, a bridge continuing it, a sharp side road and a parallel one-way road just north.
const LAT = 38.95, LNG = -77.45, E = 0.001; // E is about 87 m east, or 111 m north
const net = new RoadNet();
const way = (id, f, n, pts) => ({ id, f, n, c: pts.flat() });
net.add([
  way(1, 0, [1, 2, 3], [[LAT, LNG], [LAT, LNG + E], [LAT, LNG + 2 * E]]),
  way(2, FLAG_BRIDGE, [3, 4], [[LAT, LNG + 2 * E], [LAT + 0.0001, LNG + 3 * E]]),
  way(3, 0, [3, 5], [[LAT, LNG + 2 * E], [LAT + E, LNG + 2 * E]]),
  way(4, FLAG_ONEWAY, [6, 7], [[LAT + 0.0002, LNG + E], [LAT + 0.0002, LNG]]),
]);

test('finds the road the car is on, in the direction it is going', () => {
  const m = net.match(LAT + 0.00005, LNG + E / 2, 90);
  assert.equal(m.way.id, 1);
  assert.equal(m.dir, 1);
  assert.ok(m.dist < 10);
  const back = net.match(LAT + 0.00005, LNG + E / 2, 270);
  assert.equal(back.way.id, 1);
  assert.equal(back.dir, -1);
});

test('ignores crossing roads, far roads and one-way roads against the car', () => {
  assert.equal(net.match(LAT + E / 2, LNG + 2 * E, 90), null); // beside the side road, at right angles to it
  assert.equal(net.match(LAT + 0.01, LNG, 90), null);
  const m = net.match(LAT + 0.00018, LNG + E / 2, 90); // beside the one-way, driving against it
  assert.equal(m.way.id, 1);
});

test('looks ahead along the road and on to the straightest connecting way', () => {
  const m = net.match(LAT, LNG + 1.5 * E, 90);
  const a = net.ahead(m, 120);
  assert.ok(a.ways.has(net.ways.get(2)), 'crossed on to the bridge');
  assert.ok(!a.ways.has(net.ways.get(3)), 'did not take the side road');
  assert.ok(a.lng > LNG + 2 * E);
});

test('stops at a dead end', () => {
  const m = net.match(LAT, LNG + 2.8 * E, 85);
  const a = net.ahead(m, 5000);
  assert.ok(Math.abs(a.lng - (LNG + 3 * E)) < 1e-6);
});

test('a bridge is noticed even when the match prefers the road it expected next', () => {
  assert.equal(net.bridgeAt(LAT + 0.00005, LNG + 2.5 * E, 85), true, 'on it');
  assert.equal(net.bridgeAt(LAT + 0.00005, LNG + 2.5 * E, 265), true, 'the other way along it');
  assert.equal(net.bridgeAt(LAT + 0.00005, LNG + 2.5 * E, 0), false, 'crossing under it');
  assert.equal(net.bridgeAt(LAT + 0.01, LNG + 2.5 * E, 85), false, 'far off');
  assert.equal(net.bridgeAt(LAT, LNG + E, 90), false, 'on the road before it');
});

test('reports bridges, so the car can be put on top of them', () => {
  assert.equal(net.match(LAT, LNG + E, 90).bridge, false);
  assert.equal(net.match(LAT + 0.00005, LNG + 2.5 * E, 85).bridge, true);
});

test('recently followed roads win where two are close together', () => {
  const near = new RoadNet();
  near.add([way(1, 0, [1, 2], [[LAT, LNG], [LAT, LNG + E]]), way(2, 0, [3, 4], [[LAT + 0.0001, LNG], [LAT + 0.0001, LNG + E]])]);
  const atMiddle = LAT + 0.00006; // nearer road 2
  assert.equal(near.match(atMiddle, LNG + E / 2, 90).way.id, 2);
  assert.equal(near.match(atMiddle, LNG + E / 2, 90, new Set([near.ways.get(1)])).way.id, 1);
});

test('places a car at the nearest road, heading along it', () => {
  const p = net.nearest(LAT - 0.0005, LNG + E / 2, 80);
  assert.ok(Math.abs(p.lat - LAT) < 1e-6);
  assert.ok(Math.abs(p.heading - 90) < 1);
  assert.ok(Math.abs(net.nearest(LAT - 0.0005, LNG + E / 2, 260).heading - 270) < 1);
  assert.equal(net.nearest(LAT + 1, LNG, null, 3000), null);
});

test('one way added twice from two tiles counts once', () => {
  const n = new RoadNet();
  const w = way(9, 0, [1, 2], [[LAT, LNG], [LAT, LNG + E]]);
  n.add([w]); n.add([{ ...w }]);
  assert.equal(n.ways.size, 1);
  assert.equal(n.atNode.get(1).length, 1);
});

test('the look-ahead carries over a road cut at a tile edge', () => {
  const n = new RoadNet();
  n.add([way('a', 0, ['a1', 'a2'], [[LAT, LNG], [LAT, LNG + E]]), way('b', 0, ['b1', 'b2'], [[LAT, LNG + 0.9 * E], [LAT, LNG + 2 * E]])]);
  const a = n.ahead(n.match(LAT, LNG + 0.5 * E, 90, new Set([n.ways.get('a')])), 120);
  assert.ok(a.ways.has(n.ways.get('b')));
  assert.ok(a.lng > LNG + E);
});

// A minimal vector tile: a transportation layer with a bridge (one-way against its drawn direction) and a footpath.
function encodeTile() {
  const varint = (v) => { const o = []; while (v > 127) { o.push((v & 127) | 128); v = Math.floor(v / 128); } o.push(v); return o; };
  const field = (n, bytes) => [...varint((n << 3) | 2), ...varint(bytes.length), ...bytes];
  const num = (n, v) => [...varint(n << 3), ...varint(v)];
  const text = (s) => [...new TextEncoder().encode(s)];
  const zig = (v) => (v < 0 ? -v * 2 - 1 : v * 2);
  const line = (x0, y0, x1, y1) => [9, zig(x0), zig(y0), 10, zig(x1 - x0), zig(y1 - y0)].flatMap(varint);
  const layer = [
    ...field(1, text('transportation')),
    ...field(2, [...num(1, 1), ...field(2, [0, 0, 1, 1, 2, 3].flatMap(varint)), ...num(3, 2), ...field(4, line(0, 2048, 4096, 2048))]),
    ...field(2, [...num(1, 2), ...field(2, [0, 2].flatMap(varint)), ...num(3, 2), ...field(4, line(0, 0, 100, 100))]),
    ...field(3, text('class')), ...field(3, text('brunnel')), ...field(3, text('oneway')),
    ...field(4, field(1, text('primary'))), ...field(4, field(1, text('bridge'))), ...field(4, field(1, text('path'))),
    ...field(4, num(6, zig(-1))),
    ...num(5, 4096),
  ];
  return new Uint8Array(field(3, layer));
}

test('reads roads out of a vector tile', () => {
  const bytes = encodeTile();
  const { x, y } = vectorTileAt(LAT, LNG);
  assert.equal(readLayer(bytes, 'transportation').features.length, 2);
  assert.equal(readLayer(bytes, 'water'), null);
  const ways = roadsFromTile(bytes, x, y);
  assert.equal(ways.length, 1, 'the footpath is dropped');
  assert.equal(ways[0].f, FLAG_BRIDGE | FLAG_ONEWAY);
  assert.ok(ways[0].c[1] > ways[0].c[3], 'oneway -1 is reversed, so it runs west');
  assert.ok(Math.abs(ways[0].c[0] - LAT) < 0.02 && Math.abs(ways[0].c[1] - LNG) < 0.03, 'in the right place');
});

// A straight road east with a service road off to the right, then a left and a right street at one crossing.
const STREET = new RoadNet();
STREET.add([
  way('main', 0, [1, 2, 3, 4], [[LAT, LNG], [LAT, LNG + E], [LAT, LNG + 2 * E], [LAT, LNG + 3 * E]]),
  way('alley', FLAG_MINOR, [2, 5], [[LAT, LNG + E], [LAT - E, LNG + E]]),
  way('north', 0, [3, 6], [[LAT, LNG + 2 * E], [LAT + E, LNG + 2 * E]]),
  way('south', 0, [3, 7], [[LAT, LNG + 2 * E], [LAT - E, LNG + 2 * E]]),
  way('wrongway', FLAG_ONEWAY, [8, 4], [[LAT + E, LNG + 3 * E], [LAT, LNG + 3 * E]]),
]);

test('a signal finds the next real road on that side, not an alley', () => {
  const m = STREET.match(LAT, LNG + 0.2 * E, 90);
  const right = STREET.findTurn(m, 1, 1000);
  assert.ok(Math.abs(right.at - 1.8 * 87) < 15, 'turns at the crossing, past the alley');
  const end = right.points.at(-1);
  assert.ok(end.lat < LAT - E / 2, 'and goes south');
  const left = STREET.findTurn(m, -1, 1000);
  assert.ok(left.points.at(-1).lat > LAT + E / 2, 'left goes north');
});

test('a signal leaves room to brake and ignores turns out of reach or the wrong way down a one-way', () => {
  const m = STREET.match(LAT, LNG + 0.2 * E, 90);
  assert.equal(STREET.findTurn(m, 1, 100), null, 'too far off');
  const late = STREET.match(LAT, LNG + 2.2 * E, 90);
  assert.equal(STREET.findTurn(late, -1, 1000), null, 'the one-way points at us');
  assert.equal(STREET.findTurn(m, 1, 1000, 500), null, 'nothing past the minimum distance');
});

test('a path slows for a corner, early enough to make it, and can stop at its end', () => {
  const corner = new Path([{ lat: LAT, lng: LNG }, { lat: LAT, lng: LNG + 10 * E }, { lat: LAT + 10 * E, lng: LNG + 10 * E }], { stopAtEnd: true, decel: 12 });
  const at = (m) => corner.limitAt(corner.indexAt(m));
  const straight = 870;
  assert.ok(corner.length > 1900);
  assert.ok(at(straight) < 20, 'slow at the corner');
  assert.ok(at(straight - 300) > 60, 'fast well before it');
  const v = at(straight - 100), allowed = Math.sqrt(at(straight) ** 2 + 2 * 12 * 100);
  assert.ok(v <= allowed + 2, 'braking distance respected');
  assert.equal(corner.limitAt(corner.points.length - 1), 0);
  assert.ok(at(corner.length - 500) > 60);
});

const rad = (d) => (d * Math.PI) / 180;

// Drives a path the way FSD does and reports the fastest it took the corner and how far it strayed from the line.
function drive(path, startSpeed, cruise = Infinity) {
  const dt = 1 / 60, car = newCar(), pos = { lat: path.points[0].lat, lng: path.points[0].lng };
  car.speed = startSpeed;
  car.heading = path.pointAt(1).bearing;
  let index = null, stray = 0, overLimit = 0, peakYaw = 0, along = 0;
  for (let t = 0; t < 120 && along < path.length - 10; t += dt) {
    const at = path.locate(pos.lat, pos.lng, index);
    index = at.index; along = at.along;
    const on = path.pointAt(along);
    stray = Math.max(stray, Math.hypot((pos.lat - on.lat) * 111320, (pos.lng - on.lng) * 111320 * Math.cos((pos.lat * Math.PI) / 180)));
    const target = Math.min(path.targetAt(along, car.speed), cruise);
    const brake = brakeFor(car.speed, target);
    stepCar(car, { throttle: Math.max(0, Math.min(1, (target - car.speed) / 3)), brake }, dt);
    if (path.points[index].radius !== undefined && path.cum[index] >= along) overLimit = Math.max(overLimit, car.speed - path.limitAt(index));
    const aim = path.pointAt(along + Math.max(6, car.speed * 0.45));
    const dx = (aim.lng - pos.lng) * Math.cos((pos.lat * Math.PI) / 180), dy = aim.lat - pos.lat;
    const error = (((Math.atan2(dx, dy) * 180) / Math.PI - car.heading + 540) % 360) - 180;
    const yaw = Math.max(-1.6, Math.min(1.6, pursuitYaw(car.speed, error, Math.hypot(dx, dy) * 111320)));
    peakYaw = Math.max(peakYaw, Math.abs(yaw));
    car.heading = (car.heading + (yaw * dt * 180) / Math.PI + 360) % 360;
    const m = car.speed * dt, h = (car.heading * Math.PI) / 180;
    pos.lat += (m * Math.cos(h)) / 111320;
    pos.lng += (m * Math.sin(h)) / (111320 * Math.cos((pos.lat * Math.PI) / 180));
  }
  return { stray, overLimit, peakYaw, along };
}

test('a 90 degree corner becomes an arc that clips the apex, and FSD takes it at any approach speed', () => {
  const corner = () => new Path([{ lat: LAT, lng: LNG }, { lat: LAT, lng: LNG + 10 * E }, { lat: LAT - 10 * E, lng: LNG + 10 * E }], { decel: 8 });
  const path = corner();
  const apex = Math.min(...path.points.map((p) => Math.hypot((p.lat - LAT) * 111320, (p.lng - (LNG + 10 * E)) * 111320 * Math.cos((LAT * Math.PI) / 180))));
  assert.ok(apex > 4 && apex < 6, `apex ${apex} m inside the corner`);
  const slowest = Math.min(...path.limit);
  assert.ok(slowest > 7 && slowest < 12, `corner speed ${slowest} m/s`);
  for (const speed of [10, 25, 45, 90]) {
    const run = drive(corner(), speed);
    assert.ok(run.along > 1800, `finished at ${speed} m/s`);
    assert.ok(run.stray < 3, `strayed ${run.stray} m at ${speed} m/s`);
    assert.ok(run.overLimit < 1.5, `${run.overLimit} m/s over the plan at ${speed} m/s`);
  }
});

test('a corner drawn as several short pieces rounds as one, and gentle bends are not slowed', () => {
  const m = 1 / 111320, c = Math.cos((LAT * Math.PI) / 180);
  const pts = [[0, 0], [0, 200], [-1, 203], [-3, 205], [-6, 206], [-200, 206]].map(([n, e]) => ({ lat: LAT + n * m, lng: LNG + (e * m) / c }));
  const path = new Path(pts, { decel: 8 });
  assert.ok(Math.min(...path.limit) > 7, 'one corner, not several tight ones');
  assert.ok(drive(path, 25).stray < 3);
  const bend = [];
  for (let a = 0; a <= 60; a += 5) bend.push({ lat: LAT + (300 * Math.cos(rad(a)) - 300) * m, lng: LNG + (300 * Math.sin(rad(a)) * m) / c });
  assert.ok(Math.min(...new Path(bend).limit) > 40, 'a 300 m bend is taken quickly');
});

test('a change of cruise speed survives on a straight line', () => {
  const line = new Path([{ lat: LAT, lng: LNG, cruise: 10 }, { lat: LAT, lng: LNG + 5 * E, cruise: 10 }, { lat: LAT, lng: LNG + 10 * E, cruise: 30 }]);
  assert.equal(line.cruiseAt(line.indexAt(100)), 10);
  assert.equal(line.cruiseAt(line.indexAt(700)), 30);
});

test('a path finds the car on it, searching forward, and gives points along it', () => {
  const line = new Path([{ lat: LAT, lng: LNG, cruise: 20 }, { lat: LAT, lng: LNG + 10 * E, cruise: 20 }]);
  const a = line.locate(LAT + 0.0001, LNG + 5 * E);
  assert.ok(Math.abs(a.along - 435) < 15);
  assert.ok(a.dist < 15);
  const p = line.pointAt(100);
  assert.ok(Math.abs(p.bearing - 90) < 1);
  assert.ok(Math.abs(p.lng - (LNG + (100 / 87) * E)) < 2e-4);
  assert.equal(line.cruiseAt(a.index), 20);
  assert.equal(line.limitAt(a.index) > 100, true, 'straight lines are not limited');
});

test('a side street counts even without a shared point on the straight road', () => {
  const n = new RoadNet();
  n.add([
    way('straight', FLAG_ONEWAY, [1, 2], [[LAT, LNG], [LAT, LNG + 5 * E]]), // no vertex where the street meets it
    way('street', 0, [3, 4], [[LAT, LNG + 2 * E], [LAT - E, LNG + 2 * E]]),
  ]);
  const found = n.findTurn(n.match(LAT, LNG + 0.1 * E, 90), 1, 1000);
  assert.ok(found, 'found the junction');
  assert.ok(found.points.at(-1).lat < LAT - E / 2);
  assert.equal(n.findTurn(n.match(LAT, LNG + 0.1 * E, 90), -1, 1000), null, 'and nothing on the left');
});

test('a released road can load again', () => {
  const n = new RoadNet();
  const w = way('c', 0, [1, 2], [[LAT, LNG], [LAT, LNG + E]]);
  n.add([w]);
  n.remove([w]);
  assert.equal(n.ways.size + n.grid.size + n.atNode.size, 0);
  n.add([w]);
  assert.ok(n.match(LAT, LNG + E / 2, 90));
});

test('tiles: over the limit, the furthest go first and wanted ones stay', () => {
  const n = new RoadNet();
  const tiles = new RoadTiles(n);
  const here = vectorTileAt(LAT, LNG);
  const add = (x, y) => {
    const key = `${x}_${y}`, ways = [way(key, 0, [`${key}a`, `${key}b`], [[LAT + y, LNG + x], [LAT + y, LNG + x + E]])];
    n.add(ways);
    tiles.waysOf.set(key, ways);
    tiles.loaded.add(key);
    return key;
  };
  for (let i = 0; i < 60; i++) add(here.x + i, here.y);
  tiles.evict(LAT, LNG, new Set());
  assert.equal(tiles.loaded.size, 60, 'nothing released at the limit');
  const furthestWanted = add(here.x + 500, here.y), furthest = add(here.x + 400, here.y);
  tiles.evict(LAT, LNG, new Set([furthestWanted]));
  assert.equal(tiles.loaded.size, 60);
  assert.equal(tiles.loaded.has(furthest), false);
  assert.equal(n.ways.has(furthest), false);
  assert.equal(tiles.waysOf.has(furthest), false);
  assert.equal(tiles.loaded.has(furthestWanted), true);
  assert.equal(tiles.loaded.has(`${here.x + 59}_${here.y}`), false, 'then the next furthest');
});

test('a route far too long to recurse over still builds', () => {
  const points = [];
  for (let i = 0; i < 200000; i++) points.push({ lat: LAT + i * 0.0001, lng: LNG + (i % 2) * 0.001, cruise: 20 + (i % 3) });
  assert.ok(new Path(points, { stopAtEnd: true }).length > 0);
});

test('the point repeated between two route steps keeps its corner', () => {
  const steps = [{ lat: LAT, lng: LNG, cruise: 10 }, { lat: LAT + E, lng: LNG, cruise: 10 }, { lat: LAT + E, lng: LNG, cruise: 20 }, { lat: LAT + E, lng: LNG + E, cruise: 20 }];
  const path = new Path(steps);
  assert.ok(path.points.some((p) => p.radius !== undefined), 'the corner became an arc');
  assert.ok(path.points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)));
});

test('roads: a released tile leaves nothing behind, and the others keep working', () => {
  const net = new RoadNet();
  const a = [{ id: 'a', f: 0, n: ['1', 'j'], c: [40, -74, 40.01, -74] }];
  const b = [{ id: 'b', f: 0, n: ['j', '2'], c: [40.01, -74, 40.02, -74] }];
  net.add(a);
  net.add(b);
  const changes = net.changes;
  net.remove(a);
  assert.ok(net.changes > changes, 'whatever draws roads can tell');
  assert.equal(net.ways.has('a'), false);
  assert.equal(net.atNode.has('1'), false);
  assert.deepEqual(net.atNode.get('j').map((e) => e.way.id), ['b']);
  assert.equal(net.match(40.005, -74, 0), null);
  assert.equal(net.match(40.015, -74, 0).way.id, 'b');
  for (const entries of net.grid.values()) assert.ok(entries.every((e) => e.way.id === 'b'));
  net.remove(a); // already gone
  net.remove(b);
  assert.equal(net.grid.size, 0);
  assert.equal(net.atNode.size, 0);
});

test('roads: a way that visits a node twice, like a roundabout, can be released', () => {
  const net = new RoadNet();
  const loop = { id: 'loop', f: 0, n: ['1', '2', '3', '1'], c: [40, -74, 40.001, -74, 40.001, -73.999, 40, -74] };
  net.add([loop]);
  net.remove([loop]);
  assert.equal(net.ways.size + net.grid.size + net.atNode.size, 0);
});

test('roads: ways near a point, for the nav screen', () => {
  const net = new RoadNet();
  net.add([
    { id: 'near', f: 0, n: ['1', '2'], c: [40, -74, 40.001, -74] },
    { id: 'crossing', f: 0, n: ['3', '4'], c: [39.9, -74, 40.1, -74] },
    { id: 'far', f: 0, n: ['5', '6'], c: [41, -74, 41.001, -74] },
  ]);
  const found = [];
  net.forEachWayNear(40, -74, 500, (way) => found.push(way.id));
  assert.deepEqual(found.sort(), ['crossing', 'near']);
});

test('route: the line drawn on the map is short and light, and still follows the corners', () => {
  const points = [];
  for (let i = 0; i <= 400; i++) points.push({ lat: 40 + i * 0.0005, lng: -74 });
  for (let i = 1; i <= 400; i++) points.push({ lat: 40.2, lng: -74 + i * 0.0005 });
  const path = new Path(points);
  const line = path.lineAhead(0, 8000);
  assert.ok(line.length < path.points.length / 4, `${line.length} of ${path.points.length}`);
  assert.deepEqual(line[0], { lat: path.points[0].lat, lng: path.points[0].lng });
  const metres = (p, q) => Math.hypot((q.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180), q.lat - p.lat) * 111320;
  for (let i = 1; i < line.length; i++) assert.ok(metres(line[i - 1], line[i]) < 60, 'no long chord cuts a corner');
  const offCorner = Math.min(...path.lineAhead(0, 30000).map((p) => metres(p, { lat: 40.2, lng: -74 })));
  assert.ok(offCorner < 10, `passes the corner within ${offCorner} m`);
  assert.ok(line.length < path.lineAhead(0, 30000).length / 2, 'and only the stretch asked for');
  assert.equal(path.lineAhead(path.points.length - 1, 8000).length, 1);
  const all = path.lineAhead(0, Infinity), end = path.points[path.points.length - 1];
  assert.deepEqual(all[all.length - 1], { lat: end.lat, lng: end.lng }, 'the line reaches the destination');
});

test('new routes back off when the car keeps leaving them', () => {
  assert.deepEqual([0, 1, 2, 3].map(rerouteWait), [8000, 16000, 32000, 64000]);
  assert.equal(rerouteWait(50), 300000, 'never less than one every 5 minutes');
});

test('terrain: heights from tile colours and between pixels', () => {
  assert.equal(heightFromPixel(128, 0, 0), 0);
  assert.equal(heightFromPixel(128, 88, 128), 88.5);
  assert.equal(heightFromPixel(127, 255, 0), -1);
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) pixels.set([128, x < 128 ? 100 : 200, 0, 255], (y * 256 + x) * 4);
  const heights = heightsFromPixels(pixels);
  assert.equal(sampleHeights(heights, 10, 10), 100);
  assert.equal(sampleHeights(heights, 128, 10), 150, 'halfway between two pixels');
  assert.equal(sampleHeights(heights, 255.9, 255.9), 200, 'the far edge stays in the tile');
  const { x, y, px, py } = tilePoint(38.9555, -77.4475);
  assert.deepEqual([x, y], [1166, 1566]);
  assert.ok(px >= 0 && px < 256 && py >= 0 && py < 256);
});

test('terrain: a tile is loaded once, and a failure is tolerated and retried later', async () => {
  let loads = 0, fail = true;
  const heights = new Float32Array(256 * 256).fill(42);
  const terrain = new Terrain(async () => {
    loads++;
    if (fail) throw new Error('no');
    return heights;
  });
  const warn = console.warn;
  console.warn = () => {};
  assert.equal(await terrain.heightAt(40, -74), null);
  assert.equal(await terrain.heightAt(40, -74), null);
  assert.equal(loads, 1, 'not asked again straight after failing');
  console.warn = warn;
  terrain.failedAt.clear();
  fail = false;
  assert.deepEqual(await Promise.all([terrain.heightAt(40, -74), terrain.heightAt(40.001, -74)]), [42, 42]);
  assert.equal(loads, 2, 'shared while loading');
  assert.equal(await terrain.heightAt(40, -74), 42);
  assert.equal(loads, 2);
  for (let i = 0; i < 12; i++) await terrain.heightAt(40, -74 + 0.1 * (i + 1));
  assert.ok(terrain.tiles.size <= 12, 'old tiles are released');
});
