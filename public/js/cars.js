// Car profiles. Engine sound and gearing only for now; handling can move here when cars differ in how they drive.
// gearTops: mph at redline in each gear. An electric car has one gear, so it never shifts.
// Sound: cylinders set the firing note, brightness the filter, rumble the low note, roar the intake noise, whine a motor tone.
export const CAR_PROFILES = {
  sport: { name: 'Sports car', idle: 950, redline: 8000, gearTops: [50, 90, 140, 210, 320, 500], cylinders: 6, brightness: 1.3, rumble: 0.35, roar: 0.35, whine: 0 },
  muscle: { name: 'Muscle V8', idle: 750, redline: 6500, gearTops: [55, 100, 160, 240, 350, 500], cylinders: 8, brightness: 0.8, rumble: 0.9, roar: 0.3, whine: 0 },
  hatch: { name: 'Small hatchback', idle: 850, redline: 6800, gearTops: [35, 65, 105, 170, 270, 500], cylinders: 4, brightness: 1, rumble: 0.2, roar: 0.25, whine: 0 },
  truck: { name: 'Diesel truck', idle: 650, redline: 3800, gearTops: [25, 45, 70, 105, 150, 220, 340, 500], cylinders: 6, brightness: 0.55, rumble: 1, roar: 0.5, whine: 0 },
  electric: { name: 'Electric', idle: 0, redline: 18000, gearTops: [500], cylinders: 0, brightness: 1, rumble: 0, roar: 0.08, whine: 1 },
};
export const DEFAULT_PROFILE = 'sport';
export const profileFor = (id) => CAR_PROFILES[id] || CAR_PROFILES[DEFAULT_PROFILE];
