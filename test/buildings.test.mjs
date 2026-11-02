import test from 'node:test';
import assert from 'node:assert/strict';
import { BuildingStore, OPEN_TYPES, TYPES, buildingId, buildingType, dice, hashText, identify, isLocked, planBuilding, planLabel, poiType, typeName } from '../public/js/buildings.js';
import { FURNISHED } from '../public/js/furnish.js';
import { CATEGORY_TYPE } from '../public/js/overture.js';
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
  assert.equal(buildingType(clues({ area: 100, lands: ['aerodrome'] })), 'unknown', 'a small hut could be anything');
});

test('with nothing inside, the land and the size decide', () => {
  assert.equal(buildingType(clues({ lands: ['school'] })), 'school');
  assert.equal(buildingType(clues({ lands: ['commercial'] })), 'unknown', 'low on commercial land could be anything');
  assert.equal(buildingType(clues({ known: true, height: 30, lands: ['commercial'] })), 'office', 'a tower on it is offices');
  assert.equal(buildingType(clues({ area: 9000, lands: ['industrial'] })), 'warehouse');
  assert.equal(buildingType(clues({ area: 9000, known: true, height: 40, lands: ['industrial'] })), 'factory');
  assert.equal(buildingType(clues({ area: 9000, lands: ['retail'] })), 'unknown');
  assert.equal(buildingType(clues({ area: 30 })), 'shed');
  assert.equal(buildingType(clues({ area: 200, lands: ['residential'] })), 'home');
  assert.equal(buildingType(clues({ area: 900 })), 'unknown', 'a big building nothing is known about');
  assert.equal(buildingType(clues({ area: 200, known: true, height: 40 })), 'unknown');
  assert.equal(buildingType(clues({ area: 900, lands: ['residential'] })), 'apartments', 'but on residential land it is flats');
  assert.equal(buildingType(clues({ area: 200, known: true, height: 40, lands: ['residential'] })), 'apartments');
  assert.equal(buildingType(clues({ area: 9000, lands: ['residential'] })), 'unknown', 'too big and low for flats');
  assert.equal(buildingType(clues({ area: 500, lands: ['industrial'] })), 'unknown', 'not everything on an estate is a factory, as United Bank showed');
  assert.equal(isLocked({ type: 'unknown' }), true, 'and what is unknown is locked');
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
  const pts = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 0, y: 80 }];
  const piece = { rings: [{ pts, seam: [false, false, false] }], height: 5, known: false, ground: true, minX: 0, maxX: 80, minY: 0, maxY: 80 };
  const place = placeWith({ buildings: [piece], pois: [{ x: 75, y: 75, cls: 'bank', sub: 'bank' }] });
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

test('a place counts once though neighbouring tiles repeat it, and its name is what the building is called', () => {
  const piece = rect(0, 0, 60, 60), poi = () => ({ x: 10, y: 10, cls: 'bank', sub: 'bank', name: 'United Bank' }), place = new Place(ORIGIN);
  for (const key of ['a', 'b', 'c', 'd']) place.addTile(key, { buildings: key === 'a' ? [piece] : [], lands: [], waters: [], roads: [], pois: [poi()] });
  const plan = identify(place, piece, new BuildingStore(memory()));
  assert.deepEqual(place.cluesFor([piece], piece, poiType).pois, ['bank']);
  assert.equal(plan.type, 'bank');
  assert.equal(plan.name, 'United Bank');
  assert.match(planLabel(plan), /^United Bank · Floor 1 of/);
});

test('one shop repeated by tiles does not make a mall', () => {
  const piece = rect(0, 0, 80, 80), place = new Place(ORIGIN);
  for (const key of ['a', 'b', 'c', 'd']) place.addTile(key, { buildings: key === 'a' ? [piece] : [], lands: [], waters: [], roads: [], pois: [{ x: 5, y: 5, cls: 'shop', sub: 'gift', name: 'Gifts' }] });
  assert.equal(identify(place, piece, new BuildingStore(memory())).type, 'shop');
});

test('a place just outside a footprint belongs to the nearest building, but a car park does not, and a far one does not', () => {
  const near = rect(0, 0, 20, 20), other = rect(60, 0, 80, 20);
  const place = placeWith({ buildings: [near, other], pois: [{ x: 28, y: 10, cls: 'bank', sub: 'bank', name: '' }, { x: 10, y: 28, cls: 'parking', sub: 'parking', name: '' }, { x: 120, y: 10, cls: 'cafe', sub: 'cafe', name: '' }] });
  assert.deepEqual(place.cluesFor([near], near, poiType).pois, ['bank']);
  assert.deepEqual(place.cluesFor([other], other, poiType).pois, []);
});

test('a place in one building is not claimed by the one beside it', () => {
  const a = rect(0, 0, 20, 20), b = rect(22, 0, 42, 20);
  const place = placeWith({ buildings: [a, b], pois: [{ x: 25, y: 10, cls: 'bank', sub: 'bank', name: '' }] });
  assert.deepEqual(place.cluesFor([a], a, poiType).pois, []);
  assert.deepEqual(place.cluesFor([b], b, poiType).pois, ['bank']);
});

test('the old saved buildings are cleared away', () => {
  const storage = memory(), removed = [];
  storage.setItem('geodrive_rooms_v1', JSON.stringify({ x: { type: 'factory', saved: { 1: 10 } } }));
  storage.removeItem = (key) => removed.push(key);
  new BuildingStore(storage);
  assert.deepEqual(removed.sort(), ['geodrive_rooms_v1', 'geodrive_rooms_v1_x_1']);
});

test('Overture knows more than OpenStreetMap, so it decides, and one place is not counted from both', () => {
  const piece = rect(0, 0, 100, 60), place = placeWith({ buildings: [piece], pois: [{ x: 5, y: 5, cls: 'cafe', sub: 'cafe', name: 'Old Cafe' }, { x: 6, y: 6, cls: 'parking', sub: 'parking', name: '' }] });
  assert.deepEqual(place.cluesFor([piece], piece, poiType).pois.sort(), ['cafe', 'parking']);
  assert.equal(place.addPlaces('overture_1', [{ x: 10, y: 10, overture: true, category: 'bank_or_credit_union', name: 'United Bank' }]), true);
  assert.equal(place.addPlaces('overture_1', []), false, 'once per tile');
  const clues = place.cluesFor([piece], piece, poiType);
  assert.deepEqual(clues.pois.sort(), ['bank', 'parking']);
  assert.equal(clues.names.bank, 'United Bank');
});

test('United Bank on an industrial estate: a bank with the map data, and locked rather than a factory without it', () => {
  const lands = [{ name: 'industrial', rings: [[{ x: -500, y: -500 }, { x: 500, y: -500 }, { x: 500, y: 500 }, { x: -500, y: 500 }]], minX: -500, maxX: 500, minY: -500, maxY: 500 }];
  const without = rect(0, 0, 20, 25), bare = placeWith({ buildings: [without], lands }), plan = identify(bare, without, new BuildingStore(memory()));
  assert.equal(plan.type, 'unknown');
  assert.equal(isLocked(plan), true);
  assert.equal(typeName(plan), '');
  const known = rect(0, 0, 20, 25), named = placeWith({ buildings: [known], lands });
  named.addPlaces('o', [{ x: 10, y: 10, overture: true, category: 'bank_or_credit_union', name: 'United Bank' }]);
  const bank = identify(named, known, new BuildingStore(memory()));
  assert.equal(bank.type, 'bank');
  assert.match(planLabel(bank), /^United Bank · /);
});

test('a business run from a house leaves it a home, but not in a bigger building', () => {
  assert.equal(buildingType(clues({ area: 180, pois: ['weakOffice'] })), 'home');
  assert.equal(buildingType(clues({ area: 900, pois: ['weakOffice'] })), 'office');
  assert.equal(buildingType(clues({ area: 180, lands: ['commercial'], pois: ['weakOffice'] })), 'office');
  assert.equal(buildingType(clues({ area: 180, pois: ['office'] })), 'office', 'a real office is one whatever its size');
});

test('a place listed as a mall makes a big building one', () => {
  assert.equal(buildingType(clues({ area: 9000, pois: ['mall', 'shop'] })), 'mall');
  assert.equal(buildingType(clues({ area: 500, pois: ['mall', 'shop'] })), 'shop', 'its small part is what is in it');
});

test('when a source failed, a building that comes out unknown is not saved as unknown, but a known one is', () => {
  const store = new BuildingStore(memory()), unknown = rect(0, 0, 40, 40), place = placeWith({ buildings: [unknown] });
  assert.equal(identify(place, unknown, store, 1, false).type, 'unknown');
  assert.equal(unknown.plan, undefined, 'it can be tried again');
  assert.equal(store.get(unknown.buildingId || 'x'), null);
  const bank = rect(100, 0, 120, 20), other = placeWith({ buildings: [bank], pois: [{ x: 110, y: 10, cls: 'bank', sub: 'bank', name: '' }] });
  assert.equal(identify(other, bank, store, 1, false).type, 'bank');
  assert.equal(bank.plan.type, 'bank');
});

test('every type a place can give is a building type', () => {
  for (const [category, type] of Object.entries(CATEGORY_TYPE)) if (type !== 'weakOffice') assert.ok(TYPES[type], `${category}: ${type}`);
  assert.equal(poiType({ overture: true, category: 'bank_or_credit_union' }), 'bank');
  assert.equal(poiType({ overture: true, category: 'park' }), null);
});

test('a part with nothing of its own takes after the bigger building it is joined to, but not one across a gap', () => {
  const tower = rect(0, 0, 40, 40), part = rect(40, 0, 50, 10), apart = rect(60, 0, 70, 10);
  const lands = [{ name: 'commercial', rings: [[{ x: -500, y: -500 }, { x: 500, y: -500 }, { x: 500, y: 500 }, { x: -500, y: 500 }]], minX: -500, maxX: 500, minY: -500, maxY: 500 }];
  const place = placeWith({ buildings: [tower, part, apart], lands, pois: [{ x: 20, y: 20, cls: 'bank', sub: 'bank', name: 'Big Bank' }] });
  const store = new BuildingStore(memory());
  assert.deepEqual(place.joinedTo([part]), [tower]);
  assert.equal(identify(place, part, store).type, 'bank');
  assert.equal(identify(place, apart, store).type, 'unknown');
});

test('a big building with different kinds of business in it is a shopping centre', () => {
  assert.equal(buildingType(clues({ area: 2000, pois: ['supermarket', 'restaurant'] })), 'mall');
  assert.equal(buildingType(clues({ area: 2000, pois: ['shop', 'shop'] })), 'shop', 'one kind stays that kind');
  assert.equal(buildingType(clues({ area: 800, pois: ['supermarket', 'restaurant'] })), 'supermarket', 'and a small one is what most of it is');
});
