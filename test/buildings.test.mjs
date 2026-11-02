import test from 'node:test';
import assert from 'node:assert/strict';
import { BuildingStore, OPEN_TYPES, TYPES, buildingId, buildingType, dice, hashText, identify, isLocked, planBuilding, planLabel, poiType, typeName } from '../public/js/buildings.js';
import { FURNISHED } from '../public/js/furnish.js';
import { Place, fromLocal } from '../public/js/footData.js';

const ORIGIN = { lat: 38.9, lng: -77 };
const clues = (over = {}) => ({ area: 200, height: 5, known: false, pois: [], lands: [], ...over });
const memory = () => {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v), writes: () => items.size };
};
const rect = (x0, y0, x1, y1, over = {}) => {
  const pts = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  return { rings: [{ pts, seam: pts.map(() => false) }], height: 5, known: false, ground: true, minX: x0, maxX: x1, minY: y0, maxY: y1, ...over };
};
const placeWith = (parsed, key = 't') => {
  const place = new Place(ORIGIN);
  place.addTile(key, { buildings: [], lands: [], waters: [], roads: [], pois: [], ...parsed });
  return place;
};

test('the map\'s point of interest names give building types, and things that are not buildings give none', () => {
  assert.equal(poiType({ cls: 'bank', sub: 'bank' }), 'bank');
  assert.equal(poiType({ cls: 'lodging', sub: 'hotel' }), 'hotel');
  assert.equal(poiType({ cls: 'shop', sub: 'convenience' }), 'supermarket');
  assert.equal(poiType({ cls: 'shop', sub: 'gift' }), 'shop');
  assert.equal(poiType({ cls: 'library', sub: 'library' }), 'library');
  assert.equal(poiType({ cls: 'library', sub: 'books' }), 'shop');
  assert.equal(poiType({ cls: 'toilets', sub: 'toilets' }), null);
  assert.equal(poiType({ cls: 'art_gallery', sub: 'artwork' }), null, 'a statue says nothing about the building');
});

test('a terminal or a mall is not named after one restaurant inside it', () => {
  assert.equal(buildingType(clues({ area: 90000, lands: ['aerodrome'], pois: ['restaurant', 'cafe'] })), 'terminal');
  assert.equal(buildingType(clues({ area: 90000, pois: ['shop', 'shop', 'restaurant', 'cafe'] })), 'mall');
  assert.equal(buildingType(clues({ area: 1000, pois: ['shop', 'shop', 'restaurant', 'cafe'] })), 'shop', 'too small for a mall');
  assert.equal(buildingType(clues({ area: 300, lands: ['aerodrome'], pois: ['restaurant'] })), 'restaurant');
  assert.equal(buildingType(clues({ area: 300, lands: ['aerodrome'] })), 'hangar');
});

test('with nothing inside, the land and the size decide', () => {
  assert.equal(buildingType(clues({ lands: ['school'] })), 'school');
  assert.equal(buildingType(clues({ lands: ['commercial'] })), 'office');
  assert.equal(buildingType(clues({ area: 9000, lands: ['industrial'] })), 'warehouse');
  assert.equal(buildingType(clues({ area: 9000, known: true, height: 40, lands: ['industrial'] })), 'factory');
  assert.equal(buildingType(clues({ area: 9000, lands: ['retail'] })), 'supermarket');
  assert.equal(buildingType(clues({ area: 30 })), 'shed');
  assert.equal(buildingType(clues({ area: 200, lands: ['residential'] })), 'home');
  assert.equal(buildingType(clues({ area: 900 })), 'apartments');
  assert.equal(buildingType(clues({ area: 200, known: true, height: 40 })), 'apartments');
});

test('a mapped height sets the floors, within what that type can have', () => {
  const floors = (over) => planBuilding(clues(over), dice(1)).floors;
  assert.equal(floors({ known: true, height: 444, area: 8000, lands: ['commercial'] }), Math.round(444 / 3.8));
  assert.equal(floors({ known: true, height: 7, area: 200 }), 2);
  assert.equal(floors({ known: true, height: 14, area: 9000, lands: ['industrial'] }), 1, 'a warehouse has one floor');
});

test('an unmapped height gives a floor count the type allows, and an office is only tall if it is big', () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const [type, t] of Object.entries(TYPES)) {
      const over = type === 'terminal' ? { lands: ['aerodrome'], area: 9000 } : { pois: [type], area: 200 };
      if (['home', 'shed', 'apartments', 'mall', 'warehouse', 'factory', 'hangar'].includes(type)) continue;
      const { floors } = planBuilding(clues(over), dice(seed));
      assert.ok(t.unknown.includes(floors), `${type} ${floors}`);
    }
    assert.equal(planBuilding(clues({ area: 100, lands: ['commercial'] }), dice(seed)).floors, 1);
  }
});

test('a shop in a tower has the ground floor, and what the land says is above it', () => {
  const plan = planBuilding(clues({ known: true, height: 60, area: 800, pois: ['bank'], lands: ['commercial'] }), dice(1));
  assert.equal(plan.type, 'office');
  assert.equal(plan.ground, 'bank');
  assert.equal(plan.floors, Math.round(60 / 3.8));
  assert.match(planLabel(plan), /^Bank · Floor 1 of \d+$/);
  assert.match(planLabel(plan, 2), /^Office · Floor 2 of \d+$/);
  const flats = planBuilding(clues({ known: true, height: 40, area: 300, pois: ['restaurant'], lands: ['residential'] }), dice(1));
  assert.equal(flats.type, 'apartments');
  assert.equal(flats.ground, 'restaurant');
  const low = planBuilding(clues({ known: true, height: 7, area: 300, pois: ['restaurant'] }), dice(1));
  assert.equal(low.type, 'restaurant');
  assert.equal(low.ground, undefined);
});

test('the same dice roll the same, and different seeds differ', () => {
  const rolls = (seed) => { const r = dice(seed); return [r(), r(), r(), r()]; };
  assert.deepEqual(rolls(hashText('a')), rolls(hashText('a')));
  assert.notDeepEqual(rolls(hashText('a')), rolls(hashText('b')));
  for (const v of rolls(7)) assert.ok(v >= 0 && v < 1);
});

test('a building has the same id wherever the car is parked', () => {
  const at = { lat: 38.95, lng: -77.45 };
  const idFrom = (origin) => {
    const r = Math.PI / 180, x = (at.lng - origin.lng) * r * 6371000 * Math.cos(origin.lat * r), y = (at.lat - origin.lat) * r * 6371000;
    return buildingId(origin, { minX: x - 10, maxX: x + 10, minY: y - 8, maxY: y + 8 });
  };
  assert.equal(idFrom({ lat: 38.9, lng: -77.4 }), idFrom({ lat: 39.1, lng: -77.2 }));
  assert.notEqual(buildingId(ORIGIN, { minX: 0, maxX: 10, minY: 0, maxY: 10 }), buildingId(ORIGIN, { minX: 30, maxX: 40, minY: 0, maxY: 10 }));
  assert.ok(fromLocal(ORIGIN, 0, 0).lat === ORIGIN.lat);
});

test('what a building turned out to be is saved, and stays, even if the map would now say otherwise', () => {
  const storage = memory(), store = new BuildingStore(storage), piece = rect(0, 0, 20, 20);
  const place = placeWith({ buildings: [piece], pois: [{ x: 10, y: 10, cls: 'bank', sub: 'bank' }] });
  const plan = identify(place, piece, store, 1000);
  assert.equal(plan.type, 'bank');
  assert.equal(plan.seen, 1000);
  assert.ok(piece.buildingId);

  const again = rect(0, 0, 20, 20), later = placeWith({ buildings: [again], pois: [{ x: 10, y: 10, cls: 'cafe', sub: 'cafe' }] });
  const reloaded = new BuildingStore(storage);
  const same = identify(later, again, reloaded, 2000);
  assert.equal(same.type, 'bank');
  assert.equal(same.floors, plan.floors);
  assert.equal(same.style, plan.style);
  assert.equal(same.seen, 2000);
});

test('with nothing saved, a building rolls the same plan again', () => {
  const plans = [0, 1].map(() => {
    const piece = rect(100, 100, 130, 125);
    return identify(placeWith({ buildings: [piece] }), piece, new BuildingStore(memory()), 5);
  });
  assert.deepEqual(plans[0], plans[1]);
});

test('storage that fails or holds rubbish loses nothing but the saving', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  const piece = rect(0, 0, 20, 20);
  assert.ok(identify(placeWith({ buildings: [piece] }), piece, new BuildingStore(broken)));
  const rubbish = { getItem: () => '{not json', setItem: () => {} };
  assert.equal(new BuildingStore(rubbish).get('x'), null);
});

test('a point of interest only counts inside the footprint, not in a corner of its box', () => {
  const pts = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 }];
  const piece = { rings: [{ pts, seam: [false, false, false] }], height: 5, known: false, ground: true, minX: 0, maxX: 40, minY: 0, maxY: 40 };
  const place = placeWith({ buildings: [piece], pois: [{ x: 35, y: 35, cls: 'bank', sub: 'bank' }] });
  const whole = place.wholeOf(piece);
  assert.deepEqual(place.cluesFor(whole.pieces, piece, poiType).pois, []);
});

test('two pieces cut by a tile edge are one building, with one plan', () => {
  const left = rect(0, 0, 20, 20, { across: ['b'] }), right = rect(20, 4, 35, 16, { across: ['a'] });
  left.rings[0].seam[1] = true;  // its east side
  right.rings[0].seam[3] = true; // its west side
  const place = new Place(ORIGIN);
  place.addTile('a', { buildings: [left], lands: [], waters: [], roads: [] });
  assert.deepEqual(place.wholeOf(left).missing, ['b'], 'the other tile may hold the rest');
  assert.equal(identify(place, left, new BuildingStore(memory())), null, 'so it waits');

  place.addTile('b', { buildings: [right], lands: [], waters: [], roads: [], pois: [{ x: 30, y: 10, cls: 'bank', sub: 'bank' }] });
  const whole = place.wholeOf(left);
  assert.equal(whole.pieces.length, 2);
  assert.deepEqual(whole.missing, []);
  const plan = identify(place, left, new BuildingStore(memory()));
  assert.equal(plan.type, 'bank', 'clues from either piece count');
  assert.equal(right.plan, plan);
  assert.equal(right.buildingId, left.buildingId);
});

test('buildings that only touch are not joined', () => {
  const a = rect(0, 0, 20, 20), b = rect(20, 0, 40, 20);
  const place = placeWith({ buildings: [a, b] });
  assert.equal(place.wholeOf(a).pieces.length, 1, 'no tile cut them');
});

test('only types with rooms can be open, and everything else is locked', () => {
  for (const type of OPEN_TYPES) {
    assert.ok(TYPES[type], type);
    assert.ok(FURNISHED.has(type), `${type} is open with no rooms`);
  }
  for (const type of ['nothingYet']) assert.equal(isLocked({ type }), true, type);
  for (const type of ['home', 'apartments', 'parking', 'office', 'bank']) assert.equal(isLocked({ type }), false, type);
  assert.equal(typeName({ type: 'parking' }), 'Parking garage');
});

test('what is at the door decides: a clinic under offices is locked, and a bank under them is not', () => {
  assert.equal(isLocked({ type: 'office', ground: 'nothingYet' }), true);
  assert.equal(typeName({ type: 'office', ground: 'clinic' }), 'Clinic');
  assert.equal(isLocked({ type: 'office', ground: 'bank' }), false);
  const plan = planBuilding(clues({ known: true, height: 60, area: 800, pois: ['clinic'], lands: ['commercial'] }), dice(1));
  assert.equal(plan.ground, 'clinic');
});

test('a parking garage is one even at an airport, unless something else is in there too', () => {
  assert.equal(poiType({ cls: 'parking', sub: 'parking' }), 'parking');
  assert.equal(buildingType(clues({ area: 40000, lands: ['aerodrome'], pois: ['parking'] })), 'parking');
  assert.equal(buildingType(clues({ area: 40000, pois: ['parking', 'parking'] })), 'parking');
  assert.equal(buildingType(clues({ area: 600, pois: ['parking', 'cafe'] })), 'cafe');
  assert.equal(poiType({ cls: 'fuel', sub: 'fuel' }), 'gasStation');
  assert.equal(poiType({ cls: 'shop', sub: 'beauty' }), 'salon');
  assert.equal(poiType({ cls: 'hospital', sub: 'clinic' }), 'clinic');
  assert.equal(poiType({ cls: 'hospital', sub: 'nursing_home' }), 'nursingHome');
});
