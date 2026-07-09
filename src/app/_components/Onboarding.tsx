"use client";

import { useState } from "react";
import type { Dream, Profile } from "../_lib/store";

/**
 * 暗転から始まる儀式。生年月日 → 終わりの日 → やりたいこと(いくつでも)。
 * 問いはひとつずつ、急かさない。
 */
export default function Onboarding({ onComplete }: { onComplete: (p: Profile) => void }) {
  const [step, setStep] = useState(0);
  const [birth, setBirth] = useState("");
  const [lifeYears, setLifeYears] = useState("");
  const [dreams, setDreams] = useState<Dream[]>([]);
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

  function validateDream(): string | null {
    const a = Number(dreamAge);
    if (dreams.length >= 8) return "その器には、これ以上刻めません。(8つまで)";
    if (!dreamLabel.trim()) return "ひとつで、かまいません。";
    if (!Number.isFinite(a) || a <= currentAge())
      return "その歳は、もう通り過ぎました。";
    if (a > Number(lifeYears)) return "それは、終わりのあとになっています。";
    return null;
  }

  function pushDream(): boolean {
    const err = validateDream();
    if (err) {
      setError(err);
      return false;
    }
    setDreams([...dreams, { label: dreamLabel.trim(), age: Number(dreamAge) }]);
    setDreamLabel("");
    setDreamAge("");
    setError("");
    return true;
  }

  function submitDreams() {
    if (dreamLabel.trim() || dreamAge.trim()) {
      if (!pushDream()) return;
    }
    go(4);
  }

  function finish() {
    const withInput =
      dreamLabel.trim() && !validateDream()
        ? [...dreams, { label: dreamLabel.trim(), age: Number(dreamAge) }]
        : dreams;
    const p: Profile = {
      birth,
      lifeYears: Number(lifeYears),
      dreams: [...withInput].sort((a, b) => a.age - b.age),
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
            いくつでも、かまいません。歳の深さを変えて、残りの中に沈めておきます。
          </p>
          {dreams.length > 0 && (
            <ul className="ritual-dreams">
              {dreams.map((d, i) => (
                <li key={`${d.label}-${d.age}-${i}`}>
                  <span>
                    {d.label} — {d.age}歳
                  </span>
                  <button
                    onClick={() => setDreams(dreams.filter((_, j) => j !== i))}
                    aria-label="この目標を消す"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
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
          <button className="ritual-skip" onClick={pushDream}>
            もうひとつ沈める
          </button>
          <button className="ritual-btn" onClick={submitDreams}>
            つぎへ
          </button>
          {dreams.length === 0 && (
            <button className="ritual-skip" onClick={() => go(4)}>
              あとで決める
            </button>
          )}
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
