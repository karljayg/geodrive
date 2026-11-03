// The test windows' sums: overriding numbers and what can be spawned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../public/js/gameConfig.js';
import { hasItemIcon } from '../public/js/itemArt.js';
import { applyOverrides, fileValue, isTunable, spawnCatalog, spawnMatches, spawnSpots, tunables, tunedCopy } from '../public/js/testTools.js';

test('every plain number can be tuned, and lists and words can\'t', () => {
  assert.ok(isTunable('crash.carDeadlyMph'));
  assert.ok(isTunable('consumables.Crate of milk.thirst'));
  assert.ok(!isTunable('hammer.item'));
  assert.ok(!isTunable('stats.energy.warn'));
  assert.ok(!isTunable('__proto__.polluted'));
  assert.ok(tunables().length > 100);
});

test('a copy takes overrides and leaves GAME alone, for a server with many worlds', () => {
  const before = GAME.world.lives, copy = tunedCopy(GAME, { 'world.lives': 3, 'nothing.here': 9, 'hammer.item': 2 });
  assert.equal(copy.world.lives, 3);
  assert.equal(GAME.world.lives, before);
  assert.equal(copy.hammer.item, GAME.hammer.item);
  assert.equal(copy.nothing, undefined);
});

test('in a browser overrides go on GAME, and dropping one puts the file\'s number back', () => {
  const was = fileValue('crash.respawnSeconds');
  applyOverrides({ 'crash.respawnSeconds': was + 5 });
  assert.equal(GAME.crash.respawnSeconds, was + 5);
  applyOverrides({});
  assert.equal(GAME.crash.respawnSeconds, was);
});

test('spawning offers nothing under 2 letters, then names that begin with them first', () => {
  const catalog = spawnCatalog();
  assert.deepEqual(spawnMatches('b', catalog), []);
  const found = spawnMatches('ba', catalog);
  assert.ok(found.length > 0 && found[0].label.toLowerCase().startsWith('ba'));
  assert.ok(found.some((entry) => entry.name === 'Banana'));
  assert.ok(spawnMatches('truck', catalog).some((entry) => entry.kind === 'car' && entry.type === 'truck'));
  assert.ok(spawnMatches('sledge', catalog).some((entry) => entry.name === GAME.hammer.item));
});

test('everything edible and findable can be spawned', () => {
  const names = new Set(spawnCatalog().map((entry) => entry.name));
  for (const name of Object.keys(GAME.consumables)) assert.ok(names.has(name), name);
  assert.ok(hasItemIcon('Burger'));
});

test('spots spread out from the person, none on top of another', () => {
  const spots = spawnSpots(50, 1.5, 1), places = spots.map(({ bearing, metres }) => [Math.sin((bearing * Math.PI) / 180) * metres, Math.cos((bearing * Math.PI) / 180) * metres]);
  assert.ok(spots.every(({ metres }) => metres >= 1.5));
  for (let i = 0; i < places.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(places[i][0] - places[j][0], places[i][1] - places[j][1]) > 0.3);
});
