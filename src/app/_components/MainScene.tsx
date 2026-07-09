"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createGlSand, type GlSandHandle } from "../_lib/glsand";
import {
  getLangSnapshot,
  getServerLangSnapshot,
  subscribeLang,
  tr,
  type StrKey,
} from "../_lib/i18n";
import { bandForDate, MONO, type Band } from "../_lib/palette";
import { createScene, sphereGeom } from "../_lib/scene";
import { createSound, type SoundHandle } from "../_lib/sound";
import {
  exportProfile,
  importProfile,
  readVisit,
  saveProfile,
  writeVisit,
  type Profile,
} from "../_lib/store";
import {
  birthMs,
  DAY_MS,
  deathMs,
  dreamFrac,
  dreamRemainDays,
  nf,
  remainDays,
  remainFrac,
  remainPct,
} from "../_lib/time";
import LangToggle from "./LangToggle";

const IDLE_MS = 45_000;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
const MUTE_KEY = "muhaku.sound.v1";
const NEAR_DAYS = 60;

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

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localWeekKey(d: Date): string {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const doy = Math.floor((d.getTime() - jan1.getTime()) / DAY_MS);
  return `${d.getFullYear()}-W${Math.floor(doy / 7)}`;
}

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

  const lang = useSyncExternalStore(
    subscribeLang,
    getLangSnapshot,
    getServerLangSnapshot,
  );
  const t = (key: StrKey, vars?: Record<string, string | number>) =>
    tr(lang, key, vars);

  const [band, setBand] = useState<Band>(() => bandForDate(new Date()));
  const [pctMain, setPctMain] = useState("--.-");
  const [pctTail, setPctTail] = useState("------");
  const [days, setDays] = useState("--,---");
  const [yearDays, setYearDays] = useState("---");
  const [todayLeft, setTodayLeft] = useState("--:--:--");
  const [ariaText, setAriaText] = useState("");
  const [dreamMeta, setDreamMeta] = useState<
    { label: string; days: string; y: number; hc: number; done: boolean }[]
  >([]);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalLabel, setGoalLabel] = useState("");
  const [goalAge, setGoalAge] = useState("");
  const [goalErr, setGoalErr] = useState("");
  const [lifeEdit, setLifeEdit] = useState("");
  const [pastOpen, setPastOpen] = useState(false);
  const [pastMsg, setPastMsg] = useState("");
  const [elapsedDays, setElapsedDays] = useState(0);
  const [moment, setMoment] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const [revealVisible, setRevealVisible] = useState(false);
  const [cinematic, setCinematic] = useState(reveal);
  const [confirming, setConfirming] = useState(false);
  const [zoomZ, setZoomZ] = useState(1);
  const [hintIdx, setHintIdx] = useState(0);
  const [hintGone, setHintGone] = useState(false);
  const [muted, setMuted] = useState(false);
  const zoomTargetRef = useRef(1);
  const glHandleRef = useRef<GlSandHandle | null>(null);
  const soundRef = useRef<SoundHandle | null>(null);
  const revealT0 = useRef<number | null>(null);
  const momentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const importRef = useRef<HTMLInputElement>(null);

  const pal = MONO[band];

  /* 重い描画ループ中は CSS アニメーションが開始待ちのまま止まることがある
     (from が opacity:0 だと中身が永遠に見えない)。保留中のものを強制開始する */
  useEffect(() => {
    if (!(goalOpen || pastOpen || moment || revealVisible)) return;
    const kick = () => {
      for (const a of document.getAnimations()) {
        if (a.startTime === null && a.playState === "running") {
          a.startTime = document.timeline.currentTime;
        }
      }
    };
    const t1 = window.setTimeout(kick, 80);
    const t2 = window.setTimeout(kick, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [goalOpen, pastOpen, moment, revealVisible]);

  function showMoment(text: string) {
    clearTimeout(momentTimer.current);
    setMoment(text);
    momentTimer.current = setTimeout(() => setMoment(null), 5200);
  }

  /* Canvas シーン(+可能なら WebGL レイヤー) */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reveal && !reduced) revealT0.current = performance.now();

    const getRings = () =>
      profileRef.current.dreams.map((d) => {
        const f = dreamFrac(profileRef.current, d);
        const left = dreamRemainDays(profileRef.current, d);
        const state = d.done ? 1 : left > 0 && left <= NEAR_DAYS ? 2 : 0;
        return { f, state };
      });
    const getFrac = () =>
      revealAnim(revealT0.current, remainFrac(profileRef.current)).f;
    const getSpill = () =>
      revealAnim(revealT0.current, remainFrac(profileRef.current)).spill;

    let glSand: ReturnType<typeof createGlSand> | null = null;
    if (!reduced && glCanvasRef.current) {
      try {
        glSand = createGlSand(glCanvasRef.current, {
          getRemainFrac: getFrac,
          getDreamRings: getRings,
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
        getDreamRings: getRings,
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

  /* 今日の一粒・週次サマリー */
  useEffect(() => {
    const timer = setTimeout(() => {
      const now = new Date();
      const dayKey = localDayKey(now);
      const weekKey = localWeekKey(now);
      const prev = readVisit();
      writeVisit({ day: dayKey, week: weekKey });
      if (reveal || !prev) return;
      if (prev.week !== weekKey) {
        const p = profileRef.current;
        const lifeDaysTotal = (deathMs(p) - birthMs(p)) / DAY_MS;
        const pct = ((7 / lifeDaysTotal) * 100).toFixed(4);
        showMoment(tr(getLangSnapshot(), "weekly", { pct }));
      } else if (prev.day !== dayKey) {
        showMoment(tr(getLangSnapshot(), "daily"));
      }
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
      );
    }, 1000);
    const aria = setInterval(() => {
      setAriaText(
        tr(getLangSnapshot(), "ariaStatus", {
          pct: remainPct(profileRef.current, 2),
          days: nf(remainDays(profileRef.current)),
        }),
      );
    }, 60_000);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
      clearInterval(aria);
    };
  }, []);

  /* 夢ラベル(各目標をリングと同じ幾何で配置) */
  useEffect(() => {
    function place() {
      const p = profileRef.current;
      const { cy, R } = sphereGeom(window.innerWidth, window.innerHeight);
      setDreamMeta(
        p.dreams
          .map((d) => ({ d, f: dreamFrac(p, d) }))
          .filter(({ f }) => f > 0 && f < 1)
          .map(({ d, f }) => {
            const y = cy + R - 2 * R * f;
            const dd = Math.abs(y - cy);
            return {
              label: d.label,
              days: nf(dreamRemainDays(p, d)),
              y,
              hc: R * Math.sqrt(Math.max(0.05, 1 - (dd / R) * (dd / R))),
              done: !!d.done,
            };
          }),
      );
    }
    const first = setTimeout(place, 0);
    window.addEventListener("resize", place);
    const iv = setInterval(place, 60_000);
    return () => {
      clearTimeout(first);
      window.removeEventListener("resize", place);
      clearInterval(iv);
    };
  }, [profile]);

  /* 連続ズーム: ホイール・ピンチ・キーボード */
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") bump(1.3);
      else if (e.key === "-" || e.key === "_") bump(1 / 1.3);
      else if (e.key === "0") {
        zoomTargetRef.current = 1;
        setHintGone(true);
      }
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
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  /* ヒントの巡回(ズーム→移ろい→音) */
  useEffect(() => {
    if (hintGone) return;
    const iv = setInterval(() => {
      setHintIdx((i) => {
        if (i >= 5) {
          setHintGone(true);
          return i;
        }
        return i + 1;
      });
    }, 5500);
    return () => clearInterval(iv);
  }, [hintGone]);

  /* 非操作時、UIは淡く沈む(完全には消さない) */
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

  /* 目標の追加・達成・削除、終わりの決めなおし */
  function currentAge(): number {
    const b = new Date(profile.birth + "T00:00:00");
    return Math.floor((Date.now() - b.getTime()) / (365.2425 * DAY_MS));
  }

  function addGoal() {
    const label = goalLabel.trim();
    const age = Number(goalAge);
    if (profile.dreams.length >= 8) return setGoalErr(t("errDreamFull"));
    if (!label) return setGoalErr(t("errDreamEmpty"));
    if (!Number.isFinite(age) || age <= currentAge())
      return setGoalErr(t("errAgePast"));
    if (age > profile.lifeYears) return setGoalErr(t("errAgeAfterEnd"));
    const dreams = [...profile.dreams, { label, age }].sort((a, b) => a.age - b.age);
    saveProfile({ ...profile, dreams });
    setGoalLabel("");
    setGoalAge("");
    setGoalErr("");
  }

  function markDone(i: number) {
    const dreams = profile.dreams.map((d, j) =>
      j === i ? { ...d, done: true } : d,
    );
    saveProfile({ ...profile, dreams });
    setGoalOpen(false);
    showMoment(t("celebrated"));
  }

  function removeGoal(i: number) {
    saveProfile({ ...profile, dreams: profile.dreams.filter((_, j) => j !== i) });
    setGoalErr("");
  }

  function changeLife() {
    const n = Number(lifeEdit);
    if (!Number.isFinite(n) || n <= 0 || n > 130) return setGoalErr(t("errLifeRange"));
    if (n <= currentAge()) return setGoalErr(t("errLifePassed"));
    saveProfile({ ...profile, lifeYears: n });
    setLifeEdit("");
    setGoalErr("");
  }

  /* バックアップ・共有 */
  function downloadText(name: string, text: string, type: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function doExport() {
    downloadText(
      `muhaku-${localDayKey(new Date())}.json`,
      exportProfile(),
      "application/json",
    );
  }

  function doImport(file: File) {
    file.text().then((txt) => {
      const p = importProfile(txt);
      setPastMsg(p ? t("importOk") : t("importErr"));
    });
  }

  function saveView() {
    const src =
      glCanvasRef.current && glCanvasRef.current.style.display !== "none"
        ? glCanvasRef.current
        : canvasRef.current;
    if (!src) return;
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
    const s = src.width / window.innerWidth;
    ctx.fillStyle = pal.text;
    ctx.font = `${16 * s}px ui-monospace, Menlo, monospace`;
    ctx.fillText(
      `${t("remainPre")} ${pctMain}${pctTail} %`,
      window.innerWidth * 0.055 * s,
      window.innerHeight * 0.9 * s,
    );
    ctx.fillStyle = pal.textDim;
    ctx.font = `${11 * s}px ui-monospace, Menlo, monospace`;
    ctx.fillText(
      t("ctxLife", { days }),
      window.innerWidth * 0.055 * s,
      window.innerHeight * 0.93 * s,
    );
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `muhaku-${localDayKey(new Date())}.png`;
    a.click();
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
      ? t("ctxLife", { days })
      : level === "year"
        ? t("ctxYear", { days: yearDays })
        : level === "day"
          ? t("ctxDay", { t: todayLeft })
          : t("ctxSec");
  const railT = Math.min(
    1,
    Math.max(0, Math.log(zoomZ / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)),
  );
  const railTop = 92 - railT * 84;
  const RAIL: { key: StrKey; top: number; level: ZoomLevel }[] = [
    { key: "railSec", top: 8, level: "sec" },
    { key: "railDay", top: 36, level: "day" },
    { key: "railYear", top: 64, level: "year" },
    { key: "railLife", top: 92, level: "life" },
  ];

  /* 夢ラベル: ズームに追従し、重なりは上下に散らし、リーダー線でリングと結ぶ */
  const placedDreams = (() => {
    if (zoomZ >= 2.6 || typeof window === "undefined") {
      return [] as {
        label: string;
        days: string;
        done: boolean;
        ringY: number;
        labelY: number;
        ringLeftX: number;
      }[];
    }
    const hWin = window.innerHeight;
    const wWin = window.innerWidth;
    if (hWin <= 0) return [];
    const g = sphereGeom(wWin, hWin);
    const k = Math.min(1, Math.max(0, (zoomZ - 1) / 3));
    const fy = hWin * 0.5 + (g.botY + hWin * 0.04 - hWin * 0.5) * k;
    const items = dreamMeta
      .map((m) => {
        const ringY = fy + (m.y - fy) * zoomZ;
        return {
          label: m.label,
          days: m.days,
          done: m.done,
          ringY,
          labelY: ringY,
          ringLeftX: wWin / 2 - m.hc * zoomZ,
        };
      })
      .filter((m) => m.ringY > hWin * 0.05 && m.ringY < hWin * 0.9)
      .sort((a, b) => a.ringY - b.ringY);
    const GAP = 26;
    for (let i = 1; i < items.length; i++) {
      if (items[i].labelY < items[i - 1].labelY + GAP) {
        items[i].labelY = items[i - 1].labelY + GAP;
      }
    }
    const maxY = hWin * 0.9;
    const over = items.length ? items[items.length - 1].labelY - maxY : 0;
    if (over > 0) {
      for (const it of items) it.labelY -= over;
      for (let i = items.length - 2; i >= 0; i--) {
        if (items[i].labelY > items[i + 1].labelY - GAP) {
          items[i].labelY = items[i + 1].labelY - GAP;
        }
      }
    }
    return items;
  })();
  const labelRightX =
    typeof window !== "undefined"
      ? window.innerWidth * 0.04 + Math.min(window.innerWidth * 0.26, 300)
      : 0;

  const hints: StrKey[] = ["hintZoom", "hintBand", "hintSound"];

  function openPast() {
    setElapsedDays(
      Math.max(0, Math.floor((Date.now() - birthMs(profile)) / DAY_MS)),
    );
    setPastOpen(true);
  }

  return (
    <div className="stage" style={vars}>
      <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />
      <canvas ref={glCanvasRef} className="stage-canvas" aria-hidden="true" />
      <p className="sr-only" role="status">
        {ariaText}
      </p>

      <div
        className={`stage-ui ${(idle && !goalOpen && !pastOpen) || cinematic ? "is-idle" : ""}`}
      >
        <LangToggle />
        <span className="ui-nokori" aria-hidden="true">
          {t("nokori")}
        </span>
        <div className="ui-counter">
          <span className="ui-counter-pre">{t("remainPre")}</span>
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
              {t(r.key)}
            </b>
          ))}
          <i style={{ top: `${railTop}%` }} />
        </div>

        {!hintGone && (
          <p className="ui-zoomhint" key={hintIdx % 3}>
            {t(hints[hintIdx % 3])}
          </p>
        )}

        {placedDreams.map((m, i) => {
          const x1 = labelRightX + 8;
          const x2 = m.ringLeftX - 8;
          const dx = x2 - x1;
          const dy = m.ringY - m.labelY;
          const len = Math.max(0, Math.hypot(dx, dy));
          const ang = Math.atan2(dy, dx);
          return (
            <div key={`${m.label}-${i}`}>
              <div
                className={`ui-dream ${m.done ? "is-done" : ""}`}
                style={{ top: m.labelY - 9 }}
              >
                <span className="ui-dream-label">{m.label}</span>
                <span className="ui-dream-days">
                  {m.done ? t("dreamDone") : t("dreamLeft", { days: m.days })}
                </span>
              </div>
              {dx > 12 && (
                <div
                  className="ui-dream-line"
                  style={{
                    left: x1,
                    top: m.labelY,
                    width: len,
                    transform: `rotate(${ang}rad)`,
                    opacity: m.done ? 0.18 : undefined,
                  }}
                />
              )}
            </div>
          );
        })}

        <div className="ui-stack">
          <button onClick={openPast}>{t("btnPast")}</button>
          <button onClick={() => setGoalOpen(true)}>{t("btnGoal")}</button>
          <button onClick={toggleMute}>{muted ? t("btnUnmute") : t("btnMute")}</button>
          {confirming ? (
            <span className="ui-reset-confirm">
              {t("resetConfirm")}
              <button onClick={onReset}>{t("yes")}</button>
              <button onClick={() => setConfirming(false)}>{t("no")}</button>
            </span>
          ) : (
            <button onClick={() => setConfirming(true)}>{t("btnReset")}</button>
          )}
        </div>
      </div>

      {goalOpen && (
        <div className="goal-dialog" role="dialog" aria-label={t("btnGoal")}>
          <div className="goal-card">
            <p className="goal-q">{t("goalQ")}</p>
            <p className="goal-s">{t("goalS")}</p>
            {profile.dreams.length > 0 && (
              <ul className="goal-list">
                {profile.dreams.map((d, i) => (
                  <li key={`${d.label}-${d.age}-${i}`} className={d.done ? "is-done" : ""}>
                    <span>
                      {d.label} — {d.age}
                    </span>
                    <span className="goal-list-actions">
                      {!d.done && (
                        <button onClick={() => markDone(i)}>{t("goalDone")}</button>
                      )}
                      <button onClick={() => removeGoal(i)}>{t("goalRemove")}</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <input
              type="text"
              className="ritual-in"
              value={goalLabel}
              placeholder={t("goalPh")}
              onChange={(e) => setGoalLabel(e.target.value)}
              aria-label={t("goalQ")}
            />
            <div className="ritual-agewrap">
              <input
                type="number"
                inputMode="numeric"
                className="ritual-in ritual-in-num"
                value={goalAge}
                placeholder="40"
                onChange={(e) => setGoalAge(e.target.value)}
                aria-label={t("obAgeSuffix")}
              />
              <span className="ritual-agelabel">{t("obAgeSuffix")}</span>
            </div>
            <div className="goal-life">
              <span className="ritual-agelabel">{t("lifeEditLabel")}</span>
              <input
                type="number"
                inputMode="numeric"
                className="ritual-in ritual-in-num"
                value={lifeEdit}
                placeholder={String(profile.lifeYears)}
                onChange={(e) => setLifeEdit(e.target.value)}
                aria-label={t("lifeEditLabel")}
              />
              <button className="ritual-skip" onClick={changeLife}>
                {t("lifeEditBtn")}
              </button>
            </div>
            {goalErr && <p className="ritual-err">{goalErr}</p>}
            <div className="goal-actions">
              <button className="ritual-btn" onClick={addGoal}>
                {t("goalAdd")}
              </button>
              <button className="ritual-skip" onClick={() => setGoalOpen(false)}>
                {t("goalClose")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pastOpen && (
        <div className="goal-dialog" role="dialog" aria-label={t("pastTitle")}>
          <div className="goal-card">
            <p className="goal-q">{t("pastTitle")}</p>
            <p className="goal-s">{t("pastSub")}</p>
            <dl className="past-stats">
              <div>
                <dt>{t("pastDays")}</dt>
                <dd>{nf(elapsedDays)}</dd>
              </div>
              <div>
                <dt>{t("pastMornings")}</dt>
                <dd>{nf(elapsedDays)}</dd>
              </div>
              <div>
                <dt>{t("pastSprings")}</dt>
                <dd>{nf(Math.floor(elapsedDays / 365.2425))}</dd>
              </div>
              <div>
                <dt>{t("pastMoons")}</dt>
                <dd>{nf(Math.floor(elapsedDays / 29.53))}</dd>
              </div>
            </dl>
            {pastMsg && <p className="ritual-err">{pastMsg}</p>}
            <div className="goal-actions">
              <button className="ritual-btn" onClick={saveView}>
                {t("pastShare")}
              </button>
              <div className="past-datarow">
                <button className="ritual-skip" onClick={doExport}>
                  {t("pastExport")}
                </button>
                <button
                  className="ritual-skip"
                  onClick={() => importRef.current?.click()}
                >
                  {t("pastImport")}
                </button>
              </div>
              <button
                className="ritual-skip"
                onClick={() => {
                  setPastOpen(false);
                  setPastMsg("");
                }}
              >
                {t("goalClose")}
              </button>
            </div>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}

      {revealVisible && (
        <div className="reveal" aria-live="polite">
          <p>{t("reveal")}</p>
        </div>
      )}
      {moment && (
        <div className="reveal" aria-live="polite">
          <p>{moment}</p>
        </div>
      )}
    </div>
  );
}
