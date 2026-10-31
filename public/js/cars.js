// Car profiles. Engine sound and gearing only for now; handling can move here when cars differ in how they drive.
// gearTops: mph at redline in each gear. An electric car has one gear, so it never shifts.
// Sound: cylinders set the firing note, brightness the filter, rumble the low note, roar the intake noise, whine a motor tone.
// sound: which recordings, and the engine revs each one's note stands for: the measured pitch scaled from the idle (see audio/samples/SOURCES.md).
const recorded = (set, layers) => ({ set, layers });

export const CAR_PROFILES = {
  sport: { name: 'Sports car', sound: recorded('sports', { idle: 950, load: 950, mid: 2473, high: 5127 }), idle: 950, redline: 8000, gearTops: [50, 90, 140, 210, 320, 500], cylinders: 6, brightness: 1.3, rumble: 0.35, roar: 0.35, whine: 0 },
  muscle: { name: 'Muscle V8', sound: recorded('muscle', { idle: 750, load: 750, mid: 1164, high: 4306 }), idle: 750, redline: 6500, gearTops: [55, 100, 160, 240, 350, 500], cylinders: 8, brightness: 0.8, rumble: 0.9, roar: 0.3, whine: 0 },
  hatch: { name: 'Normal car', sound: recorded('normal', { idle: 850, load: 907, mid: 2054, high: 4350 }), idle: 850, redline: 6800, gearTops: [35, 65, 105, 170, 270, 500], cylinders: 4, brightness: 1, rumble: 0.2, roar: 0.25, whine: 0 },
  truck: { name: 'Truck', sound: recorded('truck', { idle: 650, load: 710, mid: 1149 }), idle: 650, redline: 3800, gearTops: [25, 45, 70, 105, 150, 220, 340, 500], cylinders: 6, brightness: 0.55, rumble: 1, roar: 0.5, whine: 0 },
  electric: { name: 'Electric', idle: 0, redline: 18000, gearTops: [500], cylinders: 0, brightness: 1, rumble: 0, roar: 0.08, whine: 1 },
};
// Horn notes in Hz: two together, as real horns have.
export const hornFor = (id) => ({ truck: [185, 233], muscle: [330, 415], electric: [523, 659] }[id] || [415, 523]);
export const DEFAULT_PROFILE = 'sport';
export const profileFor = (id) => CAR_PROFILES[id] || CAR_PROFILES[DEFAULT_PROFILE];
