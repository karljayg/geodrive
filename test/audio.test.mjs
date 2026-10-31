import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAR_PROFILES } from '../public/js/cars.js';
import { AUDIO_PRESETS, engineCutoff, engineIntensity, layerMix, roadLevel, windLevel } from '../public/js/engineMix.js';
import { newGearbox, stepGearbox } from '../public/js/gearbox.js';

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
