import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadNet, FLAG_BRIDGE, FLAG_MINOR, FLAG_ONEWAY } from '../public/js/road.js';
import { Path } from '../public/js/route.js';
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

test('clearing the network releases everything and it can load again', () => {
  const n = new RoadNet();
  const w = way('c', 0, [1, 2], [[LAT, LNG], [LAT, LNG + E]]);
  n.add([w]);
  n.clear();
  assert.equal(n.ways.size + n.grid.size + n.atNode.size, 0);
  n.add([w]);
  assert.ok(n.match(LAT, LNG + E / 2, 90));
});
