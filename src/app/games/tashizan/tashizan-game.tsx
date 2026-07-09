"use client";

import { useState } from "react";
import Link from "next/link";
import { playCorrect, playWrong, playWin } from "../sounds";

const TOTAL = 10;

type Level = "easy" | "hard";
type Phase = "start" | "play" | "result";

type Question = {
  a: number;
  b: number;
  choices: number[];
};

type Feedback = {
  correct: boolean;
  answer: number;
};

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function makeQuestion(level: Level): Question {
  let a: number;
  let b: number;
  if (level === "easy") {
    // こたえが 10 までの たしざん
    a = randInt(1, 9);
    b = randInt(1, 10 - a);
  } else {
    // くりあがりのある たしざん（こたえは 11〜18）
    a = randInt(2, 9);
    b = randInt(Math.max(2, 11 - a), 9);
  }
  const answer = a + b;
  const choices = new Set([answer]);
  while (choices.size < 3) {
    const delta = randInt(1, 3) * (Math.random() < 0.5 ? -1 : 1);
    const c = answer + delta;
    if (c >= 0 && c <= 20) choices.add(c);
  }
  return {
    a,
    b,
    choices: [...choices].sort(() => Math.random() - 0.5),
  };
}

export default function TashizanGame() {
  const [phase, setPhase] = useState<Phase>("start");
  const [level, setLevel] = useState<Level>("easy");
  const [questionNo, setQuestionNo] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function start(selected: Level) {
    setLevel(selected);
    setScore(0);
    setQuestionNo(0);
    setFeedback(null);
    setQuestion(makeQuestion(selected));
    setPhase("play");
  }

  function answer(choice: number) {
    if (!question || feedback) return;
    const correct = choice === question.a + question.b;
    if (correct) {
      setScore((s) => s + 1);
      playCorrect();
    } else {
      playWrong();
    }
    setFeedback({ correct, answer: question.a + question.b });
    setTimeout(() => {
      setFeedback(null);
      if (questionNo + 1 >= TOTAL) {
        setPhase("result");
        playWin();
      } else {
        setQuestionNo((n) => n + 1);
        setQuestion(makeQuestion(level));
      }
    }, 1400);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-amber-50 to-orange-100 px-4 py-8 text-zinc-800 select-none">
      <h1 className="text-3xl font-black sm:text-4xl">🧮 たしざん</h1>

      {phase === "start" && (
        <div className="mt-10 flex w-full max-w-md flex-col items-center gap-6">
          <p className="text-center text-xl font-bold leading-relaxed">
            もんだいは ぜんぶで {TOTAL}もん！
            <br />
            ただしい こたえを タッチしてね
          </p>
          <button
            onClick={() => start("easy")}
            className="w-full rounded-3xl border-4 border-green-400 bg-green-200 py-6 text-2xl font-black shadow-lg transition-transform hover:scale-105 active:scale-95 touch-manipulation"
          >
            🌱 やさしい（10まで）
          </button>
          <button
            onClick={() => start("hard")}
            className="w-full rounded-3xl border-4 border-rose-400 bg-rose-200 py-6 text-2xl font-black shadow-lg transition-transform hover:scale-105 active:scale-95 touch-manipulation"
          >
            🔥 むずかしい（くりあがり）
          </button>
        </div>
      )}

      {phase === "play" && question && (
        <div className="mt-6 flex w-full max-w-md flex-col items-center gap-6">
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL }, (_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full ${
                  i < questionNo ? "bg-orange-400" : "bg-orange-200"
                }`}
              />
            ))}
          </div>

          <div className="w-full rounded-3xl bg-white p-6 text-center shadow-lg">
            <p className="text-5xl font-black tracking-wider">
              {question.a} ＋ {question.b} ＝ ？
            </p>
            <p className="mt-4 text-2xl leading-relaxed break-all">
              {"🍎".repeat(question.a)}
              <span className="mx-1 text-lg font-bold text-zinc-400">と</span>
              {"🍊".repeat(question.b)}
            </p>
          </div>

          <div className="grid w-full grid-cols-3 gap-4">
            {question.choices.map((choice) => (
              <button
                key={choice}
                onClick={() => answer(choice)}
                disabled={feedback !== null}
                className="rounded-3xl border-4 border-sky-300 bg-sky-100 py-6 text-4xl font-black shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-60 touch-manipulation"
              >
                {choice}
              </button>
            ))}
          </div>

          {feedback && (
            <div className="animate-pop text-center">
              {feedback.correct ? (
                <p className="text-4xl font-black text-green-500">
                  ⭕ せいかい！
                </p>
              ) : (
                <p className="text-3xl font-black text-rose-500">
                  ❌ こたえは {feedback.answer} だよ
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {phase === "result" && (
        <div className="mt-10 flex w-full max-w-md flex-col items-center gap-6">
          <p className="text-2xl font-black">
            せいかいは {score}こ だったよ！
          </p>
          <p className="text-center text-3xl leading-relaxed break-all">
            {"⭐".repeat(score)}
            {"☆".repeat(TOTAL - score)}
          </p>
          <p className="text-3xl font-black text-orange-500">
            {score === TOTAL
              ? "ぜんぶ せいかい！すごい！！"
              : score >= 7
                ? "よく できました！"
                : "また ちょうせんしてね！"}
          </p>
          <button
            onClick={() => start(level)}
            className="w-full rounded-3xl border-4 border-amber-400 bg-amber-200 py-5 text-2xl font-black shadow-lg transition-transform hover:scale-105 active:scale-95 touch-manipulation"
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
