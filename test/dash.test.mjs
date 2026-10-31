import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_PROFILES, profileFor } from '../public/js/cars.js';
import { newGearbox, stepGearbox } from '../public/js/gearbox.js';
import { frequencyText, inBand, organise, parseBand } from '../public/js/radio.js';
import { RoadNet } from '../public/js/road.js';

const MPH = 0.44704;
function drive(car, from, to, seconds = 40, box = newGearbox()) {
  const log = [];
  const steps = seconds * 60;
  for (let i = 0; i <= steps; i++) {
    const mph = from + ((to - from) * i) / steps;
    stepGearbox(box, car, mph * MPH, 1, 1 / 60);
    log.push({ mph, gear: box.gear, rpm: box.rpm });
  }
  return { box, log };
}

test('accelerating goes up through every gear, and the revs drop at each change', () => {
  const car = CAR_PROFILES.sport;
  const { log } = drive(car, 0, 500);
  const gears = [...new Set(log.map((l) => l.gear))];
  assert.deepEqual(gears, [1, 2, 3, 4, 5, 6]);
  for (let g = 2; g <= 6; g++) {
    const i = log.findIndex((l) => l.gear === g);
    const before = log[i - 1].rpm, later = log[i + 40].rpm;
    assert.ok(later < before * 0.95, `revs fall going into gear ${g}`);
  }
  assert.ok(Math.max(...log.map((l) => l.rpm)) <= car.redline);
});

test('slowing down shifts back down, without hunting between gears', () => {
  const car = CAR_PROFILES.sport;
  const { box } = drive(car, 0, 500);
  const { log } = drive(car, 500, 5, 40, box);
  assert.equal(box.gear, 1);
  let changes = 0;
  for (let i = 1; i < log.length; i++) if (log[i].gear !== log[i - 1].gear) changes++;
  assert.equal(changes, 5);
});

test('gear labels: neutral at rest, reverse backwards', () => {
  const car = CAR_PROFILES.sport, box = newGearbox();
  stepGearbox(box, car, 0, 0, 0.1);
  assert.equal(box.label, 'N');
  stepGearbox(box, car, -3, 1, 0.1);
  assert.equal(box.label, 'R');
  stepGearbox(box, car, 3, 1, 0.1);
  assert.equal(box.label, '1');
});

test('an electric car never shifts, and every profile is usable', () => {
  const { log } = drive(CAR_PROFILES.electric, 0, 500);
  assert.equal(new Set(log.map((l) => l.gear)).size, 1);
  assert.equal(profileFor('nonsense'), profileFor('sport'));
  for (const car of Object.values(CAR_PROFILES)) {
    assert.equal(car.gearTops.at(-1), 500, `${car.name} still reaches 500 mph`);
    assert.ok(car.redline > car.idle);
  }
});

test('reads a band and frequency from how a station describes itself', () => {
  assert.deepEqual(parseBand({ name: 'HOT 995 - WIHT-FM 99.5 Washington' }), { band: 'FM', frequency: 99.5 });
  assert.deepEqual(parseBand({ name: 'WBJC 91.5 FM - Baltimore' }), { band: 'FM', frequency: 91.5 });
  assert.deepEqual(parseBand({ name: 'WTOP', tags: 'news,103.5' }), { band: 'FM', frequency: 103.5 });
  assert.deepEqual(parseBand({ name: 'WMAL 630 AM' }), { band: 'AM', frequency: 630 });
  assert.deepEqual(parseBand({ name: 'AM 1390 Talk' }), { band: 'AM', frequency: 1390 });
  assert.deepEqual(parseBand({ name: 'WAMU American University Radio', tags: 'npr' }), { band: 'WEB', frequency: null });
  assert.deepEqual(parseBand({ name: 'WXYZ-FM' }), { band: 'FM', frequency: null });
  assert.deepEqual(parseBand({ name: '181.FM - The Beat', tags: 'hiphop' }), { band: 'WEB', frequency: null });
});

test('keeps playable stations once, nearby ones first, sorted by frequency in a band', () => {
  const station = (id, name, url = 'https://x/' + id) => ({ stationuuid: id, name, url_resolved: url, tags: '' });
  const list = organise([
    [station('a', 'B 101.1 FM'), station('b', 'Blocked 95.5', 'http://x/b')],
    [station('a', 'B 101.1 FM'), station('c', 'A 88.5 FM'), station('d', 'b 101.1 fm')],
  ]);
  assert.deepEqual(list.map((s) => s.id), ['a', 'c']);
  assert.equal(list[0].local, true);
  assert.equal(list[1].local, false);
  assert.deepEqual(inBand(list, 'FM').map((s) => s.frequency), [88.5, 101.1]);
  assert.equal(frequencyText(inBand(list, 'FM')[0]), '88.5 FM');
});

test('a band starts on a nearby station', async () => {
  const stations = organise([[{ stationuuid: 'near', name: 'Near 99.1 FM', url_resolved: 'https://x/n', tags: '' }], [{ stationuuid: 'far', name: 'Far 88.1 FM', url_resolved: 'https://x/f', tags: '' }]]);
  const list = inBand(stations, 'FM');
  assert.equal(list[0].id, 'far', 'the dial stays in frequency order');
  assert.equal(list.find((s) => s.local).id, 'near');
});

test('the nav screen visits each nearby road piece once', () => {
  const net = new RoadNet();
  net.add([{ id: 1, f: 0, n: [1, 2], c: [38.95, -77.45, 38.95, -77.44] }, { id: 2, f: 0, n: [3, 4], c: [39.5, -77.45, 39.5, -77.44] }]);
  const seen = [];
  net.forEachSegmentNear(38.95, -77.445, 1500, (way, i) => seen.push(`${way.id}:${i}`));
  assert.deepEqual(seen, ['1:0']);
});
