// The person as a jointed figure, posed by proper walk and run cycles rather than swinging sticks. Pure, tested in node.
// x to their right, y forward, z up, feet on z = 0. Each frame is baked once, as a map model can't move its own parts.
export const CYCLE_FRAMES = 8;
export const FRAME_COUNT = 1 + CYCLE_FRAMES * 2; // standing, then walking, then running

const THIGH = 0.46, SHIN = 0.44, FOOT = 0.2, ANKLE = 0.06, TORSO = 0.52, UPPER_ARM = 0.29, FOREARM = 0.27;
const HIP_X = 0.09, SHOULDER_X = 0.2;
const deg = Math.PI / 180;
const SKIN = [0.82, 0.65, 0.52], JACKET = [0.95, 0.5, 0.08], JEANS = [0.13, 0.2, 0.34], SHOES = [0.1, 0.09, 0.09], HAIR = [0.14, 0.1, 0.07];

// Angles in degrees. hip: forward swing around lean. knee: its range, deepest just after the foot leaves the ground. elbow: how bent. flight: m off the ground mid-stride.
const GAITS = {
  stand: { hipSwing: 0, hipAhead: 0, kneeMin: 3, kneeMax: 3, arm: 0, armAhead: 2, elbow: 10, lean: 1, twist: 0, flight: 0 },
  walk: { hipSwing: 26, hipAhead: 3, kneeMin: 6, kneeMax: 62, arm: 24, armAhead: 0, elbow: 22, lean: 3, twist: 7, flight: 0 },
  run: { hipSwing: 44, hipAhead: 12, kneeMin: 18, kneeMax: 105, arm: 42, armAhead: 2, elbow: 88, lean: 13, twist: 13, flight: 0.08 },
};

// Which frame shows for how fast they move, what gait, and how far through the cycle.
export function frameFor(speed, running, phase) {
  if (speed < 0.1) return 0;
  const at = Math.floor((((phase % 1) + 1) % 1) * CYCLE_FRAMES) % CYCLE_FRAMES;
  return 1 + at + (running ? CYCLE_FRAMES : 0);
}

// Cycles a second: quicker at higher speed, but less than in proportion, as people lengthen their stride first.
export const cadenceOf = (speed, running) => (running ? 1.4 * Math.sqrt(speed / 4.2) : Math.sqrt(speed / 1.5));

function leg(g, phi, side) {
  const hip = (g.hipAhead + g.hipSwing * Math.sin(phi)) * deg;
  const flex = g.kneeMin + (g.kneeMax - g.kneeMin) * Math.max(0, Math.cos(phi + 0.5)) ** 2;
  const shin = hip - flex * deg, foot = shin * 0.6;
  const knee = [THIGH * Math.sin(hip), -THIGH * Math.cos(hip)];
  const ankle = [knee[0] + SHIN * Math.sin(shin), knee[1] - SHIN * Math.cos(shin)];
  const toe = [ankle[0] + FOOT * Math.cos(foot), ankle[1] + FOOT * Math.sin(foot)];
  return { side, knee, ankle, toe, low: Math.min(ankle[1] - ANKLE, toe[1] - 0.03) };
}

// Joint positions for one pose.
export function poseAt(gaitName, phase) {
  const g = GAITS[gaitName], phi = phase * Math.PI * 2;
  const legs = [leg(g, phi, 1), leg(g, phi + Math.PI, -1)];
  const hipZ = -Math.min(legs[0].low, legs[1].low) + g.flight * Math.sin(phi) ** 2;
  const lean = g.lean * deg, twist = g.twist * deg * Math.sin(phi); // the right shoulder comes forward with the left leg
  const chest = [0, TORSO * Math.sin(lean), hipZ + TORSO * Math.cos(lean)];
  const j = { hip: [0, 0, hipZ], chest, legs: [], arms: [] };
  for (const l of legs) {
    const at = (p) => [l.side * HIP_X, p[0] + l.side * 0.02 * Math.sin(twist), hipZ + p[1]];
    j.legs.push({ hip: at([0, 0]), knee: at(l.knee), ankle: at(l.ankle), toe: at(l.toe) });
  }
  for (const [side, armPhi] of [[1, phi + Math.PI], [-1, phi]]) {
    const upper = lean * 0.3 + (g.armAhead + g.arm * Math.sin(armPhi)) * deg, fore = upper + g.elbow * deg;
    const shoulder = [side * SHOULDER_X, chest[1] - side * SHOULDER_X * Math.sin(twist), chest[2] - 0.03];
    const elbow = [shoulder[0], shoulder[1] + UPPER_ARM * Math.sin(upper), shoulder[2] - UPPER_ARM * Math.cos(upper)];
    j.arms.push({ shoulder, elbow, hand: [elbow[0], elbow[1] + FOREARM * Math.sin(fore), elbow[2] - FOREARM * Math.cos(fore)] });
  }
  return j;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

function tri(part, a, b, c) {
  // Wound so the face looks the way its normals do, which culling and the map's lighting both rely on.
  const flip = dot(cross(sub(b.p, a.p), sub(c.p, a.p)), a.n) + dot(cross(sub(b.p, a.p), sub(c.p, a.p)), c.n) < 0;
  for (const v of flip ? [a, c, b] : [a, b, c]) { part.pos.push(...v.p); part.nor.push(...v.n); }
}

// A rounded limb from a to b. rx is its half width across the body, so a torso can be wider than deep.
function tube(part, a, b, ra, rb, sides = 8, flat = 1) {
  const axis = unit(sub(b, a)), v = unit(cross(axis, [1, 0, 0])), u = cross(v, axis);
  const ring = (c, r) => Array.from({ length: sides }, (_, i) => {
    const t = (i / sides) * Math.PI * 2, n = u.map((x, k) => x * Math.cos(t) + v[k] * Math.sin(t));
    return { p: c.map((x, k) => x + u[k] * Math.cos(t) * r + v[k] * Math.sin(t) * r * flat), n };
  });
  const A = ring(a, ra), B = ring(b, rb), capA = { p: a, n: axis.map((x) => -x) }, capB = { p: b, n: axis };
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tri(part, A[i], B[i], B[j]);
    tri(part, A[i], B[j], A[j]);
    tri(part, capA, { ...A[i], n: capA.n }, { ...A[j], n: capA.n });
    tri(part, capB, { ...B[i], n: capB.n }, { ...B[j], n: capB.n });
  }
}

function ball(part, c, r, squash = 1, from = 0) {
  const rows = 6, sides = 10, at = (i, j) => {
    const lat = (i / rows) * Math.PI, lon = (j / sides) * Math.PI * 2;
    const n = [Math.sin(lat) * Math.cos(lon), Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
    return { p: [c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r * squash], n };
  };
  for (let i = from; i < rows; i++) {
    for (let j = 0; j < sides; j++) {
      tri(part, at(i, j), at(i + 1, j), at(i + 1, j + 1));
      tri(part, at(i, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
}

// One frame as parts of one colour each.
export function personParts(frame) {
  const gait = frame === 0 ? 'stand' : frame <= CYCLE_FRAMES ? 'walk' : 'run';
  const phase = frame === 0 ? 0 : ((frame - 1) % CYCLE_FRAMES) / CYCLE_FRAMES;
  const j = poseAt(gait, phase);
  const part = (colour) => ({ pos: [], nor: [], colour });
  const skin = part(SKIN), jacket = part(JACKET), jeans = part(JEANS), shoes = part(SHOES), hair = part(HAIR);
  tube(jacket, [0, 0, j.hip[2] - 0.02], j.chest, 0.17, 0.2, 10, 0.68);
  ball(jacket, j.chest, 0.2, 0.55);
  ball(jeans, j.hip, 0.16, 0.7);
  const neck = [0, j.chest[1] + 0.02, j.chest[2] + 0.1], head = [0, neck[1] + 0.02, neck[2] + 0.13];
  tube(skin, j.chest, neck, 0.05, 0.05, 6);
  ball(skin, head, 0.105, 1.15);
  ball(hair, [head[0], head[1] - 0.012, head[2] + 0.018], 0.112, 1.1, 0);
  for (const l of j.legs) {
    tube(jeans, l.hip, l.knee, 0.09, 0.062);
    tube(jeans, l.knee, l.ankle, 0.062, 0.04);
    ball(jeans, l.knee, 0.062);
    tube(shoes, l.ankle, l.toe, 0.05, 0.04, 6);
  }
  for (const a of j.arms) {
    tube(jacket, a.shoulder, a.elbow, 0.058, 0.044);
    ball(jacket, a.shoulder, 0.062);
    ball(jacket, a.elbow, 0.044);
    tube(jacket, a.elbow, a.hand, 0.044, 0.032);
    ball(skin, a.hand, 0.042);
  }
  return [skin, jacket, jeans, shoes, hair];
}

// The same as one flat list for the room's renderer: x, y, z, nx, ny, nz, r, g, b per vertex.
export function personFloats(frame) {
  const data = [];
  for (const { pos, nor, colour } of personParts(frame)) {
    for (let i = 0; i < pos.length; i += 3) data.push(pos[i], pos[i + 1], pos[i + 2], nor[i], nor[i + 1], nor[i + 2], ...colour);
  }
  return new Float32Array(data);
}
