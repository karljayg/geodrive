// The headlight pattern on the road: two beams from the lamps, made of many soft overlapping pools. All sizes come
// from the car's own length and width. Pure apart from drawing, and tested in node.
const SLICES = 36;
const REACH = 6;          // car lengths of beam length, from the start of the pool to where it has faded out
const PEAK = 3.5;         // car lengths into the beam where it is brightest
const NEAR = 0.08;        // brightness at the start of the beam, against 1 at the peak
const SPREAD = 0.11;      // how much a beam widens per metre ahead
const BIAS = 3.5;         // car lengths past the nose where the beams begin (keeps them ahead when the overlay drifts)

export function beamBrightness(ahead, length) {
  const d = ahead / length;
  if (d <= 0 || d >= REACH) return 0;
  if (d < PEAK) { const t = d / PEAK; return NEAR + (1 - NEAR) * t * t * (3 - 2 * t); }
  const t = (d - PEAK) / (REACH - PEAK);
  return (1 - t) * (1 - t) * (1 + 2 * t);
}

// Soft pools in metres on the road: f ahead of the car's centre, r to its right, rx and ry their half sizes.
// parked: nothing moves, so the beams can begin at the lamps.
export function beamPools(length, width, parked = false) {
  const nose = length / 2, lamp = width * 0.65, bias = parked ? 0 : BIAS * length, pools = [];
  for (let i = 0; i < SLICES; i++) {
    const ahead = ((i + 0.5) / SLICES) * REACH * length;
    const strength = beamBrightness(ahead, length);
    const rx = Math.min(width * 0.45 + ahead * SPREAD, nose + ahead), ry = Math.min(length * 0.55, ahead);
    for (const side of [-1, 1]) {
      pools.push({ f: nose + bias + ahead, r: side * (lamp + ahead * 0.015), rx, ry, strength });
    }
  }
  return pools;
}

// One beam from someone on foot: reach m long, widening as it goes. The same pools as a headlight, so it draws the same way.
export function torchPools(reach, wide) {
  const pools = [];
  for (let i = 0; i < SLICES; i++) {
    const ahead = ((i + 0.5) / SLICES) * reach;
    pools.push({ f: 0.3 + ahead, r: 0, rx: 0.5 + ahead * wide, ry: Math.max(0.5, reach / SLICES), strength: (1 - i / SLICES) ** 1.2 });
  }
  return pools;
}

// Whether the brake lights are on: slowing down, or S held, which carries on from braking into reversing, so they stay lit
// through the stop and all the way back. controls is the game loop's input.
export const brakeLit = (speed, controls, arriving = false) => !!controls.reverse
  || (Math.abs(speed) > 0.5 && (!!controls.handbrake || controls.brake > 0 || arriving))
  || (speed < -0.5 && controls.throttle > 0);

// Tail lights as small lit dots on screen, kept a fixed size in pixels so they stay visible at any zoom: clearly on
// with the lights on, bigger and brighter under braking. view is as in drawPools.
export function tailDots(view, length, width, lit, braking) {
  if (!lit && !braking) return [];
  const a = (view.angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const spread = Math.max(width * 0.32 * view.perMetre, 3.5);
  const lift = 0.6 * (width / 1.9) * view.perMetre * Math.sqrt(Math.max(0, 1 - view.foreshorten ** 2));
  const backX = (length / 2) * sin * view.perMetre * -1, backY = (length / 2) * cos * view.perMetre * view.foreshorten;
  return [-1, 1].map((side) => ({
    x: view.x + backX + side * spread * cos,
    y: view.y + backY + side * spread * sin * view.foreshorten - lift,
    radius: braking ? 3 : 2,
    halo: braking ? 9 : 4,
    color: braking ? '#ff2a1a' : '#e0301f',
    haloAlpha: braking ? 0.8 : 0.35,
  }));
}

export function drawDots(ctx, dots) {
  for (const d of dots) {
    const glow = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.halo);
    glow.addColorStop(0, `rgba(255,40,25,${d.haloAlpha})`);
    glow.addColorStop(1, 'rgba(255,40,25,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.halo, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Draws the pools using the current composite mode. view: { x, y (car on screen), perMetre, foreshorten, angle (degrees
// the car points off the camera heading) }. `gain` scales each pool; they build up where they overlap.
export function drawPools(ctx, pools, view, gain, rgb = '0,0,0') {
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  glow.addColorStop(0, `rgba(${rgb},1)`);
  glow.addColorStop(0.55, `rgba(${rgb},0.55)`);
  glow.addColorStop(1, `rgba(${rgb},0)`);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.perMetre, view.perMetre * view.foreshorten);
  ctx.rotate((view.angle * Math.PI) / 180);
  ctx.fillStyle = glow;
  for (const p of pools) {
    if (p.strength <= 0.005) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.strength * gain);
    ctx.translate(p.r, -p.f);
    ctx.scale(p.rx, p.ry);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
