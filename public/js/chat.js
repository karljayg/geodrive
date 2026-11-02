// The messages this player can see: the group's and their own DMs, kept as the server keeps them. The look of it is in chatView.js. Pure, tested in node.
import { GROUP_THREAD } from './protocol.js';

export { GROUP_THREAD };

export class ChatLog {
  // kept: messages a thread holds. seen: the id of the last message read when this browser last looked.
  constructor(me, kept, seen = 0) {
    Object.assign(this, { me, kept, seen });
    this.threads = new Map();
    this.changes = 0;
  }

  // Everything from the server, on signing in. Returns how many are new since this browser last looked, and from others.
  load(lines) {
    this.threads.clear();
    for (const line of lines) this.keep(line);
    this.changes++;
    return lines.filter((line) => line.id > this.seen && line.sender !== this.me).length;
  }

  keep(line) {
    const list = this.threads.get(line.thread) ?? [];
    if (list.some((known) => known.id === line.id)) return false;
    list.push(line);
    if (list.length > this.kept) list.shift();
    this.threads.set(line.thread, list);
    return true;
  }

  add(line) {
    if (!this.keep(line)) return false;
    this.changes++;
    return true;
  }

  // Everything up to here has been read.
  markSeen() {
    let top = this.seen;
    for (const list of this.threads.values()) for (const line of list) top = Math.max(top, line.id);
    this.seen = top;
    return top;
  }

  // The other person in a DM's thread, or null for the group.
  peerOf(thread) {
    if (thread === GROUP_THREAD) return null;
    const [a, b] = thread.split(':');
    return a === this.me ? b : a;
  }

  // The thread with one person, or the group.
  threadWith(id) {
    if (!id || id === GROUP_THREAD) return GROUP_THREAD;
    return this.me < id ? `${this.me}:${id}` : `${id}:${this.me}`;
  }

  messages(thread) {
    return this.threads.get(thread) ?? [];
  }
}

// What a preview or the Messages app calls a thread: "Chat with Dana, Mo, Priya", or someone's name.
export function threadTitle(thread, log, nameOf, everyoneElse) {
  if (thread !== GROUP_THREAD) return nameOf(log.peerOf(thread)) ?? 'Someone';
  return everyoneElse.length ? `Chat with ${everyoneElse.join(', ')}` : 'Group chat';
}

const SHOW_LEAST = 4000, SHOW_MOST = 10000, PER_CHARACTER = 50; // ms
export const showFor = (text) => Math.max(SHOW_LEAST, Math.min(SHOW_MOST, text.length * PER_CHARACTER));

export const MOST_CARDS = 3;

// The cards to show after this message comes: a burst from one chat folds into its card, and only the newest few stay. Cards are { thread, title, sender, text, count }.
export function withCard(cards, card) {
  const folded = cards.find((known) => known.thread === card.thread);
  const rest = cards.filter((known) => known !== folded);
  return [...rest, { ...card, count: (folded?.count ?? 0) + 1 }].slice(-MOST_CARDS);
}
