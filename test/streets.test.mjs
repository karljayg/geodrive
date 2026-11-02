import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeStreetLabels, shortName } from '../public/js/streets.js';
import { namesFromTile, vectorTileAt } from '../public/js/vector.js';

const DULLES = new Uint8Array(readFileSync(new URL('./fixtures/dulles-14-4667-6264.pbf', import.meta.url)));

// A flat screen: "lat" is y and "lng" is x, in pixels, and every character is 6 px wide.
const options = { w: 300, h: 300, toScreen: (y, x) => [x, y], measure: (text) => text.length * 6 };
const road = (name, points, rank = 5) => ({ name, rank, c: points.flatMap(([x, y]) => [y, x]) });
const across = (name, y, from = 10, to = 290, rank) => road(name, [[from, y], [to, y]], rank);

test('names come from a real tile, on roads the map draws', () => {
  const lines = namesFromTile(DULLES, 4667, 6264);
  const names = new Set(lines.map((line) => line.name));
  assert.ok(names.has('Compass Court'));
  assert.ok(lines.every((line) => line.name && line.rank >= 0 && line.c.length >= 4 && line.c.length % 2 === 0));
  const { x, y } = vectorTileAt(lines[0].c[0], lines[0].c[1]);
  assert.ok(Math.abs(x - 4667) <= 1 && Math.abs(y - 6264) <= 1);
});

test('names shorten to their usual forms, keeping what the street is called', () => {
  assert.equal(shortName('East Service Road'), 'E Service Rd');
  assert.equal(shortName('West Street'), 'West St');
  assert.equal(shortName('Parkway'), 'Parkway');
  assert.equal(shortName('Broadway'), 'Broadway');
});

test('a name goes on a road long enough, and not on one too short', () => {
  const [label] = placeStreetLabels([across('Long Lane', 150)], options);
  assert.equal(label.text, 'Long Lane');
  assert.equal(label.y, 150);
  assert.deepEqual(placeStreetLabels([across('Long Lane', 150, 100, 130)], options), []);
});

test('a name too long in full is shortened to fit, or left off', () => {
  const short = placeStreetLabels([across('Propeller Boulevard', 150, 100, 200)], options);
  assert.equal(short[0].text, 'Propeller Blvd');
  assert.deepEqual(placeStreetLabels([across('Propeller Boulevard', 150, 100, 130)], options), []);
});

test('a name does not go round a corner', () => {
  const bend = road('Bend Road', [[70, 150], [100, 150], [100, 120]]);
  assert.deepEqual(placeStreetLabels([bend], options), []);
  const gentle = road('Bend Road', [[50, 150], [100, 151], [150, 150]]);
  assert.equal(placeStreetLabels([gentle], options).length, 1);
});

test('text is never upside down, whichever way the road was mapped', () => {
  for (const points of [[[10, 150], [290, 150]], [[290, 150], [10, 150]], [[150, 10], [150, 290]], [[150, 290], [150, 10]], [[250, 250], [50, 50]]]) {
    const [label] = placeStreetLabels([road('Some Road', points)], options);
    assert.ok(Math.abs(label.angle) <= Math.PI / 2 + 1e-9, `${points}`);
  }
});

test('names stay on the screen, even for a road running off it', () => {
  const [label] = placeStreetLabels([across('Far Road', 150, -5000, 100)], options);
  assert.ok(label.x - 24 >= 0, 'starts on screen');
  assert.deepEqual(placeStreetLabels([across('Off Road', 900)], options), []);
});

test('labels do not overlap, and bigger roads choose first', () => {
  const small = across('Small Road', 150, 10, 290, 6), big = across('Big Road', 154, 10, 290, 0);
  const labels = placeStreetLabels([small, big], { ...options, w: 120, toScreen: (y, x) => [x * 0.4, y] });
  assert.deepEqual(labels.map((label) => label.text), ['Big Road']);
});

test('names keep clear of what must stay visible', () => {
  const plain = placeStreetLabels([across('Some Road', 150, 120, 200)], options);
  assert.equal(plain.length, 1);
  assert.deepEqual(placeStreetLabels([across('Some Road', 150, 120, 200)], { ...options, avoid: [{ x: 160, y: 150, r: 12 }] }), []);
});

test('a street cut into pieces by tiles is named once', () => {
  const labels = placeStreetLabels([across('Cut Road', 150, 10, 145), across('Cut Road', 150, 155, 290)], options);
  assert.equal(labels.length, 1);
});
