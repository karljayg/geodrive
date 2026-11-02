// The browser's side of a shared world, against a real server: the line, the world object and what's kept where.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/app.mjs';
import { WorldLink, worldAddress } from '../public/js/net.js';
import { GAME } from '../public/js/gameConfig.js';
import { Vitals } from '../public/js/vitals.js';
import { PocketData } from '../public/js/pocketData.js';
import { PROTOCOL, FLAGS, clockHour } from '../public/js/protocol.js';
import { PrivateWorld, knownWorlds, needsEntry, openWorld, rememberWorld, remoteStore, savedMe, scopedStorage, worldPrefix } from '../public/js/world.js';

const LOOK = { figure: 'female', colours: { skin: '#ddaa88', jacket: '#ff8800', jeans: '#223355', shoes: '#111111', hair: '#221100' } };
const memory = () => {
  const map = new Map();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};
const until = async (check, what = 'it') => {
  for (let i = 0; i < 200; i++) {
    const value = check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waited for ${what}`);
};

async function harness(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'geodrive-link-'));
  let server = await startServer({ dir });
  const worlds = [], links = [];
  const address = () => `ws://127.0.0.1:${server.port}`;
  const open = async (first, onMade) => {
    const link = new WorldLink({ address: address(), onMessage: onMade });
    links.push(link);
    return { link, answer: await link.open(first) };
  };
  const create = async (storage, name = 'Karl') => {
    let made;
    const { link, answer } = await open({ t: 'create', protocol: PROTOCOL, name: 'Crew', player: { name, ...LOOK } }, (m) => { if (m.t === 'made') made = m; });
    rememberWorld(storage, { id: made.world, name: 'Crew', me: { id: made.id, secret: made.secret } });
    const world = new PrivateWorld({ id: made.world, link, welcome: answer, storage });
    worlds.push(world);
    return world;
  };
  const join_ = async (host, storage, name) => {
    const { code } = await host.link.ask({ t: 'invite' });
    const { link, answer } = await open({ t: 'join', protocol: PROTOCOL, world: host.id, code, name, ...LOOK });
    rememberWorld(storage, { id: host.id, name: 'Crew', me: { id: answer.you.id, secret: answer.you.secret } });
    const world = new PrivateWorld({ id: host.id, link, welcome: answer, storage });
    worlds.push(world);
    return world;
  };
  const stop = async () => {
    for (const world of worlds) { clearInterval(world.saving); clearInterval(world.placing); }
    for (const link of links) link.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    await fn({ create, join: join_, open, address, restart: async () => { const { port } = server; await server.close(); server = await startServer({ dir, port }); } });
  } finally {
    await stop();
  }
}

test('the game finds its server beside it, and a local one when played locally', () => {
  assert.equal(worldAddress({ hostname: 'www.psistorm.com', host: 'www.psistorm.com', pathname: '/geodrive/' }), 'wss://www.psistorm.com/geodrive/ws');
  assert.equal(worldAddress({ hostname: 'www.psistorm.com', host: 'www.psistorm.com', pathname: '/geodrive/index.html' }), 'wss://www.psistorm.com/geodrive/ws');
  assert.equal(worldAddress({ hostname: 'localhost', host: 'localhost:8765', pathname: '/' }), 'ws://127.0.0.1:5175');
});

test('a browser that\'s never seen a world needs none of the network code', () => {
  const storage = memory(), at = (search, hash = '') => ({ search, hash });
  assert.equal(needsEntry(at(''), storage), false);
  assert.equal(needsEntry(at('?world=walktest'), storage), false);
  assert.equal(needsEntry(at('?sandbox=1'), storage), false);
  assert.equal(needsEntry(at('', '#w=abc.def'), storage), true);
  assert.equal(needsEntry(at('?w=abc'), storage), true);
  assert.equal(needsEntry(at('', '#d=old'), storage), false, 'an old share link is the sandbox');
  assert.equal(needsEntry(at(''), null), false);
  rememberWorld(storage, { id: 'abc', name: 'Crew', me: { id: 'p', secret: 's' } });
  assert.equal(needsEntry(at(''), storage), true, 'but one that has, gets asked which');
});

test('a browser remembers each world and who it is there, newest first', () => {
  const storage = memory();
  rememberWorld(storage, { id: 'a', name: 'One', me: { id: 'p1', secret: 's1' } });
  rememberWorld(storage, { id: 'b', name: 'Two', me: { id: 'p2', secret: 's2' } });
  rememberWorld(storage, { id: 'a', name: 'One', me: { id: 'p1', secret: 's3' } });
  assert.deepEqual(knownWorlds(storage).map((w) => w.id), ['a', 'b']);
  assert.equal(savedMe(storage, 'a').secret, 's3');
  assert.equal(savedMe(storage, 'nope'), null);
  storage.setItem('geodrive_worlds_v1', 'rubbish');
  assert.deepEqual(knownWorlds(storage), []);
});

test('the bag and needs live on the server, and nothing about a trip but its figures goes there', () => {
  const local = memory(), store = remoteStore(local, { pocket: { bag: [1] }, vitals: { hours: 5 } });
  assert.deepEqual(JSON.parse(store.getItem('geodrive_pocket_v1')), { bag: [1] });
  assert.deepEqual(JSON.parse(store.getItem('geodrive_vitals_v1')), { hours: 5 });
  assert.equal(store.takeChanges(), null, 'nothing has changed');
  store.setItem('geodrive_pocket_v1', '{"bag":[2]}');
  assert.equal(local.getItem('geodrive_pocket_v1'), null, 'not in the browser');
  const session = { pos: { lat: 1, lng: 2 }, heading: 5, trip: { meters: 9 }, label: '1 Main St', destination: { label: '2 Main St' } };
  store.setItem('geodrive_session_v1', JSON.stringify(session));
  const message = store.takeChanges();
  assert.deepEqual(message.pocket, { bag: [2] });
  assert.equal(message.vitals, undefined);
  assert.deepEqual(message.trip, { meters: 9 });
  assert.equal(message.lat, 1);
  assert.ok(!JSON.stringify(message).includes('Main St'), 'no addresses');
  assert.equal(JSON.parse(local.getItem('geodrive_session_v1')).label, '1 Main St', 'they stay here');
  assert.equal(store.takeChanges(), null, 'and it\'s only sent once');
  store.setItem('other', 'x');
  assert.equal(local.getItem('other'), 'x');
  store.removeItem('other');
  assert.equal(store.getItem('other'), null);
});

test('in a shared world the rules are the world\'s, and the classes keep working', () => harness(async ({ create }) => {
  const storage = memory(), world = await create(storage);
  assert.equal(world.mode, 'private');
  assert.ok(world.rules.invites && world.rules.people && world.rules.chat && world.rules.startsOnFoot && !world.rules.ownCar && !world.rules.skipTime && !world.rules.createWorld);
  assert.equal(world.isManager, true);
  assert.deepEqual(world.managerNames, ['Karl']);
  const vitals = new Vitals(world.store), pocket = new PocketData(world.store);
  vitals.save();
  pocket.addNote(1);
  world.trips.save({ pos: { lat: 38.9, lng: -77.4 }, heading: 10, trip: { meters: 5 }, label: 'A secret address' });
  assert.deepEqual(world.trips.load().pos, { lat: 38.9, lng: -77.4 });
  assert.ok(![...storage.map.keys()].some((key) => key.includes('pocket') || key.includes('vitals')), 'not in the browser');
  assert.ok(storage.getItem(`${worldPrefix(world.id)}geodrive_session_v1`).includes('A secret address'));
}));

test('how to begin: where someone was, or near the others, or the creator chooses', () => harness(async ({ create, join }) => {
  const a = memory(), karl = await create(a);
  assert.deepEqual(karl.beginning(), { choose: true }, 'nobody anywhere yet');
  karl.whereAmI = () => ({ lat: 38.95, lng: -77.45, heading: 0, speed: 0, onFoot: true, flags: FLAGS.onFoot });
  karl.sendPlace();
  await new Promise((r) => setTimeout(r, 50));
  const dana = await join(karl, memory(), 'Dana');
  assert.ok(Math.abs(dana.beginning().near.lat - 38.95) < 1e-6);
  await karl.link.ask({ t: 'save', lat: 38.95, lng: -77.45, trip: { meters: 77 } });
  assert.deepEqual(karl.link.connected, true);
}));

test('someone back on a new browser starts where they were, with their figures', () => harness(async ({ create, open }) => {
  const a = memory(), karl = await create(a);
  await karl.link.ask({ t: 'save', lat: 40, lng: -70, trip: { meters: 123 } });
  const me = savedMe(a, karl.id), { link, answer } = await open({ t: 'hello', protocol: PROTOCOL, world: karl.id, player: me.id, secret: me.secret });
  assert.equal(answer.t, 'welcome');
  const again = new PrivateWorld({ id: karl.id, link, welcome: answer, storage: a });
  assert.deepEqual(again.beginning().restore, { lat: 40, lng: -70, trip: { meters: 123 } });
  clearInterval(again.saving);
  clearInterval(again.placing);
}));

test('places go to the others, at the rate for what they\'re doing', () => harness(async ({ create, join }) => {
  const karl = await create(memory()), dana = await join(karl, memory(), 'Dana');
  dana.whereAmI = () => ({ lat: 38.95, lng: -77.45, heading: 90, speed: 3, onFoot: true, gait: 4, floor: 1, flags: FLAGS.onFoot });
  const there = await until(() => karl.people.lastKnown(dana.you.id)?.gait === 4 && karl.people.lastKnown(dana.you.id), 'Dana\'s place');
  assert.equal(there.speed, 3);
  assert.equal(there.heading, 90);
  assert.ok(karl.people.drawnAt(dana.you.id, performance.now()));
}));

test('both see the same hour, moving at the world\'s rate', () => harness(async ({ create, join }) => {
  const karl = await create(memory()), dana = await join(karl, memory(), 'Dana');
  await until(() => karl.clock.state.at === dana.clock.state.at, 'the same clock');
  assert.ok(Math.abs(karl.clock.hour - dana.clock.hour) < 0.01);
  assert.equal(karl.clock.state.rate, GAME.world.clockRate);
  karl.clock.hour = 3; // nothing here can set it
  assert.notEqual(Math.round(karl.clock.hour), 3);
  karl.clock.advance(100000, true, 1);
  assert.ok(Math.abs(karl.clock.hour - clockHour(karl.clock.state, Date.now() + karl.clock.offset)) < 1e-6);
}));

test('sleeping alone moves everyone\'s clock, and with someone up it doesn\'t', () => harness(async ({ create, join }) => {
  const karl = await create(memory()), dana = await join(karl, memory(), 'Dana');
  const before = karl.clock.hour;
  karl.clock.skip(3);
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(karl.clock.hour - before < 0.5, 'Dana is up');
  dana.whereAmI = () => ({ lat: 1, lng: 2, heading: 0, speed: 0, onFoot: true, flags: FLAGS.onFoot | FLAGS.asleep });
  await new Promise((r) => setTimeout(r, 1100));
  karl.clock.skip(3);
  await until(() => dana.clock.hour - before > 2.5, 'the world to move');
}));

test('chat reaches a world object and its log, and the sender hears it too', () => harness(async ({ create, join }) => {
  const karl = await create(memory()), dana = await join(karl, memory(), 'Dana'), heard = [];
  dana.on.said = (line) => heard.push(line.text);
  await karl.link.ask({ t: 'say', text: 'hello' });
  await until(() => heard.length, 'the message');
  assert.deepEqual(heard, ['hello']);
  await until(() => karl.chat.messages('group').length, 'the echo');
  assert.equal(dana.chat.messages('group')[0].text, 'hello');
  await karl.link.ask({ t: 'say', to: dana.you.id, text: 'psst' });
  await until(() => dana.chat.messages(dana.chat.threadWith(karl.you.id)).length, 'the DM');
}));

test('messages already read aren\'t counted as new next time', () => harness(async ({ create, join, open }) => {
  const a = memory(), karl = await create(a), dana = await join(karl, memory(), 'Dana');
  await dana.link.ask({ t: 'say', text: 'one' });
  await until(() => karl.chat.messages('group').length, 'it');
  karl.markChatSeen();
  await dana.link.ask({ t: 'say', text: 'two' });
  const me = savedMe(a, karl.id), { link, answer } = await open({ t: 'hello', protocol: PROTOCOL, world: karl.id, player: me.id, secret: me.secret });
  const again = new PrivateWorld({ id: karl.id, link, welcome: answer, storage: a });
  assert.equal(again.missed, 1 + 0, 'only the one since');
  clearInterval(again.saving);
  clearInterval(again.placing);
}));

test('people joining and leaving, and managers changing, are heard', () => harness(async ({ create, join }) => {
  const karl = await create(memory()), told = [];
  karl.on.member = (member) => told.push(`${member.name} ${member.online}`);
  let managers = 0;
  karl.on.managers = () => { managers++; };
  const dana = await join(karl, memory(), 'Dana');
  await until(() => managers && karl.backup === dana.you.id, 'the backup');
  await until(() => told.includes('Dana true'), 'Dana');
  assert.deepEqual(karl.managerNames, ['Karl', 'Dana']);
  assert.equal(dana.isManager, true);
  dana.link.close();
  await until(() => told.includes('Dana false'), 'Dana leaving');
  assert.equal(karl.people.othersOnline.length, 0);
}));

test('the line comes back by itself after the server restarts, with no reload', () => harness(async ({ create, restart }) => {
  const storage = memory(), karl = await create(storage), states = [];
  karl.on.link = (state) => states.push(state);
  await karl.link.ask({ t: 'say', text: 'before' });
  assert.equal((await karl.link.ask({ t: 'nothing' })).why, 'unknown');
  await restart();
  await until(() => states.includes('lost'), 'losing it');
  assert.equal((await karl.link.ask({ t: 'say', text: 'while it\'s down' })).why ?? 'sent', karl.link.connected ? 'sent' : 'offline');
  await until(() => karl.link.connected && states.includes('open'), 'getting it back');
  assert.equal((await karl.link.ask({ t: 'say', text: 'after' })).why, undefined);
  await until(() => karl.chat.messages('group').some((line) => line.text === 'after'), 'the message');
  assert.ok(karl.chat.messages('group').some((line) => line.text === 'before'), 'and everything from before is still there');
}));

test('a second copy of someone stops the first, which doesn\'t fight its way back', () => harness(async ({ create, open }) => {
  const storage = memory(), karl = await create(storage), states = [];
  karl.on.link = (state, why) => states.push(why ?? state);
  const me = savedMe(storage, karl.id);
  await open({ t: 'hello', protocol: PROTOCOL, world: karl.id, player: me.id, secret: me.secret });
  await until(() => states.includes('replaced'), 'being replaced');
  await new Promise((r) => setTimeout(r, 1200));
  assert.ok(!states.includes('open'));
}));

test('an invite refused for a name leaves the line open for another try', () => harness(async ({ create, open }) => {
  const karl = await create(memory()), { code } = await karl.link.ask({ t: 'invite' });
  const { link, answer } = await open({ t: 'join', protocol: PROTOCOL, world: karl.id, code, name: 'Karl', ...LOOK });
  assert.equal(answer.why, 'name-taken');
  assert.equal(link.connected, true);
  assert.equal((await link.say({ t: 'join', protocol: PROTOCOL, world: karl.id, code, name: 'Dana', ...LOOK })).you.name, 'Dana');
}));

test('a server that can\'t be reached is said plainly', async () => {
  const link = new WorldLink({ address: 'ws://127.0.0.1:1' });
  await assert.rejects(link.open({ t: 'hello' }));
  assert.equal((await link.ask({ t: 'say', text: 'x' })).why, 'offline');
});

test('openWorld gives the entry\'s world when there is one, and otherwise as before', () => harness(async ({ create }) => {
  const storage = memory();
  const settings = { hour: 3 };
  assert.equal(openWorld({ search: '', storage, settings, saveSettings() {} }).mode, 'sandbox');
  const karl = await create(storage);
  assert.equal(scopedStorage(storage, worldPrefix(karl.id)).getItem('me_v1') !== null, true);
}));
