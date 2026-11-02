// The sounds of using things, made from code so there are no files to load and no asset licence. Which sound goes with what is here too. Pure apart from play, tested.
// A sound is a list of layers, each a tone or filtered noise, from a frequency to a frequency, in seconds from the start. hold: stays level and fades, rather than dying away from the first moment. attack: seconds to swell up, if not at once.
const tone = (from, to, at, dur, level, wave = 'sine') => ({ wave, from, to, at, dur, level });
const noise = (from, to, at, dur, level, q = 1, hold = false, filter = 'bandpass') => ({ noise: filter, from, to, at, dur, level, q, hold });
const each = (times, make) => times.flatMap(make);
const cushion = (from, to, at, dur, level, attack) => ({ ...noise(from, to, at, dur, level, 0.5, false, 'lowpass'), attack });

const PICKUP = [tone(300, 460, 0, 0.09, 0.3, 'triangle'), noise(900, 700, 0, 0.07, 0.12)];
const OPEN = [noise(350, 220, 0, 0.09, 0.45, 1.2), tone(120, 85, 0, 0.1, 0.35), noise(1500, 1100, 0.04, 0.14, 0.05, 3)];
const CLICK = [noise(3500, 3000, 0, 0.012, 0.5, 2), tone(1800, 1500, 0, 0.012, 0.12, 'square')];

export const SOUNDS = {
  // Used for anything without a sound of its own: two short, quiet, rising notes.
  ack: [tone(660, 660, 0, 0.06, 0.16), tone(880, 880, 0.06, 0.09, 0.16)],
  explosion: [noise(900, 60, 0, 1.3, 0.8), tone(90, 30, 0, 1.1, 0.7), noise(5000, 800, 0, 0.25, 0.4)],
  rumble: [noise(220, 110, 0, 0.5, 0.2), noise(70, 50, 0.05, 0.4, 0.22)],
  message: [tone(1046, 1046, 0, 0.09, 0.14), tone(1397, 1397, 0.09, 0.16, 0.14)],

  click: CLICK,
  doubleClick: [...CLICK, ...CLICK.map((layer) => ({ ...layer, at: layer.at + 0.16 }))],
  locked: [tone(150, 120, 0, 0.09, 0.4), noise(600, 400, 0, 0.05, 0.2), tone(150, 120, 0.12, 0.09, 0.3)],
  plugIn: [noise(2500, 1800, 0, 0.02, 0.45, 1.5), tone(240, 200, 0, 0.05, 0.3)],

  pickup: PICKUP,
  drop: [tone(110, 65, 0, 0.13, 0.35), noise(500, 200, 0, 0.09, 0.2)],
  rustle: each([0, 0.08, 0.17], (at) => [noise(3200, 2400, at, 0.08, 0.4, 0.8)]),
  open: OPEN,
  search: each([0, 0.11, 0.2, 0.34], (at, i) => [noise(1800 + i * 300, 1300, at, 0.09, 0.34, 0.8)]),
  found: [...OPEN, ...PICKUP.map((layer) => ({ ...layer, at: layer.at + 0.2 }))],
  // Sinking into something: no thump and no edge, just air leaving a cushion, swelling slowly and dying away.
  sit: [cushion(520, 200, 0, 0.42, 0.16, 0.09)],
  bed: [cushion(460, 170, 0, 0.75, 0.15, 0.16), cushion(900, 500, 0.3, 0.4, 0.035, 0.1)],

  drink: each([0, 0.3, 0.6], (at) => [tone(170, 340, at, 0.15, 0.32), noise(600, 1000, at, 0.13, 0.08)]),
  eat: each([0, 0.19, 0.39, 0.56], (at, i) => [noise(2400 - i * 200, 1100, at, 0.09, 0.3, 0.7), tone(130, 90, at, 0.05, 0.15)]),
  crunch: each([0, 0.25, 0.46], (at) => [noise(4200, 2000, at, 0.1, 0.34, 0.6), tone(160, 100, at, 0.04, 0.16)]),
  pills: each([0, 0.05, 0.11, 0.15, 0.23], (at, i) => [tone(3200 + i * 350, 3000 + i * 350, at, 0.022, 0.2, 'triangle')]),
  bandage: [noise(1200, 4200, 0, 0.3, 0.2, 1.2, true)],
  batteries: [noise(2800, 2200, 0, 0.02, 0.4, 2), noise(2500, 2000, 0.14, 0.02, 0.4, 2), tone(420, 340, 0.3, 0.05, 0.28, 'square')],

  water: [noise(1600, 2100, 0, 0.9, 0.2, 0.6, true), noise(420, 520, 0, 0.9, 0.1, 0.8, true)],
  flush: [noise(2200, 500, 0, 1.3, 0.3, 0.6, true), tone(140, 75, 0.12, 1.1, 0.14)],
  dryTap: [noise(1000, 800, 0, 0.09, 0.35), tone(1700, 2100, 0.02, 0.14, 0.12, 'triangle')],

  beep: [tone(1320, 1320, 0, 0.09, 0.12, 'square')],
  beeps: each([0, 0.2, 0.4], (at) => [tone(1400, 1400, at, 0.1, 0.11, 'square')]),
  hum: [tone(100, 100, 0, 0.8, 0.15, 'sawtooth'), tone(200, 200, 0, 0.8, 0.07)],
  rumble: [noise(120, 170, 0, 1, 0.5, 0.7, true, 'lowpass'), tone(52, 60, 0, 1, 0.2)],
  whirr: [tone(190, 520, 0, 0.45, 0.14, 'sawtooth'), noise(1300, 1900, 0, 0.45, 0.14, 1.2, true)],
  printer: each([0, 0.12, 0.24, 0.36, 0.48], (at) => [tone(620, 620, at, 0.09, 0.12, 'square'), noise(2600, 2600, at, 0.07, 0.14)]),
  thud: [tone(100, 48, 0, 0.2, 0.42), noise(380, 130, 0, 0.09, 0.2)],
  wallHit: [tone(85, 42, 0, 0.2, 0.5), noise(1500, 420, 0, 0.12, 0.3)],
  wallBreak: [tone(70, 36, 0, 0.3, 0.5), noise(1200, 260, 0, 0.45, 0.32), noise(2400, 700, 0.18, 0.2, 0.14), noise(1800, 500, 0.36, 0.22, 0.1)],
  clank: [tone(1250, 1190, 0, 0.26, 0.09, 'triangle'), tone(2830, 2780, 0, 0.16, 0.05, 'triangle'), noise(800, 500, 0, 0.05, 0.3)],
  clack: [tone(2600, 2300, 0, 0.022, 0.32, 'triangle'), noise(3000, 2400, 0, 0.018, 0.25)],
  paper: each([0, 0.07, 0.15, 0.22], (at, i) => [noise(4600 - i * 300, 3400, at, 0.06, 0.32, 1)]),
  typing: each([0, 0.1, 0.17, 0.29, 0.38], (at) => [noise(2600, 2000, at, 0.018, 0.6, 1.5)]),
  scribble: each([0, 0.16, 0.34], (at) => [noise(4500, 5800, at, 0.14, 0.27, 3, true)]),
  ignite: [noise(4000, 3000, 0, 0.012, 0.7, 2), noise(4000, 3000, 0.09, 0.012, 0.7, 2)],
  burners: [noise(4000, 3000, 0, 0.012, 0.3, 2), noise(800, 1200, 0.03, 0.8, 0.28, 0.5, true)],
  pour: [tone(150, 150, 0, 0.3, 0.12, 'sawtooth'), noise(1500, 2400, 0.2, 0.7, 0.13, 0.8, true)],
  vend: [tone(170, 170, 0, 0.3, 0.1, 'sawtooth'), tone(95, 50, 0.36, 0.17, 0.36), noise(500, 200, 0.36, 0.08, 0.18)],
  cash: [tone(1320, 1320, 0, 0.08, 0.1, 'square'), noise(3200, 3200, 0.14, 0.45, 0.1, 1.2, true), tone(280, 280, 0.14, 0.45, 0.06, 'square')],
  toast: [tone(170, 90, 0, 0.05, 0.4), noise(1800, 1100, 0, 0.05, 0.3), tone(480, 900, 0.03, 0.08, 0.12, 'triangle')],
  static: [noise(3000, 3000, 0, 0.45, 0.17, 0.3, true)],
  music: each([0, 0.12, 0.24, 0.36], (at, i) => [tone([523, 659, 784, 659][i], [523, 659, 784, 659][i], at, 0.13, 0.13, 'triangle')]),
  jog: each([0, 0.27, 0.54, 0.81], (at) => [tone(95, 60, at, 0.1, 0.4), noise(300, 180, at, 0.06, 0.15)]),

  // Moving about. Outdoors is grittier, indoors a duller knock, and running hits harder.
  stepOut: [tone(115, 70, 0, 0.06, 0.13), noise(1500, 800, 0, 0.05, 0.1, 0.6)],
  stepIn: [tone(135, 85, 0, 0.05, 0.16), noise(650, 380, 0, 0.035, 0.08, 0.8)],
  runOut: [tone(105, 58, 0, 0.07, 0.2), noise(1800, 800, 0, 0.06, 0.15, 0.6)],
  runIn: [tone(125, 72, 0, 0.06, 0.24), noise(750, 400, 0, 0.04, 0.12, 0.8)],
  jump: [noise(700, 1500, 0, 0.1, 0.09, 0.7)],
  land: [tone(100, 50, 0, 0.13, 0.36), noise(900, 300, 0, 0.08, 0.2, 0.6)],
  stairs: each([0, 0.15, 0.3, 0.45], (at) => [tone(150, 92, at, 0.06, 0.2), noise(800, 450, at, 0.04, 0.09, 0.8)]),
  door: [noise(320, 240, 0, 0.09, 0.15, 1), tone(1500, 1300, 0.02, 0.02, 0.05, 'triangle'), tone(95, 55, 0.3, 0.12, 0.32), noise(420, 200, 0.3, 0.07, 0.2)],
  rattle: each([0, 0.1, 0.2], (at) => [tone(170, 130, at, 0.05, 0.3, 'triangle'), noise(1400, 900, at, 0.04, 0.16)]),
  liftDing: [tone(1047, 1047, 0, 0.5, 0.11), tone(2094, 2094, 0, 0.3, 0.03)],

  // The car.
  carDoor: [noise(1800, 1200, 0, 0.04, 0.12), tone(105, 48, 0.09, 0.2, 0.45), noise(380, 150, 0.09, 0.1, 0.24)],
  chimeUp: [tone(660, 660, 0, 0.1, 0.12), tone(990, 990, 0.09, 0.16, 0.12)],
  chimeDown: [tone(990, 990, 0, 0.1, 0.12), tone(660, 660, 0.09, 0.16, 0.12)],
  arrived: each([0, 0.14, 0.28], (at, i) => [tone([659, 784, 1047][i], [659, 784, 1047][i], at, 0.28, 0.12)]),

  // The phone, the bag and what they tell you.
  tap: [tone(1000, 800, 0, 0.018, 0.13, 'triangle')],
  zip: [noise(2500, 5200, 0, 0.2, 0.2, 2, true)],
  nudge: [tone(392, 392, 0, 0.12, 0.13), tone(330, 330, 0.13, 0.17, 0.13)],
  charged: each([0, 0.1, 0.2], (at, i) => [tone([784, 988, 1175][i], [784, 988, 1175][i], at, 0.14, 0.1)]),
  powerDown: [tone(700, 240, 0, 0.32, 0.13, 'triangle')],
  accident: [noise(280, 180, 0, 0.45, 0.2, 0.7, true), tone(110, 80, 0, 0.3, 0.12)],
  collapse: [tone(110, 40, 0, 0.3, 0.55), noise(500, 120, 0, 0.16, 0.3)],
};

// Worth several takes, as they repeat and any one of them heard over and over sounds like a machine. Baked first, as they're the ones used all the time.
const TAKES = { stepOut: 4, stepIn: 4, runOut: 4, runIn: 4, click: 2, doubleClick: 2, tap: 2 };
export const takesOf = (name) => TAKES[name] || 1;
export const bakeOrder = () => [...Object.keys(TAKES), ...Object.keys(SOUNDS).filter((name) => !TAKES[name])];

// A foot came down between two points of the walking cycle: one leg a quarter of the way through it, the other three quarters, when each is furthest forward (poseAt in footPerson.js).
export const footfall = (before, after) => Math.floor(before * 2 + 0.5) !== Math.floor(after * 2 + 0.5);
export const stepSound = (running, indoors) => `${running ? 'run' : 'step'}${indoors ? 'In' : 'Out'}`;

// Things in the bag: those that don't go by their kind.
const BAG_ITEMS = { Apple: 'crunch', 'Candy bar': 'crunch', 'Dog biscuit': 'crunch', 'Box of cereal': 'crunch', Aspirin: 'pills', 'Band-Aids': 'bandage', Bandages: 'bandage' };
const BAG_KINDS = { drink: 'drink', food: 'eat', supply: 'batteries' };

// Things where they stand, when used.
const USED = {
  sink: 'water', basin: 'water', bath: 'water', toilet: 'flush', stall: 'flush', stove: 'ignite', proStove: 'burners', microwave: 'beeps', toaster: 'toast', washer: 'rumble', screen: 'typing',
  treadmill: 'jog', benchPress: 'clank', punchBag: 'thud', weightRack: 'clank', poolTable: 'clack', ticketMachine: 'printer', printer: 'whirr', machine: 'whirr', carLift: 'hum', examTable: 'paper',
  scanner: 'hum', turnstile: 'clack', workbench: 'clank', scales: 'clack', xrayBelt: 'hum', atm: 'cash', vendingMachine: 'vend', coffeeMachine: 'pour',
};
const SWITCHED = { tv: 'static', speakerStand: 'static', radio: 'music', tableLamp: 'doubleClick', floorLamp: 'doubleClick', surgeryLamp: 'click' };
const OPENED_QUIETLY = new Set(['bookcase', 'bookStack', 'storeShelf', 'clothesRack', 'displayTable']); // nothing to swing open

// The sound of eating, drinking or taking something from the bag.
export function bagSound(name, kind) {
  return BAG_ITEMS[name] || BAG_KINDS[kind] || 'ack';
}

// The sound of what useThing (footActions.js) did with an item. action is what it was asked to do, result what came of it.
export function useSound(item, action, result) {
  if (result.pose) return result.pose === 'sleep' ? 'bed' : 'sit';
  if (action === 'pick up') return 'pickup';
  if (action === 'open' || action === 'search') {
    if (result.give) return 'found';
    return action === 'open' && !OPENED_QUIETLY.has(item) ? 'open' : 'search';
  }
  if (action === 'switch') return SWITCHED[item] || 'click';
  if (action === 'write') return 'scribble';
  if (action === 'move' || action === 'drive') return 'drop';
  if (result.empty) return 'ack';   // a machine with nothing left
  if (result.dry) return 'dryTap';
  return USED[item] || 'ack';
}

// How long a sound lasts, in seconds.
export function lengthOf(name) {
  return Math.max(...(SOUNDS[name] || SOUNDS.ack).map((layer) => layer.at + layer.dur));
}

const noiseBuffers = new WeakMap();
function noiseFor(ctx) {
  if (!noiseBuffers.has(ctx)) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return noiseBuffers.get(ctx);
}

const QUIET = 0.001, HOLD_FADE = 0.3, TONE_ATTACK = 0.004;

// Builds one on any audio context, into out, slightly different in pitch each time. EngineAudio bakes these ahead on an offline context (lead 0), so using one is a single node; this is also what it falls back on before then.
export function play(ctx, out, name, random = Math.random, lead = 0.005) {
  const start = ctx.currentTime + lead, rate = 0.95 + random() * 0.1;
  for (const layer of SOUNDS[name] || SOUNDS.ack) {
    const at = start + layer.at, end = at + layer.dur, gain = ctx.createGain(), peak = Math.max(layer.level, QUIET * 2);
    gain.gain.setValueAtTime(QUIET, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + (layer.attack ?? Math.min(TONE_ATTACK, layer.dur / 3)));
    if (layer.hold) gain.gain.setValueAtTime(peak, Math.max(at + TONE_ATTACK, end - layer.dur * HOLD_FADE));
    gain.gain.exponentialRampToValueAtTime(QUIET, end);
    let source, last;
    if (layer.noise) {
      source = ctx.createBufferSource();
      source.buffer = noiseFor(ctx);
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = layer.noise;
      filter.Q.value = layer.q;
      filter.frequency.setValueAtTime(layer.from * rate, at);
      filter.frequency.exponentialRampToValueAtTime(layer.to * rate, end);
      source.connect(filter);
      last = filter;
    } else {
      source = ctx.createOscillator();
      source.type = layer.wave;
      source.frequency.setValueAtTime(layer.from * rate, at);
      source.frequency.exponentialRampToValueAtTime(layer.to * rate, end);
      last = source;
    }
    last.connect(gain).connect(out);
    source.onended = () => gain.disconnect();
    if (layer.noise) source.start(at, random() * 1.5);
    else source.start(at);
    source.stop(end + 0.01);
  }
}
