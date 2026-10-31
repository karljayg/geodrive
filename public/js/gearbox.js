// An approximate automatic gearbox: turns road speed into a gear and engine revs. Pure, tested in node.
const MPS_TO_MPH = 2.23694;
const SHIFT_AT = 0.9;       // of redline: shift up here
const DOWN_MARGIN = 0.72;   // of redline: shift down when the lower gear would be below this
const SHIFT_TIME = 0.22;    // s the power is cut for during a shift, which is what makes it audible
const REVERSE_TOP = 30;     // mph at redline in reverse

export const newGearbox = () => ({ gear: 1, rpm: 0, shifting: 0, load: 0, label: 'N' });

export function stepGearbox(box, car, speed, throttle, dt) {
  const mph = Math.abs(speed) * MPS_TO_MPH;
  const tops = car.gearTops;
  const revsIn = (gear) => (mph / tops[gear - 1]) * car.redline;
  box.shifting = Math.max(0, box.shifting - dt);
  const reversing = speed < -0.05;

  if (!reversing && !box.shifting) {
    if (box.gear < tops.length && revsIn(box.gear) >= car.redline * SHIFT_AT) {
      box.gear++;
      box.shifting = SHIFT_TIME;
    } else if (box.gear > 1 && revsIn(box.gear - 1) < car.redline * DOWN_MARGIN) {
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
