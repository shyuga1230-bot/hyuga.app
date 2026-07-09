"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createGlSand, type GlSandHandle } from "../_lib/glsand";
import { bandForDate, MONO, type Band } from "../_lib/palette";
import { createScene, sphereGeom } from "../_lib/scene";
import { createSound, type SoundHandle } from "../_lib/sound";
import { saveProfile, type Profile } from "../_lib/store";
import {
  DAY_MS,
  dreamFrac,
  dreamRemainDays,
  nf,
  remainDays,
  remainFrac,
  remainPct,
} from "../_lib/time";

const IDLE_MS = 45_000;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
const MUTE_KEY = "muhaku.sound.v1";

/* 初回リビール: 満ちる → 一拍 → 生きたぶんが一気に抜ける → 残りだけが残る */
const REVEAL_FILL = 4000;
const REVEAL_HOLD = 1200;
const REVEAL_DRAIN = 2600;
const REVEAL_TOTAL = REVEAL_FILL + REVEAL_HOLD + REVEAL_DRAIN;

function revealAnim(
  t0: number | null,
  actual: number,
): { f: number; spill: number } {
  if (t0 === null) return { f: actual, spill: 1 };
  const t = performance.now() - t0;
  if (t < REVEAL_FILL) {
    const k = t / REVEAL_FILL;
    return { f: k * k * (3 - 2 * k), spill: 0 };
  }
  if (t < REVEAL_FILL + REVEAL_HOLD) return { f: 1, spill: 0 };
  if (t < REVEAL_TOTAL) {
    const k = (t - REVEAL_FILL - REVEAL_HOLD) / REVEAL_DRAIN;
    const e = 1 - Math.pow(1 - k, 3);
    return { f: 1 - e * (1 - actual), spill: 4 };
  }
  return { f: actual, spill: 1 };
}

type ZoomLevel = "life" | "year" | "day" | "sec";

function zoomLevel(z: number): ZoomLevel {
  if (z >= 5.5) return "sec";
  if (z >= 2.8) return "day";
  if (z >= 1.2) return "year";
  return "life";
}

const RAIL = [
  { label: "秒", top: 8, level: "sec" as ZoomLevel },
  { label: "日", top: 36, level: "day" as ZoomLevel },
  { label: "年", top: 64, level: "year" as ZoomLevel },
  { label: "生", top: 92, level: "life" as ZoomLevel },
];

export default function MainScene({
  profile,
  reveal,
  onReset,
}: {
  profile: Profile;
  reveal: boolean;
  onReset: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const [band, setBand] = useState<Band>(() => bandForDate(new Date()));
  const [pctMain, setPctMain] = useState("--.-");
  const [pctTail, setPctTail] = useState("------");
  const [days, setDays] = useState("--,---");
  const [yearDays, setYearDays] = useState("---");
  const [todayLeft, setTodayLeft] = useState("--時間--分--秒");
  const [dreamMeta, setDreamMeta] = useState<
    { label: string; days: string; y: number }[]
  >([]);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalLabel, setGoalLabel] = useState("");
  const [goalAge, setGoalAge] = useState("");
  const [goalErr, setGoalErr] = useState("");
  const [idle, setIdle] = useState(false);
  const [revealVisible, setRevealVisible] = useState(false);
  const [cinematic, setCinematic] = useState(reveal);
  const [confirming, setConfirming] = useState(false);
  const [zoomZ, setZoomZ] = useState(1);
  const [hintGone, setHintGone] = useState(false);
  const [muted, setMuted] = useState(false);
  const zoomTargetRef = useRef(1);
  const glHandleRef = useRef<GlSandHandle | null>(null);
  const soundRef = useRef<SoundHandle | null>(null);
  const revealT0 = useRef<number | null>(null);

  const pal = MONO[band];

  /* Canvas シーン(+可能なら WebGL パーティクルレイヤー) */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reveal && !reduced) revealT0.current = performance.now();

    const getDreams = () =>
      profileRef.current.dreams.map((d) => dreamFrac(profileRef.current, d));
    const getFrac = () =>
      revealAnim(revealT0.current, remainFrac(profileRef.current)).f;
    const getSpill = () =>
      revealAnim(revealT0.current, remainFrac(profileRef.current)).spill;

    let glSand: ReturnType<typeof createGlSand> | null = null;
    if (!reduced && glCanvasRef.current) {
      try {
        glSand = createGlSand(glCanvasRef.current, {
          getRemainFrac: getFrac,
          getDreamFracs: getDreams,
          getBand: () => bandForDate(new Date()),
          getZoomTarget: () => zoomTargetRef.current,
          getSpillScale: getSpill,
        });
      } catch {
        glSand = null; // WebGL2 が無ければ Canvas 2D にフォールバック
      }
    }
    glHandleRef.current = glSand;
    const zoomPoll = setInterval(() => {
      if (glHandleRef.current) setZoomZ(glHandleRef.current.getZoom());
    }, 150);

    /* 環境音 */
    const storedMute =
      typeof window !== "undefined" &&
      window.localStorage.getItem(MUTE_KEY) === "off";
    const sound = createSound({
      getBand: () => bandForDate(new Date()),
      getZoom: () => glHandleRef.current?.getZoom() ?? 1,
      initiallyMuted: storedMute,
    });
    soundRef.current = sound;
    if (storedMute) setTimeout(() => setMuted(true), 0);

    /* GL が使えるときはシーン全体を GL が描く。2D はフォールバック専用 */
    canvas.style.display = glSand ? "none" : "";
    if (glCanvasRef.current) {
      glCanvasRef.current.style.display = glSand ? "" : "none";
    }
    let scene: ReturnType<typeof createScene> | null = null;
    if (!glSand) {
      scene = createScene(canvas, {
        getRemainFrac: getFrac,
        getDreamFracs: getDreams,
        getBand: () => bandForDate(new Date()),
        drawSpills: true,
      });
    }
    return () => {
      clearInterval(zoomPoll);
      glHandleRef.current = null;
      scene?.destroy();
      glSand?.destroy();
      sound.destroy();
      soundRef.current = null;
    };
  }, [reveal]);

  /* 連続ズーム: ホイールとピンチ */
  useEffect(() => {
    const bump = (factor: number) => {
      zoomTargetRef.current = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, zoomTargetRef.current * factor),
      );
      setHintGone(true);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      bump(Math.exp(-e.deltaY * 0.0014));
    };
    const pts = new Map<number, { x: number; y: number }>();
    let lastDist = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist > 0) bump(dist / lastDist);
        lastDist = dist;
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      lastDist = 0;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  /* 減り続けるカウンター */
  useEffect(() => {
    const fast = setInterval(() => {
      const p = remainPct(profileRef.current, 7);
      const dot = p.indexOf(".");
      setPctMain(p.slice(0, dot + 2));
      setPctTail(p.slice(dot + 2));
    }, 100);
    const slow = setInterval(() => {
      setDays(nf(remainDays(profileRef.current)));
      setBand(bandForDate(new Date()));
      const now = new Date();
      const endOfYear = new Date(now.getFullYear() + 1, 0, 1).getTime();
      setYearDays(nf(Math.ceil((endOfYear - now.getTime()) / DAY_MS)));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const ms = midnight.getTime() - now.getTime();
      const hh = Math.floor(ms / 3_600_000);
      const mm = Math.floor(ms / 60_000) % 60;
      const ss = Math.floor(ms / 1000) % 60;
      setTodayLeft(
        `${hh}時間${String(mm).padStart(2, "0")}分${String(ss).padStart(2, "0")}秒`,
      );
    }, 1000);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, []);

  /* 夢の緯線ラベル(各目標をリングと同じ幾何で配置) */
  useEffect(() => {
    function place() {
      const p = profileRef.current;
      const { cy, R } = sphereGeom(window.innerWidth, window.innerHeight);
      setDreamMeta(
        p.dreams
          .map((d) => ({ d, f: dreamFrac(p, d) }))
          .filter(({ f }) => f > 0 && f < 1)
          .map(({ d, f }) => ({
            label: d.label,
            days: nf(dreamRemainDays(p, d)),
            y: cy + R - 2 * R * f,
          })),
      );
    }
    const first = setTimeout(place, 0);
    window.addEventListener("resize", place);
    const t = setInterval(place, 60_000);
    return () => {
      clearTimeout(first);
      window.removeEventListener("resize", place);
      clearInterval(t);
    };
  }, [profile]);

  /* 非操作時、UIは静かに消える */
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_MS);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, []);

  /* 初回のリビール: 演出が終わってから言葉が現れ、UIが灯る */
  useEffect(() => {
    if (!reveal) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduced ? 300 : REVEAL_TOTAL + 200;
    const show = setTimeout(() => {
      setRevealVisible(true);
      setCinematic(false);
    }, delay);
    const hide = setTimeout(() => setRevealVisible(false), delay + 4800);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [reveal]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    soundRef.current?.setMuted(next);
    window.localStorage.setItem(MUTE_KEY, next ? "off" : "on");
  }

  /* 目標の追加・削除 */
  function currentAge(): number {
    const b = new Date(profile.birth + "T00:00:00");
    return Math.floor((Date.now() - b.getTime()) / (365.2425 * DAY_MS));
  }

  function addGoal() {
    const label = goalLabel.trim();
    const age = Number(goalAge);
    if (profile.dreams.length >= 8) {
      setGoalErr("その器には、これ以上刻めません。(8つまで)");
      return;
    }
    if (!label) {
      setGoalErr("ひとつで、かまいません。");
      return;
    }
    if (!Number.isFinite(age) || age <= currentAge()) {
      setGoalErr("その歳は、もう通り過ぎました。");
      return;
    }
    if (age > profile.lifeYears) {
      setGoalErr("それは、終わりのあとになっています。");
      return;
    }
    const dreams = [...profile.dreams, { label, age }].sort((a, b) => a.age - b.age);
    saveProfile({ ...profile, dreams });
    setGoalLabel("");
    setGoalAge("");
    setGoalErr("");
  }

  function removeGoal(i: number) {
    const dreams = profile.dreams.filter((_, j) => j !== i);
    saveProfile({ ...profile, dreams });
    setGoalErr("");
  }

  const vars = useMemo(
    () =>
      ({
        "--f-text": pal.text,
        "--f-dim": pal.textDim,
        "--f-acc": pal.accent,
      }) as React.CSSProperties,
    [pal],
  );

  const level = zoomLevel(zoomZ);
  const contextLine =
    level === "life"
      ? `残り ${days} 日`
      : level === "year"
        ? `今年の残りは、あと ${yearDays} 日`
        : level === "day"
          ? `今日の残りは、あと ${todayLeft}`
          : "この一秒も、こぼれている。";
  const railT = Math.min(
    1,
    Math.max(0, Math.log(zoomZ / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)),
  );
  const railTop = 92 - railT * 84;

  /* 夢ラベルはズームに追従し、大きく寄ったら静かに消える */
  const dreamTop = (rawY: number): number | null => {
    if (zoomZ >= 2.6) return null;
    const hWin = typeof window !== "undefined" ? window.innerHeight : 0;
    if (hWin <= 0) return null;
    const g = sphereGeom(window.innerWidth, hWin);
    const k = Math.min(1, Math.max(0, (zoomZ - 1) / 3));
    const fy = hWin * 0.5 + (g.botY + hWin * 0.04 - hWin * 0.5) * k;
    const t = fy + (rawY - fy) * zoomZ;
    return t > hWin * 0.05 && t < hWin * 0.9 ? t : null;
  };

  return (
    <div className="stage" style={vars}>
      <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />
      <canvas ref={glCanvasRef} className="stage-canvas" aria-hidden="true" />

      <div
        className={`stage-ui ${(idle && !goalOpen) || cinematic ? "is-idle" : ""}`}
      >
        <span className="ui-nokori" aria-hidden="true">
          のこり
        </span>
        <div className="ui-counter">
          <span className="ui-counter-pre">残り</span>
          <span className="ui-counter-main">{pctMain}</span>
          <span className="ui-counter-tail">{pctTail}</span>
          <span className="ui-counter-pct">%</span>
        </div>
        <p className="ui-days">{contextLine}</p>

        <div className="ui-rail" aria-hidden="true">
          {RAIL.map((r) => (
            <b
              key={r.level}
              style={{ top: `${r.top}%` }}
              className={level === r.level ? "on" : ""}
            >
              {r.label}
            </b>
          ))}
          <i style={{ top: `${railTop}%` }} />
        </div>

        {!hintGone && <p className="ui-zoomhint">スクロールで、時間に近づく</p>}

        {dreamMeta.map((m, i) => {
          const t = dreamTop(m.y);
          if (t === null) return null;
          return (
            <div key={`${m.label}-${i}`} className="ui-dream" style={{ top: t - 10 }}>
              <span className="ui-dream-label">{m.label}</span>
              <span className="ui-dream-days">この深さまで、あと {m.days} 日</span>
            </div>
          );
        })}

        <div className="ui-goal">
          <button onClick={() => setGoalOpen(true)}>目標を足す</button>
        </div>

        <div className="ui-sound">
          <button onClick={toggleMute}>{muted ? "音を出す" : "音を消す"}</button>
        </div>

        <div className="ui-reset">
          {confirming ? (
            <span className="ui-reset-confirm">
              すべて消して、最初から?
              <button onClick={onReset}>はい</button>
              <button onClick={() => setConfirming(false)}>いいえ</button>
            </span>
          ) : (
            <button
              className="ui-reset-btn"
              onClick={() => setConfirming(true)}
              aria-label="設定をやり直す"
            >
              はじめから
            </button>
          )}
        </div>
      </div>

      {goalOpen && (
        <div className="goal-dialog" role="dialog" aria-label="目標を足す">
          <div className="goal-card">
            <p className="goal-q">終わるまでに、何をしますか。</p>
            <p className="goal-s">
              歳を決めて、残りの中に沈めます。砂面がその深さに届いた日が、その歳です。
            </p>
            {profile.dreams.length > 0 && (
              <ul className="goal-list">
                {profile.dreams.map((d, i) => (
                  <li key={`${d.label}-${d.age}-${i}`}>
                    <span>
                      {d.label} — {d.age}歳
                    </span>
                    <button onClick={() => removeGoal(i)} aria-label="この目標を消す">
                      消す
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              type="text"
              className="ritual-in"
              value={goalLabel}
              placeholder="例: 富士山に登る"
              onChange={(e) => setGoalLabel(e.target.value)}
              aria-label="目標"
            />
            <div className="ritual-agewrap">
              <input
                type="number"
                inputMode="numeric"
                className="ritual-in ritual-in-num"
                value={goalAge}
                placeholder="40"
                onChange={(e) => setGoalAge(e.target.value)}
                aria-label="何歳までに"
              />
              <span className="ritual-agelabel">歳までに</span>
            </div>
            {goalErr && <p className="ritual-err">{goalErr}</p>}
            <div className="goal-actions">
              <button className="ritual-btn" onClick={addGoal}>
                沈める
              </button>
              <button className="ritual-skip" onClick={() => setGoalOpen(false)}>
                とじる
              </button>
            </div>
          </div>
        </div>
      )}

      {revealVisible && (
        <div className="reveal" aria-live="polite">
          <p>これが、あなたの残りです。——いまも、一粒。</p>
        </div>
      )}
    </div>
  );
}
