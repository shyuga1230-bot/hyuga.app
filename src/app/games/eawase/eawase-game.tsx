"use client";

import { useState } from "react";
import Link from "next/link";
import { playCorrect, playPop, playWin, playWrong } from "../sounds";

const ANIMALS = ["🐶", "🐱", "🐼", "🦁", "🐸", "🐰"];

type Phase = "start" | "play" | "end";

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function EawaseGame() {
  const [phase, setPhase] = useState<Phase>("start");
  const [cards, setCards] = useState<string[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<boolean[]>([]);
  const [moves, setMoves] = useState(0);

  function start() {
    const deck = shuffle([...ANIMALS, ...ANIMALS]);
    setCards(deck);
    setMatched(Array(deck.length).fill(false));
    setOpen([]);
    setMoves(0);
    setPhase("play");
  }

  function flip(index: number) {
    if (open.length >= 2 || open.includes(index) || matched[index]) return;
    playPop();
    const nextOpen = [...open, index];
    setOpen(nextOpen);
    if (nextOpen.length < 2) return;

    setMoves((m) => m + 1);
    const [first, second] = nextOpen;
    if (cards[first] === cards[second]) {
      setTimeout(() => {
        playCorrect();
        setMatched((prev) => {
          const next = [...prev];
          next[first] = true;
          next[second] = true;
          if (next.every(Boolean)) {
            setPhase("end");
            playWin();
          }
          return next;
        });
        setOpen([]);
      }, 500);
    } else {
      setTimeout(() => {
        playWrong();
        setOpen([]);
      }, 1000);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-sky-50 to-blue-100 px-4 py-8 text-zinc-800 select-none">
      <h1 className="text-3xl font-black sm:text-4xl">🐼 えあわせ</h1>

      {phase === "start" && (
        <div className="mt-10 flex w-full max-w-md flex-col items-center gap-6">
          <p className="text-center text-xl font-bold leading-relaxed">
            カードを 2まい めくって
            <br />
            おなじ どうぶつを みつけてね！
          </p>
          <button
            onClick={start}
            className="w-full rounded-3xl border-4 border-sky-400 bg-sky-200 py-6 text-3xl font-black shadow-lg transition-transform hover:scale-105 active:scale-95 touch-manipulation"
          >
            ▶ はじめる！
          </button>
        </div>
      )}

      {phase === "play" && (
        <div className="mt-6 flex w-full max-w-md flex-col items-center gap-5">
          <p className="text-xl font-black">めくった かいすう：{moves}</p>
          <div className="grid w-full grid-cols-3 gap-3 sm:grid-cols-4">
            {cards.map((emoji, i) => {
              const faceUp = open.includes(i) || matched[i];
              return (
                <button
                  key={i}
                  onClick={() => flip(i)}
                  disabled={matched[i]}
                  className={`flex aspect-square items-center justify-center rounded-2xl border-4 text-4xl shadow-md transition-transform active:scale-95 touch-manipulation sm:text-5xl ${
                    matched[i]
                      ? "border-green-300 bg-green-100"
                      : faceUp
                        ? "border-sky-300 bg-white"
                        : "border-indigo-300 bg-indigo-400 hover:scale-105"
                  }`}
                  aria-label={faceUp ? emoji : "うらむきの カード"}
                >
                  {faceUp ? (
                    <span className="animate-pop">{emoji}</span>
                  ) : (
                    <span className="text-3xl text-white">❓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase === "end" && (
        <div className="mt-10 flex w-full max-w-md flex-col items-center gap-6">
          <p className="text-5xl">🎉</p>
          <p className="text-2xl font-black">
            {moves}かいで ぜんぶ みつけたよ！
          </p>
          <p className="text-3xl font-black text-sky-600">
            {moves <= 10
              ? "すごい！きおくりょく ばつぐん！"
              : moves <= 15
                ? "やったね！じょうずだね！"
                : "クリア おめでとう！"}
          </p>
          <button
            onClick={start}
            className="w-full rounded-3xl border-4 border-sky-400 bg-sky-200 py-5 text-2xl font-black shadow-lg transition-transform hover:scale-105 active:scale-95 touch-manipulation"
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
