import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, PerfLog } from '../public/js/perflog.js';
import { placeFrom, townFrom } from '../public/js/town.js';

const memoryStore = () => {
  const items = new Map();
  return { items, getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, String(v)), removeItem: (k) => items.delete(k) };
};
const column = (row, name) => row[COLUMNS.indexOf(name)];

function fiveSeconds(log, from, gap = 20, js = 3) {
  let t = from;
  for (; t - from <= 5000; t += gap) log.frame(t, js);
  log.sample(t - gap, { lat: 40.12345678, lng: -74.5, mph: 60 });
  return t;
}

test('log: a row holds frame rate, slow frames and our own share of the frame', () => {
  const log = new PerfLog(memoryStore());
  log.frame(1000, 2);
  assert.equal(log.due(1000), false);
  log.frame(1060, 4);
  log.frame(1180, 6);
  log.spend('drive', 3);
  log.spend('nav', 9);
  log.spend('nav', 5);
  log.count('mapRequests', 7);
  assert.equal(log.due(6000), true);
  const row = log.sample(6180, { lat: 40.12345678, lng: -74.5, mph: 61.27, ways: 900 });
  assert.equal(column(row, 'fps'), 0.6);
  assert.equal(column(row, 'slowest'), 120);
  assert.equal(column(row, 'over50'), 2);
  assert.equal(column(row, 'over100'), 1);
  assert.equal(column(row, 'jsAvg'), 4);
  assert.equal(column(row, 'jsMax'), 6);
  assert.equal(column(row, 'driveMs'), 1);
  assert.equal(column(row, 'navWorst'), 9);
  assert.equal(column(row, 'mapRequests'), 7);
  assert.equal(column(row, 'lat'), 40.12346);
  assert.equal(column(row, 'mph'), 61.3);
  assert.equal(column(row, 'ways'), 900);
  assert.equal(row.length, COLUMNS.length);
  assert.equal(log.frames, 0, 'each row starts counting afresh');
});

test('log: session API totals survive each sample row', () => {
  const log = new PerfLog(memoryStore());
  log.count('geocodes', 2);
  log.count('routes', 1);
  log.sample(6000, { mph: 0 });
  log.count('elevations', 1);
  assert.equal(log.totals.geocodes, 2);
  assert.equal(log.totals.routes, 1);
  assert.equal(log.totals.elevations, 1);
  assert.equal(log.billedTotal(), 4);
  assert.equal(log.apiSummaryKey(), 'geocodes:2|routes:1|elevations:1|mapRequests:0|roadRequests:0');
});

test('log: survives a refresh, and clears once sent', () => {
  const store = memoryStore();
  const before = new PerfLog(store);
  let t = 1000;
  for (let i = 0; i < 15; i++) t = fiveSeconds(before, t);
  before.event('town', 'Newark, NJ');
  before.flush();

  const after = new PerfLog(store);
  t = fiveSeconds(after, 1000);
  after.event('load');
  const report = after.report({ gpu: 'x' });
  assert.equal(report.rows.length, 16);
  assert.deepEqual(report.columns, COLUMNS);
  assert.equal(report.meta.gpu, 'x');
  assert.deepEqual(report.events.map((e) => e[1]), ['town', 'load']);

  after.clear();
  assert.equal(after.report({}).rows.length, 0);
  fiveSeconds(after, t);
  assert.equal(new PerfLog(store).report({}).rows.length, 0, 'an unsaved row is only held in memory');
  assert.equal(after.report({}).rows.length, 1);
});

test('log: keeps only the newest hours, and only writes the chunk being filled', () => {
  const store = memoryStore();
  const log = new PerfLog(store);
  let writes = 0;
  const { setItem } = store;
  store.setItem = (k, v) => { writes++; setItem(k, v); };
  let t = 1000;
  for (let i = 0; i < 12; i++) t = fiveSeconds(log, t);
  assert.ok(writes <= 2, 'a minute of rows is written once');
  for (let i = 0; i < 12 * 310; i++) {
    log.sample((t += 5000), { lat: 1, lng: 1 });
  }
  const report = log.report({});
  assert.ok(report.rows.length <= 12 * 301 && report.rows.length >= 12 * 299, String(report.rows.length));
  assert.ok(store.items.size <= 302);
});

test('log: a full browser store drops the oldest rows rather than failing', () => {
  const store = memoryStore();
  const log = new PerfLog(store);
  let t = 1000;
  for (let i = 0; i < 12 * 20; i++) log.sample((t += 5000), { lat: 1, lng: 1 });
  const { setItem } = store;
  store.setItem = (k, v) => {
    if (store.items.size > 10 && k.match(/_\d+$/)) throw new Error('quota');
    setItem(k, v);
  };
  for (let i = 0; i < 12; i++) log.sample((t += 5000), { lat: 1, lng: 1 });
  const rows = log.report({}).rows;
  assert.ok(rows.length > 0 && rows.length < 12 * 21, String(rows.length));
});

test('log: a damaged chunk loses that minute, not the log', () => {
  const store = memoryStore();
  const log = new PerfLog(store);
  let t = 1000;
  for (let i = 0; i < 24; i++) log.sample((t += 5000), { lat: 1, lng: 1 });
  store.setItem('geodrive_log_v1_0', '{broken');
  const warn = console.warn;
  console.warn = () => {};
  assert.equal(log.report({}).rows.length, 12);
  console.warn = warn;
});

const part = (long_name, short_name, ...types) => ({ long_name, short_name, types });

test('town: the place name and state from a reverse geocode', () => {
  const state = part('New Jersey', 'NJ', 'administrative_area_level_1');
  const results = [
    { address_components: [part('123', '123', 'street_number'), part('Broad St', 'Broad St', 'route'), part('Downtown', 'Downtown', 'neighborhood'), part('Newark', 'Newark', 'locality'), part('Essex County', 'Essex County', 'administrative_area_level_2'), state] },
    { address_components: [part('Other', 'Other', 'locality'), state] },
  ];
  assert.equal(townFrom(results), 'Newark, NJ');
});

test('town: falls back to a township, then a county, and to nothing', () => {
  const state = part('Virginia', 'VA', 'administrative_area_level_1');
  assert.equal(townFrom([{ address_components: [part('Dranesville', 'Dranesville', 'administrative_area_level_3'), part('Fairfax County', 'Fairfax County', 'administrative_area_level_2'), state] }]), 'Dranesville, VA');
  assert.equal(townFrom([{ address_components: [part('Fairfax County', 'Fairfax County', 'administrative_area_level_2'), state] }]), 'Fairfax County, VA');
  assert.equal(townFrom([{ address_components: [state] }]), null);
  assert.equal(townFrom([]), null);
  assert.equal(townFrom(undefined), null);
});

test('place: the town plus what the radio search needs', () => {
  const results = [{ address_components: [part('Newark', 'Newark', 'locality'), part('New Jersey', 'NJ', 'administrative_area_level_1'), part('United States', 'US', 'country')] }];
  assert.deepEqual(placeFrom(results), { town: 'Newark, NJ', state: 'New Jersey', country: 'US' });
  assert.deepEqual(placeFrom([]), { town: null, state: null, country: null });
});
