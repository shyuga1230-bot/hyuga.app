import { MONO, type Band } from "./palette";
import { sphereGeom } from "./scene";

/**
 * 無白 WebGL2 レンダラ(第2弾)。
 * シーン全体をフラグメントシェーダでレイトレースする:
 * - ガラス球: 解析的なレイ・スフィア交差、屈折、フレネル反射、ハイライト
 * - 砂: ハイトフィールドのレイマーチ。fbm の粒質感、すり鉢の窪み、
 *   渦の筋、夜はきらめくグリント
 * - 夢のリング: 球面上の琥珀の発光緯線
 * - ポスト: 輝度抽出 → 2パスぼかし → 加算合成のブルーム
 * その上にポイントスプライトの砂(こぼれ+渦)を重ねる。
 */

export type GlSandOpts = {
  getRemainFrac: () => number;
  getDreamFrac: () => number | null;
  getBand: () => Band;
};

export type GlSandHandle = {
  destroy: () => void;
};

const MAX_SPILL = 9000;
const N_VORTEX = 1600;
const FLOATS_PER = 5; // x, y, size, alpha, tint

/* ---------------- shaders ---------------- */

const QUAD_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/* シーン本体。座標はデバイスピクセル、y は下向き。直交投影で z 方向へレイを飛ばす */
const SCENE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;
uniform float u_remain;
uniform float u_dreamF;   // 0..1、無ければ -1
uniform float u_dark;
uniform vec3 u_bgTop;
uniform vec3 u_bgBottom;
uniform vec3 u_glow;
uniform vec3 u_floorT;
uniform vec3 u_floorB;
uniform vec3 u_sandHi;
uniform vec3 u_sandLo;
uniform vec3 u_accent;
out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float s = vnoise(p) * 0.55;
  s += vnoise(p * 2.13) * 0.28;
  s += vnoise(p * 4.7) * 0.17;
  return s;
}

/* 幾何(sphereGeom と同じ式) */
float sphR() { return min(u_res.y * 0.2, u_res.x * 0.3); }
vec2 sphC() { return vec2(u_res.x * 0.5, u_res.y * 0.44); }
float floorY() { return u_res.y * 0.82; }

vec3 background(vec2 px) {
  float fy = floorY();
  vec3 col;
  if (px.y < fy) {
    col = mix(u_bgTop, u_bgBottom, px.y / fy);
    float pool = length(px - vec2(u_res.x * 0.5, u_res.y * 0.26)) / (u_res.x * 0.5);
    float poolK = pow(1.0 - smoothstep(0.0, 1.0, pool), 2.0);
    col += u_glow * (u_dark > 0.5 ? 0.05 : 0.035) * poolK;
  } else {
    col = mix(u_floorT, u_floorB, (px.y - fy) / max(1.0, u_res.y - fy));
    /* 浮遊する球の柔らかい影 */
    vec2 sc = vec2(sphC().x + u_res.x * 0.02, u_res.y * 0.85);
    vec2 dd = (px - sc) / vec2(sphR() * 1.15, sphR() * 0.20);
    float sh = exp(-dot(dd, dd));
    col *= 1.0 - sh * (u_dark > 0.5 ? 0.45 : 0.30);
  }
  /* 地平線 */
  float hl = exp(-abs(px.y - fy) * 0.8);
  col += (u_dark > 0.5 ? vec3(0.03) : vec3(-0.03)) * hl;
  return col;
}

/* 砂のハイトフィールド: 世界座標 (x, z) → 表面の y(下向きが正) */
float sandHeight(vec2 xz) {
  vec2 c = sphC();
  float R = sphR();
  float levelY = c.y + R - 2.0 * R * u_remain;
  float d = abs(levelY - c.y);
  float rad = R * sqrt(max(0.04, 1.0 - (d / R) * (d / R)));
  float r = length(xz);
  float fw = rad * 0.55;
  float fdepth = rad * 0.55;
  float y = levelY + fdepth * exp(-(r * r) / (fw * fw));
  /* 渦の筋 */
  y += sin(r * 0.55 - atan(xz.y, xz.x) * 2.0) * rad * 0.012 * smoothstep(rad, rad * 0.15, r);
  /* 表面のうねり */
  y += (fbm(xz * 0.05) - 0.5) * rad * 0.05;
  return y;
}

vec3 sandNormal(vec2 xz) {
  float e = 2.0;
  float hx = sandHeight(xz + vec2(e, 0.0)) - sandHeight(xz - vec2(e, 0.0));
  float hz = sandHeight(xz + vec2(0.0, e)) - sandHeight(xz - vec2(0.0, e));
  /* y は下向き正。表面の上向き法線は -y 方向 */
  return normalize(vec3(hx / (2.0 * e), -1.0, hz / (2.0 * e)));
}

vec3 shadeSand(vec3 p, float glassAtten) {
  vec2 c = sphC();
  float R = sphR();
  vec2 xz = vec2(p.x - c.x, p.z);
  vec3 N = sandNormal(xz);
  vec3 L = normalize(vec3(-0.45, -0.75, -0.45)); /* 左上手前から */
  float diff = clamp(dot(N, L) * 0.5 + 0.55, 0.0, 1.0);

  float grain = fbm(xz * 0.35 + 7.0);
  vec3 albedo = mix(u_sandLo, u_sandHi, grain * 0.85 + 0.075);

  /* すり鉢の陰影と吸い込み孔 */
  float levelY = c.y + R - 2.0 * R * u_remain;
  float d = abs(levelY - c.y);
  float rad = R * sqrt(max(0.04, 1.0 - (d / R) * (d / R)));
  float r = length(xz);
  float funnelAo = exp(-(r * r) / (rad * rad * 0.30));
  float hole = smoothstep(rad * 0.075, rad * 0.03, r);

  vec3 col = albedo * diff;
  col *= 1.0 - funnelAo * 0.55;
  col = mix(col, vec3(0.01), hole);

  /* きらめくグリント(夜) */
  float sp = hash12(floor(xz * 0.8));
  float tw = 0.5 + 0.5 * sin(u_time * (1.0 + sp * 4.0) + sp * 40.0);
  float glint = step(0.985, sp) * tw * smoothstep(rad, rad * 0.2, r);
  col += u_sandHi * glint * (u_dark > 0.5 ? 1.2 : 0.25);

  return col * glassAtten * (u_dark > 0.5 ? 0.82 : 1.0);
}

/* ガラスに密着した砂(砂面より下の前面)。質感はスクリーン平面で */
vec3 shadePressed(vec3 P1) {
  vec2 c = sphC();
  float R = sphR();
  float grain = fbm(P1.xy * 0.30 + 3.0);
  float grain2 = fbm(P1.xy * 1.1 + 17.0);
  vec3 albedo = mix(u_sandLo, u_sandHi, clamp(grain * 0.7 + grain2 * 0.25, 0.0, 1.0));
  /* 上ほど明るく、球の下端へ沈む */
  float topL = clamp(0.85 - (P1.y - (c.y - R)) / (2.0 * R) * 0.5, 0.3, 0.85);
  /* 左上のキーライト */
  float side = clamp(0.5 - (P1.x - c.x) / (2.0 * R) * 0.35, 0.3, 0.75);
  vec3 col = albedo * (topL * 0.7 + side * 0.5);
  float sp = hash12(floor(P1.xy * 0.9));
  float tw = 0.5 + 0.5 * sin(u_time * (1.0 + sp * 4.0) + sp * 40.0);
  col += u_sandHi * step(0.99, sp) * tw * (u_dark > 0.5 ? 0.9 : 0.15);
  return col * (u_dark > 0.5 ? 0.82 : 1.0);
}

void main() {
  vec2 px = v_uv * u_res;
  px.y = u_res.y - px.y; /* y を下向きに */
  vec2 c = sphC();
  float R = sphR();

  /* わずかに見下ろすカメラ(砂の上面とすり鉢が見えるように) */
  float tilt = 0.22;
  float sT = sin(tilt);
  float cT = cos(tilt);
  vec3 rd0 = vec3(0.0, sT, cT);
  vec3 ro = vec3(px.x, px.y - sT * (2.0 * R) / cT, -2.0 * R);
  vec3 C3 = vec3(c, 0.0);

  vec3 col;
  vec3 oc = ro - C3;
  float bq = dot(oc, rd0);
  float hq = bq * bq - (dot(oc, oc) - R * R);

  if (hq <= 0.0) {
    col = background(px);
  } else {
    float t1 = -bq - sqrt(hq);
    vec3 P1 = ro + rd0 * t1;
    vec3 N1 = (P1 - C3) / R;

    float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(-rd0, N1), 0.0, 1.0), 3.0);
    fres = clamp(fres, 0.03, 0.9);

    /* 屈折して内部へ */
    vec3 rd = refract(rd0, N1, 1.0 / 1.12);
    if (dot(rd, rd) < 0.001) rd = rd0;

    /* 入射点がすでに砂面より下 → ガラスに密着した砂 */
    float f0 = sandHeight(vec2(P1.x - c.x, P1.z)) - P1.y;
    if (f0 < 1.5) {
      col = shadePressed(P1);
    } else {
      /* 内部で砂ハイトフィールドをレイマーチ(上面のすり鉢) */
      vec3 p = P1 + rd * 1.0;
      float hit = -1.0;
      for (int i = 0; i < 48; i++) {
        float f = sandHeight(vec2(p.x - c.x, p.z)) - p.y;
        if (f < 1.2) { hit = 1.0; break; }
        p += rd * clamp(f * 0.75, 1.5, R * 0.25);
        vec3 lp = p - C3;
        if (dot(lp, lp) > R * R * 1.04) break;
      }

      if (hit > 0.0) {
        col = shadeSand(p, 0.96);
      } else {
        /* 砂に当たらない → 暗いガラスの内側ごしに背景 */
        vec3 lp = P1 - C3;
        float tExit = -2.0 * dot(rd, lp);
        vec3 exitP = P1 + rd * tExit;
        col = background(exitP.xy) * (u_dark > 0.5 ? 0.45 : 0.80);
        col *= 1.0 - 0.10 * (1.0 - fres);
      }
    }

    /* フレネル反射: 環境のなだらかな写り込み */
    vec3 refl = reflect(rd0, N1);
    vec2 envPx = px + refl.xy * R * 0.8;
    vec3 env = background(envPx) + u_glow * 0.06;
    col = mix(col, env, fres * 0.55);

    /* リムライトとハイライト */
    float rim = pow(1.0 - clamp(dot(-rd0, N1), 0.0, 1.0), 3.0);
    col += (u_dark > 0.5 ? vec3(0.10) : vec3(0.16)) * rim * 0.8;
    vec3 L = normalize(vec3(-0.5, -0.62, -0.6));
    vec3 H = normalize(L - rd0);
    float spec = pow(max(dot(N1, H), 0.0), 90.0);
    col += vec3(1.0) * spec * (u_dark > 0.5 ? 0.45 : 0.5);

    /* 夢のリング: 球面上の発光緯線 */
    if (u_dreamF > 0.0 && u_dreamF < 1.0) {
      float ringY = c.y + R - 2.0 * R * u_dreamF;
      float dy = P1.y - ringY;
      float ringGlow = exp(-dy * dy / 6.0);
      float frontW = 0.45 - 0.55 * (P1.z / R); /* 手前ほど強い */
      col += u_accent * ringGlow * frontW * (u_dark > 0.5 ? 1.1 : 0.8);
    }
  }

  /* ごく淡いビネット */
  vec2 vd = (px - vec2(u_res.x * 0.5, u_res.y * 0.46)) / (u_res.y * 0.95);
  float vig = smoothstep(0.32, 1.0, length(vd));
  col *= 1.0 - vig * (u_dark > 0.5 ? 0.35 : 0.12);

  outColor = vec4(col, 1.0);
}`;

const POINT_VERT = `#version 300 es
precision highp float;
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

const POINT_FRAG = `#version 300 es
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
    outColor = vec4(col * a, a);
  } else {
    outColor = vec4(col, a);
  }
}`;

const BRIGHT_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_threshold;
out vec4 outColor;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(u_threshold, u_threshold + 0.25, lum);
  outColor = vec4(c * k, 1.0);
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

const FINAL_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_strength;
uniform float u_time;
out vec4 outColor;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 c = texture(u_scene, v_uv).rgb;
  c += texture(u_bloom, v_uv).rgb * u_strength;
  /* フィルムグレイン */
  c += (hash12(v_uv * 913.0 + fract(u_time) * 71.0) - 0.5) * 0.016;
  outColor = vec4(c, 1.0);
}`;

/* ---------------- helpers ---------------- */

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

type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture };

export function createGlSand(canvas: HTMLCanvasElement, opts: GlSandOpts): GlSandHandle {
  const glMaybe = canvas.getContext("webgl2", {
    alpha: false,
    premultipliedAlpha: true,
    antialias: false,
  });
  if (!glMaybe) throw new Error("webgl2 unavailable");
  const gl: WebGL2RenderingContext = glMaybe;

  let w = 0;
  let h = 0;
  let dpr = 1;

  const sceneProg = link(gl, QUAD_VERT, SCENE_FRAG);
  const pointProg = link(gl, POINT_VERT, POINT_FRAG);
  const brightProg = link(gl, QUAD_VERT, BRIGHT_FRAG);
  const blurProg = link(gl, QUAD_VERT, BLUR_FRAG);
  const finalProg = link(gl, QUAD_VERT, FINAL_FRAG);

  const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const sceneU = {
    res: U(sceneProg, "u_res"), time: U(sceneProg, "u_time"),
    remain: U(sceneProg, "u_remain"), dreamF: U(sceneProg, "u_dreamF"),
    dark: U(sceneProg, "u_dark"),
    bgTop: U(sceneProg, "u_bgTop"), bgBottom: U(sceneProg, "u_bgBottom"),
    glow: U(sceneProg, "u_glow"),
    floorT: U(sceneProg, "u_floorT"), floorB: U(sceneProg, "u_floorB"),
    sandHi: U(sceneProg, "u_sandHi"), sandLo: U(sceneProg, "u_sandLo"),
    accent: U(sceneProg, "u_accent"),
  };
  const pointU = {
    res: U(pointProg, "u_res"), sizeScale: U(pointProg, "u_sizeScale"),
    hi: U(pointProg, "u_hi"), lo: U(pointProg, "u_lo"), dark: U(pointProg, "u_dark"),
  };
  const brightU = { tex: U(brightProg, "u_tex"), threshold: U(brightProg, "u_threshold") };
  const blurU = { tex: U(blurProg, "u_tex"), dir: U(blurProg, "u_dir") };
  const finalU = {
    scene: U(finalProg, "u_scene"), bloom: U(finalProg, "u_bloom"),
    strength: U(finalProg, "u_strength"), time: U(finalProg, "u_time"),
  };

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
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  /* render targets */
  let sceneT: Target | null = null; // full res
  let bloomA: Target | null = null; // half res
  let bloomB: Target | null = null;
  let bw = 0;
  let bh = 0;

  function makeTarget(tw: number, th: number): Target {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!fbo || !tex) throw new Error("fbo alloc failed");
    return { fbo, tex };
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
    sceneT = makeTarget(canvas.width, canvas.height);
    bloomA = makeTarget(bw, bh);
    bloomB = makeTarget(bw, bh);
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
    const drips = Math.floor(dt * 260) + (Math.random() < 0.5 ? 1 : 0);
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

  function quadPass(prog: WebGLProgram) {
    gl.useProgram(prog);
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  function render(timeS: number) {
    if (!sceneT || !bloomA || !bloomB) return;
    const band = opts.getBand();
    const pal = MONO[band];
    const dark = pal.dark;
    const hi = hexVec(pal.sandHi);
    const lo = hexVec(pal.sandLo);
    const dreamF = opts.getDreamFrac();

    /* 1) シーンをフル解像度FBOへレイトレース */
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(sceneProg);
    gl.uniform2f(sceneU.res, canvas.width, canvas.height);
    gl.uniform1f(sceneU.time, timeS);
    gl.uniform1f(sceneU.remain, opts.getRemainFrac());
    gl.uniform1f(sceneU.dreamF, dreamF === null ? -1 : dreamF);
    gl.uniform1f(sceneU.dark, dark ? 1 : 0);
    const setv = (loc: WebGLUniformLocation | null, hex: string) => {
      const v = hexVec(hex);
      gl.uniform3f(loc, v[0], v[1], v[2]);
    };
    setv(sceneU.bgTop, pal.bgTop);
    setv(sceneU.bgBottom, pal.bgBottom);
    setv(sceneU.glow, pal.glow);
    setv(sceneU.floorT, pal.floorTop);
    setv(sceneU.floorB, pal.floorBottom);
    setv(sceneU.sandHi, pal.sandHi);
    setv(sceneU.sandLo, pal.sandLo);
    setv(sceneU.accent, pal.accent);
    quadPass(sceneProg);

    /* 2) パーティクルを同じFBOに重ねる */
    const count = fillBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * FLOATS_PER);
    gl.enable(gl.BLEND);
    gl.blendFunc(dark ? gl.ONE : gl.SRC_ALPHA, dark ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(pointProg);
    gl.uniform2f(pointU.res, canvas.width, canvas.height);
    gl.uniform1f(pointU.sizeScale, 1);
    gl.uniform3f(pointU.hi, hi[0], hi[1], hi[2]);
    gl.uniform3f(pointU.lo, lo[0], lo[1], lo[2]);
    gl.uniform1f(pointU.dark, dark ? 1 : 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);

    /* 3) 輝度抽出 → ぼかし */
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(brightProg);
    gl.uniform1i(brightU.tex, 0);
    gl.uniform1f(brightU.threshold, dark ? 0.8 : 0.9);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    quadPass(brightProg);

    gl.useProgram(blurProg);
    gl.uniform1i(blurU.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
    gl.uniform2f(blurU.dir, 1.7 / bw, 0);
    quadPass(blurProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
    gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
    gl.uniform2f(blurU.dir, 0, 1.7 / bh);
    quadPass(blurProg);

    /* 4) 合成 + フィルムグレイン */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(finalProg);
    gl.uniform1i(finalU.scene, 0);
    gl.uniform1i(finalU.bloom, 1);
    gl.uniform1f(finalU.strength, dark ? 0.55 : 0.15);
    gl.uniform1f(finalU.time, timeS);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
    gl.activeTexture(gl.TEXTURE0);
    quadPass(finalProg);
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
      render(t * 0.001);
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
