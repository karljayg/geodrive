import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeShare, encodeShare, packShare, shareSummary, unpackShare } from '../public/js/share.js';

const defaults = { carScale: 1, carColor: '#bf0d16', hour: 7.75, muted: false, radioStation: { id: 'x' } };
const startA = { label: 'Default', lat: 1, lng: 2, heading: 0 };
const session = {
  pos: { lat: 38.123456789, lng: -77.987654321 }, heading: 123.456, label: 'Home', camIndex: 1, zoom: 2.5, fsdBoost: 10, navRadius: 3000, lane: 0,
  destination: { lat: 39.1, lng: -77.2, label: 'Town Center' }, fsd: true,
  trip: { elapsed: 100, moving: 90, meters: 5000, fsdMeters: 1000, offRoadMeters: 0, fsdSeconds: 50, topSpeed: 60, bridges: 2, takeovers: 1, signals: 3, fuel: 80 },
};
const pack = packShare({ settings: { ...defaults, carColor: '#112233', hour: 20 }, defaults, session, start: { label: 'Mine', lat: 5, lng: 6, heading: 90 }, defaultStart: startA });

test('a drive survives the round trip through a link', async () => {
  const code = await encodeShare(pack);
  assert.match(code, /^[\w-]+$/, 'safe in a URL');
  const out = await decodeShare(code);
  assert.deepEqual(out.settings, { carColor: '#112233', hour: 20 });
  assert.equal(out.session.pos.lat, 38.12346);
  assert.equal(out.session.destination.label, 'Town Center');
  assert.equal(out.session.fsd, true);
  assert.equal(out.session.trip.fuel, 80);
  assert.equal(out.session.navRadius, 3000);
  assert.equal(out.start.label, 'Mine');
});

test('only differences from the defaults go in', () => {
  assert.deepEqual(Object.keys(pack.s).sort(), ['carColor', 'hour']);
  const plain = packShare({ settings: defaults, defaults, session: { ...session, destination: null }, start: startA, defaultStart: startA });
  assert.equal(plain.s, undefined);
  assert.equal(plain.o, undefined);
  assert.equal(plain.d, undefined);
});

test('a hostile or damaged link is cleaned or refused', async () => {
  assert.equal(await decodeShare('not-a-real-link'), null);
  assert.equal(unpackShare({ p: [999, 0] }), null);
  assert.equal(unpackShare({}), null);
  const out = unpackShare({
    p: [1, 2, 'x'], l: '<img src=x>'.repeat(50), c: 99, z: 1e9, n: 7,
    s: { evil: 1, masterVolume: 50, carColor: 'red;', carProfile: 'tank', muted: 'yes', radioStation: { id: 'a', url: 'http://x' }, hour: 30 },
    d: [1000, 2, 'x'], f: 1, t: ['a', -5],
  });
  assert.deepEqual(out.settings, { masterVolume: 1, hour: 24 });
  assert.equal(out.session.heading, 0);
  assert.equal(out.session.camIndex, 2);
  assert.equal(out.session.zoom, 8);
  assert.equal(out.session.navRadius, 1500);
  assert.equal(out.session.destination, null);
  assert.equal(out.session.fsd, false);
  assert.ok(out.session.label.length <= 200);
  assert.equal(out.session.trip.moving, 0);
});

test('the dialog says what a link will do', () => {
  const helpers = { carName: (id) => `car ${id}`, clock: (h) => `${h}h` };
  const base = { carProfile: 'sport', hour: 8, radioOn: true, muted: false, radioVolume: 0.5, masterVolume: 0.8, radioStation: { name: 'HOT 99.5' } };
  const shared = unpackShare({ p: [1, 2, 3], l: 'Home', d: [3, 4, 'Mall'], f: 1, t: [10, 10, 1609.344, 0, 0, 0, 44.704], s: { hour: 20 } });
  const rows = Object.fromEntries(shareSummary(shared, base, helpers));
  assert.equal(rows.Location, 'Home');
  assert.match(rows.Destination, /Mall.*FSD/);
  assert.equal(rows['Time of day'], '20h');
  assert.match(rows['Trip so far'], /1\.0 mi.*100 mph/);
  assert.match(rows.Radio, /HOT 99\.5.*Music starts.*40%/);
  assert.match(Object.fromEntries(shareSummary(shared, { ...base, radioOn: false }, helpers)).Radio, /^Off/);
  assert.match(Object.fromEntries(shareSummary(shared, { ...base, muted: true }, helpers)).Radio, /muted/);
});

test('the map settings travel in a link, kept to what the slider allows', () => {
  const carry = (mapScale, mapLabels) => unpackShare(JSON.parse(JSON.stringify(packShare({ settings: { ...defaults, mapScale, mapLabels }, defaults: { ...defaults, mapScale: 0.8, mapLabels: true }, session, start: startA, defaultStart: startA })))).settings;
  assert.deepEqual([carry(0.6, false).mapScale, carry(0.6, false).mapLabels], [0.6, false]);
  assert.equal(carry(0, true).mapScale, 0.5, 'never zero, which would hide the map');
});
