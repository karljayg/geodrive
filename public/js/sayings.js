// Picks what to say from sayingsConfig.js. Each key goes through all its lines in a shuffled order before any comes round again, and never the same line twice running. Pure, tested in node.
import { SAYINGS } from './sayingsConfig.js';

const decks = new Map();

function next(key, lines, random) {
  let deck = decks.get(key);
  if (!deck || !deck.left.length) {
    const left = [...lines];
    for (let i = left.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [left[i], left[j]] = [left[j], left[i]];
    }
    if (left.length > 1 && deck && left[left.length - 1] === deck.last) left.unshift(left.pop());
    deck = { left, last: deck?.last };
    decks.set(key, deck);
  }
  deck.last = deck.left.pop();
  return deck.last;
}

// The next line for a key, with its {blanks} filled. Anything that isn't a key is said as it is, so a config entry can be plain text.
export function say(key, blanks = {}, sayings = SAYINGS, random = Math.random) {
  const lines = sayings[key];
  if (!lines?.length) return key;
  return next(key, lines, random).replace(/\{(\w+)\}/g, (whole, name) => blanks[name] ?? whole);
}
