import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "あそびのひろば",
  description: "小学1年生から遊べるミニゲームがいっぱい！",
};

const games = [
  {
    href: "/games/tashizan",
    emoji: "🧮",
    name: "たしざん",
    description: "すうじの もんだいに こたえよう！",
    bg: "bg-amber-100 hover:bg-amber-200 border-amber-300",
  },
  {
    href: "/games/mogura",
    emoji: "🐹",
    name: "もぐらたたき",
    description: "でてきた もぐらを タッチ！",
    bg: "bg-green-100 hover:bg-green-200 border-green-300",
  },
  {
    href: "/games/eawase",
    emoji: "🐼",
    name: "えあわせ",
    description: "おなじ どうぶつを みつけてね！",
    bg: "bg-sky-100 hover:bg-sky-200 border-sky-300",
  },
];

export default function GamesPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-yellow-50 to-orange-100 px-4 py-10 text-zinc-800">
      <h1 className="text-4xl font-black tracking-wide sm:text-5xl">
        🎈 あそびの ひろば 🎈
      </h1>
      <p className="mt-4 text-lg font-bold text-zinc-600">
        すきな ゲームを えらんでね！
      </p>
      <div className="mt-10 grid w-full max-w-3xl gap-6 sm:grid-cols-3">
        {games.map((game) => (
          <Link
            key={game.href}
            href={game.href}
            className={`flex flex-col items-center gap-3 rounded-3xl border-4 p-8 shadow-lg transition-transform hover:scale-105 active:scale-95 ${game.bg}`}
          >
            <span className="text-6xl">{game.emoji}</span>
            <span className="text-2xl font-black">{game.name}</span>
            <span className="text-center text-sm font-bold text-zinc-600">
              {game.description}
            </span>
          </Link>
        ))}
      </div>
      <Link
        href="/"
        className="mt-12 rounded-full bg-white px-6 py-3 text-lg font-bold text-zinc-600 shadow hover:bg-zinc-100"
      >
        ← おうちに もどる
      </Link>
    </div>
  );
}
