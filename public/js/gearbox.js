// An approximate automatic gearbox for the sound and the tachometer: turns road speed into a gear and revs, shifting
// early when cruising and late when accelerating. It has no effect on how the car moves. Pure, tested in node.
const MPS_TO_MPH = 2.23694;
const SHIFT_AT = 0.9;       // of redline: shift up here
const DOWN_MARGIN = 0.72;   // of redline: shift down when the lower gear would be below this
const CRUISE_UP = 0.33;     // of redline: on a light throttle, shift up once the next gear would still be above this
const CRUISE_DOWN = 0.24;   // of redline: on a light throttle, shift down below this
const LIGHT = 0.4;          // throttle below this drives like cruising
const SHIFT_TIME = 0.22;    // s the power is cut for during a shift, which is what makes it audible
const REVERSE_TOP = 30;     // mph at redline in reverse

export const newGearbox = () => ({ gear: 1, rpm: 0, shifting: 0, load: 0, label: 'N' });

export function stepGearbox(box, car, speed, throttle, dt) {
  const mph = Math.abs(speed) * MPS_TO_MPH;
  const tops = car.gearTops;
  box.gear = Math.min(box.gear, tops.length); // the car may have just changed
  const revsIn = (gear) => (mph / tops[gear - 1]) * car.redline;
  box.shifting = Math.max(0, box.shifting - dt);
  const reversing = speed < -0.05;

  if (!reversing && !box.shifting) {
    const light = throttle < LIGHT;
    const up = box.gear < tops.length && (light ? revsIn(box.gear + 1) >= car.redline * CRUISE_UP : revsIn(box.gear) >= car.redline * SHIFT_AT);
    const down = box.gear > 1 && (light ? revsIn(box.gear) < car.redline * CRUISE_DOWN : revsIn(box.gear - 1) < car.redline * DOWN_MARGIN);
    if (up) {
      box.gear++;
      box.shifting = SHIFT_TIME;
    } else if (down) {
      box.gear--;
      box.shifting = SHIFT_TIME * 0.7;
    }
  }
  if (box.gear > 1 && mph < 1) box.gear = 1;

  const wheelRevs = reversing ? (mph / REVERSE_TOP) * car.redline : revsIn(box.gear);
  // Light on the throttle at a standstill, the engine still rises a little, as a clutch would let it.
  const target = Math.min(car.redline, Math.max(car.idle + (mph < 8 ? throttle * car.redline * 0.25 : 0), wheelRevs));
  const rate = box.shifting ? 14 : 8;
  box.rpm += (target - box.rpm) * (1 - Math.exp(-rate * dt));
  const wanted = box.shifting ? 0.1 : throttle;
  box.load += (wanted - box.load) * (1 - Math.exp(-(box.shifting ? 30 : 7) * dt));
  box.label = reversing ? 'R' : mph < 0.5 && !throttle ? 'N' : String(box.gear);
  return box;
}
