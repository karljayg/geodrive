// The headlight pattern on the road: two beams from the lamps, made of many soft overlapping pools. All sizes come
// from the car's own length and width. Pure apart from drawing, and tested in node.
const SLICES = 26;
const REACH = 4;          // car lengths ahead of the nose where the outer beam has faded out
const PEAK = 1.5;         // car lengths ahead of the nose where the beam is brightest
const NEAR = 0.2;         // brightness just ahead of the nose, against 1 at the peak
const SPREAD = 0.16;      // how much a beam widens per metre ahead

export function beamBrightness(ahead, length) {
  const d = ahead / length;
  if (d <= 0 || d >= REACH) return 0;
  if (d < PEAK) { const t = d / PEAK; return NEAR + (1 - NEAR) * t * t * (3 - 2 * t); }
  const t = (d - PEAK) / (REACH - PEAK);
  return (1 - t) * (1 - t) * (1 + 2 * t);
}

// Soft pools in metres on the road: f ahead of the car's centre, r to its right, rx and ry their half sizes.
export function beamPools(length, width) {
  const nose = length / 2, lamp = width * 0.65, pools = [];
  for (let i = 0; i < SLICES; i++) {
    const ahead = ((i + 0.5) / SLICES) * REACH * length;
    const strength = beamBrightness(ahead, length);
    const rx = Math.min(width * 0.45 + ahead * SPREAD, nose + ahead), ry = Math.min(length * 0.55, ahead);
    for (const side of [-1, 1]) {
      pools.push({ f: nose + ahead, r: side * (lamp + ahead * 0.015), rx, ry, strength });
    }
  }
  return pools;
}

// Two very small tail lights at the back of the car: faint with the lights on, bright under braking.
export function tailPools(length, width, lit, braking) {
  const strength = braking ? 1 : lit ? 0.3 : 0;
  return [-1, 1].map((side) => ({ f: -length / 2, r: side * width * 0.32, rx: width * 0.13, ry: width * 0.13, strength }));
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
