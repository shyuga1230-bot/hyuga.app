import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-sky-100 to-yellow-50 px-4 py-16 text-zinc-800">
      <main className="flex flex-col items-center gap-8 text-center">
        <span className="text-8xl">🌻</span>
        <h1 className="text-4xl font-black tracking-wide sm:text-5xl">
          hyuga.app へ ようこそ！
        </h1>
        <p className="text-xl font-bold text-zinc-600">
          たのしい ゲームで あそぼう！
        </p>
        <Link
          href="/games"
          className="rounded-full border-4 border-orange-400 bg-orange-300 px-10 py-5 text-2xl font-black shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          🎈 あそびのひろばへ いく →
        </Link>
      </main>
    </div>
  );
}
