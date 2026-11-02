// The world server: holds open a connection for each player and hands what they send to their world's Room. Run by main.mjs, and by the tests.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { GAME } from '../public/js/gameConfig.js';
import { PROTOCOL, cleanLook, nameProblem } from '../public/js/protocol.js';
import { Room, newToken } from './room.mjs';
import { WorldStore } from './store.mjs';

const WORLD_ID = /^[A-Za-z0-9_-]{8,32}$/; // a file name comes from this, so nothing else may reach one
const NAME_MOST = 40;                     // characters in a world's name
const MOST_BYTES = 2000000;               // in one message: a whole pocket at its very largest
const BEAT = 30000;                       // ms between checking a connection is still there
const SIGN_IN_WITHIN = 120000;            // ms a connection may sit open without signing in

export function startServer({ dir, port = 0, host = '127.0.0.1', origins = [], now = Date.now, config = GAME.world, signInWithin = SIGN_IN_WITHIN }) {
  mkdirSync(dir, { recursive: true });
  const rooms = new Map(), madeToday = new Map();
  const fileOf = (id) => join(dir, `${id}.sqlite`);
  const bytesHeld = () => readdirSync(dir).reduce((sum, name) => sum + statSync(join(dir, name)).size, 0);

  // The world's room if it exists. A world with nobody in it isn't kept open.
  function roomFor(id) {
    if (typeof id !== 'string' || !WORLD_ID.test(id)) return null;
    if (rooms.has(id)) return rooms.get(id);
    if (!existsSync(fileOf(id))) return null;
    const room = new Room(new WorldStore(fileOf(id)), { now, config });
    rooms.set(id, room);
    return room;
  }

  function closeIfEmpty(id, room) {
    if (!room.empty) return;
    room.store.close();
    rooms.delete(id);
  }

  // Why this address can't make another world, or null. Anyone can press the button, so there are limits.
  function whyNoNewWorld(address) {
    const today = Math.floor(now() / 86400000), made = madeToday.get(address);
    if (made?.day === today && made.count >= config.newWorldsPerDay) return 'too-many-worlds';
    return bytesHeld() >= config.allWorldsBytes ? 'server-full' : null;
  }

  const http = createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'text/plain' });
    res.end(req.url === '/health' ? 'ok' : 'Not found');
  });
  const sockets = new WebSocketServer({ server: http, maxPayload: MOST_BYTES, verifyClient: ({ origin }) => !origins.length || origins.includes(origin) });

  sockets.on('connection', (socket, req) => {
    const address = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',').pop().trim(); // Apache adds the real one last, and anything before it is what the player claimed
    const connection = {
      send: (message) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)); },
      sendBytes: (bytes) => { if (socket.readyState === socket.OPEN) socket.send(bytes); },
      close: () => socket.close(),
    };
    let room = null, roomId = null;
    const signingIn = setTimeout(() => { if (!room) socket.close(); }, signInWithin);
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });

    const enter = (id, found) => { room = found; roomId = id; };
    const refuse = (why) => { connection.send({ t: 'refused', why }); socket.close(); };

    function first(message) {
      if (message.protocol !== PROTOCOL) return refuse('old-client');
      if (message.t === 'create') {
        const why = whyNoNewWorld(address), name = typeof message.name === 'string' ? message.name.trim().slice(0, NAME_MOST) : '';
        if (why) return refuse(why);
        if (!name) return refuse('no-world-name');
        const problem = nameProblem(message.player?.name) ?? (cleanLook(message.player?.figure, message.player?.colours) ? null : 'bad-look');
        if (problem) return refuse(problem);
        const id = newToken(12), store = new WorldStore(fileOf(id));
        const { memberId, secret } = Room.create(store, { id, name, player: message.player, now: now(), config });
        store.close();
        const today = Math.floor(now() / 86400000), made = madeToday.get(address);
        madeToday.set(address, { day: today, count: made?.day === today ? made.count + 1 : 1 });
        const found = roomFor(id);
        enter(id, found);
        connection.send({ t: 'made', world: id, id: memberId, secret }); // first, so the id and secret are known by the time they're signed in
        found.hello(connection, { player: memberId, secret });
        return undefined;
      }
      const found = roomFor(message.world);
      if (!found) return refuse('no-world');
      if (message.t === 'hello') {
        const why = found.hello(connection, message);
        if (why) {
          closeIfEmpty(message.world, found);
          return refuse(why);
        }
        return enter(message.world, found);
      }
      if (message.t === 'join') {
        const result = found.join(connection, message);
        if (result.why) {
          connection.send({ t: 'refused', why: result.why }); // the line stays open, so another name can be tried
          return closeIfEmpty(message.world, found);
        }
        return enter(message.world, found);
      }
      return refuse('not-signed-in');
    }

    socket.on('message', (data, isBinary) => {
      try {
        if (isBinary) {
          if (room) room.presence(connection, new Uint8Array(data));
          return;
        }
        const message = JSON.parse(data);
        if (!message || typeof message !== 'object') return;
        if (room) room.message(connection, message);
        else first(message);
      } catch (err) {
        console.warn('message:', err.message); // one bad message mustn't stop anyone else
      }
    });
    socket.on('close', () => {
      clearTimeout(signingIn);
      if (!room) return;
      try {
        room.leave(connection);
        closeIfEmpty(roomId, room);
      } catch (err) {
        console.warn('leaving:', err.message);
      }
    });
    socket.on('error', (err) => console.warn('connection:', err.message));
  });

  // A connection can die without saying so.
  const beat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!socket.alive) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, BEAT);

  return new Promise((resolve) => {
    http.listen(port, host, () => resolve({
      port: http.address().port,
      rooms,
      close: () => new Promise((done) => {
        clearInterval(beat);
        for (const socket of sockets.clients) socket.terminate();
        sockets.close(() => http.close(() => {
          for (const room of rooms.values()) room.store.close();
          rooms.clear();
          done();
        }));
      }),
    }));
  });
}
