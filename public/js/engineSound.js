// All the car's sound: recorded engine loops, road and wind noise and effects, each on its own bus into a master
// with a limiter. Browsers only allow audio after a click or key press, so start() is called from those.
import { AUDIO_PRESETS, engineCutoff, engineIntensity, layerMix, roadLevel, windLevel } from './engineMix.js';
import { SynthEngine } from './synthEngine.js';

const UPDATE_EVERY = 0.03; // s; the audio engine smooths in between, so this needn't match the frame rate
const ATTACK = 0.03, RELEASE = 0.08, RATE_GLIDE = 0.05, BLEND_GLIDE = 0.08;
const ENGINE_TRIM = 2.2;   // loops are normalised quiet, this brings them up to the mix

export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.buffers = new Map(); // file -> Promise of a decoded buffer, or null if it failed
    this.settings = null;
    this.set = null;
    this.layers = {};
    this.lastUpdate = 0;
    this.status = 'not started';
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = (this.ctx = new AudioCtx());
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
    if (this.settings) this.applySettings(this.settings);
  }

  applySettings(s) {
    this.settings = s;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.masterVolume, now, 0.02);
    this.engineBus.gain.setTargetAtTime(s.engineVolume, now, 0.02);
    this.roadBus.gain.setTargetAtTime(s.roadVolume, now, 0.02);
    this.windBus.gain.setTargetAtTime(s.windVolume, now, 0.02);
    this.fxBus.gain.setTargetAtTime(s.signalVolume, now, 0.02);
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
  update({ rpm, load, speedMph, car, running }) {
    if (!this.ctx || !this.settings) return;
    const now = this.ctx.currentTime;
    if (now - this.lastUpdate < UPDATE_EVERY) return;
    this.lastUpdate = now;
    const s = this.settings, preset = AUDIO_PRESETS[s.audioPreset] || AUDIO_PRESETS.balanced;
    const wantRecorded = s.engineSound === 'recorded' && car.sound;
    if (wantRecorded && this.set !== car.sound) this.loadSet(car.sound);

    const recorded = wantRecorded && this.status === 'recorded';
    const level = running ? engineIntensity(rpm, load, car.idle, car.redline, preset) : 0;
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
    this.road.gain.setTargetAtTime(running ? roadLevel(speedMph) : 0, now, 0.15);
    this.wind.gain.setTargetAtTime(running ? windLevel(speedMph) : 0, now, 0.2);
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
