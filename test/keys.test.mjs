import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_LIST, keyListHtml } from '../public/js/keyList.js';

const pressed = (mode) => KEY_LIST[mode].groups.flatMap((group) => group.keys.flatMap(([keys]) => keys));

test('the key list shows only the keys for where you are', () => {
  const car = keyListHtml(false), foot = keyListHtml(true);
  assert.match(car, /In the car/);
  assert.doesNotMatch(car, /On foot|Flashlight|Compass/);
  assert.match(foot, /On foot/);
  assert.doesNotMatch(foot, /In the car|Handbrake|FSD|Headlights/);
});

test('both lists say how to pause, close and see the list again', () => {
  for (const mode of ['car', 'foot']) for (const key of ['P', 'K', 'Esc', 'L']) assert.ok(pressed(mode).includes(key), `${mode} ${key}`);
});

test('the key list escapes what it shows', () => {
  assert.doesNotMatch(keyListHtml(false), /<kbd>[^<]*[<>][^<]*<\/kbd>/);
});
