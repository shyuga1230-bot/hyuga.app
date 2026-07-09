"use client";

import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  getLangSnapshot,
  getServerLangSnapshot,
  subscribeLang,
  tr,
} from "../_lib/i18n";
import {
  clearProfile,
  exportProfile,
  getProfileSnapshot,
  getServerProfileSnapshot,
  saveProfile,
  subscribeProfile,
  type Profile,
} from "../_lib/store";
import MainScene from "./MainScene";
import Onboarding from "./Onboarding";

const emptySubscribe = () => () => {};

/** 実行時エラーで真っ黒にならないための受け皿。記録の書き出しも残す */
class SceneBoundary extends Component<
  { children: ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    const lang = getLangSnapshot();
    return (
      <div className="ritual">
        <section className="ritual-step">
          <p className="ritual-q">{tr(lang, "crashTitle")}</p>
          <p className="ritual-s">{tr(lang, "crashSub")}</p>
          <button
            className="ritual-btn"
            onClick={() => window.location.reload()}
          >
            {tr(lang, "crashReload")}
          </button>
          <button
            className="ritual-skip"
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(
                new Blob([exportProfile()], { type: "application/json" }),
              );
              a.download = "muhaku-backup.json";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            {tr(lang, "pastExport")}
          </button>
        </section>
      </div>
    );
  }
}

export default function Muhaku() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const profile = useSyncExternalStore(
    subscribeProfile,
    getProfileSnapshot,
    getServerProfileSnapshot,
  );
  useSyncExternalStore(subscribeLang, getLangSnapshot, getServerLangSnapshot);
  const [justCompleted, setJustCompleted] = useState(false);

  /* PWA: ホーム画面起動・オフラインシェル用の service worker(通常デプロイ時のみ) */
  useEffect(() => {
    const p = window.location.pathname;
    if ("serviceWorker" in navigator && /^\/([^/]+\/?)?$/.test(p)) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }, []);

  function handleComplete(p: Profile) {
    setJustCompleted(true);
    saveProfile(p);
  }

  function handleReset() {
    setJustCompleted(false);
    clearProfile();
  }

  if (!mounted) return <div className="boot" />;

  return (
    <SceneBoundary>
      {!profile ? (
        <Onboarding onComplete={handleComplete} />
      ) : (
        <MainScene
          profile={profile}
          reveal={justCompleted}
          onReset={handleReset}
        />
      )}
    </SceneBoundary>
  );
}
