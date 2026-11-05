import test from 'node:test';
import assert from 'node:assert/strict';
import { carShot, crashOutcome } from '../public/js/worldOps.js';
import { CAR_REASONS, cleanCar, cleanStorage, plantCars, rescueCar } from '../public/js/worldCars.js';
import { GAME } from '../public/js/gameConfig.js';
import { SAYINGS } from '../public/js/sayingsConfig.js';
import { SharedCars } from '../public/js/sharedWorld.js';
import { seatsPicture, seatsShown } from '../public/js/carSeats.js';
import { stationFor, stationWorks } from '../public/js/stations.js';
import { carDamageAt, coastDistance, coastPlace, conditionLeft, cutsOut, drivable, healthLossHit, healthLossInCar, healthLossStrike, offRoadSlowing, offRoadWear, powerOf, reliabilityText } from '../public/js/carDamage.js';
import { BumpLimit, FootprintIndex, buildingHit, carTouchesPerson, carsTouch, closingSpeed, firstHit } from '../public/js/collide.js';
import { metresApart } from '../public/js/protocol.js';
import { move } from '../public/js/camera.js';

const METRE = 1 / 111320;
// A long straight road north, from a given start, in the shape vector.js gives.
const line = (lat = 38.9, lng = -77.4, metres = 30000) => [lat, lng, lat + metres * METRE, lng];
const road = (lat, lng, metres) => ({ kerbs: [{ c: line(lat, lng, metres), out: 4.6 }] });

test('everyone gets the same cars from the same road', () => {
  assert.deepEqual(plantCars(road()), plantCars(road()));
  assert.notDeepEqual(plantCars(road(39)).map((c) => c.id), plantCars(road()).map((c) => c.id), 'and different ones on another road');
});

test('cars are spaced along a road at about the set distance, none on bridges', () => {
  const cars = plantCars(road()), expected = 30000 / GAME.worldCars.every;
  assert.ok(cars.length > expected * 0.7 && cars.length < expected * 1.4, `${cars.length}`);
  assert.equal(plantCars({ kerbs: [{ c: [1, 2], out: 4.6 }] }).length, 0, 'a road with one point');
  assert.equal(plantCars(road(38.9, -77.4, 30)).length, 0, 'nor a street too short to be clear of its junctions');
  assert.equal(plantCars({}).length, 0, 'nothing where nobody may park');
});

test('about 2 in 5 run and about 1 in 4 hold a sledgehammer, and those that don\'t run say why', () => {
  const cars = Array.from({ length: 40 }, (_, i) => plantCars(road(38 + i * 0.5))).flat();
  const share = (fits) => cars.filter(fits).length / cars.length;
  assert.ok(cars.length > 1000);
  assert.ok(Math.abs(share((c) => c.runs) - GAME.worldCars.runningChance) < 0.05, `${share((c) => c.runs)}`);
  assert.ok(Math.abs(share((c) => c.storage.some((i) => i.id === GAME.hammer.item)) - GAME.worldCars.hammerChance) < 0.05);
  for (const car of cars) assert.equal(!!car.why, !car.runs);
  for (const why of CAR_REASONS) assert.ok(SAYINGS[why]?.length, why);
  for (const car of cars) assert.ok(car.fuel >= 25 && car.fuel <= 95);
});

test('a car sits at the kerb on the right, facing the way traffic goes there, and clear of junctions', () => {
  for (const car of plantCars(road(38.9, -77.4, 2000))) {
    assert.ok(Math.abs(metresApart(car, { lat: car.lat, lng: -77.4 }) - 4.6) < 0.05, 'beside the road');
    assert.ok(car.heading === 0 ? car.lng > -77.4 : Math.abs(car.heading - 180) < 1e-6 && car.lng < -77.4, `${car.heading}`);
    assert.ok(car.lat - 38.9 > GAME.worldCars.clearOfEnds * METRE * 0.99 && 38.9 + 2000 * METRE - car.lat > GAME.worldCars.clearOfEnds * METRE * 0.99);
  }
});

test('in a car park, cars stand in the bays either side of the aisle, side by side and square to it', () => {
  const cars = plantCars({ aisles: [line(38.9, -77.4, 3000)] }), { bay, bayOut, bayTaken } = GAME.worldCars;
  const bays = (3000 / bay) * 2;
  assert.ok(Math.abs(cars.length / bays - bayTaken) < 0.05, `${cars.length} of ${bays}`);
  for (const car of cars) {
    assert.ok(Math.abs(metresApart(car, { lat: car.lat, lng: -77.4 }) - bayOut) < 0.05, 'a bay\'s depth off the aisle');
    assert.ok(Math.abs(car.heading - 90) < 1e-6 || Math.abs(car.heading - 270) < 1e-6, `${car.heading}`);
    assert.ok(Math.abs(((car.lat - 38.9) / METRE) % bay - bay / 2) < 0.05, 'in the middle of a bay');
  }
});

test('a driveway holds at most one car, up by the house and facing it', () => {
  const drives = Array.from({ length: 400 }, (_, i) => [38.9 + i * 0.001, -77.4, 38.9 + i * 0.001 + 30 * METRE, -77.4]);
  const cars = plantCars({ driveways: drives }), { driveTaken, driveBack } = GAME.worldCars;
  assert.ok(Math.abs(cars.length / drives.length - driveTaken) < 0.07, `${cars.length}`);
  for (const car of cars) {
    assert.equal(car.heading, 0);
    assert.ok(Math.abs((((car.lat - 38.9) / 0.001) % 1) * 0.001 / METRE - (30 - driveBack)) < 0.1, 'short of the far end');
  }
  assert.equal(plantCars({ driveways: [[38.9, -77.4, 38.9 + 3 * METRE, -77.4]] }).length, 0, 'none in a driveway too short for one');
});

test('on a bigger road, now and then a car is pulled over on the shoulder, facing the traffic\'s way', () => {
  const cars = plantCars({ shoulders: [{ c: line(), out: 8 }] }), expected = 30000 / GAME.worldCars.shoulderEvery;
  assert.ok(cars.length > expected * 0.7 && cars.length < expected * 1.4, `${cars.length}`);
  for (const car of cars) {
    assert.ok(Math.abs(metresApart(car, { lat: car.lat, lng: -77.4 }) - 8) < 0.05 && car.lng > -77.4, 'on the right shoulder');
    assert.equal(car.heading, 0);
  }
});

test('no car is kept that would stand on any road, its own or another', () => {
  const street = { c: line(), half: 3.5 }, other = { c: line(38.9, -77.4 + 6 / (111320 * Math.cos((38.9 * Math.PI) / 180))), half: 4 };
  assert.ok(plantCars({ ...road(), roads: [street] }).length > 100, 'a kerb car beside its own street is fine');
  assert.equal(plantCars({ ...road(), roads: [street, other] }).length, 0, 'but not on the next road over');
  assert.equal(plantCars({ kerbs: [{ c: line(), out: 2 }], roads: [street] }).length, 0, 'nor in the street itself');
  assert.equal(plantCars({ aisles: [line()], roads: [{ c: line(38.9, -77.4 + 5.6 / (111320 * Math.cos((38.9 * Math.PI) / 180))), half: 4 }] }).filter((car) => car.lng > -77.4).length, 0, 'a bay that\'s really a street is left empty');
});

test('a rescue car is pulled in to the kerb on the right', () => {
  const car = rescueCar(38.9, -77.4, 0, 'me-2');
  assert.ok(Math.abs(metresApart(car, { lat: 38.9, lng: -77.4 }) - GAME.worldCars.kerb) < 0.05);
  assert.ok(car.lng > -77.4 && Math.abs(car.lat - 38.9) < 1e-9);
});

test('a car needs a good id, place and look before it\'s kept', () => {
  const [car] = plantCars(road());
  assert.equal(cleanCar(car).id, car.id);
  assert.equal(cleanCar(car).driver, null, 'nobody can claim to be driving');
  for (const bad of [null, {}, { ...car, id: '../x' }, { ...car, lat: 200 }, { ...car, lng: NaN }, { ...car, type: 'tank' }, { ...car, colour: 'red' }, { ...car, runs: 'yes' }]) assert.equal(cleanCar(bad), null);
  assert.equal(cleanCar({ ...car, fuel: 900 }).fuel, 100);
  const rescued = rescueCar(38.9, -77.4, 90, 'me-1');
  assert.equal(rescued.runs, true);
  assert.equal(cleanCar(rescued).id, 'x_me-1');
});

test('storage must be a short list of plain things', () => {
  assert.deepEqual(cleanStorage([{ id: 'Sledgehammer', name: 'Sledgehammer', count: 1, x: 1 }]), [{ id: 'Sledgehammer', name: 'Sledgehammer', count: 1 }]);
  for (const bad of ['x', [{ id: 5, count: 1 }], [{ id: 'a', count: 0 }], [{ id: 'a', count: 1.5 }], Array(61).fill({ id: 'a', count: 1 })]) assert.equal(cleanStorage(bad), null);
});

test('around shows parked cars, a moved one where it now is, and not those being driven', () => {
  const planted = plantCars(road()), first = planted[0], cars = new SharedCars(null, 'me');
  cars.plantFrom(new Map([['t', road()]]));
  assert.equal(cars.around(first, 1)[0].id, first.id);
  cars.heard({ ...first, lat: 40, lng: -70, driver: null });
  assert.equal(cars.around(first, 1).length, 0, 'it\'s gone from there');
  assert.equal(cars.around({ lat: 40, lng: -70 }, 5)[0].id, first.id);
  cars.heard({ ...first, driver: 'dana' });
  assert.equal(cars.around(first, 1).length, 0);
  assert.equal(cars.mine(), null);
  cars.heard({ ...first, driver: 'me' });
  assert.equal(cars.mine().id, first.id);
  assert.equal(cars.around(first, 5000, 3).length, 3, 'with a limit');
  assert.ok(metresApart(cars.around(planted[3], 5000, 1)[0], planted[3]) < 1, 'nearest first');
  cars.plantFrom(new Map());
  assert.equal(cars.plantedTiles.size, 0, 'and a tile let go of takes its cars with it');
});

const CAR_BOX = { halfWidth: 1, halfLength: 2.2 };
const METRE_LAT = 1 / 111320;
const north = (metres) => ({ lat: 38.9 + metres * METRE_LAT, lng: -77.4 });
const parked = (metres, over = {}) => ({ id: 'p', kind: 'parked', ...north(metres), heading: 0, speed: 0, ...CAR_BOX, ...over });
const driving = (metres, speed, heading = 0) => ({ ...north(metres), heading, speed, ...CAR_BOX });

test('cars touch when their rectangles do, turned or not', () => {
  const at = (x, y, heading = 0) => ({ x, y, heading, ...CAR_BOX });
  assert.equal(carsTouch(at(0, 0), at(0, 4)), true, 'nose to tail, overlapping');
  assert.equal(carsTouch(at(0, 0), at(0, 5)), false);
  assert.equal(carsTouch(at(0, 0), at(1.9, 0)), true, 'side by side');
  assert.equal(carsTouch(at(0, 0), at(2.1, 0)), false);
  assert.equal(carsTouch(at(0, 0, 90), at(0, 3.3)), false, 'a car across the road reaches less far that way');
  assert.equal(carsTouch(at(0, 0, 90), at(0, 3.1)), true);
  assert.equal(carsTouch(at(0, 0, 90), at(0, 2.9, 90)), false);
  assert.equal(carsTouch(at(0, 0, 90), at(4, 0, 90)), true);
  assert.equal(carsTouch(at(0, 0, 45), at(2.5, 2.5, 45)), true);
  assert.equal(carsTouch(at(0, 0, 45), at(2.5, -2.5, 45)), false, 'beside it, on the diagonal');
});

test('a car touches a person at its edge', () => {
  const car = { x: 0, y: 0, heading: 0, ...CAR_BOX };
  assert.equal(carTouchesPerson(car, { x: 0, y: 2.5 }, 0.35), true);
  assert.equal(carTouchesPerson(car, { x: 0, y: 2.6 }, 0.35), false);
  assert.equal(carTouchesPerson(car, { x: 1.3, y: 0 }, 0.35), true);
  assert.equal(carTouchesPerson(car, { x: 1.4, y: 0 }, 0.35), false);
});

test('a car hits what\'s ahead, and says how fast and how far to go back', () => {
  const hit = firstHit(driving(1, 20), 0.5, [parked(5)]);
  assert.ok(hit);
  assert.equal(hit.closing, 20);
  assert.ok(hit.back > 0);
  assert.equal(firstHit(driving(1, 20), 0.5, [parked(10)]), null, 'not yet');
  assert.equal(firstHit(driving(1, 20), 0.5, []), null);
});

test('at any speed nothing is jumped over', () => {
  const fast = driving(100, 223), moved = 223 / 10; // a whole 10 fps frame at top speed
  const hit = firstHit({ ...fast, ...north(100) }, moved, [parked(90)]);
  assert.ok(hit, 'it was in the way');
  assert.ok(hit.back > 3, `stops well short of where it would have got to: ${hit.back}`);
  assert.equal(firstHit({ ...fast, ...north(100) }, moved, [parked(150)]), null, 'beyond it, nothing');
});

test('reversing hits what\'s behind', () => {
  const hit = firstHit(driving(0, -5), -0.2, [parked(-4)]);
  assert.ok(hit);
  assert.equal(hit.closing, 5);
  assert.equal(firstHit(driving(0, -5), -0.2, [parked(4.5)]), null);
});

test('a car already touching something can drive away from it', () => {
  assert.equal(firstHit(driving(0, 5), 0.1, [parked(-4)]), null, 'forward, from what\'s behind');
  assert.equal(firstHit(driving(0, -5), -0.1, [parked(4)]), null, 'back, from what\'s ahead');
  assert.ok(firstHit(driving(0, 5), 0.1, [parked(4)]), 'but not further in');
  assert.equal(firstHit(driving(0, 0), 0, [parked(4)]), null, 'and sitting still does nothing');
});

test('closing speed is how fast two are coming together', () => {
  const toward = { x: 0, y: 1 };
  assert.equal(closingSpeed({ heading: 0, speed: 20 }, { heading: 180, speed: 25 }, toward), 45, 'head on adds up');
  assert.equal(closingSpeed({ heading: 0, speed: 30 }, { heading: 0, speed: 20 }, toward), 10, 'catching up is the difference');
  assert.equal(closingSpeed({ heading: 0, speed: 20 }, { heading: 0, speed: 30 }, toward), 0, 'being left behind is nothing');
  assert.equal(closingSpeed({ heading: 180, speed: 20 }, { speed: 0 }, toward), 0, 'nor is moving away');
  assert.ok(Math.abs(closingSpeed({ heading: 90, speed: 20 }, { heading: 0, speed: 0 }, { x: 0, y: 1 })) < 1e-9, 'passing across isn\'t closing');
});

test('a moving car and a person are both hit', () => {
  const hit = firstHit(driving(0, 10), 0.2, [{ id: 'd', kind: 'car', ...north(4), heading: 180, speed: 10, ...CAR_BOX }]);
  assert.equal(hit.closing, 20);
  const person = firstHit(driving(0, 10), 0.2, [{ id: 'p', kind: 'person', ...north(2.5), radius: 0.35 }]);
  assert.equal(person.closing, 10);
  assert.equal(person.other.kind, 'person');
});

test('bumps between two things come at most once in a while', () => {
  const limit = new BumpLimit(1000);
  assert.equal(limit.allows('a', 0), true);
  assert.equal(limit.allows('a', 500), false);
  assert.equal(limit.allows('b', 500), true, 'something else is its own');
  assert.equal(limit.allows('a', 1000), true);
});

test('the seats panel only shows with someone riding', () => {
  assert.equal(seatsShown({ driver: 'a', seats: [] }), false, 'alone at the wheel');
  assert.equal(seatsShown({ driver: 'a' }), false, 'a car that has never had seats');
  assert.equal(seatsShown({ driver: 'a', seats: ['b'] }), true);
  assert.equal(seatsShown({ driver: null, seats: ['b'] }), true, 'a passenger whose driver has gone still sees it');
});

test('the seats panel shows who\'s where, and nothing can be written into it', () => {
  const html = seatsPicture('#123456', [{ id: 'a', name: 'Dana', initials: 'DA', colour: '#ff0000' }, null, { id: 'b', name: '<b>x', initials: 'MO', colour: '#00ff00' }]);
  assert.ok(html.includes('Dana <small>driving</small>'));
  assert.ok(html.includes('&lt;b&gt;x') && !html.includes('<b>x'));
  assert.ok(html.includes('data-seat="b"'));
  assert.ok(seatsPicture('#123456', [null, { id: 'b', name: 'Mo', initials: 'MO', colour: '#00ff00' }]).includes('Mo'), 'someone can be riding with nobody at the wheel');
  assert.ok(seatsPicture('#123456', [null]).includes('Nobody at the wheel'));
});

test('damage rises with speed: a little when small, a whole car at the deadly speed', () => {
  assert.ok(carDamageAt(10) < 2);
  assert.ok(carDamageAt(30) > 8 && carDamageAt(30) < 10);
  assert.equal(carDamageAt(100), 100);
  assert.equal(carDamageAt(300), 100);
  assert.ok(healthLossInCar(30) < 10 && healthLossInCar(90) > 70 && healthLossInCar(100) < 100, 'people come off a little better than cars');
  assert.ok(healthLossHit(25) > 20 && healthLossHit(49) > 80, 'and worse when hit on foot');
  assert.equal(conditionLeft(100, carDamageAt(30)), 91);
  assert.equal(conditionLeft(100, 9.6), 90, 'the bar is a whole percent');
  let left = conditionLeft(conditionLeft(100, carDamageAt(70)), carDamageAt(70));
  assert.equal(left, 2);
  assert.equal(drivable(left), false, 'two fast deer hits leave a car that will not run');
  assert.equal(healthLossStrike(100), 25);
  assert.ok(healthLossStrike(70) < 13 && healthLossStrike(70) < healthLossInCar(70), 'a deer hurts a bit, not like a car crash');
});

test('a car gets less reliable as it wears, and stops running at the end', () => {
  assert.equal(drivable(100), true);
  assert.equal(drivable(undefined), true, 'a car nobody has touched is fine');
  assert.equal(drivable(11), true);
  assert.equal(drivable(10), false);
  assert.equal(powerOf(100), 1);
  assert.equal(powerOf(30), 1);
  assert.ok(powerOf(15) < 1 && powerOf(15) >= 0.4);
  assert.equal(reliabilityText(100), 'Good');
  assert.equal(reliabilityText(60), 'Worn');
  assert.equal(reliabilityText(20), 'Unreliable');
  assert.equal(reliabilityText(10), 'Won\'t run');
  let cuts = 0;
  for (let t = 0; t < 1000; t++) if (cutsOut(12, t / 10)) cuts++;
  assert.ok(cuts > 0 && cuts < 500, `${cuts}`);
  for (let t = 0; t < 1000; t++) assert.equal(cutsOut(60, t / 10), false);
});

test('off road wears a little per km and slows it', () => {
  assert.equal(offRoadWear(1000), 2);
  assert.equal(offRoadWear(-500), 1);
  const after = offRoadSlowing(20, 0.1);
  assert.ok(after < 20 && after > 19.5);
});

test('with no driver a car rolls on, slowing, and stops', () => {
  const { seconds, metres } = coastDistance(30);
  assert.ok(seconds > 5 && seconds < 60, `${seconds}`);
  assert.ok(metres > 50 && metres < 500, `${metres}`);
  const coast = { lat: 38.9, lng: -77.4, heading: 0, speed: 30, at: 1000 };
  const start = coastPlace(coast, 1000), middle = coastPlace(coast, 1000 + (seconds * 1000) / 2), end = coastPlace(coast, 1000 + seconds * 2000);
  assert.equal(start.lat, 38.9);
  assert.ok(middle.lat > start.lat && end.lat > middle.lat);
  assert.ok(middle.speed < 30 && middle.speed > 0);
  assert.equal(end.speed, 0);
  assert.equal(end.done, true);
  assert.ok(Math.abs((end.lat - 38.9) * 111320 - metres) < 1);
  assert.equal(coastPlace({ ...coast, speed: 0 }, 5000).done, true, 'not moving, it stays');
});

const AT = { lat: 38.9, lng: -77.4 };
const shop = (metres, kind = 'fuel', name = 'Shell') => ({ lat: AT.lat + metres / 111320, lng: AT.lng, kind, name });

test('about half of gas stations work, the same for everyone', () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ lat: 30 + i * 0.01, lng: -80 - i * 0.013, kind: 'fuel' }));
  const share = many.filter((s) => stationWorks(s)).length / many.length;
  assert.ok(Math.abs(share - GAME.stations.workingChance) < 0.08, `${share}`);
  assert.equal(stationWorks(many[3]), stationWorks({ ...many[3] }));
});

test('a car can only use what\'s in reach and suits it', () => {
  assert.equal(stationFor(AT, [], false), null);
  assert.equal(stationFor(AT, [shop(200)], false), null, 'too far');
  assert.equal(stationFor(AT, [shop(10)], false).station.name, 'Shell');
  assert.equal(stationFor(AT, [shop(10, 'charger', 'Tesla')], false), null, 'a charger is no use to a gas car');
  assert.equal(stationFor(AT, [shop(30), shop(10, 'fuel', 'BP')], false).station.name, 'BP', 'nearest first');
});

test('an electric car charges at a real charger, always, or at a gas station if it works', () => {
  const real = stationFor(AT, [shop(10), shop(40, 'charger', 'Tesla Supercharger')], true);
  assert.equal(real.station.name, 'Tesla Supercharger');
  assert.equal(real.works, true);
  const atPumps = stationFor(AT, [shop(10)], true);
  assert.equal(atPumps.works, stationWorks(atPumps.station));
});

const box = (lat, lng, metres) => { const d = metres / 111320, e = d / Math.cos((lat * Math.PI) / 180); return [[lng - e, lat - d], [lng + e, lat - d], [lng + e, lat + d], [lng - e, lat + d]]; };

test('outlines can be asked about a point, quickly and rightly', () => {
  const index = new FootprintIndex([box(38.9, -77.4, 20), box(38.91, -77.41, 5)]);
  assert.equal(index.contains(38.9, -77.4), true);
  assert.equal(index.contains(38.9 + 19 / 111320, -77.4), true);
  assert.equal(index.contains(38.9 + 21 / 111320, -77.4), false);
  assert.equal(index.contains(38.91, -77.41), true);
  assert.equal(index.contains(38.905, -77.405), false, 'and between them, nothing');
  assert.equal(new FootprintIndex([]).contains(38.9, -77.4), false);
});

test('a car stops short of a wall, a little inside the outline, and never jumps over one', () => {
  const index = new FootprintIndex([box(38.9, -77.4, 20)]), contains = (lat, lng) => index.contains(lat, lng), south = 38.9 - 20 / 111320;
  const me = (metresShort, heading = 0) => ({ lat: south - metresShort / 111320, lng: -77.4, heading, ...CAR_BOX });
  assert.equal(buildingHit(me(10), 0.5, contains, 1), null, 'still short of it');
  assert.equal(buildingHit(me(1.6), 0.5, contains, 1), null, 'its bonnet can poke over, as the outline may not match the picture');
  assert.ok(buildingHit(me(0), 0.5, contains, 1), 'but not further');
  const fast = buildingHit(me(-5 - 40), 50, contains, 1);
  assert.ok(fast, 'a whole 50 m in one frame still hits');
  assert.ok(fast.back > 20, `and it goes back to the wall: ${fast.back}`);
  assert.equal(buildingHit({ ...me(5), lng: -77.4 - 40 / 111320 }, 10, contains, 1), null, 'going past the side, nothing');
  assert.equal(buildingHit({ lat: 38.9, lng: -77.4, heading: 90, ...CAR_BOX }, 0.5, contains, 1), null, 'and a car that finds itself inside can always drive out');
  const north = 38.9 + 20 / 111320;
  const backing = { lat: north + 1 / 111320, lng: -77.4, heading: 0, ...CAR_BOX };
  const hit = buildingHit(backing, -0.8, contains, 1);
  assert.ok(hit && hit.back < 0, 'reversing into the wall behind');
  const out = move(backing.lat, backing.lng, backing.heading, -hit.back);
  assert.ok(out.lat > backing.lat && !contains(out.lat, out.lng), 'the way out is forward, back outside');
});

test('hitting a building takes the car, not the building', () => {
  const { kill, wreck } = crashOutcome('building', 50, GAME.crash);
  assert.deepEqual(kill, ['me']);
  assert.deepEqual(wreck, ['me']);
  assert.deepEqual(crashOutcome('building', 20, GAME.crash).hurt, ['me']);
});

test('each shot wears a car down to 0, and the shot after that blows it up', () => {
  const rules = GAME.shots;
  let condition = 100, shots = 0;
  while (condition > 0) {
    const out = carShot({ condition, damage: 1, riders: 0, roll: 0, pick: 0 }, rules);
    assert.equal(out.blew, false);
    condition = out.condition;
    shots++;
  }
  assert.equal(shots, 100 / rules.carPerDamage, 'a handgun takes 20');
  assert.equal(carShot({ condition: 7, damage: 5, riders: 0, roll: 0, pick: 0 }, rules).condition, 0, 'never below 0');
  const blast = carShot({ condition: 0, damage: 1, riders: 3, roll: 0, pick: 0 }, rules);
  assert.deepEqual(blast, { condition: 0, blew: true, rider: null }, 'nobody is shot in the blast: they burn');
});

test('someone inside is hit a quarter of the time for each person there, so four inside are hit every shot', () => {
  const rules = GAME.shots, hit = (riders, roll, pick = 0) => carShot({ condition: 80, damage: 1, riders, roll, pick }, rules).rider;
  assert.equal(hit(0, 0), null, 'an empty car');
  assert.equal(hit(1, 0.24), 0);
  assert.equal(hit(1, 0.26), null);
  assert.equal(hit(2, 0.49, 0.99), 1, 'which of them by pick');
  assert.equal(hit(2, 0.51), null);
  assert.equal(hit(4, 0.999, 0.6), 2, 'four inside: always one of them');
});
