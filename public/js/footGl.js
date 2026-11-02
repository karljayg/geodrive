// Draws a room and the person in it with WebGL2: flat-coloured meshes. Outdoors the canvas is clear, showing the map below. It keeps one
// context for the whole visit, because a canvas can never get a new one once its context is destroyed.
// The matrix helpers at the top are pure and tested in node. All are column by column, for x east, y north, z up.
const VERTEX = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec3 aCol;
uniform mat4 uViewProj, uModel; uniform vec3 uEye;
out vec3 vNor, vCol; out float vDist;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vNor = mat3(uModel) * aNor;
  vCol = aCol;
  vDist = distance(world.xyz, uEye);
  gl_Position = uViewProj * world;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vNor, vCol; in float vDist;
uniform vec3 uTint, uSky; uniform vec2 uFog;
out vec4 colour;
void main() {
  vec3 albedo = vCol;
  vec3 n = normalize(vNor);
  float light = 0.56 + 0.14 * (n.z * 0.5 + 0.5) + 0.36 * max(dot(n, normalize(vec3(0.45, -0.35, 0.82))), 0.0);
  float fog = clamp((vDist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  colour = vec4(mix(albedo * light, uSky, fog) * uTint, 1.0);
}`;
const STRIDE_BYTES = 36; // nine floats a vertex

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

export function perspective(fovYDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovYDeg * Math.PI) / 360);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}

// Looking from eye to target with z up. Right-handed, so facing north has east on the right of the screen.
export function lookAt(eye, target) {
  let fx = target.x - eye.x, fy = target.y - eye.y, fz = target.z - eye.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  let sx = fy, sy = -fx; // forward × up
  const sl = Math.hypot(sx, sy) || 1;
  sx /= sl; sy /= sl;
  const ux = sy * fz, uy = -sx * fz, uz = sx * fy - sy * fx; // right × forward
  return [
    sx, ux, -fx, 0, sy, uy, -fy, 0, 0, uz, -fz, 0,
    -(sx * eye.x + sy * eye.y), -(ux * eye.x + uy * eye.y + uz * eye.z), fx * eye.x + fy * eye.y + fz * eye.z, 1,
  ];
}

export const translate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

// A compass bearing in radians: turns a model facing +y clockwise, seen from above.
export function bearing(angle) {
  const s = Math.sin(angle), c = Math.cos(angle);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

// Swings a limb forward and back about the x axis.
export function swing(angle) {
  const s = Math.sin(angle), c = Math.cos(angle);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

export class FootGl {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('this browser has no WebGL2');
    this.lost = false;
    this.onRestored = null;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.setUp(); this.onRestored?.(); });
    this.setUp();
  }

  setUp() {
    const { gl } = this;
    const compile = (type, text) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    for (const [i, name] of ['aPos', 'aNor', 'aCol'].entries()) gl.bindAttribLocation(program, i, name);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    this.u = {};
    for (const name of ['uViewProj', 'uModel', 'uEye', 'uTint', 'uSky', 'uFog']) this.u[name] = gl.getUniformLocation(program, name);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  // Matches the canvas to its place on the page. Returns width / height.
  fit() {
    const { canvas, gl } = this, scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * scale)), h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    return w / h;
  }

  mesh(floats) {
    const { gl } = this, vao = gl.createVertexArray(), buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, floats, gl.STATIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 3, gl.FLOAT, false, STRIDE_BYTES, i * 12);
    }
    gl.bindVertexArray(null);
    return { vao, buffer, count: floats.length / 9 };
  }

  free(mesh) {
    if (!mesh) return;
    this.gl.deleteVertexArray(mesh.vao);
    this.gl.deleteBuffer(mesh.buffer);
  }

  // tint: what the time of day multiplies everything by. sky: the fog's colour before that.
  begin({ viewProj, eye, tint, sky, fogFrom, fogTo }) {
    const { gl, u } = this;
    gl.clearColor(sky[0] * tint[0], sky[1] * tint[1], sky[2] * tint[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl.uniform3f(u.uEye, eye.x, eye.y, eye.z);
    gl.uniform3fv(u.uTint, tint);
    gl.uniform3fv(u.uSky, sky);
    gl.uniform2f(u.uFog, fogFrom, fogTo);
  }

  // Nothing drawn: the map shows through.
  clearAway() {
    const { gl } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  draw(mesh, model = IDENTITY) {
    const { gl, u } = this;
    if (!mesh || !mesh.count) return;
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }
}
