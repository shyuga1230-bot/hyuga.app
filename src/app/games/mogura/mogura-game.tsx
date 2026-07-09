"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { playPop, playWrong, playWin } from "../sounds";

const HOLE_COUNT = 9;
const GAME_SECONDS = 30;

type Phase = "start" | "play" | "end";
type Hole = { kind: "mole" | "flower"; hideAt: number } | null;

export default function MoguraGame() {
  const [phase, setPhase] = useState<Phase>("start");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [endAt, setEndAt] = useState(0);
  const [holes, setHoles] = useState<Hole[]>(Array(HOLE_COUNT).fill(null));
  const [hitIndex, setHitIndex] = useState<number | null>(null);

  function start() {
    setScore(0);
    setTimeLeft(GAME_SECONDS);
    setEndAt(Date.now() + GAME_SECONDS * 1000);
    setHoles(Array(HOLE_COUNT).fill(null));
    setHitIndex(null);
    setPhase("play");
  }

  // のこりじかんのカウントダウン
  useEffect(() => {
    if (phase !== "play") return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, (endAt - Date.now()) / 1000);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setPhase("end");
        playWin();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [phase, endAt]);

  // もぐらの出現と退場
  useEffect(() => {
    if (phase !== "play") return;
    const loop = setInterval(() => {
      const now = Date.now();
      setHoles((prev) => {
        const next = prev.map((h) => (h && h.hideAt <= now ? null : h));
        const empty = next
          .map((h, i) => (h === null ? i : -1))
          .filter((i) => i >= 0);
        const active = HOLE_COUNT - empty.length;
        if (empty.length > 0 && active < 3 && Math.random() < 0.55) {
          const i = empty[Math.floor(Math.random() * empty.length)];
          next[i] = {
            kind: Math.random() < 0.2 ? "flower" : "mole",
            hideAt: now + 700 + Math.random() * 600,
          };
        }
        return next;
      });
    }, 250);
    return () => clearInterval(loop);
  }, [phase]);

  function whack(index: number) {
    const hole = holes[index];
    if (phase !== "play" || !hole) return;
    if (hole.kind === "mole") {
      setScore((s) => s + 1);
      playPop();
    } else {
      setScore((s) => Math.max(0, s - 1));
      playWrong();
    }
    setHoles((prev) => prev.map((h, i) => (i === index ? null : h)));
    setHitIndex(index);
    setTimeout(() => setHitIndex((cur) => (cur === index ? null : cur)), 300);
  }

  return (
    <div
      className="flex flex-1 flex-col items-center bg-gradient-to-b from-lime-50 to-green-100 px-4 py-8 text-zinc-800 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <h1 className="text-3xl font-black sm:text-4xl">🐹 もぐらたたき</h1>

      {phase === "start" && (
        <div className="mt-10 flex w-full max-w-md flex-col items-center gap-6">
          <p className="text-center text-xl font-bold leading-relaxed">
            もぐら 🐹 が でてきたら タッチ！
            <br />
            おはな 🌼 は たたかないでね
            <br />
            じかんは {GAME_SECONDS}びょうだよ
          </p>
          <button
            onClick={start}
            className="w-full rounded-3xl border-4 border-green-400 bg-green-200 py-6 text-3xl font-black shadow-lg transition-transform hover:scale-105 active:scale-95 touch-manipulation"
          >
            ▶ はじめる！
          </button>
        </div>
      )}

      {phase === "play" && (
        <div className="mt-6 flex w-full max-w-md flex-col items-center gap-5">
          <div className="flex w-full items-center justify-between text-2xl font-black">
            <span>とくてん：{score}</span>
            <span>のこり {Math.ceil(timeLeft)}びょう</span>
          </div>
          <div className="h-4 w-full overflow-hidden rounded-full bg-white shadow-inner">
            <div
              className="h-full rounded-full bg-green-400 transition-[width] duration-100"
              style={{ width: `${(timeLeft / GAME_SECONDS) * 100}%` }}
            />
          </div>

          <div className="grid w-full grid-cols-3 gap-4">
            {holes.map((hole, i) => (
              <button
                key={i}
                onPointerDown={() => whack(i)}
                className="flex aspect-square items-center justify-center rounded-full border-8 border-amber-700/40 bg-amber-800/80 text-5xl shadow-inner touch-manipulation sm:text-6xl"
                aria-label={
                  hole?.kind === "mole"
                    ? "もぐら"
                    : hole?.kind === "flower"
                      ? "おはな"
                      : "あな"
                }
              >
                {hitIndex === i ? (
                  <span className="animate-pop">💥</span>
                ) : hole ? (
                  <span className="animate-pop">
                    {hole.kind === "mole" ? "🐹" : "🌼"}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "end" && (
        <div className="mt-10 flex w-full max-w-md flex-col items-center gap-6">
          <p className="text-5xl">🎉</p>
          <p className="text-2xl font-black">とくてんは {score}てん！</p>
          <p className="text-3xl font-black text-green-600">
            {score >= 20
              ? "すごい！もぐらたたき めいじんだ！"
              : score >= 10
                ? "やったね！じょうずだね！"
                : "また ちょうせんしてね！"}
          </p>
          <button
            onClick={start}
            className="w-full rounded-3xl border-4 border-green-400 bg-green-200 py-5 text-2xl font-black shadow-lg transition-transform hover:scale-105 active:scale-95 touch-manipulation"
          >
            🔁 もういちど
          </button>
        </div>
      )}

      <Link
        href="/games"
        className="mt-auto pt-10 text-lg font-bold text-zinc-500 hover:text-zinc-700"
      >
        ← ひろばに もどる
      </Link>
    </div>
  );
}
