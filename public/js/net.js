// The line to the world server. It keeps itself open, backing off between tries, and never reloads the page, since a page load is the one thing here that costs money.
// Only loaded in a shared world, so the sandbox has no network code at all.
const FIRST_RETRY = 1000, LAST_RETRY = 30000; // ms
const ANSWER_WITHIN = 10000; // ms

export function worldAddress(where = location) {
  if (where.hostname === 'localhost' || where.hostname === '127.0.0.1') return 'ws://127.0.0.1:5175'; // scripts/serve.mjs starts one
  return `wss://${where.host}${where.pathname.replace(/[^/]*$/, '')}ws`;
}

// onMessage(message): anything the server says that isn't an answer. onBytes(bytes): someone's place. onState('open' | 'lost' | 'ended', why).
export class WorldLink {
  constructor({ address = worldAddress(), onMessage, onBytes, onState, Socket = WebSocket }) {
    Object.assign(this, { address, onMessage, onBytes, onState, Socket });
    this.socket = null;
    this.again = FIRST_RETRY;
    this.hello = null;     // what to say on connecting, once signed in
    this.ended = false;
    this.nextId = 1;
    this.waiting = new Map();
    this.retry = null;
  }

  get connected() {
    return this.socket?.readyState === this.Socket.OPEN;
  }

  // Opens the line and says this, resolving with the first answer: { t: 'welcome' }, or { t: 'refused', why }. Rejects if the server can't be reached.
  // A refused invite leaves the line open, so another name can be tried with say().
  open(first) {
    return new Promise((resolve, reject) => {
      this.answerFirst = { resolve, reject };
      this.connect(first);
    });
  }

  say(first) {
    return new Promise((resolve, reject) => {
      this.answerFirst = { resolve, reject };
      this.send(first);
    });
  }

  connect(first) {
    const socket = new this.Socket(this.address);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.onopen = () => {
      this.again = FIRST_RETRY;
      socket.send(JSON.stringify(first));
    };
    socket.onmessage = ({ data }) => (typeof data === 'string' ? this.heard(JSON.parse(data)) : this.onBytes?.(new Uint8Array(data)));
    socket.onclose = () => this.lost(socket);
    socket.onerror = () => {}; // onclose follows
  }

  heard(message) {
    if (message.t === 'ok' || message.t === 'no') {
      const waiting = this.waiting.get(message.id);
      if (!waiting) return;
      this.waiting.delete(message.id);
      clearTimeout(waiting.timer);
      return waiting.resolve(message);
    }
    if (message.t === 'welcome' || message.t === 'refused') {
      const first = this.answerFirst;
      this.answerFirst = null;
      first?.resolve(message);
      if (message.t === 'refused' && !first) this.finish(message.why); // coming back, and no longer let in
      if (first) return;
    }
    if (message.t === 'replaced') this.finish('replaced');
    this.onMessage?.(message);
  }

  lost(socket) {
    if (socket !== this.socket) return;
    this.socket = null;
    for (const [id, waiting] of this.waiting) {
      clearTimeout(waiting.timer);
      waiting.resolve({ t: 'no', id, why: 'offline' });
    }
    this.waiting.clear();
    if (this.answerFirst) {
      this.answerFirst.reject(new Error('The world server could not be reached.'));
      this.answerFirst = null;
      return;
    }
    if (this.ended || !this.hello) return;
    this.onState?.('lost');
    this.retry = setTimeout(() => {
      this.retry = null;
      if (!this.ended) this.connect(this.hello());
    }, this.again);
    this.again = Math.min(LAST_RETRY, this.again * 2);
  }

  // Signed in: from here it comes back by itself, saying this.
  stayOpen(hello) {
    this.hello = hello;
  }

  // For good: told it's been replaced, or that this person can't come in any more.
  finish(why) {
    this.ended = true;
    this.onState?.('ended', why);
  }

  close() {
    this.ended = true;
    clearTimeout(this.retry);
    this.socket?.close();
  }

  send(message) {
    if (!this.connected) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  sendBytes(bytes) {
    if (this.connected) this.socket.send(bytes);
  }

  // An answer always comes: { t: 'ok', ... }, or { t: 'no', why }, with why 'offline' if the server can't be reached.
  ask(message) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      if (!this.send({ ...message, id })) return resolve({ t: 'no', id, why: 'offline' });
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        resolve({ t: 'no', id, why: 'offline' });
      }, ANSWER_WITHIN);
      this.waiting.set(id, { resolve, timer });
    });
  }
}
