// The world server with real connections and real files, each test with its own folder and a clock it can move.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from '../server/node_modules/ws/wrapper.mjs';
import { startServer } from '../server/app.mjs';
import { GAME } from '../public/js/gameConfig.js';
import { PROTOCOL, packPresence, unpackPresence, FLAGS } from '../public/js/protocol.js';

const LOOK = { figure: 'male', colours: { skin: '#ddaa88', jacket: '#ff8800', jeans: '#223355', shoes: '#111111', hair: '#221100' } };
const HOUR = 3600000;

class Player {
  constructor(port, headers) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
    this.inbox = [];
    this.bytes = [];
    this.waiting = [];
    this.nextId = 1;
    this.open = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.closed = new Promise((resolve) => { this.socket.once('close', resolve); });
    this.socket.on('message', (data, binary) => {
      if (binary) this.bytes.push(new Uint8Array(data));
      else this.inbox.push(JSON.parse(data));
      for (const check of [...this.waiting]) check();
    });
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  // The first message that fits, kept or still to come.
  next(fits, what = 'message') {
    const test = typeof fits === 'string' ? (m) => m.t === fits : fits;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`waited for ${typeof fits === 'string' ? fits : what}; got ${JSON.stringify(this.inbox.map((m) => m.t))}`)), 2000);
      const check = () => {
        const index = this.inbox.findIndex(test);
        if (index < 0) return;
        const [found] = this.inbox.splice(index, 1);
        clearTimeout(timer);
        this.waiting = this.waiting.filter((other) => other !== check);
        resolve(found);
      };
      this.waiting.push(check);
      check();
    });
  }

  async ask(message) {
    const id = this.nextId++;
    this.send({ ...message, id });
    return this.next((m) => (m.t === 'ok' || m.t === 'no') && m.id === id, message.t);
  }

  quit() {
    this.socket.close();
    return this.closed;
  }
}

async function harness(fn, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'geodrive-')), clock = { now: 1000000 };
  const server = await startServer({ dir, now: () => clock.now, ...options });
  const players = [];
  const connect = async (headers) => {
    const player = new Player(server.port, headers);
    players.push(player);
    await player.open;
    return player;
  };
  const create = async (name = 'Karl') => {
    const player = await connect();
    player.send({ t: 'create', protocol: PROTOCOL, name: 'Dulles Gang', player: { name, ...LOOK } });
    const made = await player.next('made'), welcome = await player.next('welcome');
    return Object.assign(player, { world: made.world, memberId: made.id, secret: made.secret, welcome });
  };
  const invited = async (from, name, extra = {}) => {
    const { code, why } = await from.ask({ t: 'invite', ...extra });
    assert.equal(why, undefined);
    const player = await connect();
    player.send({ t: 'join', protocol: PROTOCOL, world: from.world, code, name, ...LOOK });
    const welcome = await player.next('welcome');
    return Object.assign(player, { world: from.world, memberId: welcome.you.id, secret: welcome.you.secret, welcome });
  };
  try {
    await fn({ server, clock, connect, create, invited, dir });
  } finally {
    for (const player of players) player.socket.terminate();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('making a world signs its creator in as owner, and keeps nothing but what they gave', () => harness(async ({ create, dir }) => {
  const karl = await create();
  const { world, you, members, clock, near } = karl.welcome;
  assert.equal(world.name, 'Dulles Gang');
  assert.equal(world.mode, 'private');
  assert.equal(world.owner, you.id);
  assert.equal(world.creator, you.id);
  assert.equal(world.backup, null);
  assert.equal(you.lives, GAME.world.lives);
  assert.deepEqual(members.map((m) => m.name), ['Karl']);
  assert.equal(clock.rate, GAME.world.clockRate, 'the clock runs with someone here');
  assert.equal(near, null, 'nobody else to appear near');
  assert.ok(!('secretHash' in members[0]), 'nobody is sent anyone\'s secret');
  assert.ok(readdirSync(dir).some((name) => name === `${karl.world}.sqlite`));
}));

test('a world\'s name and first person are checked, and nothing is made if they\'re wrong', () => harness(async ({ connect, dir }) => {
  for (const [message, why] of [
    [{ name: '  ', player: { name: 'Karl', ...LOOK } }, 'no-world-name'],
    [{ name: 'A', player: { name: 'K', ...LOOK } }, 'too-short'],
    [{ name: 'A', player: { name: 'has space', ...LOOK } }, 'bad-characters'],
    [{ name: 'A', player: { name: 'Karl', figure: 'male', colours: { skin: 'red' } } }, 'bad-look'],
  ]) {
    const player = await connect();
    player.send({ t: 'create', protocol: PROTOCOL, ...message });
    assert.equal((await player.next('refused')).why, why);
  }
  assert.equal(readdirSync(dir).filter((name) => name.endsWith('.sqlite')).length, 0);
}));

test('an address can only make so many worlds in a day', () => harness(async ({ connect, create, clock }) => {
  await create();
  const again = await connect();
  again.send({ t: 'create', protocol: PROTOCOL, name: 'B', player: { name: 'Karl', ...LOOK } });
  assert.equal((await again.next('refused')).why, 'too-many-worlds');
  clock.now += 24 * HOUR;
  await create();
}, { config: { ...GAME.world, newWorldsPerDay: 1 } }));

test('no world comes from a bad id', () => harness(async ({ connect }) => {
  const a = await connect();
  a.send({ t: 'hello', protocol: PROTOCOL, world: '../../etc/passwd', player: 'x', secret: 'y' });
  assert.equal((await a.next('refused')).why, 'no-world');
  const b = await connect();
  b.send({ t: 'hello', protocol: PROTOCOL, world: 'nosuchworldhere', player: 'x', secret: 'y' });
  assert.equal((await b.next('refused')).why, 'no-world');
}));

test('no new world once all the worlds together are too large', () => harness(async ({ connect }) => {
  const player = await connect();
  player.send({ t: 'create', protocol: PROTOCOL, name: 'A', player: { name: 'Karl', ...LOOK } });
  assert.equal((await player.next('refused')).why, 'server-full');
}, { config: { ...GAME.world, allWorldsBytes: 0 } }));

test('the limit on new worlds goes by the address Apache saw, not one the player claims', () => harness(async ({ connect }) => {
  const make = async (forwarded) => {
    const player = await connect({ 'x-forwarded-for': forwarded });
    player.send({ t: 'create', protocol: PROTOCOL, name: 'A', player: { name: 'Karl', ...LOOK } });
    return player.next((m) => m.t === 'made' || m.t === 'refused');
  };
  assert.equal((await make('1.1.1.1, 9.9.9.9')).t, 'made');
  assert.equal((await make('2.2.2.2, 9.9.9.9')).why, 'too-many-worlds', 'Apache adds the real one last');
  assert.equal((await make('9.9.9.9, 8.8.8.8')).t, 'made', 'and someone else is fine');
}, { config: { ...GAME.world, newWorldsPerDay: 1 } }));

test('an out-of-date client is told so', () => harness(async ({ connect }) => {
  const player = await connect();
  player.send({ t: 'hello', protocol: PROTOCOL - 1, world: 'abc', player: 'x', secret: 'y' });
  assert.equal((await player.next('refused')).why, 'old-client');
}));

test('only the listed sites may connect', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'geodrive-')), server = await startServer({ dir, origins: ['https://www.psistorm.com'] });
  const attempt = (origin) => new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin });
    socket.once('open', () => { socket.close(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
  assert.equal(await attempt('https://www.psistorm.com'), true);
  assert.equal(await attempt('https://evil.example'), false);
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

test('someone invited is in, is told who\'s here, and those here are told about them', () => harness(async ({ create, invited }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  assert.deepEqual(dana.welcome.members.map((m) => m.name), ['Karl', 'Dana']);
  assert.deepEqual(dana.welcome.members.map((m) => m.online), [true, true]);
  assert.equal(dana.welcome.you.order, 2);
  assert.ok(dana.secret);
  assert.equal((await karl.next((m) => m.t === 'member' && m.member.name === 'Dana')).member.name, 'Dana');
}));

test('the first to join becomes the backup, and everyone is told', () => harness(async ({ create, invited }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  const told = await karl.next('managers');
  assert.equal(told.owner, karl.memberId);
  assert.equal(told.backup, dana.memberId);
  const mo = await invited(karl, 'Mo');
  assert.equal(mo.welcome.world.backup, dana.memberId, 'the second doesn\'t replace them');
}));

test('managers can invite and choose the backup, and nobody else can', () => harness(async ({ create, invited }) => {
  const karl = await create(), dana = await invited(karl, 'Dana'), mo = await invited(karl, 'Mo');
  assert.equal((await mo.ask({ t: 'invite' })).why, 'not-manager');
  assert.equal((await mo.ask({ t: 'setBackup', member: mo.memberId })).why, 'not-manager');
  assert.ok((await dana.ask({ t: 'invite' })).code, 'the backup can invite');
  assert.equal((await karl.ask({ t: 'setBackup', member: karl.memberId })).why, 'already-owner');
  assert.equal((await karl.ask({ t: 'setBackup', member: 'nobody' })).why, 'unknown');
  assert.equal((await karl.ask({ t: 'setBackup', member: mo.memberId })).why, undefined);
  assert.equal((await dana.next((m) => m.t === 'managers' && m.backup === mo.memberId)).owner, karl.memberId);
  assert.equal((await dana.ask({ t: 'invite' })).why, 'not-manager', 'someone replaced as backup isn\'t a manager');
  assert.ok((await mo.ask({ t: 'invite' })).code);
}));

test('an invite works once', () => harness(async ({ create, connect }) => {
  const karl = await create(), { code } = await karl.ask({ t: 'invite' });
  const dana = await connect();
  dana.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Dana', ...LOOK });
  await dana.next('welcome');
  const mo = await connect();
  mo.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Mo', ...LOOK });
  assert.equal((await mo.next('refused')).why, 'invite-used');
}));

test('an invite runs out', () => harness(async ({ create, connect, clock }) => {
  const karl = await create(), { code, expires } = await karl.ask({ t: 'invite' });
  assert.equal(expires, clock.now + GAME.world.inviteHours * HOUR);
  clock.now = expires;
  const dana = await connect();
  dana.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Dana', ...LOOK });
  assert.equal((await dana.next('refused')).why, 'invite-used');
}));

test('a made-up invite gets nowhere', () => harness(async ({ create, connect }) => {
  const karl = await create();
  for (const code of ['made-up', 7, null]) {
    const stranger = await connect();
    stranger.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Eve', ...LOOK });
    assert.equal((await stranger.next('refused')).why, 'invite-used');
  }
}));

test('a name is taken for good, in any case, and refusing one keeps the invite for another try', () => harness(async ({ create, connect }) => {
  const karl = await create(), { code } = await karl.ask({ t: 'invite' }), dana = await connect();
  dana.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'kARL', ...LOOK });
  assert.equal((await dana.next('refused')).why, 'name-taken');
  dana.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'no good', ...LOOK });
  assert.equal((await dana.next('refused')).why, 'bad-characters');
  dana.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Dana', figure: 'male', colours: { skin: 'javascript:' } });
  assert.equal((await dana.next('refused')).why, 'bad-look');
  dana.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Dana', ...LOOK });
  assert.equal((await dana.next('welcome')).you.name, 'Dana');
}));

test('two people claiming one name at once: exactly one gets it, and the other keeps their invite', () => harness(async ({ create, connect }) => {
  const karl = await create(), first = await karl.ask({ t: 'invite' }), second = await karl.ask({ t: 'invite' });
  const a = await connect(), b = await connect();
  a.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code: first.code, name: 'Sam', ...LOOK });
  b.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code: second.code, name: 'SAM', ...LOOK });
  const answers = await Promise.all([a, b].map((p) => p.next((m) => m.t === 'welcome' || m.t === 'refused')));
  assert.equal(answers.filter((m) => m.t === 'welcome').length, 1);
  assert.equal(answers.find((m) => m.t === 'refused').why, 'name-taken');
  const loser = answers[0].t === 'refused' ? a : b, code = answers[0].t === 'refused' ? first.code : second.code;
  loser.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Sammy', ...LOOK });
  assert.equal((await loser.next('welcome')).you.name, 'Sammy');
}));

test('coming back with the saved id and secret works, and with anything else doesn\'t', () => harness(async ({ create, invited, connect }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  await dana.quit();
  const stranger = await connect();
  stranger.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: dana.memberId, secret: 'guess' });
  assert.equal((await stranger.next('refused')).why, 'unknown');
  const noSecret = await connect();
  noSecret.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: dana.memberId });
  assert.equal((await noSecret.next('refused')).why, 'unknown');
  const back = await connect();
  back.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: dana.memberId, secret: dana.secret });
  const welcome = await back.next('welcome');
  assert.equal(welcome.you.id, dana.memberId);
  assert.equal(welcome.you.secret, undefined, 'it isn\'t sent again');
}));

test('nothing is heard or done before signing in', () => harness(async ({ create, connect }) => {
  const karl = await create(), stranger = await connect();
  stranger.send({ t: 'say', protocol: PROTOCOL, text: 'hello' });
  assert.equal((await stranger.next('refused')).why, 'no-world');
  const another = await connect();
  another.socket.send(packPresence({ lat: 1, lng: 2 }));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(karl.bytes.length, 0);
}));

test('a rejoin invite signs in as that person, and their old browser stops working', () => harness(async ({ create, invited, connect }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  await dana.ask({ t: 'save', pocket: { bag: [{ id: 'Cash', count: 2 }] } });
  await dana.quit();
  const { code } = await karl.ask({ t: 'invite', rejoinOf: dana.memberId });
  const back = await connect();
  back.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Ignored', ...LOOK });
  const welcome = await back.next('welcome');
  assert.equal(welcome.you.id, dana.memberId);
  assert.equal(welcome.you.name, 'Dana');
  assert.deepEqual(welcome.player.pocket.bag, [{ id: 'Cash', count: 2 }], 'with their things');
  assert.ok(welcome.you.secret && welcome.you.secret !== dana.secret);
  await back.quit();
  const old = await connect();
  old.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: dana.memberId, secret: dana.secret });
  assert.equal((await old.next('refused')).why, 'unknown');
}));

test('the same person connecting again replaces the old connection', () => harness(async ({ create, connect }) => {
  const karl = await create(), second = await connect();
  second.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: karl.memberId, secret: karl.secret });
  await second.next('welcome');
  await karl.next('replaced');
  await karl.closed;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await second.ask({ t: 'invite' })).code !== undefined, true, 'and the new one carries on, signed in');
}));

test('a ninth person online is told it\'s full, and can come in when someone leaves', () => harness(async ({ create, invited, connect }) => {
  const karl = await create(), others = [];
  for (let i = 0; i < GAME.world.playersOnline - 1; i++) others.push(await invited(karl, `Player${i}`));
  const { code } = await karl.ask({ t: 'invite' }), ninth = await connect();
  ninth.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Nine', ...LOOK });
  assert.equal((await ninth.next('refused')).why, 'full');
  await others[0].quit();
  await new Promise((r) => setTimeout(r, 30));
  ninth.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Nine', ...LOOK });
  assert.equal((await ninth.next('welcome')).you.name, 'Nine');
}));

test('someone is told where to appear: near someone online, or else whoever was here last', () => harness(async ({ create, invited, clock, connect }) => {
  const karl = await create(), place = { lat: 38.95, lng: -77.45 };
  karl.socket.send(packPresence({ lat: place.lat, lng: place.lng }));
  await new Promise((r) => setTimeout(r, 30));
  const dana = await invited(karl, 'Dana');
  assert.ok(Math.abs(dana.welcome.near.lat - place.lat) < 1e-6 && Math.abs(dana.welcome.near.lng - place.lng) < 1e-6);
  await dana.ask({ t: 'save', lat: 40, lng: -74 });
  clock.now += 1000;
  await karl.quit();
  await new Promise((r) => setTimeout(r, 30));
  const { code } = await dana.ask({ t: 'invite' }), mo = await connect();
  mo.send({ t: 'join', protocol: PROTOCOL, world: karl.world, code, name: 'Mo', ...LOOK });
  const { near } = await mo.next('welcome');
  assert.equal(near.lat, 40, 'Dana is the one online');
  await dana.quit();
  await mo.quit();
  await new Promise((r) => setTimeout(r, 30));
  const again = await connect();
  again.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: karl.memberId, secret: karl.secret });
  assert.equal((await again.next('welcome')).near.lat, 40, 'and with nobody online, whoever was here last with a place');
}));

test('a person\'s place goes to the others, marked as theirs whatever they claim', () => harness(async ({ create, invited }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  dana.socket.send(packPresence({ player: 99, seq: 5, lat: 38.95, lng: -77.45, heading: 90, speed: 12.5, flags: FLAGS.onFoot, gait: 3 }));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(karl.bytes.length, 1);
  assert.equal(dana.bytes.length, 0, 'not back to themselves');
  const heard = unpackPresence(karl.bytes[0]);
  assert.equal(heard.player, 2, 'their number in this world, not the 99 they sent');
  assert.equal(heard.seq, 5);
  assert.ok(Math.abs(heard.lat - 38.95) < 1e-6);
  assert.equal(heard.speed, 12.5);
  assert.equal(heard.flags, FLAGS.onFoot);
}));

test('rubbish instead of a place goes nowhere and stops nobody', () => harness(async ({ create, invited }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  dana.socket.send(new Uint8Array(7));
  dana.socket.send(new Uint8Array(24)); // the wrong kind
  dana.socket.send('not json {');
  dana.socket.send('[1,2]');
  dana.socket.send(JSON.stringify({ t: 'nothing like this', id: 1 }));
  assert.equal((await dana.next((m) => m.id === 1)).why, 'unknown');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(karl.bytes.length, 0);
  assert.equal((await dana.ask({ t: 'say', text: 'still here' })).why, undefined);
}));

test('someone sending too many places a second is held to the limit', () => harness(async ({ create, invited }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  for (let i = 0; i < 100; i++) dana.socket.send(packPresence({ seq: i, lat: 1, lng: 2 }));
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(karl.bytes.length, 30);
}));

test('someone far off is only passed on now and then', () => harness(async ({ create, invited, clock }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  karl.socket.send(packPresence({ lat: 40, lng: -74 }));
  for (let i = 0; i < 5; i++) dana.socket.send(packPresence({ seq: i, lat: 38.95, lng: -77.45 }));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(karl.bytes.length, 1, 'a few hundred km away, one of the five');
  clock.now += 6000;
  dana.socket.send(packPresence({ seq: 6, lat: 38.95, lng: -77.45 }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(karl.bytes.length, 2, 'then another after a while');
  dana.socket.send(packPresence({ seq: 7, lat: 40.0001, lng: -74 }));
  dana.socket.send(packPresence({ seq: 8, lat: 40.0001, lng: -74 }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(karl.bytes.length, 4, 'and nearby, all of them');
}));

test('the clock runs while anyone\'s here, stops when they\'ve gone, and carries on from there', () => harness(async ({ create, connect, clock }) => {
  const karl = await create(), { hour: began, rate } = karl.welcome.clock;
  assert.equal(rate, 12);
  clock.now += HOUR / 12; // 5 real minutes: one game hour
  await karl.quit();
  await new Promise((r) => setTimeout(r, 30));
  clock.now += 10 * HOUR; // nobody here, so it doesn't count
  const back = await connect();
  back.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: karl.memberId, secret: karl.secret });
  const welcome = await back.next('welcome');
  assert.ok(Math.abs(welcome.clock.hour - (began + 1)) < 1e-6, `${welcome.clock.hour}`);
  assert.equal(welcome.clock.at, clock.now);
}));

test('someone joining doesn\'t move the clock', () => harness(async ({ create, invited, clock }) => {
  const karl = await create(), began = karl.welcome.clock.hour, at = karl.welcome.clock.at;
  clock.now += HOUR / 12;
  const dana = await invited(karl, 'Dana');
  const { hour, rate, at: since } = dana.welcome.clock;
  assert.ok(Math.abs(hour + (rate * (clock.now - since)) / HOUR - (began + (12 * (clock.now - at)) / HOUR)) < 1e-6);
}));

test('sleeping moves the world only if everyone else here is in bed', () => harness(async ({ create, invited }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  assert.equal((await karl.ask({ t: 'sleep', hours: 8 })).worldMoved, false, 'Dana is up');
  dana.socket.send(packPresence({ lat: 1, lng: 2, flags: FLAGS.asleep }));
  await new Promise((r) => setTimeout(r, 30));
  const before = karl.inbox.filter((m) => m.t === 'clock').length;
  assert.equal((await karl.ask({ t: 'sleep', hours: 8 })).worldMoved, true);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(karl.inbox.filter((m) => m.t === 'clock').length > before, 'and everyone hears');
  assert.equal((await karl.ask({ t: 'sleep', hours: 900 })).why, 'bad-hours');
}));

test('alone, sleeping moves the world', () => harness(async ({ create }) => {
  const karl = await create();
  const before = karl.welcome.clock.hour;
  assert.equal((await karl.ask({ t: 'sleep', hours: 8 })).worldMoved, true);
  const { clock } = await karl.next((m) => m.t === 'clock' && Math.abs(m.clock.hour - (before + 8)) < 0.01);
  assert.ok(clock);
}));

test('the group hears a group message, and it\'s kept for those who come later', () => harness(async ({ create, invited }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  assert.equal((await karl.ask({ t: 'say', text: 'hello all' })).why, undefined);
  const heard = await dana.next('said');
  assert.equal(heard.thread, 'group');
  assert.equal(heard.sender, karl.memberId);
  assert.equal(heard.text, 'hello all');
  await karl.next('said');
  const mo = await invited(karl, 'Mo');
  assert.deepEqual(mo.welcome.chat.map((m) => m.text), ['hello all']);
}));

test('a DM reaches only its two people, even later', () => harness(async ({ create, invited, connect }) => {
  const karl = await create(), dana = await invited(karl, 'Dana'), mo = await invited(karl, 'Mo');
  const answer = await karl.ask({ t: 'say', to: dana.memberId, text: 'psst' });
  assert.equal(answer.offline, false);
  assert.equal((await dana.next('said')).text, 'psst');
  assert.equal((await karl.next('said')).text, 'psst');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(mo.inbox.some((m) => m.t === 'said'), false);
  await mo.quit();
  await new Promise((r) => setTimeout(r, 30));
  const back = await connect();
  back.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: mo.memberId, secret: mo.secret });
  assert.deepEqual((await back.next('welcome')).chat, [], 'not when Mo comes back either');
}));

test('a DM to someone away waits for them, and the sender is told', () => harness(async ({ create, invited, connect }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  await dana.quit();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await karl.ask({ t: 'say', to: dana.memberId, text: 'see this later' })).offline, true);
  assert.equal((await karl.ask({ t: 'say', to: 'nobody', text: 'x' })).why, 'unknown');
  const back = await connect();
  back.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: dana.memberId, secret: dana.secret });
  assert.deepEqual((await back.next('welcome')).chat.map((m) => m.text), ['see this later']);
}));

test('chat is limited in length and speed, and keeps the last 50 of a thread', () => harness(async ({ create, clock, connect }) => {
  const karl = await create();
  assert.equal((await karl.ask({ t: 'say', text: 'x'.repeat(GAME.world.chatLength + 1) })).why, 'too-long');
  assert.equal((await karl.ask({ t: 'say', text: '   ' })).why, 'empty');
  assert.equal((await karl.ask({ t: 'say', text: 7 })).why, 'empty');
  for (let i = 0; i < GAME.world.chatBurst; i++) assert.equal((await karl.ask({ t: 'say', text: `${i}` })).why, undefined);
  assert.equal((await karl.ask({ t: 'say', text: 'too soon' })).why, 'too-fast');
  for (let i = 0; i < 60; i++) {
    clock.now += 5000;
    await karl.ask({ t: 'say', text: `later ${i}` });
  }
  const back = await connect();
  back.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: karl.memberId, secret: karl.secret });
  const { chat } = await back.next('welcome');
  assert.equal(chat.length, GAME.world.chatKept);
  assert.equal(chat.at(-1).text, 'later 59', 'the newest kept');
  assert.equal(chat[0].text, 'later 10', 'and the oldest gone');
}));

test('what a person has comes back to them, and only their numbers from a trip are kept', () => harness(async ({ create, connect }) => {
  const karl = await create();
  await karl.ask({
    t: 'save', pocket: { bag: [{ id: 'Flashlight', count: 1 }], notes: [{ text: 'hello' }] }, vitals: { stats: { health: 40 } },
    trip: { meters: 1200, topSpeed: 30, label: 'Saarinen Circle, Dulles Airport, Virginia', destination: { label: '1 Main St' }, place: 'Sterling' }, lat: 38.9, lng: -77.4,
  });
  await karl.ask({ t: 'save', lat: 999, lng: 5 });
  await karl.quit();
  await new Promise((r) => setTimeout(r, 30));
  const back = await connect();
  back.send({ t: 'hello', protocol: PROTOCOL, world: karl.world, player: karl.memberId, secret: karl.secret });
  const { player } = await back.next('welcome');
  assert.equal(player.vitals.stats.health, 40);
  assert.equal(player.pocket.notes[0].text, 'hello');
  assert.deepEqual(player.trip, { meters: 1200, topSpeed: 30 }, 'never an address or a town');
  assert.equal(player.lat, 38.9);
  assert.equal(player.lng, -77.4, 'and a place off the globe is ignored');
}));

test('a connection that never signs in is let go', () => harness(async ({ connect }) => {
  const idle = await connect();
  await idle.closed;
}, { signInWithin: 20 }));

test('a world is still there after the server restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'geodrive-'));
  let server = await startServer({ dir });
  const first = new Player(server.port);
  await first.open;
  first.send({ t: 'create', protocol: PROTOCOL, name: 'Lasting', player: { name: 'Karl', ...LOOK } });
  const made = await first.next('made');
  await first.ask({ t: 'say', text: 'remember this' });
  first.socket.terminate();
  await server.close();
  server = await startServer({ dir });
  const back = new Player(server.port);
  await back.open;
  back.send({ t: 'hello', protocol: PROTOCOL, world: made.world, player: made.id, secret: made.secret });
  const welcome = await back.next('welcome');
  assert.equal(welcome.world.name, 'Lasting');
  assert.deepEqual(welcome.chat.map((m) => m.text), ['remember this']);
  back.socket.terminate();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

test('an override is kept, told to everyone, and used by that world only', () => harness(async ({ create, invited }) => {
  const karl = await create(), other = await create('Sam');
  const ann = await invited(karl, 'Ann');
  assert.equal((await karl.ask({ t: 'tune', path: 'hammer.item', value: 1 })).why, 'bad');
  assert.equal((await karl.ask({ t: 'tune', path: 'world.clockRate', value: 60 })).t, 'ok');
  const heard = await ann.next((m) => m.t === 'overrides');
  assert.equal(heard.overrides['world.clockRate'], 60);
  const clock = await ann.next((m) => m.t === 'clock' && m.clock.rate === 60);
  assert.equal(clock.clock.rate, 60);
  assert.equal(other.welcome.overrides['world.clockRate'], undefined);
  assert.equal(GAME.world.clockRate, 12, 'GAME is every world\'s, and is left alone');
  await karl.ask({ t: 'tune', path: 'world.clockRate', value: null });
  await karl.next((m) => m.t === 'overrides' && !('world.clockRate' in m.overrides));
}));

test('anyone\'s lives can be set and reset, and none ends someone', () => harness(async ({ create, invited }) => {
  const karl = await create(), ann = await invited(karl, 'Ann'), id = ann.welcome.you.id;
  assert.equal((await karl.ask({ t: 'setLives', member: id, lives: 2 })).lives, 2);
  assert.equal((await karl.ask({ t: 'setLives', member: id, lives: -1 })).why, 'bad');
  assert.equal((await karl.ask({ t: 'setLives', member: id, lives: 'reset' })).lives, GAME.world.lives);
  await karl.ask({ t: 'setLives', member: id, lives: 0 });
  assert.equal((await ann.next((m) => m.t === 'died')).lives, 0);
}));

test('a spawned car runs, and is known to others', () => harness(async ({ create, invited }) => {
  const karl = await create(), ann = await invited(karl, 'Ann');
  const planted = { id: 'x_test-1', lat: 39, lng: -77, heading: 0, fuel: 100, type: 'truck', colour: '#112233', runs: true, why: null, storage: [] };
  assert.equal((await karl.ask({ t: 'spawnCar', planted })).car.type, 'truck');
  assert.equal((await ann.next((m) => m.t === 'car')).car.id, 'x_test-1');
  const repaired = await karl.ask({ t: 'repairCar', car: 'x_test-1' });
  assert.equal(repaired.car.condition, 100);
}));

test('gunfire wears a car down, hits whoever is inside, and the shot after 0 blows it up with them in it', () => harness(async ({ create, invited, clock }) => {
  const karl = await create(), dana = await invited(karl, 'Dana');
  const car = { lat: 38.95, lng: -77.45 }, from = { lat: 38.95, lng: -77.4502 }; // about 17 m west
  const planted = { id: 'x_shot-1', ...car, heading: 0, fuel: 100, type: 'truck', colour: '#112233', runs: true, why: null, storage: [] };
  await karl.ask({ t: 'spawnCar', planted });
  dana.socket.send(packPresence({ ...car }));
  const seated = await dana.ask({ t: 'getIn', car: planted.id });
  assert.ok(seated.car, JSON.stringify(seated));
  const fire = async () => {
    clock.now += 2000;
    karl.socket.send(packPresence({ ...from, flags: FLAGS.onFoot }));
    dana.socket.send(packPresence({ ...car }));
    await new Promise((r) => setTimeout(r, 30));
    karl.send({ t: 'shot', weapon: 'Sniper Rifle', ...from, aimLat: car.lat, aimLng: car.lng, car: planted.id });
    return karl.next('carHit');
  };
  for (const left of [75, 50, 25, 0]) {
    const hit = await fire();
    assert.equal(hit.condition, left);
    assert.equal(hit.rider, dana.memberId, 'one person inside, and the dice at 0, so she is hit');
    const hurt = await dana.next((m) => m.t === 'injured');
    assert.equal(hurt.how, 'shot');
  }
  const blast = await fire();
  assert.equal(blast.blew, true);
  assert.equal((await dana.next('carBlown')).car, planted.id);
  const died = await dana.next((m) => m.t === 'died' && m.member === dana.memberId);
  assert.equal(died.how, 'burned');
  assert.equal(died.by, karl.memberId);
  const wreck = await karl.next((m) => m.t === 'car' && m.car.wrecked);
  assert.equal(wreck.car.id, planted.id);
}, { random: () => 0 }));

test('a shot at a car from out of range does nothing to it', () => harness(async ({ create, clock }) => {
  const karl = await create(), car = { lat: 38.95, lng: -77.45 }, from = { lat: 38.95, lng: -77.452 }; // about 170 m: past a handgun
  const planted = { id: 'x_shot-2', ...car, heading: 0, fuel: 100, type: 'truck', colour: '#112233', runs: true, why: null, storage: [] };
  await karl.ask({ t: 'spawnCar', planted });
  clock.now += 2000;
  karl.socket.send(packPresence({ ...from, flags: FLAGS.onFoot }));
  await new Promise((r) => setTimeout(r, 30));
  karl.send({ t: 'shot', weapon: 'Handgun', ...from, aimLat: car.lat, aimLng: car.lng, car: planted.id });
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(!karl.inbox.some((m) => m.t === 'carHit'));
}));
