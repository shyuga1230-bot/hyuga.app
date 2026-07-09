"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  clearProfile,
  getProfileSnapshot,
  getServerProfileSnapshot,
  saveProfile,
  subscribeProfile,
  type Profile,
} from "../_lib/store";
import MainScene from "./MainScene";
import Onboarding from "./Onboarding";

const emptySubscribe = () => () => {};

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
  const [justCompleted, setJustCompleted] = useState(false);

  /* PWA: ホーム画面起動・オフラインシェル用の service worker */
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
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
  if (!profile) return <Onboarding onComplete={handleComplete} />;

  return (
    <MainScene profile={profile} reveal={justCompleted} onReset={handleReset} />
  );
}
