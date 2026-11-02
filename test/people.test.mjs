import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatLog, GROUP_THREAD, MOST_CARDS, showFor, threadTitle, withCard } from '../public/js/chat.js';
import { DRAW_BEHIND, People, QUIET, agoText, bearingBetween, compassPoint, farText, initialsOf, placeAt, presenceRate, statusLine } from '../public/js/people.js';
import { FLAGS, metresApart } from '../public/js/protocol.js';

const AT = { lat: 38.95, lng: -77.45 };
const place = (over) => ({ ...AT, heading: 0, speed: 0, flags: FLAGS.onFoot, floor: 0, player: 2, seq: 1, ...over });
const metre = 1 / 111320;
const near = (a, b, within = 0.01) => assert.ok(Math.abs(a - b) <= within, `${a} vs ${b}`);

function crowd() {
  const people = new People('me');
  people.setMembers([{ id: 'me', name: 'Karl', order: 1, online: true, lives: 3 }, { id: 'dana', name: 'Dana', order: 2, online: true, lives: 3, lastSeen: 0 }]);
  return people;
}

test('someone is drawn between their last two places, not jumping from one to the next', () => {
  const list = [{ ...place(), at: 0 }, { ...place({ lat: AT.lat + 10 * metre }), at: 100 }];
  near(placeAt(list, 50).lat, AT.lat + 5 * metre, 1e-7);
  near(placeAt(list, 0).lat, AT.lat, 1e-7);
  near(placeAt(list, 100).lat, AT.lat + 10 * metre, 1e-7);
});

test('someone turns the short way round, through north', () => {
  const list = [{ ...place({ heading: 350 }), at: 0 }, { ...place({ heading: 10 }), at: 100 }];
  near(placeAt(list, 50).heading % 360, 0);
  near(placeAt(list, 25).heading, 355);
});

test('a big jump is a teleport, not a glide across the map', () => {
  const list = [{ ...place(), at: 0 }, { ...place({ lat: AT.lat + 500 * metre }), at: 100 }];
  near(placeAt(list, 50).lat, AT.lat + 500 * metre, 1e-7);
});

test('past their last place someone carries on by their speed, but not for long', () => {
  const list = [{ ...place({ heading: 90, speed: 10 }), at: 0 }];
  near(metresApart(placeAt(list, 100), AT), 1, 0.01);
  near(metresApart(placeAt(list, 300), AT), 3, 0.01);
  near(metresApart(placeAt(list, 5000), AT), 3, 0.01);
  assert.ok(placeAt(list, 100).lng > AT.lng, 'heading 90 goes east');
  assert.equal(placeAt([], 0), null);
});

test('before anything is known about the time, the oldest place is used', () => {
  near(placeAt([{ ...place(), at: 100 }, { ...place({ lat: AT.lat + metre }), at: 200 }], 50).lat, AT.lat, 1e-7);
});

test('an old message arriving late is ignored, and places are kept to a few', () => {
  const people = crowd();
  people.heard(place({ seq: 10, lat: AT.lat + 5 * metre }), 1000);
  people.heard(place({ seq: 9, lat: AT.lat }), 1010);
  near(people.lastKnown('dana').lat, AT.lat + 5 * metre, 1e-7);
  for (let i = 0; i < 30; i++) people.heard(place({ seq: 11 + i }), 1100 + i * 100);
  assert.ok(people.places.get('dana').list.length <= 8);
});

test('after a long silence a lower number is taken as a fresh start, as after a refresh', () => {
  const people = crowd();
  people.heard(place({ seq: 500 }), 0);
  people.heard(place({ seq: 1, lat: 40 }), QUIET + 1);
  near(people.lastKnown('dana').lat, 40, 1e-7);
});

test('nobody hears about themselves or strangers', () => {
  const people = crowd();
  people.heard(place({ player: 1 }), 0);
  people.heard(place({ player: 99 }), 0);
  assert.equal(people.places.size, 0);
});

test('someone gone quiet stops being drawn, but their last place stays for the phone', () => {
  const people = crowd();
  people.heard(place(), 0);
  assert.ok(people.drawnAt('dana', DRAW_BEHIND));
  assert.equal(people.drawnAt('dana', QUIET + 1), null);
  assert.ok(people.lastKnown('dana'));
  assert.equal(people.drawnAt('nobody', 0), null);
});

test('someone offline is where they left, as the server saved it', () => {
  const people = new People('me');
  people.setMember({ id: 'dana', name: 'Dana', order: 2, online: false, lives: 3, lat: 41, lng: -70 });
  assert.equal(people.lastKnown('dana').lat, 41);
  people.setMember({ id: 'mo', name: 'Mo', order: 3, online: false, lives: 3, lat: null, lng: null });
  assert.equal(people.lastKnown('mo'), null);
});

test('those who are away or indoors aren\'t solid outdoors, and others are', () => {
  const people = crowd();
  people.heard(place(), 0);
  assert.equal(people.solidNow(200).length, 1);
  people.heard(place({ seq: 2, flags: FLAGS.onFoot | FLAGS.away }), 300);
  assert.equal(people.solidNow(500).length, 0);
  people.heard(place({ seq: 3, flags: FLAGS.onFoot | FLAGS.indoors }), 600);
  assert.equal(people.solidNow(800).length, 0);
  people.setMember({ ...people.member('dana'), online: false });
  assert.equal(people.solidNow(800).length, 0);
});

test('right now is further on than what\'s drawn, as the drawing is a moment behind', () => {
  const people = crowd();
  people.heard(place({ speed: 20, seq: 1 }), 1000);
  people.heard(place({ speed: 20, seq: 2, lat: AT.lat + 2 * metre }), 1100);
  assert.ok(people.nowAt('dana', 1200).lat > people.drawnAt('dana', 1200).lat);
  near(people.nowAt('dana', 1200).lat, AT.lat + 4 * metre, 1e-6);
  assert.equal(people.nowAt('dana', 99999), null, 'and nothing for someone gone quiet');
  assert.equal(people.nowAt('nobody', 0), null);
});

test('a car isn\'t solid as a person: it has its own shape', () => {
  const people = crowd();
  people.heard(place({ flags: 0 }), 0);
  assert.equal(people.solidNow(100).length, 0);
});

test('someone counts as near within 100 m', () => {
  const people = crowd();
  people.heard(place({ lat: AT.lat + 50 * metre }), 0);
  assert.equal(people.someoneNear(AT, 200), true);
  assert.equal(people.someoneNear({ lat: AT.lat + metre * 500, lng: AT.lng }, 200), false);
  assert.equal(people.othersOnline.length, 1);
  assert.equal(people.byName('Dana').id, 'dana');
});

test('places go out faster the more it matters', () => {
  assert.equal(presenceRate({ moving: true, onFoot: false, near: true }), 20);
  assert.equal(presenceRate({ moving: true, onFoot: false }), 10);
  assert.equal(presenceRate({ moving: true, onFoot: true }), 5);
  assert.equal(presenceRate({ moving: false, onFoot: true, near: true }), 1);
  assert.equal(presenceRate({ moving: true, onFoot: true, away: true, near: true }), 1);
});

test('a badge is one or two letters', () => {
  assert.equal(initialsOf('Karl'), 'KA');
  assert.equal(initialsOf('mo-jones'), 'MJ');
  assert.equal(initialsOf('a_b_c'), 'AB');
  assert.equal(initialsOf('X'), 'X');
});

test('directions and distances read as a phone would say them', () => {
  assert.equal(compassPoint(bearingBetween(AT, { lat: AT.lat + 0.01, lng: AT.lng })), 'N');
  assert.equal(compassPoint(bearingBetween(AT, { lat: AT.lat, lng: AT.lng + 0.01 })), 'E');
  assert.equal(compassPoint(bearingBetween(AT, { lat: AT.lat - 0.01, lng: AT.lng - 0.01 })), 'SW');
  assert.equal(compassPoint(359), 'N');
  assert.equal(farText(100), '330 ft');
  assert.equal(farText(1609), '1.0 mi');
  assert.equal(agoText(10000), 'just now');
  assert.equal(agoText(60000), '1 minute ago');
  assert.equal(agoText(3 * 3600000), '3 hours ago');
  assert.equal(agoText(72 * 3600000), '3 days ago');
});

test('the line under a name says where they are and what they\'re doing', () => {
  const dana = { online: true, lives: 3, lastSeen: 0 }, north = { lat: AT.lat + 0.03, lng: AT.lng };
  assert.equal(statusLine(dana, { ...north, flags: FLAGS.onFoot }, AT, 0), '2.1 mi N · On foot');
  assert.equal(statusLine(dana, { ...north, flags: 0 }, AT, 0), '2.1 mi N · Driving');
  assert.equal(statusLine(dana, { ...north, flags: FLAGS.onFoot | FLAGS.away }, AT, 0), '2.1 mi N · Away');
  assert.equal(statusLine(dana, { ...north, flags: FLAGS.indoors, floor: 3 }, AT, 0), 'In a building, floor 3');
  assert.equal(statusLine(dana, { ...north, flags: FLAGS.indoors, floor: 1 }, AT, 0), 'In a building');
  assert.equal(statusLine(dana, null, AT, 0), 'Online');
  assert.equal(statusLine({ ...dana, online: false, lastSeen: 0 }, north, AT, 2 * 3600000), 'Last seen 2 hours ago');
  assert.equal(statusLine({ ...dana, lives: 0 }, north, AT, 0), 'Dead');
});

const said = (id, thread, sender, text = `m${id}`) => ({ id, thread, sender, text, at: id });

test('a chat log keeps each thread to its limit and ignores repeats', () => {
  const log = new ChatLog('a', 3);
  for (let i = 1; i <= 5; i++) log.add(said(i, GROUP_THREAD, 'b'));
  assert.deepEqual(log.messages(GROUP_THREAD).map((m) => m.id), [3, 4, 5]);
  assert.equal(log.add(said(5, GROUP_THREAD, 'b')), false);
  assert.deepEqual(log.messages('nothing'), []);
});

test('coming back counts only what others said since last looking', () => {
  const log = new ChatLog('a', 50, 2);
  assert.equal(log.load([said(1, GROUP_THREAD, 'b'), said(2, GROUP_THREAD, 'b'), said(3, GROUP_THREAD, 'b'), said(4, GROUP_THREAD, 'a')]), 1);
  assert.equal(log.markSeen(), 4);
  assert.equal(log.load([said(3, GROUP_THREAD, 'b'), said(4, GROUP_THREAD, 'a')]), 0, 'and after reading, nothing is new');
});

test('a DM thread knows who it\'s with, both ways round', () => {
  const log = new ChatLog('m', 50);
  assert.equal(log.threadWith('z'), 'm:z');
  assert.equal(log.threadWith('a'), 'a:m');
  assert.equal(log.peerOf('m:z'), 'z');
  assert.equal(log.peerOf('a:m'), 'a');
  assert.equal(log.peerOf(GROUP_THREAD), null);
  assert.equal(log.threadWith(null), GROUP_THREAD);
});

test('a thread is titled like a message preview', () => {
  const log = new ChatLog('m', 50), nameOf = (id) => ({ z: 'Zed' })[id];
  assert.equal(threadTitle(GROUP_THREAD, log, nameOf, ['Dana', 'Mo', 'Priya']), 'Chat with Dana, Mo, Priya');
  assert.equal(threadTitle(GROUP_THREAD, log, nameOf, []), 'Group chat');
  assert.equal(threadTitle('m:z', log, nameOf, []), 'Zed');
  assert.equal(threadTitle('m:q', log, nameOf, []), 'Someone');
});

test('a card stays longer for a longer message, within limits', () => {
  assert.equal(showFor('hi'), 4000);
  assert.equal(showFor('x'.repeat(120)), 6000);
  assert.equal(showFor('x'.repeat(400)), 10000);
});

test('a burst from one chat folds into its card, and only a few cards show', () => {
  const card = (thread, text) => ({ thread, title: thread, sender: 's', text });
  let cards = withCard([], card('a', 'one'));
  cards = withCard(cards, card('a', 'two'));
  assert.equal(cards.length, 1);
  assert.equal(cards[0].text, 'two');
  assert.equal(cards[0].count, 2);
  for (const thread of ['b', 'c', 'd', 'e']) cards = withCard(cards, card(thread, 'x'));
  assert.equal(cards.length, MOST_CARDS);
  assert.deepEqual(cards.map((c) => c.thread), ['c', 'd', 'e'], 'newest last');
  cards = withCard(cards, card('c', 'again'));
  assert.equal(cards.at(-1).thread, 'c', 'and a new message brings its card to the front');
});
