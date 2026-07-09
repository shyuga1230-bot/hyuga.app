import { MONO, type Band } from "./palette";
import { sphereGeom } from "./scene";

/**
 * WebGL2 パーティクルレイヤー。
 * - 落下する砂: 数千粒のポイントスプライト。塊でこぼれ、乱流で散らばり、
 *   床に届く前に消える。夜は加算合成+ブルームで発光、昼は墨の粒。
 * - 砂面の渦: すり鉢の中心へ、渦を巻きながら吸い込まれていく粒。
 * 2D キャンバス(器・砂・ガラス)の上に重ねて使う。
 */

export type GlSandOpts = {
  getRemainFrac: () => number;
  getBand: () => Band;
};

export type GlSandHandle = {
  destroy: () => void;
};

const MAX_SPILL = 9000;
const N_VORTEX = 1600;
const FLOATS_PER = 5; // x, y, size, alpha, tint

const VERT = `#version 300 es
precision mediump float;
layout(location=0) in vec2 a_pos;
layout(location=1) in float a_size;
layout(location=2) in float a_alpha;
layout(location=3) in float a_tint;
uniform vec2 u_res;
uniform float u_sizeScale;
out float v_alpha;
out float v_tint;
void main() {
  vec2 clip = (a_pos / u_res * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size * u_sizeScale;
  v_alpha = a_alpha;
  v_tint = a_tint;
}`;

const FRAG = `#version 300 es
precision mediump float;
in float v_alpha;
in float v_tint;
uniform vec3 u_hi;
uniform vec3 u_lo;
uniform float u_dark;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float halo = smoothstep(1.0, 0.0, d);
  float core = smoothstep(0.42, 0.0, d);
  float a = v_alpha * (halo * 0.35 + core * 0.9);
  vec3 col = mix(u_lo, u_hi, v_tint);
  if (u_dark > 0.5) {
    outColor = vec4(col * a, a); // additive
  } else {
    outColor = vec4(col, a);     // normal alpha (ink)
  }
}`;

const QUAD_VERT = `#version 300 es
precision mediump float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const BLUR_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;
out vec4 outColor;
void main() {
  vec4 sum = texture(u_tex, v_uv) * 0.227027;
  sum += texture(u_tex, v_uv + u_dir * 1.3846) * 0.316216;
  sum += texture(u_tex, v_uv - u_dir * 1.3846) * 0.316216;
  sum += texture(u_tex, v_uv + u_dir * 3.2308) * 0.070270;
  sum += texture(u_tex, v_uv - u_dir * 3.2308) * 0.070270;
  outColor = sum;
}`;

const COMPOSITE_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_strength;
out vec4 outColor;
void main() {
  vec4 b = texture(u_tex, v_uv);
  outColor = vec4(b.rgb * u_strength, 0.0);
}`;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function hexVec(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("shader compile: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("program link: " + gl.getProgramInfoLog(p));
  }
  return p;
}

type Spill = {
  x: number; y: number; vx: number; vy: number;
  size: number; tint: number;
};

type Vortex = {
  theta: number; r: number; speed: number; size: number; tint: number;
};

export function createGlSand(canvas: HTMLCanvasElement, opts: GlSandOpts): GlSandHandle {
  const glMaybe = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
  });
  if (!glMaybe) throw new Error("webgl2 unavailable");
  const gl: WebGL2RenderingContext = glMaybe;

  let w = 0;
  let h = 0;
  let dpr = 1;

  const pointProg = link(gl, VERT, FRAG);
  const blurProg = link(gl, QUAD_VERT, BLUR_FRAG);
  const compProg = link(gl, QUAD_VERT, COMPOSITE_FRAG);

  const uRes = gl.getUniformLocation(pointProg, "u_res");
  const uSizeScale = gl.getUniformLocation(pointProg, "u_sizeScale");
  const uHi = gl.getUniformLocation(pointProg, "u_hi");
  const uLo = gl.getUniformLocation(pointProg, "u_lo");
  const uDark = gl.getUniformLocation(pointProg, "u_dark");
  const uBlurTex = gl.getUniformLocation(blurProg, "u_tex");
  const uBlurDir = gl.getUniformLocation(blurProg, "u_dir");
  const uCompTex = gl.getUniformLocation(compProg, "u_tex");
  const uCompStrength = gl.getUniformLocation(compProg, "u_strength");

  /* particle buffer */
  const data = new Float32Array((MAX_SPILL + N_VORTEX) * FLOATS_PER);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  const stride = FLOATS_PER * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 16);
  gl.bindVertexArray(null);

  /* fullscreen quad */
  const quadVao = gl.createVertexArray();
  const quadVbo = gl.createBuffer();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  /* bloom FBOs (half res) */
  let fboA: WebGLFramebuffer | null = null;
  let fboB: WebGLFramebuffer | null = null;
  let texA: WebGLTexture | null = null;
  let texB: WebGLTexture | null = null;
  let bw = 0;
  let bh = 0;

  function makeTarget(): [WebGLFramebuffer, WebGLTexture] {
    const tex = gl!.createTexture();
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, bw, bh, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    const fbo = gl!.createFramebuffer();
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    if (!fbo || !tex) throw new Error("fbo alloc failed");
    return [fbo, tex];
  }

  function fit() {
    const host = canvas.parentElement ?? document.body;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = host.clientWidth;
    h = host.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    bw = Math.max(1, Math.floor(canvas.width / 2));
    bh = Math.max(1, Math.floor(canvas.height / 2));
    [fboA, texA] = makeTarget();
    [fboB, texB] = makeTarget();
  }

  /* ---------- simulation ---------- */
  let spills: Spill[] = [];
  let burstT = 0;
  const vortex: Vortex[] = [];
  for (let i = 0; i < N_VORTEX; i++) {
    vortex.push({
      theta: rand(0, Math.PI * 2),
      r: Math.sqrt(Math.random()),
      speed: rand(0.7, 1.3),
      size: rand(1.0, 2.2),
      tint: Math.random(),
    });
  }

  function step(dt: number) {
    const g = sphereGeom(w, h);
    /* こぼれ: 塊とほどけ */
    burstT -= dt;
    if (burstT <= 0) {
      const n = 6 + Math.floor(Math.random() * 20);
      for (let i = 0; i < n && spills.length < MAX_SPILL; i++) {
        spills.push({
          x: g.cx + rand(-3.5, 3.5),
          y: g.botY + rand(0, 5),
          vx: rand(-7, 7),
          vy: rand(25, 95),
          size: rand(0.9, 2.6),
          tint: Math.random(),
        });
      }
      burstT = rand(0.05, 0.28);
    }
    const drips = Math.floor(dt * 260 + (Math.random() < (dt * 260) % 1 ? 1 : 0));
    for (let i = 0; i < drips && spills.length < MAX_SPILL; i++) {
      spills.push({
        x: g.cx + rand(-2.5, 2.5),
        y: g.botY,
        vx: rand(-5, 5),
        vy: rand(20, 70),
        size: rand(0.7, 1.8),
        tint: Math.random(),
      });
    }
    for (const s of spills) {
      s.vy += 320 * dt;
      s.vx += rand(-90, 90) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    const cut = h * 0.8;
    spills = spills.filter((s) => s.y < cut);

    /* 渦: 中心へ吸い込まれる */
    for (const v of vortex) {
      const pull = 0.012 + 0.06 * (1 - v.r) * (1 - v.r);
      v.r -= pull * v.speed * dt * 2.2;
      v.theta += (0.5 + 2.4 * Math.pow(1 - v.r, 1.6)) * v.speed * dt;
      if (v.r <= 0.055) {
        v.r = rand(0.86, 1.0);
        v.theta = rand(0, Math.PI * 2);
      }
    }
  }

  function fillBuffer(): number {
    const g = sphereGeom(w, h);
    const f = opts.getRemainFrac();
    const levelY = g.cy + g.R - 2 * g.R * f;
    const d1 = Math.abs(levelY - g.cy);
    const hc = g.R * Math.sqrt(Math.max(0.05, 1 - (d1 / g.R) * (d1 / g.R))) * 0.94;
    const sry = hc * 0.2;

    let n = 0;
    const fadeStart = h * 0.7;
    const fadeEnd = h * 0.795;
    for (const s of spills) {
      const a = s.y < fadeStart ? 1 : Math.max(0, 1 - (s.y - fadeStart) / (fadeEnd - fadeStart));
      if (a <= 0) continue;
      const o = n * FLOATS_PER;
      data[o] = s.x * dpr;
      data[o + 1] = s.y * dpr;
      data[o + 2] = s.size * 3.4 * dpr;
      data[o + 3] = a * 0.85;
      data[o + 4] = s.tint;
      n++;
    }
    for (const v of vortex) {
      const o = n * FLOATS_PER;
      data[o] = (g.cx + Math.cos(v.theta) * v.r * hc) * dpr;
      data[o + 1] = (levelY + Math.sin(v.theta) * v.r * sry) * dpr;
      data[o + 2] = v.size * 2.4 * dpr;
      data[o + 3] = (0.14 + 0.5 * (1 - v.r)) * 0.8;
      data[o + 4] = v.tint;
      n++;
    }
    return n;
  }

  function drawPoints(count: number, sizeScale: number, hi: number[], lo: number[], dark: boolean) {
    gl.useProgram(pointProg);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uSizeScale, sizeScale);
    gl.uniform3f(uHi, hi[0], hi[1], hi[2]);
    gl.uniform3f(uLo, lo[0], lo[1], lo[2]);
    gl.uniform1f(uDark, dark ? 1 : 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);
  }

  function render() {
    const band = opts.getBand();
    const pal = MONO[band];
    const dark = pal.dark;
    const hi = hexVec(pal.sandHi);
    const lo = hexVec(pal.sandLo);

    const count = fillBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * FLOATS_PER);

    gl.enable(gl.BLEND);
    if (dark) {
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    /* main pass to screen */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawPoints(count, 1, hi, lo, dark);

    /* bloom: 夜だけ */
    if (dark && fboA && fboB && texA && texB) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
      gl.viewport(0, 0, bw, bh);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendFunc(gl.ONE, gl.ONE);
      drawPoints(count, 0.5, hi, lo, true);

      gl.useProgram(blurProg);
      gl.uniform1i(uBlurTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.disable(gl.BLEND);
      /* horizontal A -> B */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
      gl.bindTexture(gl.TEXTURE_2D, texA);
      gl.uniform2f(uBlurDir, 1.6 / bw, 0);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      /* vertical B -> A */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
      gl.bindTexture(gl.TEXTURE_2D, texB);
      gl.uniform2f(uBlurDir, 0, 1.6 / bh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      /* composite additive to screen */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(compProg);
      gl.uniform1i(uCompTex, 0);
      gl.uniform1f(uCompStrength, 0.9);
      gl.bindTexture(gl.TEXTURE_2D, texA);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }
  }

  fit();

  let raf = 0;
  let last = performance.now();
  let destroyed = false;
  const loop = (t: number) => {
    if (destroyed) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (!document.hidden) {
      step(dt);
      render();
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fit();
      spills = [];
    }, 150);
  };
  window.addEventListener("resize", onResize);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    },
  };
}
