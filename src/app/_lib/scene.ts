import { MONO, type Band } from "./palette";

/**
 * 無白のメイン画面レンダラ(Canvas 2D)。
 * 宙に浮かぶ透明なガラス球の中に、残り時間ぶんの砂が満ちている。
 * 球の底から砂が抜け、塊になりほどけ、まだらに散らばりながら
 * 床に届く前に消える。どこにも積もらない。
 */

export type SceneOpts = {
  getRemainFrac: () => number;
  /** 各目標に到達する瞬間の残り割合(0..1) */
  getDreamFracs: () => number[];
  getBand: () => Band;
  /** WebGL レイヤーが落下砂を描くときは false(2D 側の砂は止める) */
  drawSpills?: boolean;
};

export type SceneHandle = {
  destroy: () => void;
};

export function sphereGeom(w: number, h: number) {
  const R = Math.min(h * 0.2, w * 0.3);
  const cy = h * 0.44;
  return { cx: w * 0.5, cy, R, botY: cy + R, floorY: h * 0.82 };
}

type Spill = { x: number; y: number; vx: number; vy: number; s: number; t: number };
type Speck = { u: number; v: number; ph: number; sp: number; a: number };

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mix(h1: string, h2: string, t: number): string {
  const a = parseInt(h1.slice(1), 16);
  const b = parseInt(h2.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

export function createScene(canvas: HTMLCanvasElement, opts: SceneOpts): SceneHandle {
  const doSpills = opts.drawSpills !== false;
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  let ctx: CanvasRenderingContext2D;
  let w = 0;
  let h = 0;
  let spills: Spill[] = [];
  let burstT = 0;
  const specks: Speck[] = [];
  for (let i = 0; i < 70; i++) {
    const ang = rand(0, Math.PI * 2);
    const rr = Math.sqrt(Math.random());
    specks.push({
      u: Math.cos(ang) * rr,
      v: Math.sin(ang) * rr,
      ph: rand(0, Math.PI * 2),
      sp: rand(0.5, 1.6),
      a: rand(0.2, 0.8),
    });
  }

  function fit() {
    const host = canvas.parentElement ?? document.body;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = host.clientWidth;
    h = host.clientHeight;
    canvas.width = Math.max(1, w * dpr);
    canvas.height = Math.max(1, h * dpr);
    const c = canvas.getContext("2d");
    if (!c) throw new Error("canvas 2d context unavailable");
    ctx = c;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnBurst(g: ReturnType<typeof sphereGeom>) {
    const n = 2 + Math.floor(Math.random() * 7);
    for (let i = 0; i < n; i++) {
      spills.push({
        x: g.cx + rand(-3.5, 3.5),
        y: g.botY + rand(0, 4),
        vx: rand(-6, 6),
        vy: rand(25, 85),
        s: rand(0.7, 2.1),
        t: Math.random(),
      });
    }
  }

  function draw(now: number) {
    const pal = MONO[opts.getBand()];
    const dark = pal.dark;
    const g = sphereGeom(w, h);
    const { cx, cy, R, botY, floorY } = g;
    const lineC = dark ? "#F5F1E6" : "#33322E";

    /* 壁と床(白黒はフラットに、光は最小限) */
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, pal.bgTop);
    wall.addColorStop(1, pal.bgBottom);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, floorY);
    const gl = ctx.createRadialGradient(cx, h * 0.26, 0, cx, h * 0.26, w * 0.5);
    gl.addColorStop(0, hexA(pal.glow, dark ? 0.05 : 0.07));
    gl.addColorStop(1, hexA(pal.glow, 0));
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, w, floorY);
    const floor = ctx.createLinearGradient(0, floorY, 0, h);
    floor.addColorStop(0, pal.floorTop);
    floor.addColorStop(1, pal.floorBottom);
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorY, w, h - floorY);
    ctx.fillStyle = hexA(dark ? "#FFF6E0" : "#2A2118", dark ? 0.03 : 0.05);
    ctx.fillRect(0, floorY, w, 1);

    /* 浮遊する球の、床に落ちる柔らかい影 */
    const sh = ctx.createRadialGradient(
      cx + w * 0.02, h * 0.85, 0,
      cx + w * 0.02, h * 0.85, R * 1.1,
    );
    sh.addColorStop(0, `rgba(0,0,0,${dark ? 0.22 : 0.14})`);
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.scale(1, 0.16);
    ctx.translate(0, (h * 0.85) / 0.16 - h * 0.85);
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(cx + w * 0.02, h * 0.85, R * 1.1, 0, 7);
    ctx.fill();
    ctx.restore();

    /* 砂(球の内側にクリップ)— 残量ぶんの高さまで満ちている */
    const f = opts.getRemainFrac();
    const levelY = cy + R - 2 * R * f;
    const d1 = Math.abs(levelY - cy);
    const hc = R * Math.sqrt(Math.max(0.05, 1 - (d1 / R) * (d1 / R))) * 0.965;
    const sry = hc * 0.2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.965, 0, 7);
    ctx.clip();
    const sandG = ctx.createLinearGradient(0, levelY, 0, botY);
    sandG.addColorStop(0, pal.sandLo);
    sandG.addColorStop(1, mix(pal.sandLo, "#000000", dark ? 0.3 : 0.15));
    ctx.fillStyle = sandG;
    ctx.fillRect(cx - R, levelY, 2 * R, botY - levelY + 2);
    /* 砂中のわずかな地層 */
    ctx.strokeStyle = hexA(pal.sandHi, dark ? 0.09 : 0.12);
    ctx.lineWidth = 1;
    for (let li = 1; li < 4; li++) {
      const ly = levelY + ((botY - levelY) * li) / 4;
      const dd = Math.abs(ly - cy);
      const hw = R * Math.sqrt(Math.max(0, 1 - (dd / R) * (dd / R))) * 0.94;
      ctx.beginPath();
      ctx.ellipse(cx, ly, hw, hw * 0.18, 0, 0.3, 2.84);
      ctx.stroke();
    }
    /* 表面 */
    const surf = ctx.createRadialGradient(cx - hc * 0.3, levelY - sry * 0.5, 0, cx, levelY, hc);
    surf.addColorStop(0, pal.sandHi);
    surf.addColorStop(1, pal.sandLo);
    ctx.fillStyle = surf;
    ctx.beginPath();
    ctx.ellipse(cx, levelY, hc, sry, 0, 0, 7);
    ctx.fill();
    /* すり鉢の窪みと渦 */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, levelY, hc, sry, 0, 0, 7);
    ctx.clip();
    const fn = ctx.createRadialGradient(cx, levelY, 0, cx, levelY, hc * 0.62);
    fn.addColorStop(0, "rgba(0,0,0,0.50)");
    fn.addColorStop(0.35, "rgba(0,0,0,0.22)");
    fn.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fn;
    ctx.beginPath();
    ctx.ellipse(cx, levelY, hc, sry, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = hexA(pal.sandLo, 0.6);
    ctx.beginPath();
    ctx.ellipse(cx, levelY, hc * 0.42, sry * 0.42, 0, 0.6, 4.2);
    ctx.stroke();
    ctx.strokeStyle = hexA(pal.sandLo, 0.35);
    ctx.beginPath();
    ctx.ellipse(cx, levelY, hc * 0.66, sry * 0.66, 0, 2.4, 6.0);
    ctx.stroke();
    ctx.restore();
    /* 中央の吸い込み孔 */
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.ellipse(cx, levelY, hc * 0.05, sry * 0.09, 0, 0, 7);
    ctx.fill();
    /* 砂面のきらめき */
    if (dark) ctx.globalCompositeOperation = "lighter";
    for (const p of specks) {
      const radN = Math.hypot(p.u, p.v);
      if (radN < 0.18) continue;
      const px = cx + p.u * hc;
      const py = levelY + p.v * sry;
      const a = p.a * (0.55 + 0.45 * Math.sin(now * p.sp + p.ph)) * (dark ? 0.5 : 0.18);
      ctx.fillStyle = hexA(dark ? pal.sandHi : "#000000", a);
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();

    /* ガラスの質感 */
    const gb = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.38, R * 0.1, cx, cy, R);
    gb.addColorStop(0, hexA("#FFFFFF", dark ? 0.1 : 0.16));
    gb.addColorStop(0.55, hexA("#FFFFFF", dark ? 0.02 : 0.04));
    gb.addColorStop(1, hexA("#FFFFFF", dark ? 0.05 : 0.02));
    ctx.fillStyle = gb;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.985, 0, 7);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = hexA(lineC, dark ? 0.55 : 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 0.7, Math.PI * 1.65);
    ctx.stroke();
    ctx.strokeStyle = hexA(lineC, dark ? 0.16 : 0.22);
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 1.65, Math.PI * 2.7);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx - R * 0.42, cy - R * 0.44);
    ctx.rotate(-0.7);
    const hl = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
    hl.addColorStop(0, hexA("#FFFFFF", dark ? 0.35 : 0.5));
    hl.addColorStop(1, hexA("#FFFFFF", 0));
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.3, R * 0.12, 0, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = hexA("#FFFFFF", dark ? 0.1 : 0.12);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, Math.PI * 0.22, Math.PI * 0.62);
    ctx.stroke();
    /* 排出口(底の小さな口) */
    ctx.fillStyle = hexA(lineC, 0.35);
    ctx.beginPath();
    ctx.ellipse(cx, botY, Math.max(4, w * 0.007), Math.max(3, h * 0.005), 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.ellipse(cx, botY - 1, Math.max(2.5, w * 0.004), Math.max(2, h * 0.003), 0, 0, 7);
    ctx.fill();

    /* 夢のリング(ガラスに刻まれた琥珀の緯線)— 砂面がここまで沈んだ日が、その年齢 */
    for (const fD of opts.getDreamFracs()) {
      if (!(fD > 0 && fD < 1)) continue;
      const dyL = cy + R - 2 * R * fD;
      const ddL = Math.abs(dyL - cy);
      const hcL = R * Math.sqrt(Math.max(0.05, 1 - (ddL / R) * (ddL / R)));
      if (dark) ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = hexA(pal.accent, dark ? 0.7 : 0.85);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, dyL, hcL, hcL * 0.2, 0, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = hexA(pal.accent, dark ? 0.22 : 0.32);
      ctx.beginPath();
      ctx.ellipse(cx, dyL, hcL, hcL * 0.2, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      if (dark) {
        const lg = ctx.createRadialGradient(cx - hcL, dyL, 0, cx - hcL, dyL, 7);
        lg.addColorStop(0, hexA(pal.accent, 0.85));
        lg.addColorStop(1, hexA(pal.accent, 0));
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(cx - hcL, dyL, 7, 0, 7);
        ctx.fill();
      } else {
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.arc(cx - hcL, dyL, 2, 0, 7);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    /* 中央の芯(かすかな流れの気配) */
    const core = ctx.createLinearGradient(0, botY, 0, h * 0.79);
    core.addColorStop(0, hexA(pal.sandHi, dark ? 0.14 : 0.2));
    core.addColorStop(1, hexA(pal.sandHi, 0));
    ctx.fillStyle = core;
    ctx.fillRect(cx - 1.2, botY, 2.4, h * 0.79 - botY);

    /* まだらに散らばり落ちる砂(WebGL レイヤーがあるときはそちらに任せる) */
    if (dark) ctx.globalCompositeOperation = "lighter";
    const fadeStart = h * 0.7;
    const fadeEnd = h * 0.795;
    for (const s of doSpills ? spills : []) {
      const a = s.y < fadeStart ? 1 : Math.max(0, 1 - (s.y - fadeStart) / (fadeEnd - fadeStart));
      if (a <= 0) continue;
      if (dark) {
        ctx.strokeStyle = hexA(pal.sandHi, 0.13 * a);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * 0.05, s.y - s.vy * 0.05);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        const gg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.s * 2.3);
        gg.addColorStop(0, hexA(pal.sandHi, 0.9 * a));
        gg.addColorStop(1, hexA(pal.sandHi, 0));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.s * 2.3, 0, 7);
        ctx.fill();
        ctx.fillStyle = mix(pal.sandHi, pal.sandLo, s.t);
      } else {
        ctx.fillStyle = hexA(pal.sandLo, 0.85 * a);
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.s * 0.75, 0, 7);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    /* ごく淡いビネット */
    const v = ctx.createRadialGradient(w * 0.5, h * 0.46, h * 0.3, w * 0.5, h * 0.46, h * 0.95);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${dark ? 0.15 : 0.05})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function step(dt: number) {
    if (!doSpills) return;
    const g = sphereGeom(w, h);
    burstT -= dt;
    if (burstT <= 0) {
      spawnBurst(g);
      burstT = rand(0.1, 0.5);
    }
    if (Math.random() < dt * 5) {
      spills.push({
        x: g.cx + rand(-2, 2),
        y: g.botY,
        vx: rand(-4, 4),
        vy: rand(20, 60),
        s: rand(0.6, 1.4),
        t: Math.random(),
      });
    }
    for (const s of spills) {
      s.vy += 300 * dt;
      s.vx += rand(-75, 75) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    spills = spills.filter((s) => s.y < h * 0.8);
  }

  fit();

  let raf = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let last = performance.now();
  let destroyed = false;

  if (reduced) {
    for (let i = 0; i < 120; i++) step(0.016);
    draw(performance.now() * 0.001);
    interval = setInterval(() => draw(performance.now() * 0.001), 1000);
  } else {
    const loop = (t: number) => {
      if (destroyed) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!document.hidden) {
        step(dt);
        draw(t * 0.001);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fit();
      spills = [];
      draw(performance.now() * 0.001);
    }, 150);
  };
  window.addEventListener("resize", onResize);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      if (interval) clearInterval(interval);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    },
  };
}
