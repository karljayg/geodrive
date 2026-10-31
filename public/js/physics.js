// Car physics: a kinematic bicycle model. Pure functions, no DOM, so test/physics.test.mjs can run them in node.
// The important property: yaw comes from speed and steering angle, so a stopped car cannot turn
// and a reversing car turns the other way, like a real one.

export const CAR = {
  wheelbase: 2.7,        // m
  maxSteer: 0.6,         // rad at the wheels, walking pace
  maxLateral: 11,        // m/s² of cornering grip; limits the steering angle at speed
  minYaw: 0.2,           // rad/s the car can always turn, so very high speeds can still steer
  steerRate: 2.6,        // rad/s turning the wheel
  steerReturn: 4.5,      // rad/s self-centring
  engine: 8.5,           // m/s² from a standstill
  topSpeed: 223.5,       // m/s (500 mph)
  brake: 15,             // m/s², plus brakeFade per m/s so 500 mph doesn't take a mile to stop
  brakeFade: 0.12,
  reverseAccel: 5,       // m/s²
  maxReverse: 12,        // m/s (27 mph)
  rolling: 0.25,         // m/s² when coasting
  aero: 0.00012,         // per metre: drag off the throttle grows with speed²
  handbrake: 11,         // m/s²
};

export const newCar = () => ({ speed: 0, heading: 0, steer: 0 });

const towardZero = (v, amount) => (v > 0 ? Math.max(0, v - amount) : Math.min(0, v + amount));

// input: { throttle (0..1), reverse, steer (-1 left .. 1 right), handbrake, brake (m/s², from FSD; never reverses) }. Returns the metres moved along the heading.
export function stepCar(car, input, dt, spec = CAR) {
  let v = car.speed;
  const forward = v > 0.05, backward = v < -0.05;

  if (input.throttle) {
    if (backward) v = towardZero(v, (spec.brake + spec.brakeFade * Math.abs(v)) * dt);
    else v = Math.min(spec.topSpeed, v + input.throttle * spec.engine * (1 - (0.2 * v) / spec.topSpeed) * dt);
  } else if (input.reverse) {
    if (forward) v = towardZero(v, (spec.brake + spec.brakeFade * Math.abs(v)) * dt);
    else v = Math.max(-spec.maxReverse, v - spec.reverseAccel * dt);
  } else {
    v = towardZero(v, spec.rolling * dt);
  }
  if (!input.throttle) v = towardZero(v, spec.aero * v * v * dt); // the engine always wins, all the way to top speed
  if (input.handbrake) v = towardZero(v, spec.handbrake * dt);
  if (input.brake) v = towardZero(v, input.brake * dt);

  // Grip limits how far the wheels can usefully turn at speed: v²·tan(steer)/L <= maxLateral.
  const lateral = Math.max(spec.maxLateral, spec.minYaw * Math.abs(v));
  const grip = Math.atan((spec.wheelbase * lateral) / Math.max(v * v, 0.01));
  const limit = Math.min(spec.maxSteer, grip);
  const steer = input.steer || 0;
  const target = steer * limit;
  const rate = steer ? spec.steerRate : spec.steerReturn;
  const delta = target - car.steer;
  car.steer += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);

  const yawRate = (v * Math.tan(car.steer)) / spec.wheelbase; // rad/s; zero when stopped
  car.heading = (car.heading + (yawRate * dt * 180) / Math.PI + 360) % 360;
  car.speed = v;
  return v * dt;
}
