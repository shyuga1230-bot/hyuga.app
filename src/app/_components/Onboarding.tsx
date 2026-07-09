"use client";

import { useState } from "react";
import type { Profile } from "../_lib/store";

/**
 * 暗転から始まる儀式。生年月日 → 終わりの日 → やりたいこと。
 * 問いはひとつずつ、急かさない。
 */
export default function Onboarding({ onComplete }: { onComplete: (p: Profile) => void }) {
  const [step, setStep] = useState(0);
  const [birth, setBirth] = useState("");
  const [lifeYears, setLifeYears] = useState("");
  const [dreamLabel, setDreamLabel] = useState("");
  const [dreamAge, setDreamAge] = useState("");
  const [error, setError] = useState("");

  const todayIso = new Date().toISOString().slice(0, 10);

  function go(next: number) {
    setError("");
    setStep(next);
  }

  function submitBirth() {
    if (!birth) {
      setError("その日から、砂はこぼれはじめています。");
      return;
    }
    if (birth >= todayIso) {
      setError("始まりは、今日より前の日のはずです。");
      return;
    }
    go(2);
  }

  function currentAge(): number {
    const b = new Date(birth + "T00:00:00");
    return Math.floor((Date.now() - b.getTime()) / (365.2425 * 86_400_000));
  }

  function submitLife() {
    const n = Number(lifeYears);
    if (!Number.isFinite(n) || n <= 0 || n > 130) {
      setError("1 から 130 のあいだで、仮の終わりを置いてください。");
      return;
    }
    if (n <= currentAge()) {
      setError("その終わりは、もう過ぎています。");
      return;
    }
    go(3);
  }

  function submitDream(skip: boolean) {
    if (!skip) {
      const a = Number(dreamAge);
      if (!dreamLabel.trim()) {
        setError("ひとつで、かまいません。");
        return;
      }
      if (!Number.isFinite(a) || a <= currentAge()) {
        setError("その歳は、もう通り過ぎました。");
        return;
      }
      if (a > Number(lifeYears)) {
        setError("それは、終わりのあとになっています。");
        return;
      }
    }
    go(4);
  }

  function finish() {
    const p: Profile = {
      birth,
      lifeYears: Number(lifeYears),
      dreams: dreamLabel.trim()
        ? [{ label: dreamLabel.trim(), age: Number(dreamAge) }]
        : [],
      createdAt: new Date().toISOString(),
    };
    onComplete(p);
  }

  return (
    <div className="ritual">
      {step === 0 && (
        <section key="s0" className="ritual-step">
          <p className="ritual-q">こぼれた一粒は、もう戻らない。</p>
          <p className="ritual-s">
            ここから先は、あなたの残り時間の話です。
            <br />
            静かな場所で、ひとりで。
          </p>
          <button className="ritual-btn" onClick={() => go(1)}>
            すすむ
          </button>
        </section>
      )}

      {step === 1 && (
        <section key="s1" className="ritual-step">
          <p className="ritual-q">あなたは、いつ始まりましたか。</p>
          <p className="ritual-s">砂は、この日からこぼれはじめています。</p>
          <input
            type="date"
            className="ritual-in"
            value={birth}
            max={todayIso}
            onChange={(e) => setBirth(e.target.value)}
            aria-label="生年月日"
          />
          {error && <p className="ritual-err">{error}</p>}
          <button className="ritual-btn" onClick={submitBirth}>
            つぎへ
          </button>
        </section>
      )}

      {step === 2 && (
        <section key="s2" className="ritual-step">
          <p className="ritual-q">終わりの日を、あなたが決めてください。</p>
          <p className="ritual-s">
            ほんとうの答えは、誰も知りません。
            <br />
            それでも一度、仮の終わりを置く。そこからしか、残りは見えません。
            <br />
            いつでも、決めなおせます。
          </p>
          <input
            type="number"
            inputMode="numeric"
            className="ritual-in ritual-in-num"
            value={lifeYears}
            placeholder="80"
            min={1}
            max={130}
            onChange={(e) => setLifeYears(e.target.value)}
            aria-label="寿命(歳)"
          />
          {error && <p className="ritual-err">{error}</p>}
          <button className="ritual-btn" onClick={submitLife}>
            つぎへ
          </button>
        </section>
      )}

      {step === 3 && (
        <section key="s3" className="ritual-step">
          <p className="ritual-q">終わるまでに、何をしますか。</p>
          <p className="ritual-s">
            ひとつで、かまいません。あなたの残りの中に、沈めておきます。
          </p>
          <input
            type="text"
            className="ritual-in"
            value={dreamLabel}
            placeholder="例: 海のそばに住む"
            onChange={(e) => setDreamLabel(e.target.value)}
            aria-label="やりたいこと"
          />
          <div className="ritual-agewrap">
            <input
              type="number"
              inputMode="numeric"
              className="ritual-in ritual-in-num"
              value={dreamAge}
              placeholder="35"
              onChange={(e) => setDreamAge(e.target.value)}
              aria-label="何歳までに"
            />
            <span className="ritual-agelabel">歳までに</span>
          </div>
          {error && <p className="ritual-err">{error}</p>}
          <button className="ritual-btn" onClick={() => submitDream(false)}>
            つぎへ
          </button>
          <button className="ritual-skip" onClick={() => submitDream(true)}>
            あとで決める
          </button>
        </section>
      )}

      {step === 4 && (
        <section key="s4" className="ritual-step">
          <p className="ritual-q">これが、あなたの残りになります。</p>
          <p className="ritual-s">
            誰にも送られません。この端末の中だけに、残ります。
          </p>
          <button className="ritual-btn" onClick={finish}>
            砂に会う
          </button>
        </section>
      )}
    </div>
  );
}
