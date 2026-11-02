import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS, PRESENCE_BYTES, cleanLook, clockHour, dmThread, isNewer, metresApart, nameKey, nameProblem, packPresence, readChatLine, stampPresence, unpackPresence } from '../public/js/protocol.js';

const COLOURS = { skin: '#DDAA88', jacket: '#ff8800', jeans: '#223355', shoes: '#111111', hair: '#221100' };

test('a place goes into 24 bytes and comes back the same, to a centimetre', () => {
  const sent = { player: 3, seq: 40000, lat: 38.9555123, lng: -77.4475123, heading: 271.25, speed: -11.5, flags: FLAGS.onFoot | FLAGS.running, gait: 12, floor: -2, u: 12.34, v: -56.78 };
  const bytes = packPresence(sent);
  assert.equal(bytes.byteLength, PRESENCE_BYTES);
  const back = unpackPresence(bytes);
  for (const key of ['player', 'seq', 'flags', 'gait', 'floor']) assert.equal(back[key], sent[key], key);
  assert.ok(Math.abs(back.lat - sent.lat) < 1e-7 && Math.abs(back.lng - sent.lng) < 1e-7);
  assert.ok(Math.abs(back.heading - sent.heading) < 0.01 && Math.abs(back.speed - sent.speed) < 0.01);
  assert.ok(Math.abs(back.u - sent.u) < 0.02 && Math.abs(back.v - sent.v) < 0.02);
});

test('a place holds the far ends of the globe, and top speed in reverse and forward', () => {
  for (const [lat, lng] of [[90, 180], [-90, -180], [0, 0]]) {
    const back = unpackPresence(packPresence({ lat, lng }));
    assert.equal(back.lat, lat);
    assert.equal(back.lng, lng);
  }
  assert.ok(Math.abs(unpackPresence(packPresence({ lat: 0, lng: 0, speed: 223.5 })).speed - 223.5) < 0.01);
  assert.equal(unpackPresence(packPresence({ lat: 0, lng: 0, heading: 360 })).heading, 0);
  assert.equal(unpackPresence(packPresence({ lat: 0, lng: 0, heading: -90 })).heading, 270);
});

test('numbers out of range are held at the limits, never wrapped round', () => {
  const back = unpackPresence(packPresence({ lat: 200, lng: -500, speed: 9000, floor: 900, u: 99999, seq: 70000 }));
  assert.equal(back.lat, 90);
  assert.equal(back.lng, -180);
  assert.ok(back.speed > 300);
  assert.equal(back.floor, 127);
  assert.ok(back.u > 600);
  assert.equal(back.seq, 70000 & 0xffff);
  const nothing = unpackPresence(packPresence({ lat: NaN, lng: undefined, speed: Infinity }));
  assert.equal(nothing.lat, 0);
});

test('anything else isn\'t a place', () => {
  assert.equal(unpackPresence(new Uint8Array(7)), null);
  assert.equal(unpackPresence(new Uint8Array(24)), null, 'the wrong kind');
  assert.equal(unpackPresence(null), null);
  const off = packPresence({ lat: 1, lng: 2 });
  new DataView(off.buffer).setInt32(4, 2000000000);
  assert.equal(unpackPresence(off), null, 'off the globe');
});

test('the sender can be stamped on, and a slice of a larger buffer reads right', () => {
  assert.equal(unpackPresence(stampPresence(packPresence({ player: 9, lat: 1, lng: 2 }), 4)).player, 4);
  const inside = new Uint8Array(40);
  inside.set(packPresence({ lat: 5, lng: 6 }), 8);
  assert.equal(unpackPresence(inside.subarray(8, 32)).lng, 6);
});

test('later messages win, even when the count goes round', () => {
  assert.ok(isNewer(5, 4));
  assert.ok(!isNewer(4, 5));
  assert.ok(isNewer(2, 65530), 'just past the top');
  assert.ok(!isNewer(65530, 2));
});

test('names are 2 to 16 plain characters with no spaces', () => {
  for (const name of ['Al', 'Karl', 'dana_9', 'mo-mo', 'A234567890123456']) assert.equal(nameProblem(name), null, name);
  assert.equal(nameProblem('K'), 'too-short');
  assert.equal(nameProblem(''), 'too-short');
  assert.equal(nameProblem('A2345678901234567'), 'too-long');
  for (const name of ['two words', 'Kárl', '<b>x</b>', 'a/b', '/w']) assert.equal(nameProblem(name), 'bad-characters', name);
  for (const name of [undefined, null, 7, {}]) assert.equal(nameProblem(name), 'too-short');
  assert.equal(nameKey('KaRl'), nameKey('karl'));
});

test('a look needs a known figure and a plain colour for each part, and nothing else is kept', () => {
  const look = cleanLook('female', { ...COLOURS, extra: '<script>' });
  assert.equal(look.figure, 'female');
  assert.equal(look.colours.skin, '#ddaa88', 'lower case');
  assert.equal(look.colours.extra, undefined);
  assert.equal(cleanLook('robot', COLOURS), null);
  assert.equal(cleanLook('male', null), null);
  assert.equal(cleanLook('male', { ...COLOURS, hair: undefined }), null);
  for (const hair of ['red', '#12345', '#1234567', 'url(x)', '#12345g', 5]) assert.equal(cleanLook('male', { ...COLOURS, hair }), null, String(hair));
});

test('the hour runs on from what the server said, wraps at midnight, and stands still at rate 0', () => {
  const at = 1000, hour = 23, rate = 12;
  assert.equal(clockHour({ hour, rate, at }, at), 23);
  assert.equal(clockHour({ hour, rate, at }, at + 300000), 0, '5 real minutes is one game hour');
  assert.ok(Math.abs(clockHour({ hour, rate, at }, at + 600000) - 1) < 1e-9);
  assert.equal(clockHour({ hour, rate: 0, at }, at + 999999), 23);
  assert.equal(clockHour({ hour, rate, at }, at - 5000), 23, 'a clock a little behind the server\'s doesn\'t run it backwards');
});

test('a typed line goes to the group, unless it\'s /w', () => {
  const names = ['Dana', 'Mo'];
  assert.deepEqual(readChatLine('  hello  ', names), { to: null, text: 'hello' });
  assert.deepEqual(readChatLine('/w Dana hi there', names), { to: 'Dana', text: 'hi there' });
  assert.deepEqual(readChatLine('/W dana  hi', names), { to: 'Dana', text: 'hi' }, 'in any case, with the name as they spell it');
  assert.equal(readChatLine('   ', names), null, 'nothing to send');
  assert.deepEqual(readChatLine('/w', names), { error: 'no-name' });
  assert.deepEqual(readChatLine('/w Dana', names), { error: 'no-message' });
  assert.deepEqual(readChatLine('/w Dana   ', names), { error: 'no-message' });
  assert.deepEqual(readChatLine('/w Zed hi', names), { error: 'unknown-name', name: 'Zed' });
  assert.deepEqual(readChatLine('/kick Dana', names), { error: 'unknown-command' });
  assert.deepEqual(readChatLine('x'.repeat(5), names, 4), { error: 'too-long' });
  assert.deepEqual(readChatLine(`/w Mo ${'x'.repeat(5)}`, names, 4), { error: 'too-long' });
  assert.deepEqual(readChatLine('/when is it', names), { error: 'unknown-command' }, 'a word that only starts with /w isn\'t a whisper');
});

test('a DM has one thread whoever sends it', () => {
  assert.equal(dmThread('a', 'b'), dmThread('b', 'a'));
  assert.notEqual(dmThread('a', 'b'), dmThread('a', 'c'));
});

test('distance on the globe is about right', () => {
  assert.ok(Math.abs(metresApart({ lat: 38.9, lng: -77 }, { lat: 38.91, lng: -77 }) - 1113) < 2);
  assert.ok(Math.abs(metresApart({ lat: 38.9, lng: -77 }, { lat: 38.9, lng: -76.99 }) - 867) < 2);
});
