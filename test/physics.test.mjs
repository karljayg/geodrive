import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, newCar, stepCar } from '../public/js/physics.js';
import { formatTime, newTrip, tripFigures, updateTrip } from '../public/js/trip.js';
import { leadDistance, move, distance, easeAngle } from '../public/js/camera.js';

const DT = 1 / 60;
const run = (car, input, seconds) => {
  let moved = 0;
  for (let i = 0; i < seconds * 60; i++) moved += stepCar(car, input, DT);
  return moved;
};
const turned = (from, to) => ((to - from + 540) % 360) - 180;

test('a stopped car does not turn on the spot', () => {
  const car = newCar();
  run(car, { steer: 1 }, 3);
  assert.equal(car.heading, 0);
  assert.equal(car.speed, 0);
});

test('steering right turns right going forward, the other way in reverse', () => {
  const a = newCar();
  run(a, { throttle: 1 }, 2);
  const h = a.heading;
  run(a, { throttle: 1, steer: 1 }, 1);
  assert.ok(turned(h, a.heading) > 5);

  const b = newCar();
  run(b, { reverse: true }, 2);
  assert.ok(b.speed < 0);
  run(b, { reverse: true, steer: 1 }, 1);
  assert.ok(turned(0, b.heading) < -5);
});

test('turning radius grows with speed instead of yawing at a constant rate', () => {
  const rate = (seconds) => {
    const car = newCar();
    run(car, { throttle: 1 }, seconds);
    const v = car.speed, h = car.heading;
    run(car, { throttle: 1, steer: 1 }, 1);
    return { v, deg: Math.abs(turned(h, car.heading)) };
  };
  const slow = rate(1), fast = rate(5);
  assert.ok(fast.v > slow.v * 3);
  assert.ok(fast.deg < slow.deg);
  assert.ok(fast.v * ((fast.deg * Math.PI) / 180) < CAR.maxLateral * 1.3); // lateral grip respected
});

test('speed stays inside the limits; braking stops before reversing', () => {
  const car = newCar();
  run(car, { throttle: 1 }, 60);
  assert.equal(car.speed, CAR.topSpeed); // keeps climbing all the way to 500 mph
  assert.ok(Math.abs(car.speed * 2.23694 - 500) < 0.1);
  run(car, { reverse: true }, 0.5);
  assert.ok(car.speed > 0);
  run(car, { reverse: true }, 20);
  assert.ok(car.speed < 0); // stopped from 500 mph inside 20 s
  run(car, { reverse: true }, 60);
  assert.ok(car.speed >= -CAR.maxReverse && car.speed < 0);
});

test('coasting and the handbrake bring the car to rest', () => {
  const car = newCar();
  run(car, { throttle: 1 }, 5);
  run(car, { handbrake: true }, 10);
  assert.equal(car.speed, 0);
});

test('FSD pedals: part throttle is gentler, and its brake stops without reversing', () => {
  const full = newCar(), part = newCar();
  run(full, { throttle: 1 }, 2);
  run(part, { throttle: 0.5 }, 2);
  assert.ok(part.speed < full.speed * 0.6);
  run(full, { brake: 20 }, 5);
  assert.equal(full.speed, 0);
});

test('the car can still steer at 500 mph', () => {
  const car = newCar();
  run(car, { throttle: 1 }, 60);
  const h = car.heading;
  run(car, { throttle: 1, steer: 1 }, 2);
  assert.ok(turned(h, car.heading) > 15);
});

test('camera helpers', () => {
  const p = move(38.95, -77.45, 90, 1000);
  assert.ok(Math.abs(distance(38.95, -77.45, p.lat, p.lng) - 1000) < 0.01);
  assert.equal(leadDistance(200, 60, 35, 0), 0);          // car at screen centre: no lead
  assert.ok(leadDistance(400, 60, 35, 0.5) > leadDistance(200, 60, 35, 0.5)); // scales with zoom
  assert.ok(Math.abs(easeAngle(350, 10, 0.5) - 0) < 1e-9); // crosses north the short way
});

test('trip stats add up', () => {
  const trip = newTrip();
  const state = { speed: 0, fsd: false, onRoad: true, onBridge: false };
  updateTrip(trip, 5, 0, state);
  assert.equal(trip.elapsed, 0, 'the clock waits for the first movement');
  updateTrip(trip, 10, 1609.344, { ...state, speed: 160 });
  updateTrip(trip, 10, 0, state); // stopped: counts as elapsed, not moving
  updateTrip(trip, 10, 1609.344, { ...state, speed: 160, fsd: true, onBridge: true });
  updateTrip(trip, 1, 0, { ...state, onBridge: true });
  updateTrip(trip, 1, 0, state);
  updateTrip(trip, 1, 804.672, { ...state, speed: 20, onRoad: false, onBridge: true });
  const f = tripFigures(trip);
  assert.equal(f.miles, '2.50 mi');
  assert.equal(f.elapsed, '0:33');
  assert.equal(f.moving, '0:21');
  assert.equal(f.top, '358 mph');
  assert.equal(f.fsdMiles, '1.00 mi');
  assert.equal(f.fsdShare, '40%');
  assert.equal(f.offRoad, '0.50 mi');
  assert.equal(f.bridges, '2', 'one bridge counts once, however long it lasts');
  assert.equal(f.average, '429 mph');
});

test('times read like a clock', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(75.9), '1:15');
  assert.equal(formatTime(3725), '1:02:05');
});
