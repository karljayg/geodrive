import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME } from '../public/js/gameConfig.js';
import { frameOf, newDeer, plantDeer, stepDeer } from '../public/js/deer.js';
import { FLAG_BRIDGE } from '../public/js/road.js';
import { plantCars } from '../public/js/worldCars.js';
import { metresApart } from '../public/js/protocol.js';

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
  const deer = plantDeer([road()]), cars = plantCars([road()]);
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
