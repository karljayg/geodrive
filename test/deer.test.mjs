import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME } from '../public/js/gameConfig.js';
import { cookMeat, cookOffer, frameOf, newDeer, plantDeer, stackInto, stepDeer } from '../public/js/deer.js';
import { FLAG_BRIDGE } from '../public/js/road.js';
import { plantCars } from '../public/js/worldCars.js';
import { metresApart } from '../public/js/protocol.js';
import { firstHit } from '../public/js/collide.js';
import { crashOutcome } from '../public/js/worldOps.js';
import { carDamageAt, healthLossInCar } from '../public/js/carDamage.js';
import { Vitals } from '../public/js/vitals.js';
import { BAG_SLOTS } from '../public/js/pocketData.js';

const cfg = GAME.deer;
const METRE = 1 / 111320;
const road = (lat = 38.9, lng = -77.4, metres = 30000, f = 0) => ({ id: 'w', f, n: [], c: [lat, lng, lat + metres * METRE, lng] });

test('a deer stands until someone is close, then gallops away', () => {
  const deer = newDeer({ id: 'doe', lat: 0, lng: 0, heading: 0, stag: false });
  stepDeer(deer, { x: 30, y: 0 }, 1, 0, cfg);
  assert.equal(deer.gait, 'idle');
  assert.equal(deer.x, 0);
  const before = Math.hypot(deer.x - 5, deer.y);
  stepDeer(deer, { x: 5, y: 0 }, 0.4, 1000, cfg);
  assert.equal(deer.gait, 'gallop');
  assert.equal(deer.speed, cfg.fleeSpeed);
  assert.ok(Math.hypot(deer.x - 5, deer.y) > before, 'farther from the player');
  assert.ok(deer.x < 0, 'ran the other way');
});

test('the bolt keeps going for the alarm, then it walks back toward home', () => {
  const deer = newDeer({ id: 'doe', lat: 0, lng: 0, heading: 0, stag: false });
  stepDeer(deer, { x: 4, y: 0 }, 0.2, 0, cfg);
  const away = deer.x;
  stepDeer(deer, null, 0.5, 1000, cfg);
  assert.ok(deer.x < away, 'still running after the player is gone');
  stepDeer(deer, null, 0.2, cfg.alarmMs + 50, cfg);
  assert.equal(deer.speed, cfg.wanderSpeed);
  assert.equal(deer.goalX, 0);
  assert.equal(deer.goalY, 0);
});

test('deer are spaced along a road at about twice the cars\' distance, none on bridges', () => {
  const deer = plantDeer([road()]), cars = plantCars({ kerbs: [{ c: road().c, out: 3 }] }); // a quiet street's kerb, cars' most common place
  assert.deepEqual(plantDeer([road()]), plantDeer([road()]), 'same for everyone');
  const expected = 30000 / GAME.deer.every;
  assert.ok(deer.length > expected * 0.7 && deer.length < expected * 1.4, `${deer.length}`);
  assert.ok(deer.length < cars.length * 0.7, `half as common: ${deer.length} vs ${cars.length} cars`);
  assert.equal(plantDeer([road(38.9, -77.4, 30000, FLAG_BRIDGE)]).length, 0);
  for (const one of deer) {
    assert.ok(Math.abs(metresApart(one, { lat: one.lat, lng: -77.4 }) - GAME.deer.verge) < 0.1, 'off the verge');
    assert.equal(typeof one.stag, 'boolean');
    assert.match(one.id, /^d_/);
  }
});

const mph = (n) => n / 2.23694;

test('hitting a deer hurts the driver and damages the car, and does not wreck it', () => {
  const plain = (speed) => { const { mph: _, ...rest } = crashOutcome('deer', mph(speed), GAME.crash); return rest; };
  assert.deepEqual(plain(4), { kill: [], hurt: [], wreck: [] });
  assert.deepEqual(plain(30), { kill: [], hurt: ['me'], wreck: [] });
  assert.deepEqual(plain(100), { kill: [], hurt: ['me'], wreck: [] });
  assert.ok(carDamageAt(30) > 0 && carDamageAt(30) < carDamageAt(80));
  assert.ok(healthLossInCar(30) > 0 && healthLossInCar(30) < healthLossInCar(80));
});

test('the car meets a deer standing in front of it', () => {
  const lat = 38.9, lng = -77.4;
  const me = { lat, lng, heading: 0, speed: 12, halfWidth: 0.9, halfLength: 2.2 };
  const deer = { id: 'd1', kind: 'deer', lat: lat + 1 / 111320, lng, heading: 180, speed: 0, radius: GAME.deer.hitRadius };
  const hit = firstHit(me, 6, [deer]);
  assert.equal(hit.other.id, 'd1');
  assert.ok(hit.closing > 5);
  const missed = { ...deer, lng: lng + 40 / 111320 };
  assert.equal(firstHit(me, 6, [missed]), null);
});

test('one deer is 20 pieces of raw meat, and a stove, range or microwave cooks one', () => {
  for (const item of ['stove', 'proStove', 'microwave']) assert.equal(cookOffer(item, true), 'Cook the raw deer meat?');
  assert.equal(cookOffer('fridge', true), null);
  assert.equal(cookOffer('stove', false), null);
  const bag = [];
  assert.equal(stackInto(bag, { id: GAME.deer.raw, name: GAME.deer.raw }, GAME.deer.meat, BAG_SLOTS), true);
  assert.equal(bag[0].count, 20);
  assert.equal(cookMeat(bag, BAG_SLOTS), GAME.deer.cooked);
  assert.equal(bag.find((i) => i.id === GAME.deer.raw).count, 19);
  assert.equal(bag.find((i) => i.id === GAME.deer.cooked).count, 1);
  const full = Array.from({ length: BAG_SLOTS }, (_, i) => ({ id: `x${i}`, name: `x${i}`, count: 1 }));
  full[0] = { id: GAME.deer.raw, name: GAME.deer.raw, count: 3 };
  assert.equal(cookMeat(full, BAG_SLOTS), null, 'no room for a new kind');
  assert.equal(full[0].count, 3);
  const memory = { getItem: () => null, setItem() {} };
  const vitals = new Vitals(memory);
  vitals.stats.hunger = 40;
  vitals.stats.health = 80;
  const hunger = vitals.stats.hunger, health = vitals.stats.health;
  vitals.consume(GAME.deer.raw);
  assert.ok(vitals.stats.hunger > hunger);
  assert.ok(vitals.stats.health < health);
  const after = vitals.stats.hunger;
  vitals.consume(GAME.deer.cooked);
  assert.ok(vitals.stats.hunger > after);
});

test('a moving deer steps through its clip', () => {
  const deer = newDeer({ id: 'stag', lat: 0, lng: 0, heading: 0, stag: true });
  deer.speed = cfg.fleeSpeed;
  deer.gait = 'gallop';
  deer.phase = 0;
  const first = frameOf(deer);
  deer.phase = cfg.clips.gallop * 0.5;
  assert.notEqual(frameOf(deer), first);
  assert.ok(frameOf(deer) < cfg.frames.gallop);
});
