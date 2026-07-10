import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-24 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-10 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            hyuga.app
          </h1>
          <p className="mt-3 text-sm text-ink-secondary">
            ちょっとしたツール置き場
          </p>
        </div>
        <Link
          href="/line-couple"
          className="group w-full rounded-2xl border border-black/10 bg-white p-6 text-left transition-colors hover:border-black/25 dark:border-white/10 dark:bg-zinc-950 dark:hover:border-white/25"
        >
          <div className="text-3xl" aria-hidden>
            💬
          </div>
          <h2 className="mt-3 text-xl font-semibold text-foreground">
            LINEカップル偏見診断
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            LINEのトーク履歴を読み込んで、ふたりがどんなカップルかを統計と偏見で断定します。データは端末内で完結。
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-foreground group-hover:underline">
            診断してみる →
          </span>
        </Link>
      </main>
    </div>
  );
}
