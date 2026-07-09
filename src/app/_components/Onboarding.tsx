"use client";

import { useState, useSyncExternalStore } from "react";
import {
  getLangSnapshot,
  getServerLangSnapshot,
  subscribeLang,
  tr,
  type StrKey,
} from "../_lib/i18n";
import type { Dream, Profile } from "../_lib/store";
import LangToggle from "./LangToggle";

/**
 * 暗転から始まる儀式。生年月日 → 終わりの日 → やりたいこと(いくつでも)。
 * 問いはひとつずつ、急かさない。
 */
export default function Onboarding({ onComplete }: { onComplete: (p: Profile) => void }) {
  const lang = useSyncExternalStore(
    subscribeLang,
    getLangSnapshot,
    getServerLangSnapshot,
  );
  const t = (key: StrKey) => tr(lang, key);

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
    if (!birth) return setError(t("errBirthEmpty"));
    if (birth >= todayIso) return setError(t("errBirthFuture"));
    go(2);
  }

  function currentAge(): number {
    const b = new Date(birth + "T00:00:00");
    return Math.floor((Date.now() - b.getTime()) / (365.2425 * 86_400_000));
  }

  function submitLife() {
    const n = Number(lifeYears);
    if (!Number.isFinite(n) || n <= 0 || n > 130) return setError(t("errLifeRange"));
    if (n <= currentAge()) return setError(t("errLifePassed"));
    go(3);
  }

  function validateDream(): string | null {
    const a = Number(dreamAge);
    if (dreams.length >= 8) return t("errDreamFull");
    if (!dreamLabel.trim()) return t("errDreamEmpty");
    if (!Number.isFinite(a) || a <= currentAge()) return t("errAgePast");
    if (a > Number(lifeYears)) return t("errAgeAfterEnd");
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
    onComplete({
      birth,
      lifeYears: Number(lifeYears),
      dreams: [...withInput].sort((a, b) => a.age - b.age),
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <div className="ritual">
      <LangToggle />
      {step === 0 && (
        <section key="s0" className="ritual-step">
          <p className="ritual-q">{t("ob0Title")}</p>
          <p className="ritual-s">
            {t("ob0Sub")
              .split("\n")
              .map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
          </p>
          <button className="ritual-btn" onClick={() => go(1)}>
            {t("ob0Next")}
          </button>
        </section>
      )}

      {step === 1 && (
        <section key="s1" className="ritual-step">
          <p className="ritual-q">{t("obBirthQ")}</p>
          <p className="ritual-s">{t("obBirthSub")}</p>
          <input
            type="date"
            className="ritual-in"
            value={birth}
            max={todayIso}
            onChange={(e) => setBirth(e.target.value)}
            aria-label={t("obBirthQ")}
          />
          {error && <p className="ritual-err">{error}</p>}
          <button className="ritual-btn" onClick={submitBirth}>
            {t("obNext")}
          </button>
        </section>
      )}

      {step === 2 && (
        <section key="s2" className="ritual-step">
          <p className="ritual-q">{t("obLifeQ")}</p>
          <p className="ritual-s">
            {t("obLifeSub")
              .split("\n")
              .map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
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
            aria-label={t("obLifeAria")}
          />
          {error && <p className="ritual-err">{error}</p>}
          <button className="ritual-btn" onClick={submitLife}>
            {t("obNext")}
          </button>
        </section>
      )}

      {step === 3 && (
        <section key="s3" className="ritual-step">
          <p className="ritual-q">{t("obDreamQ")}</p>
          <p className="ritual-s">{t("obDreamSub")}</p>
          {dreams.length > 0 && (
            <ul className="ritual-dreams">
              {dreams.map((d, i) => (
                <li key={`${d.label}-${d.age}-${i}`}>
                  <span>
                    {d.label} — {d.age}
                  </span>
                  <button
                    onClick={() => setDreams(dreams.filter((_, j) => j !== i))}
                    aria-label={t("goalRemove")}
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
            placeholder={t("obDreamPh")}
            onChange={(e) => setDreamLabel(e.target.value)}
            aria-label={t("obDreamQ")}
          />
          <div className="ritual-agewrap">
            <input
              type="number"
              inputMode="numeric"
              className="ritual-in ritual-in-num"
              value={dreamAge}
              placeholder="35"
              onChange={(e) => setDreamAge(e.target.value)}
              aria-label={t("obAgeSuffix")}
            />
            <span className="ritual-agelabel">{t("obAgeSuffix")}</span>
          </div>
          {error && <p className="ritual-err">{error}</p>}
          <button className="ritual-skip" onClick={pushDream}>
            {t("obAddMore")}
          </button>
          <button className="ritual-btn" onClick={submitDreams}>
            {t("obNext")}
          </button>
          {dreams.length === 0 && (
            <button className="ritual-skip" onClick={() => go(4)}>
              {t("obLater")}
            </button>
          )}
        </section>
      )}

      {step === 4 && (
        <section key="s4" className="ritual-step">
          <p className="ritual-q">{t("obFinalQ")}</p>
          <p className="ritual-s">{t("obFinalSub")}</p>
          <button className="ritual-btn" onClick={finish}>
            {t("obEnter")}
          </button>
        </section>
      )}
    </div>
  );
}
