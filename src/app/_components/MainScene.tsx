"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createGlSand } from "../_lib/glsand";
import { bandForDate, MONO, type Band } from "../_lib/palette";
import { createScene, sphereGeom } from "../_lib/scene";
import type { Profile } from "../_lib/store";
import {
  dreamFrac,
  dreamRemainDays,
  nf,
  remainDays,
  remainFrac,
  remainPct,
} from "../_lib/time";

const IDLE_MS = 45_000;

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
  const [dreamDays, setDreamDays] = useState("-,---");
  const [dreamY, setDreamY] = useState<number | null>(null);
  const [idle, setIdle] = useState(false);
  const [revealVisible, setRevealVisible] = useState(reveal);
  const [confirming, setConfirming] = useState(false);

  const dream = profile.dreams[0] ?? null;
  const pal = MONO[band];

  /* Canvas シーン(+可能なら WebGL パーティクルレイヤー) */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let glSand: ReturnType<typeof createGlSand> | null = null;
    if (!reduced && glCanvasRef.current) {
      try {
        glSand = createGlSand(glCanvasRef.current, {
          getRemainFrac: () => remainFrac(profileRef.current),
          getBand: () => bandForDate(new Date()),
        });
      } catch {
        glSand = null; // WebGL2 が無ければ 2D の砂にフォールバック
      }
    }

    const scene = createScene(canvas, {
      getRemainFrac: () => remainFrac(profileRef.current),
      getDreamFrac: () => {
        const d = profileRef.current.dreams[0];
        return d ? dreamFrac(profileRef.current, d) : null;
      },
      getBand: () => bandForDate(new Date()),
      drawSpills: !glSand,
    });
    return () => {
      scene.destroy();
      glSand?.destroy();
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
      const d = profileRef.current.dreams[0];
      if (d) setDreamDays(nf(dreamRemainDays(profileRef.current, d)));
      setBand(bandForDate(new Date()));
    }, 1000);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, []);

  /* 夢の緯線ラベルの位置(リングと同じ幾何で計算) */
  useEffect(() => {
    function place() {
      const d = profileRef.current.dreams[0];
      if (!d) {
        setDreamY(null);
        return;
      }
      const f = dreamFrac(profileRef.current, d);
      if (f <= 0 || f >= 1) {
        setDreamY(null);
        return;
      }
      const { cy, R } = sphereGeom(window.innerWidth, window.innerHeight);
      setDreamY(cy + R - 2 * R * f);
    }
    const first = setTimeout(place, 0);
    window.addEventListener("resize", place);
    const t = setInterval(place, 60_000);
    return () => {
      clearTimeout(first);
      window.removeEventListener("resize", place);
      clearInterval(t);
    };
  }, []);

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

  /* 初回のリビール */
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setRevealVisible(false), 4500);
    return () => clearTimeout(t);
  }, [reveal]);

  const vars = useMemo(
    () =>
      ({
        "--f-text": pal.text,
        "--f-dim": pal.textDim,
        "--f-acc": pal.accent,
      }) as React.CSSProperties,
    [pal],
  );

  return (
    <div className="stage" style={vars}>
      <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />
      <canvas ref={glCanvasRef} className="stage-canvas" aria-hidden="true" />

      <div className={`stage-ui ${idle ? "is-idle" : ""}`}>
        <span className="ui-nokori" aria-hidden="true">
          のこり
        </span>
        <div className="ui-counter">
          <span className="ui-counter-pre">残り</span>
          <span className="ui-counter-main">{pctMain}</span>
          <span className="ui-counter-tail">{pctTail}</span>
          <span className="ui-counter-pct">%</span>
        </div>
        <p className="ui-days">残り {days} 日</p>

        <div className="ui-rail" aria-hidden="true">
          <b>秒</b>
          <i />
        </div>

        {dream && dreamY !== null && (
          <div className="ui-dream" style={{ top: dreamY - 10 }}>
            <span className="ui-dream-label">{dream.label}</span>
            <span className="ui-dream-days">この深さまで、あと {dreamDays} 日</span>
          </div>
        )}

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

      {revealVisible && (
        <div className="reveal" aria-live="polite">
          <p>これが、あなたの残りです。——いまも、一粒。</p>
        </div>
      )}
    </div>
  );
}
