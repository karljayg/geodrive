// All the car's sound: recorded engine loops, road and wind noise and effects, each on its own bus into a master
// with a limiter. Browsers only allow audio after a click or key press, so start() is called from those.
import { AUDIO_PRESETS, engineCutoff, engineIntensity, layerMix, roadLevel, windLevel } from './engineMix.js';
import { SynthEngine } from './synthEngine.js';
import { bakeOrder, GUN_CLIPS, lengthOf, play, SOUNDS, takesOf } from './sounds.js';

const UPDATE_EVERY = 0.03; // s; the audio engine smooths in between, so this needn't match the frame rate
const ATTACK = 0.03, RELEASE = 0.08, RATE_GLIDE = 0.05, BLEND_GLIDE = 0.08;
// Pixabay Content License. Chicken: Alex_Jauk, "Chicken Noise". Rabbit: u_3yocsblk00, "Rat Squeaking" (used for the rabbit).
const ANIMAL_FILES = { chicken: 'audio/animals/chicken.mp3', rabbit: 'audio/animals/rabbit.mp3' };
const ANIMAL_TRIM = 2; // the files peak near 0.4, so a close one sits with the other effects
const ANIMAL_QUIET = 3; // silent stretches after each call, so a 2 s clip plays once and is quiet for 6 s
const ENGINE_TRIM = 4;     // loops are normalised quiet, this brings them up to the mix
const KEEP_AWAKE = 0.0004; // about -68 dB of high hiss, which nobody hears: headphones, speakers and displays can doze in true silence and take a second or two to wake

export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.buffers = new Map(); // file -> Promise of a decoded buffer, or null if it failed
    this.settings = null;
    this.set = null;
    this.layers = {};
    this.lastUpdate = 0;
    this.status = 'not started';
    this.baked = new Map();   // sound name -> buffers ready to play
    this.onState = null;      // told when the browser starts or stops the audio
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume(); // Safari also has 'interrupted'
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = (this.ctx = new AudioCtx({ latencyHint: 'interactive' }));
    ctx.onstatechange = () => this.onState?.(ctx.state);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.connect(limiter).connect(ctx.destination);
    const bus = () => { const g = ctx.createGain(); g.connect(this.master); return g; };
    this.engineBus = bus();
    this.roadBus = bus();
    this.windBus = bus();
    this.fxBus = bus();
    this.musicBus = bus();

    // Recorded layers pass through a filter and an overall level.
    this.body = ctx.createBiquadFilter();
    this.body.type = 'lowpass';
    this.intensity = ctx.createGain();
    this.intensity.gain.value = 0;
    this.body.connect(this.intensity).connect(this.engineBus);
    this.synth = new SynthEngine(ctx, this.engineBus);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const hiss = (type, frequency, q, out) => {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = noise;
      source.loop = true;
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(out);
      source.start();
      return gain;
    };
    this.road = hiss('lowpass', 420, 0.5, this.roadBus);
    this.wind = hiss('bandpass', 750, 0.4, this.windBus);
    hiss('highpass', 9000, 0.5, this.master).gain.value = KEEP_AWAKE;
    this.bakeSounds();
    if (this.settings) this.applySettings(this.settings);
  }

  applySettings(s) {
    this.settings = s;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.masterVolume, now, 0.02);
    this.engineBus.gain.setTargetAtTime(s.engineVolume, now, 0.02);
    this.roadBus.gain.setTargetAtTime(s.roadVolume * 2, now, 0.02);
    this.windBus.gain.setTargetAtTime(s.windVolume * 2, now, 0.02);
    this.fxBus.gain.setTargetAtTime(s.signalVolume, now, 0.02);
    this.musicBus.gain.setTargetAtTime(s.musicVolume, now, 0.02);
  }

  fetchBuffer(file) {
    if (!this.buffers.has(file)) {
      this.buffers.set(file, fetch(file)
        .then((res) => { if (!res.ok) throw new Error(`answered ${res.status}`); return res.arrayBuffer(); })
        .then((data) => this.ctx.decodeAudioData(data))
        .catch((err) => { console.warn(`engine sound ${file}:`, err.message); return null; }));
    }
    return this.buffers.get(file);
  }

  // Swaps to a car's recordings, stopping the old ones. Without at least the low layers the synth takes over.
  async loadSet(sound) {
    this.set = sound;
    for (const layer of Object.values(this.layers)) {
      layer.source.stop();
      layer.source.disconnect();
      layer.gain.disconnect();
    }
    this.layers = {};
    this.status = 'loading';
    const names = Object.keys(sound.layers);
    const buffers = await Promise.all(names.map((n) => this.fetchBuffer(`audio/samples/${sound.set}/${n}.flac`)));
    if (this.set !== sound) return; // the car changed again while loading
    names.forEach((name, i) => {
      if (!buffers[i]) return;
      const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
      source.buffer = buffers[i];
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(this.body);
      source.start(0, Math.random() * buffers[i].duration); // so layers from one recording don't line up
      this.layers[name] = { source, gain };
    });
    this.status = this.layers.idle || this.layers.load ? 'recorded' : 'synth fallback';
  }

  // { rpm, load (0..1), speedMph, car (profile), running }
  // reach: how much of the engine is heard, 0..1, for standing away from the car. outside: no road or wind noise, which are heard from the cabin.
  update({ rpm, load, speedMph, car, running, reach = 1, outside = false }) {
    if (!this.ctx || !this.settings) return;
    const now = this.ctx.currentTime;
    if (now - this.lastUpdate < UPDATE_EVERY) return;
    this.lastUpdate = now;
    const s = this.settings, preset = AUDIO_PRESETS[s.audioPreset] || AUDIO_PRESETS.balanced;
    const wantRecorded = s.engineSound === 'recorded' && car.sound;
    if (wantRecorded && this.set !== car.sound) this.loadSet(car.sound);

    const recorded = wantRecorded && this.status === 'recorded';
    const level = running ? engineIntensity(rpm, load, car.idle, car.redline, preset) * reach : 0;
    this.synth.update({ rpm, load, car, volume: recorded ? 0 : level, pitch: s.enginePitch, running: running && !recorded && !(wantRecorded && this.status === 'loading') });
    const target = recorded ? level * ENGINE_TRIM : 0;
    this.intensity.gain.setTargetAtTime(target, now, target > this.intensity.gain.value ? ATTACK : RELEASE);
    if (recorded) {
      const { gains, rates } = layerMix(car.sound.layers, rpm, load, s.enginePitch);
      for (const [name, layer] of Object.entries(this.layers)) {
        layer.gain.gain.setTargetAtTime(gains[name] || 0, now, BLEND_GLIDE);
        layer.source.playbackRate.setTargetAtTime(rates[name], now, RATE_GLIDE);
      }
      this.body.frequency.setTargetAtTime(engineCutoff(load, preset), now, BLEND_GLIDE);
    }
    this.road.gain.setTargetAtTime(running && !outside ? roadLevel(speedMph) : 0, now, 0.15);
    this.wind.gain.setTargetAtTime(running && !outside ? windLevel(speedMph) : 0, now, 0.2);
  }

  // The horn: two reedy notes through the effects bus, on until hornOff.
  hornOn(notes) {
    if (!this.ctx || this.horn) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = notes[1] * 2.2;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.015);
    filter.connect(gain).connect(this.fxBus);
    const oscillators = notes.map((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.connect(filter);
      osc.start();
      return osc;
    });
    this.horn = { gain, oscillators, filter };
  }

  hornOff() {
    if (!this.horn) return;
    const { gain, oscillators, filter } = this.horn, now = this.ctx.currentTime;
    this.horn = null;
    gain.gain.setTargetAtTime(0, now, 0.015);
    for (const osc of oscillators) osc.stop(now + 0.1);
    setTimeout(() => { filter.disconnect(); gain.disconnect(); }, 200);
  }

  // Renders every sound to a buffer as soon as there's audio, each on its own, so none waits for one being played and using one is a single node.
  async bakeSounds() {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return;
    const rate = this.ctx.sampleRate;
    for (const name of bakeOrder()) {
      const takes = [];
      for (let i = 0; i < takesOf(name); i++) {
        const offline = new Offline(1, Math.ceil((lengthOf(name) + 0.02) * rate), rate);
        play(offline, offline.destination, name, Math.random, 0);
        takes.push(await offline.startRendering());
      }
      this.baked.set(name, takes);
    }
  }

  // Chicken and rabbit calls. levels are 0..1 from nearestFade: full beside one, gone at the same distance as an engine heard outside.
  animals(levels) {
    if (!this.ctx) return;
    this.ensureAnimals();
    const now = this.ctx.currentTime;
    if (now - (this.animalAt || 0) < UPDATE_EVERY) return;
    this.animalAt = now;
    for (const [name, voice] of Object.entries(this.animalVoices)) {
      const heard = Math.max(0, Math.min(1, levels[name] || 0));
      voice.gain.gain.setTargetAtTime(heard * ANIMAL_TRIM, now, 0.12);
      if (!voice.buffer || voice.playing || heard < 0.04 || now < voice.nextAt) continue;
      const source = this.ctx.createBufferSource();
      source.buffer = voice.buffer;
      source.connect(voice.gain);
      voice.playing = true;
      source.onended = () => {
        voice.playing = false;
        voice.nextAt = this.ctx.currentTime + voice.buffer.duration * ANIMAL_QUIET;
        source.disconnect();
      };
      source.start();
    }
  }

  ensureAnimals() {
    if (this.animalVoices) return;
    this.animalVoices = {};
    for (const [name, file] of Object.entries(ANIMAL_FILES)) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.fxBus);
      const voice = { gain, buffer: null, playing: false, nextAt: 0 };
      this.animalVoices[name] = voice;
      this.fetchBuffer(file).then((buffer) => { voice.buffer = buffer; });
    }
  }

  // A gun's own recording. An automatic one keeps the burst that is already playing. Before the file arrives, the plain gunshot stands in.
  playClip(name) {
    const spec = GUN_CLIPS[name];
    if (!spec || !this.ctx) return false;
    this.gunVoices ||= {};
    let voice = this.gunVoices[name];
    if (!voice) {
      voice = this.gunVoices[name] = { buffer: null, playing: false };
      this.fetchBuffer(spec.file).then((buffer) => { voice.buffer = buffer; });
    }
    if (!voice.buffer) return false;
    if (spec.hold && voice.playing) return true;
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    source.buffer = voice.buffer;
    gain.gain.value = spec.gain;
    source.connect(gain).connect(this.fxBus);
    voice.playing = true;
    source.onended = () => { voice.playing = false; source.disconnect(); gain.disconnect(); };
    source.start();
    return true;
  }

  // The sound of doing something (sounds.js), playing at once. Nearly always follows a key press or click, so audio is allowed to start.
  effect(name) {
    this.start();
    if (!this.ctx) return;
    if (GUN_CLIPS[name]) { if (this.playClip(name)) return; name = 'gunshot'; }
    const takes = this.baked.get(SOUNDS[name] ? name : 'ack');
    if (!takes) return play(this.ctx, this.fxBus, name);
    const source = this.ctx.createBufferSource();
    source.buffer = takes[Math.floor(Math.random() * takes.length)];
    source.playbackRate.value = 0.96 + Math.random() * 0.08;
    source.onended = () => source.disconnect();
    source.connect(this.fxBus);
    source.start();
  }

  // How far behind the audio output is, in seconds, for the performance log.
  timing() {
    if (!this.ctx) return null;
    const stamp = this.ctx.getOutputTimestamp?.();
    return { state: this.ctx.state, at: this.ctx.currentTime, base: this.ctx.baseLatency, output: this.ctx.outputLatency, behind: stamp ? this.ctx.currentTime - stamp.contextTime : undefined };
  }

  // One tick of the turn signal.
  tick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1500;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain).connect(this.fxBus);
    osc.start(now);
    osc.stop(now + 0.04);
  }
}
