// Pretend players, for trying a shared world without other people: a world of bots walking near a place, and an invite for a real person to join them. They talk too.
// node scripts/bots.mjs [count] [--live] [--near lat,lng]. Local by default, which needs `npm start`. --live uses the real server, where a world lasts until removed by hand.
import WebSocket from '../server/node_modules/ws/wrapper.mjs';
import { FLAGS, PROTOCOL, packPresence, unpackPresence } from '../public/js/protocol.js';
import { FRAME_COUNT } from '../public/js/footPerson.js';

const args = process.argv.slice(2), count = Number(args.find((arg) => /^\d+$/.test(arg))) || 2, live = args.includes('--live');
const near = (args.includes('--near') ? args[args.indexOf('--near') + 1] : '38.9555,-77.4475').split(',').map(Number);
const ADDRESS = live ? 'wss://www.psistorm.com/geodrive/ws' : 'ws://127.0.0.1:5175', ORIGIN = 'https://www.psistorm.com';
const GAME_ADDRESS = live ? 'https://www.psistorm.com/geodrive/' : 'http://localhost:8765/';
const NAMES = ['Dana', 'Mo', 'Priya', 'Sam', 'Lee', 'Ana', 'Tomasz'];
const JACKETS = ['#ff5533', '#3388ff', '#33cc66', '#ffcc33', '#cc55ff', '#33cccc', '#ffffff'];
const LINES = ['Anyone seen a car?', 'I can see the road from here.', 'Over here!', 'It\'s getting late.', 'Which way is everyone going?'];
const METRE = 1 / 111320;

const look = (i) => ({ figure: i % 2 ? 'female' : 'male', colours: { skin: '#d1a685', jacket: JACKETS[i % JACKETS.length], jeans: '#213357', shoes: '#1a1717', hair: '#241a12' } });

class Bot {
  constructor(i) {
    this.i = i;
    this.socket = new WebSocket(ADDRESS, { origin: ORIGIN });
    this.socket.binaryType = 'nodebuffer';
    this.inbox = [];
    this.nextId = 1;
    this.opened = new Promise((resolve, reject) => { this.socket.once('open', resolve); this.socket.once('error', reject); });
    this.socket.on('message', (data, binary) => {
      if (binary) return unpackPresence(new Uint8Array(data));
      const message = JSON.parse(data);
      this.inbox.push(message);
      if (message.t === 'said' && message.sender !== this.id && i === 0) console.log(`  chat: ${message.text}`);
      if (message.t === 'member' && message.member.online && i === 0) console.log(`  ${message.member.name} is here`);
      for (const check of this.waits ?? []) check();
    });
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  next(type) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${type}: ${JSON.stringify(this.inbox)}`)), 5000);
      const check = () => {
        const at = this.inbox.findIndex((m) => m.t === type);
        if (at < 0) return;
        clearTimeout(timer);
        this.waits = this.waits.filter((other) => other !== check);
        resolve(this.inbox.splice(at, 1)[0]);
      };
      (this.waits ??= []).push(check);
      check();
    });
  }

  ask(message) {
    const id = this.nextId++;
    this.send({ ...message, id });
    return new Promise((resolve) => {
      const check = () => {
        const at = this.inbox.findIndex((m) => (m.t === 'ok' || m.t === 'no') && m.id === id);
        if (at < 0) return;
        this.waits = this.waits.filter((other) => other !== check);
        resolve(this.inbox.splice(at, 1)[0]);
      };
      (this.waits ??= []).push(check);
      check();
    });
  }

  // Walks round a circle near the place, at walking pace, five times a second.
  walk() {
    let seq = 0, stride = 0;
    const radius = 14 + this.i * 7, speed = 3, began = Date.now();
    setInterval(() => {
      const seconds = (Date.now() - began) / 1000, turn = this.i * 1.3 + (seconds * speed) / radius;
      const lat = near[0] + Math.cos(turn) * radius * METRE, lng = near[1] + (Math.sin(turn) * radius * METRE) / Math.cos((near[0] * Math.PI) / 180);
      stride = (stride + 1) % 8;
      this.socket.send(packPresence({ seq: seq++, lat, lng, heading: ((turn * 180) / Math.PI + 90) % 360, speed, flags: FLAGS.onFoot, gait: 1 + stride % (FRAME_COUNT - 1), floor: 1 }));
    }, 200);
  }
}

const owner = new Bot(0);
await owner.opened;
owner.send({ t: 'create', protocol: PROTOCOL, name: `Bots ${new Date().toLocaleTimeString()}`, player: { name: NAMES[0], ...look(0) } });
const made = await owner.next('made');
owner.id = made.id;
await owner.next('welcome');
owner.walk();
await owner.ask({ t: 'save', lat: near[0], lng: near[1] });
for (let i = 1; i < count; i++) {
  const { code } = await owner.ask({ t: 'invite' }), bot = new Bot(i);
  await bot.opened;
  bot.send({ t: 'join', protocol: PROTOCOL, world: made.world, code, name: NAMES[i], ...look(i) });
  bot.id = (await bot.next('welcome')).you.id;
  bot.walk();
  setInterval(() => bot.send({ t: 'say', text: LINES[Math.floor(Math.random() * LINES.length)] }), 45000 + i * 7000);
}
const { code } = await owner.ask({ t: 'invite' });
console.log(`World ${made.world}, ${count} bots walking near ${near}.\nJoin: ${GAME_ADDRESS}#w=${made.world}.${code}`);
if (args.includes('--once')) process.exit(0);
