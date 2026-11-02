// Plays the soundtrack through the engine's audio mix, streaming each song rather than holding it in memory (a decoded song is about 60 MB).
// Three players, as a crossfade can begin while another is still fading. Fades run on the audio clock, so a hidden tab doesn't stutter them.
import { KEEP, nextStep, Rotation } from './music.js';

const PLAYERS = 3;
const FORGIVE = 60000; // ms before trying songs that failed again, as it may have been the connection
const LEFT_UNKNOWN = Infinity;

// A moment of silence as a WAV address, to play during the first click.
function silence() {
  const samples = 800, bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const tag = (at, text) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); tag(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, samples * 2, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

export class Soundtrack {
  // onSong({ mood, file }) tells the game what started, or null when music stops.
  constructor(config, onSong = () => {}) {
    this.config = config;
    this.onSong = onSong;
    this.rotation = new Rotation(config);
    this.broken = new Set();
    this.players = [];
    this.current = null;
    this.want = null;
  }

  // Needs the running audio context and a key press or click, so it's called from one: a phone browser only lets an element play later if it played during one.
  start(ctx, bus) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.bus = bus;
    const quiet = silence();
    for (let i = 0; i < PLAYERS; i++) {
      const audio = new Audio();
      audio.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(gain).connect(bus);
      const player = { audio, gain, song: null, mood: null, stopTimer: 0 };
      audio.addEventListener('ended', () => this.songOver(player));
      audio.addEventListener('error', () => this.songFailed(player));
      audio.src = quiet;
      audio.play().catch(() => {});
      this.players.push(player);
    }
  }

  // Called a couple of times a second, and whenever something changes. want is a mood, KEEP or null.
  update(want) {
    if (!this.ctx) return;
    this.want = want;
    const current = this.current && { mood: this.current.mood, left: this.songLeft(this.current) };
    const step = nextStep({ current, want }, this.config);
    if (step.act === 'stop') this.stop(step.fade);
    if (step.act === 'start') this.begin(step.mood, step.fade);
  }

  songLeft(player) {
    const { duration, currentTime } = player.audio;
    return Number.isFinite(duration) ? duration - currentTime : LEFT_UNKNOWN;
  }

  begin(mood, fade) {
    const song = this.rotation.next(mood, this.broken);
    if (!song) { // nothing in this mood will play
      this.stop(this.config.stopFade);
      return;
    }
    const player = this.freePlayer();
    clearTimeout(player.stopTimer);
    player.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    player.gain.gain.value = 0;
    player.song = song;
    player.mood = mood;
    player.audio.src = this.config.folder + song.file;
    player.audio.play().catch((err) => { if (err.name !== 'AbortError') console.warn('music:', song.file, err.message); });
    this.current = player;
    this.ramp(player, song.volume * this.config.moods[mood].volume, fade);
    this.fadeOthers(fade);
    this.onSong({ mood, file: song.file });
  }

  stop(fade) {
    if (!this.current) return;
    this.current = null;
    this.fadeOthers(fade);
    this.onSong(null);
  }

  // Everything but the current song, including any still fading more slowly from an earlier change: a chase shouldn't wait on a gentle fade.
  fadeOthers(seconds) {
    for (const player of this.players) if (player !== this.current && player.song) this.fadeOut(player, seconds);
  }

  // Quietest first, cutting a fade short only if all three are in use.
  freePlayer() {
    const free = this.players.find((p) => p !== this.current && !p.song);
    if (free) return free;
    const others = this.players.filter((p) => p !== this.current).sort((a, b) => a.gain.gain.value - b.gain.gain.value);
    return others[0];
  }

  ramp(player, level, seconds) {
    const param = player.gain.gain, now = this.ctx.currentTime;
    const from = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    param.linearRampToValueAtTime(level, now + Math.max(0.05, seconds));
  }

  fadeOut(player, seconds) {
    this.ramp(player, 0, seconds);
    clearTimeout(player.stopTimer);
    player.stopTimer = setTimeout(() => this.release(player), (seconds + 0.2) * 1000);
  }

  release(player) {
    player.audio.pause();
    player.audio.removeAttribute('src');
    player.audio.load();
    player.song = null;
    player.mood = null;
    player.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    player.gain.gain.value = 0;
  }

  // A slowed tab can miss the moment to crossfade, so the end of a song also moves on.
  songOver(player) {
    if (player !== this.current) return this.release(player);
    const mood = this.want === KEEP ? player.mood : this.want;
    this.current = null;
    this.release(player);
    if (mood) this.begin(mood, 0.5);
    else this.onSong(null);
  }

  songFailed(player) {
    if (!player.song) return; // the silent start, or a player just emptied
    console.warn('music: could not play', player.song.file);
    this.broken.add(player.song.file);
    clearTimeout(this.forgive);
    this.forgive = setTimeout(() => this.broken.clear(), FORGIVE);
    const mood = player.mood;
    const wasCurrent = player === this.current;
    this.release(player);
    if (!wasCurrent) return;
    this.current = null;
    this.begin(mood, 0.5);
  }

  // For the Settings readout.
  nowPlaying() {
    return this.current ? { mood: this.current.mood, file: this.current.song.file } : null;
  }
}
