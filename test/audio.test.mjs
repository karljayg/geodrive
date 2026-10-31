import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAR_PROFILES } from '../public/js/cars.js';
import { AUDIO_PRESETS, engineCutoff, engineIntensity, layerMix, roadLevel, windLevel } from '../public/js/engineMix.js';
import { newGearbox, stepGearbox } from '../public/js/gearbox.js';
import { BODY_SHAPES, buildCarGlb, carPicture, colorFactor, DEFAULT_COLOR } from '../public/js/carModel.js';
import { clockText, darknessAt, tintAt } from '../public/js/daylight.js';
import { beamBrightness, beamPools, tailDots } from '../public/js/headlights.js';

const sport = CAR_PROFILES.sport, layers = sport.sound.layers;

test('load, not revs, makes it aggressive', () => {
  const easy = engineIntensity(4000, 0.1, sport.idle, sport.redline);
  const hard = engineIntensity(4000, 1, sport.idle, sport.redline);
  assert.ok(hard > easy * 2.5);
  assert.ok(engineIntensity(950, 0, sport.idle, sport.redline) <= 0.13, 'idle is about 10%');
  assert.ok(engineIntensity(sport.redline, 1, sport.idle, sport.redline) >= 0.75, 'full throttle is 75% or more');
  assert.ok(engineCutoff(1) > engineCutoff(0.1) * 3);
});

test('neighbouring layers blend smoothly with constant power, and pitch follows revs', () => {
  let last = null;
  for (let rpm = 900; rpm < 8000; rpm += 25) {
    const { gains } = layerMix(layers, rpm, 0.5);
    const power = Object.values(gains).reduce((a, g) => a + g * g, 0);
    assert.ok(Math.abs(power - 1) < 1e-6, `power at ${rpm}`);
    if (last) for (const k of Object.keys(gains)) assert.ok(Math.abs(gains[k] - last[k]) < 0.1, `${k} jumps at ${rpm}`);
    last = gains;
  }
  const a = layerMix(layers, 3000, 0).rates.mid, b = layerMix(layers, 3600, 1).rates.mid;
  assert.ok(Math.abs(b / a - 1.2) < 1e-6);
});

test('off the throttle uses the idle recording, on it the loaded one', () => {
  assert.equal(layerMix(layers, 950, 0).gains.load, 0);
  assert.ok(Math.abs(layerMix(layers, 950, 1).gains.idle) < 1e-9);
});

test('a truck with no high layer stays on its top layer', () => {
  const { gains } = layerMix(CAR_PROFILES.truck.sound.layers, 3500, 1);
  assert.equal(gains.mid, 1);
});

test('60 mph on a light throttle cruises at low revs, full throttle revs out', () => {
  const run = (throttle) => {
    const box = newGearbox();
    for (let i = 0; i < 2400; i++) stepGearbox(box, sport, 60 * 0.44704 * Math.min(1, i / 1200), throttle, 1 / 60);
    return box;
  };
  const cruise = run(0.15), hard = run(1);
  assert.ok(cruise.rpm < 3600, `cruise at ${cruise.rpm}`);
  assert.ok(hard.rpm > cruise.rpm + 1500, `hard at ${hard.rpm}`);
});

test('road and wind stay gentle: wind nearly silent in town, both capped', () => {
  assert.ok(roadLevel(10) < 0.05);
  assert.ok(windLevel(25) === 0);
  assert.ok(windLevel(500) <= 0.7 && roadLevel(500) <= 0.5);
  assert.ok(AUDIO_PRESETS.quiet.push < AUDIO_PRESETS.sport.push);
});

test('every recorded layer a car names exists', () => {
  for (const car of Object.values(CAR_PROFILES)) {
    if (!car.sound) continue;
    for (const layer of Object.keys(car.sound.layers)) readFileSync(new URL(`../public/audio/samples/${car.sound.set}/${layer}.flac`, import.meta.url));
  }
});

test('every car type builds a valid model in any colour, and bad colours fall back', () => {
  for (const type of Object.keys(CAR_PROFILES)) {
    const glb = buildCarGlb(type, '#ff0000');
    const view = new DataView(glb.buffer);
    assert.equal(view.getUint32(0, true), 0x46546c67);
    assert.equal(view.getUint32(8, true), glb.length);
    const len = view.getUint32(12, true);
    const gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
    assert.equal(gltf.materials[0].pbrMetallicRoughness.baseColorFactor[0], 1);
    assert.ok(carPicture(type, '#ff0000').includes('#ff0000'));
    assert.ok(BODY_SHAPES[type], `${type} has a shape`);
  }
  assert.notDeepEqual(buildCarGlb('truck', '#fff'), buildCarGlb('sport', '#fff'));
  assert.deepEqual(colorFactor('nonsense'), colorFactor(DEFAULT_COLOR));
});

test('time of day: clear by day, dark at night, warm at dusk', () => {
  assert.deepEqual(tintAt(12), [255, 255, 255]);
  assert.equal(darknessAt(12), 0);
  assert.ok(darknessAt(23) > 0.85 && darknessAt(2) > 0.85);
  const dusk = tintAt(18);
  assert.ok(dusk[0] > dusk[2], 'dusk is warm');
  assert.deepEqual(tintAt(24), tintAt(0));
  assert.equal(clockText(0), '12:00 AM');
  assert.equal(clockText(13.5), '1:30 PM');
});

test('headlights: dim at the nose, brightest 3-4 car lengths ahead, gone by 6, narrow, nothing behind', () => {
  const L = 4, W = 1.8;
  assert.ok(beamBrightness(0.1, L) < 0.3);
  assert.equal(beamBrightness(3.5 * L, L), 1);
  assert.ok(beamBrightness(1 * L, L) < 0.4, 'dim where the old peak was');
  assert.ok(beamBrightness(5.5 * L, L) < 0.15);
  assert.equal(beamBrightness(6 * L, L), 0);
  assert.equal(beamBrightness(-1, L), 0);
  const pools = beamPools(L, W);
  for (const p of pools) {
    assert.ok(p.f - p.ry >= L / 2 - 1e-9, 'no light behind the nose');
    assert.ok(Math.abs(p.r) + p.rx < W * 1.3 + (p.f - L / 2) * 0.2, 'little sideways spill');
    assert.ok(p.f <= L / 2 + 6 * L);
  }
  const twice = beamPools(L * 2, W * 2);
  assert.ok(Math.abs(twice[10].f - pools[10].f * 2) < 1e-9, 'scales with the car');
});

test('tail lights are dots behind the car: none when off, bigger when braking, and they turn with the car', () => {
  const view = { x: 100, y: 100, perMetre: 7, foreshorten: 0.5, angle: 0 };
  assert.equal(tailDots(view, 4, 2, false, false).length, 0);
  const lit = tailDots(view, 4, 2, true, false), brake = tailDots(view, 4, 2, false, true);
  assert.equal(lit.length, 2);
  assert.ok(brake[0].radius > lit[0].radius && brake[0].halo > lit[0].halo);
  assert.ok(lit[0].x < 100 && lit[1].x > 100 && lit[0].y === lit[1].y);
  const turned = tailDots({ ...view, angle: 90 }, 4, 2, true, false);
  assert.ok((turned[0].x + turned[1].x) / 2 < 100, 'pointing right, the back is on the left');
});
