import { GAME } from '../public/js/gameConfig.js';
import { actionsOf, useThing } from '../public/js/footActions.js';
import { ITEMS } from '../public/js/furniture.js';
import { hasItemIcon, itemIcon } from '../public/js/itemArt.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ART } from '../public/js/pocketArt.js';
import { BAG_SLOTS, CONTACTS, PocketData, addRecent, bearingToCar, compassName, distanceText, noteTitle, songParts, turnToCar } from '../public/js/pocketData.js';

const memory = () => {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v), removeItem: (k) => items.delete(k) };
};

test('the way to the car: someone east of it must walk west, wherever they face', () => {
  assert.equal(compassName(bearingToCar(100, 0)), 'W');
  assert.equal(compassName(bearingToCar(-100, 0)), 'E');
  assert.equal(compassName(bearingToCar(0, 100)), 'S');
  assert.equal(compassName(bearingToCar(0, -100)), 'N');
  assert.equal(compassName(bearingToCar(100, 100)), 'SW');
  assert.equal(compassName(359), 'N');
  assert.equal(compassName(-1), 'N');
});

test('the car on the rim of the compass: at the top when walking at it, on the right when it is to the right', () => {
  assert.equal(turnToCar(100, 0, 270), 0, 'east of it and facing west');
  assert.equal(turnToCar(100, 0, 180), 90, 'east of it and facing south, the car is on the right');
  assert.equal(turnToCar(100, 0, 0), -90, 'east of it and facing north, the car is on the left');
  assert.equal(Math.abs(turnToCar(100, 0, 90)), 180, 'and behind');
});

test('distances read in feet, then miles', () => {
  assert.equal(distanceText(30), '100 ft');
  assert.equal(distanceText(3000), '1.9 mi');
  assert.equal(distanceText(50000), '31 mi');
});

test('notes are kept, newest first, and survive a reload', () => {
  const storage = memory(), data = new PocketData(storage), first = data.addNote(1), second = data.addNote(2);
  data.setNote(first.id, 'Buy milk\nand bread', 3);
  data.setNote(second.id, 'Second', 4);
  const again = new PocketData(storage);
  assert.deepEqual(again.notes.map((n) => n.text), ['Second', 'Buy milk\nand bread']);
  assert.equal(noteTitle(again.notes[1]), 'Buy milk');
  again.deleteNote(second.id);
  assert.equal(new PocketData(storage).notes.length, 1);
});

test('a note left empty goes, and one with words stays', () => {
  const data = new PocketData(memory()), empty = data.addNote(1), full = data.addNote(2);
  data.setNote(full.id, 'x');
  data.closeNote(empty.id);
  data.closeNote(full.id);
  assert.deepEqual(data.notes.map((n) => n.id), [full.id]);
  assert.equal(noteTitle({ text: '   ' }), 'New note');
});

test('text messages are kept by contact, and each contact goes round their replies', () => {
  const storage = memory(), data = new PocketData(storage), [{ id, replies }] = CONTACTS;
  data.addMessage(id, 'Hi', true, 1);
  assert.equal(data.replyFrom(id), replies[0]);
  data.addMessage(id, data.replyFrom(id), false, 2);
  assert.equal(data.replyFrom(id), replies[1]);
  assert.deepEqual(new PocketData(storage).thread(id).map((m) => m.mine), [true, false]);
  assert.deepEqual(data.thread('garage'), []);
  assert.equal(data.replyFrom('nobody'), null);
});

test('the bag holds a limited number of things, counts repeats and gives them back', () => {
  const storage = memory(), data = new PocketData(storage);
  for (let i = 0; i < BAG_SLOTS - 1; i++) assert.equal(data.addToBag({ id: `t${i}`, name: `Thing ${i}` }), true); // beside the flashlight
  assert.equal(data.addToBag({ id: 'one too many', name: 'x' }), false);
  assert.equal(data.addToBag({ id: 't0', name: 'Thing 0' }), true, 'one already there stacks');
  assert.equal(new PocketData(storage).bag.find((i) => i.id === 't0').count, 2);
  assert.equal(data.takeFromBag('t0'), true);
  assert.equal(data.takeFromBag('t0'), true);
  assert.equal(data.takeFromBag('t0'), false);
  assert.equal(data.bag.length, BAG_SLOTS - 1, 'one gone');
});

test('storage that fails or holds rubbish loses only the saving', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  const data = new PocketData(broken);
  assert.ok(data.addNote(1));
  const rubbish = new PocketData({ getItem: () => '{nope', setItem: () => {} });
  assert.deepEqual(rubbish.notes, []);
});

test('every picture is whole, and two of the same on screen don\'t share gradient ids', () => {
  for (const [name, draw] of Object.entries(ART)) {
    const one = draw('a'), two = draw('b');
    assert.ok(one.startsWith('<svg') && one.endsWith('</svg>'), name);
    for (const [, id] of one.matchAll(/ id="([^"]+)"/g)) assert.ok(!two.includes(` id="${id}"`), `${name}: ${id}`);
  }
});

test('a stream title becomes the two lines of a music player', () => {
  assert.deepEqual(songParts('TY MYERS - ENDS OF THE EARTH'), { title: 'ENDS OF THE EARTH', artist: 'TY MYERS' });
  assert.deepEqual(songParts('Just a title'), { title: 'Just a title', artist: '' });
  assert.deepEqual(songParts(null), { title: '', artist: '' });
});

test('what played earlier: newest first, no repeat of the current one, and a limit', () => {
  let list = [];
  for (const song of ['a', 'a', 'b', 'c', 'a']) list = addRecent(list, song);
  assert.deepEqual(list, ['a', 'c', 'b']);
  assert.deepEqual(addRecent(['x'], null), ['x']);
  for (let i = 0; i < 20; i++) list = addRecent(list, String(i));
  assert.equal(list.length, 6);
});

test('everything that can reach the bag has its own picture, and anything new still gets one', () => {
  const names = new Set([...Object.values(GAME.finds).flat(), ...Object.values(GAME.machines).map((m) => m.give), ...Object.keys(GAME.consumables), 'Flashlight', 'Cash', 'Ticket']);
  for (const item of Object.keys(ITEMS)) {
    const actions = actionsOf(item);
    if (actions.includes('pick up')) names.add(useThing([item, ITEMS[item].models[0], 0, 0, 0, 0, 0, 1], {}, 1, 'x', actions[1] === 'pick up').give);
    else if (actions.includes('use')) { const { give } = useThing([item, ITEMS[item].models[0], 0, 0, 0, 0, 0, 1], {}, 1, 'x'); if (give) names.add(give); }
  }
  for (const name of names) {
    assert.ok(hasItemIcon(name), name);
    assert.match(itemIcon(name), /^<svg [^>]*>.+<\/svg>$/);
  }
  assert.match(itemIcon('Something nobody has drawn'), /^<svg /);
  assert.equal(new Set([...names].map(itemIcon)).size, names.size, 'no two look the same');
});
