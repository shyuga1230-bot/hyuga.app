"use client";

import { useSyncExternalStore } from "react";
import {
  getLangSnapshot,
  getServerLangSnapshot,
  setLang,
  subscribeLang,
} from "../_lib/i18n";

/** 画面隅の小さな言語切替(日本語 ⇄ English) */
export default function LangToggle() {
  const lang = useSyncExternalStore(
    subscribeLang,
    getLangSnapshot,
    getServerLangSnapshot,
  );
  return (
    <button
      className="ui-lang"
      onClick={() => setLang(lang === "ja" ? "en" : "ja")}
      aria-label={lang === "ja" ? "Switch to English" : "日本語に切り替える"}
    >
      {lang === "ja" ? "EN" : "日本語"}
    </button>
  );
}
