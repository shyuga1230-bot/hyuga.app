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
    /* コースティクス: ガラス球が光を集め、床に揺らめく光紋を落とす */
    vec2 cuv = (px - vec2(sphC().x, u_res.y * 0.85)) / (sphR() * vec2(0.9, 0.22));
    float cmask = exp(-dot(cuv, cuv));
    float cn = fbm(cuv * 7.0 + vec2(u_time * 0.15, -u_time * 0.11));
    float cn2 = fbm(cuv * 11.0 - vec2(u_time * 0.09, u_time * 0.13));
    float caust = pow(clamp(cn * cn2 * 3.0, 0.0, 1.0), 5.0);
    col += u_glow * caust * cmask * (u_dark > 0.5 ? 0.10 : 0.14);
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

  /* 縁の透過光: 砂の薄い縁を光が透ける */
  float rimT = smoothstep(rad * 0.7, rad, r);
  col += u_sandHi * rimT * (u_dark > 0.5 ? 0.22 : 0.10);

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
  /* シルエット際の透過光 */
  float silD = 1.0 - clamp(length(vec2(P1.x - c.x, P1.y - c.y)) / R, 0.0, 1.0);
  col += u_sandHi * exp(-silD * 7.0) * (u_dark > 0.5 ? 0.20 : 0.08);
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
      for (int i = 0; i < 64; i++) {
        float f = sandHeight(vec2(p.x - c.x, p.z)) - p.y;
        if (f < 1.2) { hit = 1.0; break; }
        p += rd * clamp(f * 0.75, 1.5, R * 0.25);
        vec3 lp = p - C3;
        if (dot(lp, lp) > R * R * 1.04) break;
      }

      if (hit > 0.0) {
        col = shadeSand(p, 0.96);
      } else {
        /* 砂に当たらない → 波長分散つきの屈折で背景が透ける */
        vec3 lp = P1 - C3;
        vec3 rdR = refract(rd0, N1, 1.0 / 1.105);
        vec3 rdB = refract(rd0, N1, 1.0 / 1.135);
        if (dot(rdR, rdR) < 0.001) rdR = rd;
        if (dot(rdB, rdB) < 0.001) rdB = rd;
        vec2 exG = (P1 + rd * (-2.0 * dot(rd, lp))).xy;
        vec2 exR = (P1 + rdR * (-2.0 * dot(rdR, lp))).xy;
        vec2 exB = (P1 + rdB * (-2.0 * dot(rdB, lp))).xy;
        col.r = background(exR).r;
        col.g = background(exG).g;
        col.b = background(exB).b;
        col *= (u_dark > 0.5 ? 0.45 : 0.80);
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
precision highp float;
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

/* ---------- GPU パーティクル(Transform Feedback) ---------- */

const SIM_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec4 a_posVel; /* x, y, vx, vy */
layout(location=1) in vec2 a_meta;   /* life, seed */
uniform float u_dt;
uniform float u_time;
uniform vec2 u_emit;
uniform float u_cut;
uniform float u_scale;
out vec4 v_posVel;
out vec2 v_meta;

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 pos = a_posVel.xy;
  vec2 vel = a_posVel.zw;
  float life = a_meta.x;
  float seed = a_meta.y;

  /* コホート単位で塊になって生まれる(まだらの source) */
  float cohort = floor(seed * 48.0);
  float cycle = floor(u_time * 2.6);
  float active = step(0.42, hash2(vec2(cohort, cycle)));

  if (life <= 0.0) {
    if (active > 0.5 && hash2(vec2(seed, u_time)) < 0.10) {
      float r1 = hash2(vec2(seed, cycle + 0.7));
      float r2 = hash2(vec2(seed * 1.7, u_time));
      pos = u_emit + vec2((r1 - 0.5) * 7.0, r2 * 4.0) * u_scale;
      vel = vec2((hash2(vec2(seed, 3.3)) - 0.5) * 14.0, 25.0 + r2 * 70.0) * u_scale;
      life = 1.0;
    }
  } else {
    vel.y += 320.0 * u_scale * u_dt;
    float turb = hash2(floor(pos * 0.05 / u_scale) + vec2(floor(u_time * 3.0), seed)) - 0.5;
    vel.x += turb * 300.0 * u_scale * u_dt;
    pos += vel * u_dt;
    if (pos.y > u_cut) life = 0.0;
  }
  v_posVel = vec4(pos, vel);
  v_meta = vec2(life, seed);
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

const SIM_FRAG = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(0.0); }`;

const SPILL_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec4 a_posVel;
layout(location=1) in vec2 a_meta;
uniform vec2 u_res;
uniform float u_scale;
uniform float u_fadeStart;
uniform float u_fadeEnd;
out float v_alpha;
out float v_tint;
float hash1(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  vec2 pos = a_posVel.xy;
  float life = a_meta.x;
  float seed = a_meta.y;
  vec2 clip = (pos / u_res * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  float fade = pos.y < u_fadeStart ? 1.0 : max(0.0, 1.0 - (pos.y - u_fadeStart) / (u_fadeEnd - u_fadeStart));
  v_alpha = life > 0.5 ? fade * 0.30 : 0.0;
  v_tint = hash1(seed * 17.31);
  gl_PointSize = (1.6 + hash1(seed * 7.7) * 3.2) * u_scale * (life > 0.5 ? 1.0 : 0.0);
}`;

const BRIGHT_FRAG = `#version 300 es
precision highp float;
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
precision highp float;
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

const COPY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  outColor = texture(u_tex, v_uv);
}`;

const FINAL_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_dof;
uniform sampler2D u_bloom1;
uniform sampler2D u_bloom2;
uniform sampler2D u_bloom3;
uniform sampler2D u_streak;
uniform float u_strength1;
uniform float u_strength2;
uniform float u_strength3;
uniform float u_strength4;
uniform float u_exposure;
uniform float u_time;
uniform vec2 u_res;
uniform float u_cy;
uniform float u_R;
out vec4 outColor;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  float py = (1.0 - v_uv.y) * u_res.y;
  /* 色収差(端でわずかに) */
  vec2 cdir = v_uv - 0.5;
  float cab = dot(cdir, cdir) * 3.0 / u_res.x;
  vec3 c;
  c.r = texture(u_scene, v_uv + cdir * cab).r;
  c.g = texture(u_scene, v_uv).g;
  c.b = texture(u_scene, v_uv - cdir * cab).b;
  /* チルトシフト被写界深度: 球にピント、床と壁は柔らかくボケる */
  float coc = smoothstep(u_R * 1.35, u_R * 3.2, abs(py - u_cy));
  vec3 blurc = texture(u_dof, v_uv).rgb;
  c = mix(c, blurc, coc * 0.45);
  /* 三段ブルーム(芯 + にじみ + 大気) */
  c += texture(u_bloom1, v_uv).rgb * u_strength1;
  c += texture(u_bloom2, v_uv).rgb * u_strength2;
  c += texture(u_bloom3, v_uv).rgb * u_strength3;
  /* アナモルフィック・ストリーク(水平の光条) */
  c += texture(u_streak, v_uv).rgb * vec3(1.0, 0.98, 0.92) * u_strength4;
  /* ACES トーンマップ */
  c = aces(c * u_exposure);
  /* フィルムグレイン(バンディングのディザを兼ねる) */
  c += (hash12(v_uv * 913.0 + fract(u_time) * 71.0) - 0.5) * 0.024;
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

function linkTF(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
  varyings: string[],
): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.transformFeedbackVaryings(p, varyings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("tf program link: " + gl.getProgramInfoLog(p));
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

  /* HDR(16bit float)が使えるならフルHDRパイプラインに */
  const hdrOK = !!gl.getExtension("EXT_color_buffer_float");

  const sceneProg = link(gl, QUAD_VERT, SCENE_FRAG);
  const pointProg = link(gl, POINT_VERT, POINT_FRAG);
  const brightProg = link(gl, QUAD_VERT, BRIGHT_FRAG);
  const blurProg = link(gl, QUAD_VERT, BLUR_FRAG);
  const copyProg = link(gl, QUAD_VERT, COPY_FRAG);
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
  const copyU = { tex: U(copyProg, "u_tex") };
  const finalU = {
    scene: U(finalProg, "u_scene"), dof: U(finalProg, "u_dof"),
    bloom1: U(finalProg, "u_bloom1"), bloom2: U(finalProg, "u_bloom2"),
    bloom3: U(finalProg, "u_bloom3"), streak: U(finalProg, "u_streak"),
    strength1: U(finalProg, "u_strength1"), strength2: U(finalProg, "u_strength2"),
    strength3: U(finalProg, "u_strength3"), strength4: U(finalProg, "u_strength4"),
    exposure: U(finalProg, "u_exposure"), time: U(finalProg, "u_time"),
    res: U(finalProg, "u_res"), cy: U(finalProg, "u_cy"), R: U(finalProg, "u_R"),
  };

  /* ---------- GPU パーティクル(Transform Feedback)。失敗時は CPU にフォールバック ---------- */
  const SPILL_N = 49152;
  let gpuOK = false;
  let simProg: WebGLProgram | null = null;
  let spillProg: WebGLProgram | null = null;
  let pBuf: [WebGLBuffer, WebGLBuffer] | null = null;
  let vaoSim: [WebGLVertexArrayObject, WebGLVertexArrayObject] | null = null;
  let tfObj: WebGLTransformFeedback | null = null;
  let cur = 0;
  let simDt = 0.016;
  let simU: {
    dt: WebGLUniformLocation | null; time: WebGLUniformLocation | null;
    emit: WebGLUniformLocation | null; cut: WebGLUniformLocation | null;
    scale: WebGLUniformLocation | null;
  } | null = null;
  let spillU: {
    res: WebGLUniformLocation | null; scale: WebGLUniformLocation | null;
    fadeStart: WebGLUniformLocation | null; fadeEnd: WebGLUniformLocation | null;
    hi: WebGLUniformLocation | null; lo: WebGLUniformLocation | null;
    dark: WebGLUniformLocation | null;
  } | null = null;
  try {
    simProg = linkTF(gl, SIM_VERT, SIM_FRAG, ["v_posVel", "v_meta"]);
    spillProg = link(gl, SPILL_VERT, POINT_FRAG);
    const init = new Float32Array(SPILL_N * 6);
    for (let i = 0; i < SPILL_N; i++) init[i * 6 + 5] = Math.random();
    const mkBuf = () => {
      const b = gl.createBuffer();
      if (!b) throw new Error("buffer alloc failed");
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
      return b;
    };
    const b0 = mkBuf();
    const b1 = mkBuf();
    pBuf = [b0, b1];
    const mkVao = (buf: WebGLBuffer) => {
      const v = gl.createVertexArray();
      if (!v) throw new Error("vao alloc failed");
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
      gl.bindVertexArray(null);
      return v;
    };
    vaoSim = [mkVao(b0), mkVao(b1)];
    tfObj = gl.createTransformFeedback();
    if (!tfObj) throw new Error("tf alloc failed");
    simU = {
      dt: U(simProg, "u_dt"), time: U(simProg, "u_time"),
      emit: U(simProg, "u_emit"), cut: U(simProg, "u_cut"),
      scale: U(simProg, "u_scale"),
    };
    spillU = {
      res: U(spillProg, "u_res"), scale: U(spillProg, "u_scale"),
      fadeStart: U(spillProg, "u_fadeStart"), fadeEnd: U(spillProg, "u_fadeEnd"),
      hi: U(spillProg, "u_hi"), lo: U(spillProg, "u_lo"), dark: U(spillProg, "u_dark"),
    };
    gpuOK = true;
  } catch {
    gpuOK = false;
  }

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
  let sceneT: Target | null = null; // フル解像度(SSAA込み)
  let dofA: Target | null = null;   // 1/2: 被写界深度用のぼかし
  let dofB: Target | null = null;
  let bloomA: Target | null = null; // 1/2: 近距離ブルーム
  let bloomB: Target | null = null;
  let bloomQA: Target | null = null; // 1/4: 広域ブルーム
  let bloomQB: Target | null = null;
  let bloomOA: Target | null = null; // 1/8: 大気のにじみ
  let bloomOB: Target | null = null;
  let streakA: Target | null = null; // 1/2: アナモルフィック光条
  let streakB: Target | null = null;
  let bw = 0;
  let bh = 0;
  let qw = 0;
  let qh = 0;
  let ow = 0;
  let oh = 0;

  function makeTarget(tw: number, th: number): Target {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hdrOK) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, tw, th, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
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
    w = host.clientWidth;
    h = host.clientHeight;
    /* スーパーサンプリング: ネイティブDPR × 1.6、ピクセル予算内で自動調整 */
    const SS = 1.6;
    const budget = 9_000_000;
    let scale = Math.min(window.devicePixelRatio || 1, 3) * SS;
    if (w * h * scale * scale > budget) {
      scale = Math.sqrt(budget / (w * h));
    }
    dpr = scale;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    bw = Math.max(1, Math.floor(canvas.width / 2));
    bh = Math.max(1, Math.floor(canvas.height / 2));
    qw = Math.max(1, Math.floor(canvas.width / 4));
    qh = Math.max(1, Math.floor(canvas.height / 4));
    ow = Math.max(1, Math.floor(canvas.width / 8));
    oh = Math.max(1, Math.floor(canvas.height / 8));
    sceneT = makeTarget(canvas.width, canvas.height);
    dofA = makeTarget(bw, bh);
    dofB = makeTarget(bw, bh);
    bloomA = makeTarget(bw, bh);
    bloomB = makeTarget(bw, bh);
    bloomQA = makeTarget(qw, qh);
    bloomQB = makeTarget(qw, qh);
    bloomOA = makeTarget(ow, oh);
    bloomOB = makeTarget(ow, oh);
    streakA = makeTarget(bw, bh);
    streakB = makeTarget(bw, bh);
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
    simDt = dt;
    const g = sphereGeom(w, h);
    if (!gpuOK) {
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
    }

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
    if (!gpuOK) {
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
    }
    /* 渦はすり鉢の3D曲面に沿わせて、シーンと同じ見下ろしカメラで投影する */
    const rad3 = g.R * Math.sqrt(Math.max(0.05, 1 - (d1 / g.R) * (d1 / g.R)));
    const fw = rad3 * 0.55;
    const fd = rad3 * 0.55;
    const tanT = Math.tan(0.22);
    void hc;
    void sry;
    for (const v of vortex) {
      const xw = Math.cos(v.theta) * v.r * rad3;
      const zw = Math.sin(v.theta) * v.r * rad3;
      const r3 = Math.hypot(xw, zw);
      const yw = levelY + fd * Math.exp(-(r3 * r3) / (fw * fw)) - 1.5;
      const o = n * FLOATS_PER;
      data[o] = (g.cx + xw) * dpr;
      data[o + 1] = (yw - tanT * zw) * dpr;
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

    /* 2a) GPUパーティクル: Transform Feedback で約5万粒をGPU上で更新 */
    if (gpuOK && simProg && spillProg && pBuf && vaoSim && tfObj && simU && spillU) {
      const g2 = sphereGeom(w, h);
      gl.useProgram(simProg);
      gl.uniform1f(simU.dt, Math.min(0.05, simDt));
      gl.uniform1f(simU.time, timeS);
      gl.uniform2f(simU.emit, g2.cx * dpr, g2.botY * dpr);
      gl.uniform1f(simU.cut, h * 0.8 * dpr);
      gl.uniform1f(simU.scale, dpr);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tfObj);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, pBuf[1 - cur]);
      gl.bindVertexArray(vaoSim[cur]);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, SPILL_N);
      gl.endTransformFeedback();
      gl.bindVertexArray(null);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      gl.disable(gl.RASTERIZER_DISCARD);
      cur = 1 - cur;

      gl.enable(gl.BLEND);
      gl.blendFunc(dark ? gl.ONE : gl.SRC_ALPHA, dark ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(spillProg);
      gl.uniform2f(spillU.res, canvas.width, canvas.height);
      gl.uniform1f(spillU.scale, dpr);
      gl.uniform1f(spillU.fadeStart, h * 0.7 * dpr);
      gl.uniform1f(spillU.fadeEnd, h * 0.795 * dpr);
      gl.uniform3f(spillU.hi, hi[0], hi[1], hi[2]);
      gl.uniform3f(spillU.lo, lo[0], lo[1], lo[2]);
      gl.uniform1f(spillU.dark, dark ? 1 : 0);
      gl.bindVertexArray(vaoSim[cur]);
      gl.drawArrays(gl.POINTS, 0, SPILL_N);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }

    /* 2b) CPUパーティクル(渦 + フォールバック時のこぼれ砂) */
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

    /* 3) 被写界深度用: シーンを1/2に落としてぼかす */
    if (!dofA || !dofB || !bloomQA || !bloomQB) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dofA.fbo);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(copyProg);
    gl.uniform1i(copyU.tex, 0);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    quadPass(copyProg);
    gl.useProgram(blurProg);
    gl.uniform1i(blurU.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dofB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, dofA.tex);
    gl.uniform2f(blurU.dir, 2.2 / bw, 0);
    quadPass(blurProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dofA.fbo);
    gl.bindTexture(gl.TEXTURE_2D, dofB.tex);
    gl.uniform2f(blurU.dir, 0, 2.2 / bh);
    quadPass(blurProg);

    /* 4) 輝度抽出 → 近距離ブルーム(1/2) */
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(brightProg);
    gl.uniform1i(brightU.tex, 0);
    gl.uniform1f(brightU.threshold, dark ? 0.75 : 0.9);
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

    /* 5) 広域ブルーム(1/4) */
    if (!bloomOA || !bloomOB || !streakA || !streakB) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomQA.fbo);
    gl.viewport(0, 0, qw, qh);
    gl.useProgram(copyProg);
    gl.uniform1i(copyU.tex, 0);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
    quadPass(copyProg);
    gl.useProgram(blurProg);
    gl.uniform1i(blurU.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomQB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, bloomQA.tex);
    gl.uniform2f(blurU.dir, 2.4 / qw, 0);
    quadPass(blurProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomQA.fbo);
    gl.bindTexture(gl.TEXTURE_2D, bloomQB.tex);
    gl.uniform2f(blurU.dir, 0, 2.4 / qh);
    quadPass(blurProg);

    /* 5b) 大気のにじみ(1/8) */
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomOA.fbo);
    gl.viewport(0, 0, ow, oh);
    gl.useProgram(copyProg);
    gl.uniform1i(copyU.tex, 0);
    gl.bindTexture(gl.TEXTURE_2D, bloomQA.tex);
    quadPass(copyProg);
    gl.useProgram(blurProg);
    gl.uniform1i(blurU.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomOB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, bloomOA.tex);
    gl.uniform2f(blurU.dir, 2.6 / ow, 0);
    quadPass(blurProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomOA.fbo);
    gl.bindTexture(gl.TEXTURE_2D, bloomOB.tex);
    gl.uniform2f(blurU.dir, 0, 2.6 / oh);
    quadPass(blurProg);

    /* 5c) アナモルフィック・ストリーク(1/2, 水平にだけ強く伸ばす) */
    gl.bindFramebuffer(gl.FRAMEBUFFER, streakA.fbo);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(copyProg);
    gl.uniform1i(copyU.tex, 0);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
    quadPass(copyProg);
    gl.useProgram(blurProg);
    gl.uniform1i(blurU.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, streakB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, streakA.tex);
    gl.uniform2f(blurU.dir, 6.0 / bw, 0);
    quadPass(blurProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, streakA.fbo);
    gl.bindTexture(gl.TEXTURE_2D, streakB.tex);
    gl.uniform2f(blurU.dir, 14.0 / bw, 0);
    quadPass(blurProg);

    /* 6) 合成: DoF + 二段ブルーム + ACES + 色収差 + グレイン */
    const g = sphereGeom(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(finalProg);
    gl.uniform1i(finalU.scene, 0);
    gl.uniform1i(finalU.dof, 1);
    gl.uniform1i(finalU.bloom1, 2);
    gl.uniform1i(finalU.bloom2, 3);
    gl.uniform1i(finalU.bloom3, 4);
    gl.uniform1i(finalU.streak, 5);
    gl.uniform1f(finalU.strength1, dark ? 0.4 : 0.1);
    gl.uniform1f(finalU.strength2, dark ? 0.3 : 0.1);
    gl.uniform1f(finalU.strength3, dark ? 0.25 : 0.06);
    gl.uniform1f(finalU.strength4, dark ? 0.3 : 0.05);
    gl.uniform1f(finalU.exposure, dark ? 1.1 : 1.0);
    gl.uniform1f(finalU.time, timeS);
    gl.uniform2f(finalU.res, canvas.width, canvas.height);
    gl.uniform1f(finalU.cy, g.cy * dpr);
    gl.uniform1f(finalU.R, g.R * dpr);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dofA.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, bloomQA.tex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, bloomOA.tex);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, streakA.tex);
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
