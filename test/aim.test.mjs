import test from 'node:test';
import assert from 'node:assert/strict';
import { aimOf, firstInShot, groundOfScreen, screenOfGround, shotHits, stepAim } from '../public/js/aim.js';
import { newWalker, placeCamera } from '../public/js/footWalker.js';

const view = { width: 800, height: 600, range: 65, tilt: 62, fovY: 35, below: 0.45 };

test('the scope mark is the ground the shot goes to', () => {
  for (const mark of [{ x: 400, y: 300 }, { x: 520, y: 260 }, { x: 180, y: 420 }, { x: 640, y: 200 }]) {
    const shot = aimOf(mark.x, mark.y, 0.4, view);
    assert.ok(shot.point, `${mark.x},${mark.y}`);
    const back = screenOfGround(shot.ahead, shot.side, view);
    assert.ok(Math.abs(back.x - mark.x) < 0.05 && Math.abs(back.y - mark.y) < 0.05, `back to ${back.x},${back.y}`);
    const bearing = Math.atan2(shot.point.x, shot.point.y);
    assert.ok(Math.abs(Math.atan2(Math.sin(bearing - shot.yaw), Math.cos(bearing - shot.yaw))) < 1e-6);
  }
});

test('the middle of the screen is straight ahead, and a mark to the right is to the right', () => {
  const centre = aimOf(view.width / 2, view.height / 2, 0, view);
  assert.ok(Math.abs(centre.side) < 0.05, centre.side);
  assert.ok(centre.ahead > 1, centre.ahead);
  assert.ok(Math.abs(centre.yaw) < 0.02, centre.yaw);
  const right = aimOf(view.width / 2 + 120, view.height / 2, 0, view);
  assert.ok(right.side > 1, right.side);
  assert.ok(right.yaw > 0.05, right.yaw);
  assert.equal(groundOfScreen(view.width / 2, -10000, view), null);
});

test('the mouse moves the mark, and past the edge the view turns', () => {
  const aim = { x: 0, y: 0 };
  assert.deepEqual(stepAim(aim, 30, -12, 800, 600, 0.0025), { lookX: 0 });
  assert.equal(aim.x, 30);
  assert.equal(aim.y, -12);
  const turned = stepAim(aim, 10000, 0, 800, 600, 0.0025);
  assert.equal(aim.x, 800 * 0.42);
  assert.ok(turned.lookX > 0);
  stepAim(aim, 0, -10000, 800, 600, 0.0025);
  assert.equal(aim.y, -Math.max(24, 600 * 0.42));
});

test('a shot through a creature hits it, and one beside it or past the ground does not', () => {
  const walker = newWalker(0, 0, 0);
  const cam = placeCamera(walker, { range: 65, tilt: 62, fov: 35, below: 0.45 });
  const at = { x: 0, y: 12 };
  const chest = { x: at.x, y: at.y, z: walker.z + 1 };
  const dz = chest.z - cam.eye.z;
  const t = (walker.z - cam.eye.z) / dz;
  const end = {
    x: cam.eye.x + t * (chest.x - cam.eye.x),
    y: cam.eye.y + t * (chest.y - cam.eye.y),
    z: walker.z,
  };
  const deer = { ...at, radius: 0.7, body: 1.6 };
  const beside = { x: 4, y: 12, radius: 0.7, body: 1.6 };
  const further = { x: 0, y: 30, radius: 0.7, body: 1.6 };
  assert.equal(firstInShot(cam.eye, end, [beside, deer]).y, 12);
  assert.equal(shotHits(cam.eye, end, beside, 0.7, 1.6), null);
  const feet = { x: at.x, y: at.y, z: walker.z };
  assert.ok(shotHits(cam.eye, feet, at, 0.7, 1.6) != null);
  assert.equal(shotHits(cam.eye, feet, further, 0.7, 1.6), null);
  const rabbit = { x: 0, y: 8, radius: 0.35, body: 0.45 };
  const rabbitEnd = groundThrough(cam.eye, { x: rabbit.x, y: rabbit.y, z: 0.3 }, walker.z);
  assert.equal(firstInShot(cam.eye, rabbitEnd, [deer, rabbit]).y, 8);
  // A shot a metre to the side of a chicken misses the old box and lands in the wider one.
  const chicken = { x: 0, y: 10 };
  const besideIt = groundThrough(cam.eye, { x: 1, y: chicken.y, z: 0.6 }, walker.z);
  assert.equal(shotHits(cam.eye, besideIt, chicken, 0.35, 0.5), null);
  assert.ok(shotHits(cam.eye, besideIt, chicken, 3, 3.6) != null);
});

function groundThrough(eye, point, groundZ) {
  const t = (groundZ - eye.z) / (point.z - eye.z);
  return { x: eye.x + t * (point.x - eye.x), y: eye.y + t * (point.y - eye.y), z: groundZ };
}
