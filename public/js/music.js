// What the soundtrack should be doing, as plain decisions: which mood, whether the radio gives way, when to fade and which song is next.
// musicPlayer.js does the playing. Pure, tested in node.

export const KEEP = 'keep'; // carry on with what's playing, for a moment when the radio is about to take over

// A mood that has songs: itself, or where its fallbacks lead. Null if none has any.
export function playable(name, config) {
  const seen = new Set();
  while (name && !seen.has(name)) {
    seen.add(name);
    const mood = config.moods[name];
    if (!mood) return null;
    if (mood.songs.length) return name;
    name = mood.fallback;
  }
  return null;
}

export function clockMood(hour, config) {
  const h = ((hour % 24) + 24) % 24;
  let found = config.clock[config.clock.length - 1];
  for (const part of config.clock) if (h >= part.from) found = part;
  return found.mood;
}

// The highest-priority scene that has songs, of the names given.
export function topScene(names, config) {
  let top = null;
  for (const name of names) {
    const mood = playable(name, config);
    if (mood && (!top || (config.moods[name].priority || 0) > (config.moods[top].priority || 0))) top = name;
  }
  return top;
}

// What should sound now. radio is 'playing', 'starting' (on, and has a moment to get going) or 'off'.
// Returns the mood (or KEEP, or null for silence), and whether the radio gives way. test is the Settings menu's choice, which is always heard.
export function chooseMusic({ scenes = [], radio = 'off', test = null, blocked = false }, config) {
  if (blocked) return { mood: null, holdRadio: true };
  if (test) return { mood: playable(test, config), holdRadio: true };
  const scene = topScene(scenes, config);
  if (scene && config.moods[scene].overridesRadio) return { mood: playable(scene, config), holdRadio: true };
  if (radio === 'playing') return { mood: null, holdRadio: false };
  if (radio === 'starting') return { mood: KEEP, holdRadio: false };
  // No scene: walk the playlist. The clock no longer holds one mood for hours. A dark room is a scene, so it still cuts in.
  return { mood: playable(scene || 'along', config), holdRadio: false };
}

// The next step, given what's playing. current: { mood, left (seconds of song left, Infinity if not known yet) } or null. Returns:
//   { act: 'none' }, { act: 'start', mood, fade } (a new song), or { act: 'stop', fade }.
export function nextStep({ current, want }, config) {
  if (want === KEEP) want = current?.mood ?? null;
  if (!want) return current ? { act: 'stop', fade: config.stopFade } : { act: 'none' };
  const fade = config.moods[want].fade;
  if (!current) return { act: 'start', mood: want, fade };
  if (current.mood !== want) return { act: 'start', mood: want, fade }; // a new mood never waits for the song
  return current.left <= fade + config.songTail ? { act: 'start', mood: want, fade } : { act: 'none' };
}

// Each mood's turn through its songs, kept for the visit so coming back to a mood moves on to its next song.
export class Rotation {
  constructor(config) {
    this.config = config;
    this.turn = new Map();
    this.interrupted = null;
  }

  // What to play on moving to a mood. leaving: { mood, song, at } being played now, or null. A scene remembers what it interrupted,
  // and coming back to that mood carries on with that song where it stopped. Returns { song, at } (song is null if nothing will play).
  pick(mood, leaving, skip = new Set()) {
    const isScene = (name) => !!this.config.moods[name]?.overridesRadio;
    if (isScene(mood)) {
      if (leaving && !isScene(leaving.mood)) this.interrupted = leaving;
      return { song: this.next(mood, skip), at: 0 };
    }
    const back = this.interrupted;
    this.interrupted = null;
    if (back?.mood === mood && !skip.has(back.song.file)) return { song: back.song, at: back.at };
    return { song: this.next(mood, skip), at: 0 };
  }

  // skip: song files known not to play. Null if every one is.
  next(mood, skip = new Set()) {
    const songs = this.config.moods[mood].songs;
    for (let tried = 0; tried < songs.length; tried++) {
      const at = this.turn.get(mood) || 0;
      this.turn.set(mood, (at + 1) % songs.length);
      if (!skip.has(songs[at].file)) return songs[at];
    }
    return null;
  }
}

// Scenes asked for, each staying on for at least the minimum after it's ended. now is in seconds.
export class Scenes {
  constructor(config) {
    this.config = config;
    this.on = new Set();
    this.until = new Map();
  }

  start(name, now) {
    if (!this.config.moods[name]) return false;
    this.on.add(name);
    this.until.set(name, now + this.config.sceneMinimum);
    return true;
  }

  end(name) {
    this.on.delete(name);
  }

  active(now) {
    const names = new Set(this.on);
    for (const [name, until] of this.until) {
      if (until > now) names.add(name);
      else this.until.delete(name);
    }
    return [...names];
  }
}
