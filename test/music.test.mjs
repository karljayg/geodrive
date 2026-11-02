import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chooseMusic, clockMood, KEEP, nextStep, playable, Rotation, Scenes, topScene } from '../public/js/music.js';
import { MUSIC } from '../public/js/musicConfig.js';
import { darkHere } from '../public/js/roomLight.js';

globalThis.Audio ||= class extends EventTarget {
  volume = 1;
  paused = true;
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute() {}
};
globalThis.fetch = () => Promise.reject(new Error('no network in tests'));
globalThis.document ||= { hidden: true };
console.warn = () => {};
const { Radio } = await import('../public/js/radio.js');

test('every song in the config is there, and every mood it names exists', () => {
  for (const [name, mood] of Object.entries(MUSIC.moods)) {
    for (const song of mood.songs) {
      assert.ok(existsSync(new URL(`../public/${MUSIC.folder}${song.file}`, import.meta.url)), song.file);
      assert.ok(song.volume > 0 && song.volume <= 1, song.file);
    }
    assert.ok(mood.fade > 0, name);
    assert.ok(playable(name, MUSIC), `${name} has something to play`);
  }
  for (const part of MUSIC.clock) assert.ok(MUSIC.moods[part.mood], part.mood);
});

test('the clock picks the mood, and the late night runs past midnight', () => {
  const at = (hour) => clockMood(hour, MUSIC);
  assert.equal(at(12), 'day');
  assert.equal(at(17), 'afternoon');
  assert.equal(at(21), 'night');
  assert.equal(at(23), 'lateNight');
  assert.equal(at(0), 'lateNight');
  assert.equal(at(4), 'lateNight');
  assert.equal(at(5), 'night');
  assert.equal(at(6), 'day');
});

test('a mood with no songs uses its fallback until it has some', () => {
  assert.equal(clockMood(19, MUSIC), 'dusk');
  assert.equal(chooseMusic({ hour: 19 }, MUSIC).mood, 'afternoon');
  const loop = { moods: { a: { songs: [], fallback: 'b' }, b: { songs: [], fallback: 'a' } } };
  assert.equal(playable('a', loop), null);
});

test('background music waits for the radio or phone, and the late night does too', () => {
  assert.deepEqual(chooseMusic({ hour: 12, radio: 'off' }, MUSIC), { mood: 'day', holdRadio: false });
  assert.deepEqual(chooseMusic({ hour: 12, radio: 'playing' }, MUSIC), { mood: null, holdRadio: false });
  assert.deepEqual(chooseMusic({ hour: 12, radio: 'starting' }, MUSIC), { mood: KEEP, holdRadio: false });
  assert.deepEqual(chooseMusic({ hour: 23.5, radio: 'playing' }, MUSIC), { mood: null, holdRadio: false });
});

test('scenes override the radio, the highest priority playing', () => {
  assert.deepEqual(chooseMusic({ hour: 12, radio: 'playing', scenes: ['foreboding'] }, MUSIC), { mood: 'foreboding', holdRadio: true });
  assert.equal(chooseMusic({ hour: 12, scenes: ['chase', 'foreboding', 'danger'] }, MUSIC).mood, 'chase');
  assert.equal(topScene(['nothing'], MUSIC), null);
});

test('music off beats everything, even a scene or a test', () => {
  assert.deepEqual(chooseMusic({ hour: 12, scenes: ['chase'], test: 'danger', blocked: true }, MUSIC), { mood: null, holdRadio: true });
});

test('the Settings test is heard over the radio, whichever mood it is', () => {
  assert.deepEqual(chooseMusic({ hour: 12, radio: 'playing', test: 'night' }, MUSIC), { mood: 'night', holdRadio: true });
});

test('a change of time of day crossfades at once, however much of the song is left', () => {
  assert.deepEqual(nextStep({ current: { mood: 'day', left: 100 }, want: 'night' }, MUSIC), { act: 'start', mood: 'night', fade: 4 });
  assert.equal(nextStep({ current: { mood: 'day', left: Infinity }, want: 'night' }, MUSIC).act, 'start');
});

test('scenes cut in, and leaving one does not wait', () => {
  assert.deepEqual(nextStep({ current: { mood: 'day', left: 100 }, want: 'chase' }, MUSIC), { act: 'start', mood: 'chase', fade: 1.5 });
  assert.equal(nextStep({ current: { mood: 'chase', left: 100 }, want: 'day' }, MUSIC).act, 'start');
});

test('a song crossfades into the next before it ends, and a length not yet known waits', () => {
  assert.equal(nextStep({ current: { mood: 'day', left: 60 }, want: 'day' }, MUSIC).act, 'none');
  assert.deepEqual(nextStep({ current: { mood: 'day', left: 5 }, want: 'day' }, MUSIC), { act: 'start', mood: 'day', fade: 4 });
  assert.equal(nextStep({ current: { mood: 'day', left: Infinity }, want: 'day' }, MUSIC).act, 'none');
});

test('stopping and keeping', () => {
  assert.equal(nextStep({ current: { mood: 'day', left: 60 }, want: null }, MUSIC).act, 'stop');
  assert.equal(nextStep({ current: null, want: null }, MUSIC).act, 'none');
  assert.equal(nextStep({ current: { mood: 'chase', left: 60 }, want: KEEP }, MUSIC).act, 'none');
  assert.equal(nextStep({ current: null, want: KEEP }, MUSIC).act, 'none');
});

test('a mood rotates through its songs, skips broken ones and remembers its place', () => {
  const r = new Rotation(MUSIC), files = MUSIC.moods.day.songs.map((s) => s.file);
  assert.equal(r.next('day').file, files[0]);
  assert.equal(r.next('chase').file, MUSIC.moods.chase.songs[0].file);
  assert.equal(r.next('day').file, files[1]);
  assert.equal(r.next('day').file, files[0]);
  assert.equal(r.next('day', new Set([files[1]])).file, files[0]);
  assert.equal(r.next('day', new Set(files)), null);
  assert.equal(r.next('chase').file, MUSIC.moods.chase.songs[0].file, 'one song loops');
});

test('a scene stays for its minimum after it ends, and an unknown one is refused', () => {
  const s = new Scenes(MUSIC);
  assert.equal(s.start('nope', 0), false);
  s.start('chase', 100);
  assert.deepEqual(s.active(101), ['chase']);
  s.end('chase');
  assert.deepEqual(s.active(100 + MUSIC.sceneMinimum - 1), ['chase']);
  assert.deepEqual(s.active(100 + MUSIC.sceneMinimum + 1), []);
  s.start('danger', 200);
  assert.deepEqual(s.active(200 + MUSIC.sceneMinimum + 60), ['danger'], 'still on until ended');
});

test('only the room lights or daylight end the dark', () => {
  const dark = (over) => darkHere({ lightsOn: false, win: 0, wasDark: false, ...over }, MUSIC.darkRoom);
  assert.equal(dark(), true);
  assert.equal(dark({ lightsOn: true }), false);
  assert.equal(dark({ win: 0.5 }), false, 'windows are enough by day');
});

test('standing at the edge of the window light does not flip it', () => {
  const dark = (win, wasDark) => darkHere({ lightsOn: false, win, wasDark }, MUSIC.darkRoom);
  const between = (MUSIC.darkRoom.below + MUSIC.darkRoom.above) / 2;
  assert.equal(dark(between, true), true);
  assert.equal(dark(between, false), false);
});

test('the dark room plays foreboding over the radio, and light gives back the mood or the radio', () => {
  const asked = [MUSIC.darkRoom.mood];
  assert.deepEqual(chooseMusic({ hour: 12, radio: 'playing', scenes: asked }, MUSIC), { mood: 'foreboding', holdRadio: true });
  assert.deepEqual(chooseMusic({ hour: 12, radio: 'off', scenes: [] }, MUSIC), { mood: 'day', holdRadio: false });
  assert.deepEqual(chooseMusic({ hour: 12, radio: 'starting', scenes: [] }, MUSIC), { mood: KEEP, holdRadio: false });
  assert.equal(chooseMusic({ hour: 12, scenes: [...asked, 'chase'] }, MUSIC).mood, 'chase', 'a chase beats the dark');
});

test('after a scene the song it interrupted carries on from where it stopped', () => {
  const r = new Rotation(MUSIC), day = MUSIC.moods.day.songs;
  const { song } = r.pick('day', null);
  assert.equal(song.file, day[0].file);
  assert.equal(r.pick('foreboding', { mood: 'day', song, at: 42 }).at, 0);
  const inScene = { mood: 'foreboding', song: MUSIC.moods.foreboding.songs[0], at: 5 };
  r.pick('chase', inScene); // scene to scene keeps what the first one interrupted
  assert.deepEqual(r.pick('day', { mood: 'chase', song: MUSIC.moods.chase.songs[0], at: 1 }), { song, at: 42 });
  assert.equal(r.pick('day', { mood: 'day', song, at: 150 }).song.file, day[1].file, 'then it rotates as usual');
});

test('if the clock moved on during the scene, or the song broke, it moves on too', () => {
  const r = new Rotation(MUSIC), song = MUSIC.moods.day.songs[0];
  r.pick('foreboding', { mood: 'day', song, at: 42 });
  assert.deepEqual(r.pick('night', null), { song: MUSIC.moods.night.songs[0], at: 0 });
  r.pick('foreboding', { mood: 'day', song, at: 42 });
  assert.equal(r.pick('day', null, new Set([song.file])).at, 0);
});

test('a held radio stays on and tuned, ignores tuning, and plays again when let go', () => {
  const radio = new Radio(() => {});
  const station = { id: 'a', url: 'https://x/a', band: 'FM' }, other = { id: 'b', url: 'https://x/b', band: 'FM' };
  radio.stations = [station, other];
  radio.current = station;
  assert.equal(radio.soundState(10000), 'off');
  radio.setPower(true);
  assert.equal(radio.soundState(10000), 'starting');
  assert.equal(radio.soundState(10000, performance.now() + 20000), 'off', 'gives up waiting');
  radio.audio.dispatchEvent(new Event('playing'));
  assert.equal(radio.soundState(10000), 'playing');
  radio.setHeld('Stopped for now');
  assert.equal(radio.audio.paused, true);
  assert.equal(radio.on, true);
  assert.equal(radio.status, 'Stopped for now');
  radio.audio.src = 'unchanged';
  radio.tune(other);
  assert.equal(radio.audio.src, 'unchanged', 'no stream opened');
  assert.equal(radio.current, other, 'but the choice is kept');
  radio.setHeld(null, 0, 0);
  assert.equal(radio.audio.src, other.url);
  assert.equal(radio.audio.paused, false);
  radio.setVolume(0.5);
  assert.equal(radio.audio.volume, 0, 'silent until it is really playing');
  radio.audio.dispatchEvent(new Event('playing'));
  assert.equal(radio.audio.volume, 0.5);
  radio.setPower(false);
});
