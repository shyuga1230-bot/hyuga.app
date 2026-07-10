import type { Metadata } from "next";
import AnalyzerClient from "./analyzer-client";

export const metadata: Metadata = {
  title: "LINEカップル偏見診断",
  description:
    "LINEのトーク履歴からふたりの関係を統計分析し、どんなカップルかを偏見で断定します。データはブラウザ内で完結、送信されません。",
};

export default function LineCouplePage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="w-full max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            LINEカップル偏見診断
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-secondary">
            トーク履歴を統計分析して、ふたりがどんなカップルなのか
            <strong>偏見で</strong>断定します。
            <br />
            履歴はブラウザの中だけで処理され、どこにも送信されません。
          </p>
        </header>
        <AnalyzerClient />
      </main>
    </div>
  );
}
