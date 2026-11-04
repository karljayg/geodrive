// How loud each engine recording plays and at what speed, for given revs and load. Pure, tested in node.
// Revs set the pitch; load sets how aggressive it sounds. The recordings aren't one continuous sweep, so
// neighbouring ones blend as the revs pass between them.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const MIN_RATE = 0.55, MAX_RATE = 3.2;

export const AUDIO_PRESETS = {
  quiet: { base: 0.75, push: 0.6, bright: 0.7 },
  balanced: { base: 1, push: 1, bright: 1 },
  sport: { base: 1.3, push: 1.15, bright: 1.25 },
};

// How present the engine is overall, 0..1. Quiet when cruising, strong only under real load.
export function engineIntensity(rpm, load, idle, redline, preset = AUDIO_PRESETS.balanced) {
  const revs = clamp((rpm - idle) / Math.max(1, redline - idle), 0, 1);
  const base = (0.12 + 0.12 * revs) * preset.base;
  const push = 0.68 * Math.pow(clamp(load, 0, 1), 1.65) * (0.4 + 0.6 * revs) * preset.push;
  return Math.min(1, base + push);
}

// layers: { idle, load, mid, high? } reference revs. Returns gains and rates for each.
export function layerMix(layers, rpm, load, pitch = 1) {
  const rungs = [['low', layers.idle]];
  if (layers.mid) rungs.push(['mid', layers.mid]);
  if (layers.high) rungs.push(['high', layers.high]);
  const weights = { low: 0, mid: 0, high: 0 };
  const r = Math.max(rpm, 1);
  if (r <= rungs[0][1]) weights.low = 1;
  else if (r >= rungs[rungs.length - 1][1]) weights[rungs[rungs.length - 1][0]] = 1;
  else {
    for (let i = 0; i < rungs.length - 1; i++) {
      const [a, ra] = rungs[i], [b, rb] = rungs[i + 1];
      if (r >= ra && r <= rb) {
        // Equal power, measured in pitch rather than revs.
        const f = Math.log(r / ra) / Math.log(rb / ra);
        weights[a] = Math.cos((f * Math.PI) / 2);
        weights[b] = Math.sin((f * Math.PI) / 2);
      }
    }
  }
  const l = clamp(load, 0, 1);
  const gains = {
    idle: weights.low * Math.cos((l * Math.PI) / 2),
    load: weights.low * Math.sin((l * Math.PI) / 2),
    mid: weights.mid,
    high: weights.high,
  };
  const rates = {};
  for (const name of Object.keys(layers)) rates[name] = clamp((r / layers[name]) * pitch, MIN_RATE, MAX_RATE);
  return { gains, rates };
}

// Brightness: off the throttle the sound closes down, which stands in for separate coast recordings.
export const engineCutoff = (load, preset = AUDIO_PRESETS.balanced) => (900 + 9000 * Math.pow(clamp(load, 0, 1), 1.2)) * preset.bright;

// Road and wind, 0..1 before their volume settings. They level off so 500 mph isn't deafening.
export const roadLevel = (mph) => 0.5 * Math.pow(clamp(mph / 90, 0, 1), 1.4);
export const windLevel = (mph) => 0.7 * Math.pow(clamp((mph - 25) / 150, 0, 1), 1.6);

// How much of the engine reaches someone standing this many metres from the car: all of it close by, then falling away to nothing.
export const ENGINE_NEAR = 3, ENGINE_GONE = 40;
export function engineFadeAt(metres) {
  const t = Math.max(0, Math.min(1, (metres - ENGINE_NEAR) / (ENGINE_GONE - ENGINE_NEAR)));
  return (1 - t) ** 2;
}

// The nearest of these distances, heard the same way as that engine: full close by, nothing once it has fallen away.
export function nearestFade(distances) {
  let best = 0;
  for (const metres of distances) {
    const level = engineFadeAt(metres);
    if (level > best) best = level;
  }
  return best;
}
