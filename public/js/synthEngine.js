// The original engine noise: the "Classic synth" option, the electric car, and the fallback if recordings can't load.
// Made from oscillators and filtered noise (Web Audio), so there are no sound files to license.
// It's an approximation: the pitch follows the revs, which drop at each gear change.
export class SynthEngine {
  constructor(ctx, bus) {
    const ctx_ = (this.ctx = ctx);
    this.master = ctx_.createGain();
    this.master.gain.value = 0;
    this.filter = ctx_.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 1.2;
    const shaper = ctx_.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 127.5) - 1) * 2.2);
    shaper.curve = curve;
    this.filter.connect(shaper).connect(this.master).connect(bus);

    const voice = (type) => {
      const osc = ctx_.createOscillator(), gain = ctx_.createGain();
      osc.type = type;
      gain.gain.value = 0;
      osc.connect(gain).connect(this.filter);
      osc.start();
      return { osc, gain };
    };
    this.fire = voice('sawtooth');
    this.harmonic = voice('sawtooth');
    this.rumble = voice('square');
    // The whine skips the filter's lowpass being set for an engine: it only sounds on electric profiles.
    this.whine = voice('sine');

    const noise = ctx_.createBuffer(1, ctx_.sampleRate * 2, ctx_.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx_.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    this.roarFilter = ctx_.createBiquadFilter();
    this.roarFilter.type = 'bandpass';
    this.roarFilter.Q.value = 0.8;
    this.roar = ctx_.createGain();
    this.roar.gain.value = 0;
    source.connect(this.roarFilter).connect(this.roar).connect(this.filter);
    source.start();
  }

  // state: { rpm, load, car (profile), volume (0..1), pitch, running }
  update({ rpm, load, car, volume, pitch, running }) {
    const now = this.ctx.currentTime, glide = 0.03;
    const set = (param, value) => param.setTargetAtTime(value, now, glide);
    const revs = rpm / car.redline;
    set(this.master.gain, running ? volume * (0.35 + 0.65 * load) * (0.55 + 0.45 * revs) : 0);
    const firing = car.cylinders ? (rpm / 60) * (car.cylinders / 2) * pitch : 0;
    set(this.fire.osc.frequency, Math.max(20, firing));
    set(this.harmonic.osc.frequency, Math.max(20, firing * 2.01));
    set(this.rumble.osc.frequency, Math.max(20, firing / 2));
    set(this.fire.gain.gain, car.cylinders ? 0.5 : 0);
    set(this.harmonic.gain.gain, car.cylinders ? 0.15 * car.brightness : 0);
    set(this.rumble.gain.gain, car.rumble * 0.6);
    set(this.whine.osc.frequency, Math.max(20, (rpm / 60) * 8 * pitch));
    set(this.whine.gain.gain, car.whine * 0.25 * Math.min(1, revs * 8));
    set(this.filter.frequency, (car.whine ? 6000 : 250 + car.brightness * (500 + revs * 2600 + load * 1400)));
    set(this.roarFilter.frequency, 400 + revs * 2400);
    set(this.roar.gain, car.roar * (0.2 + load) * (0.3 + revs));
  }
}
