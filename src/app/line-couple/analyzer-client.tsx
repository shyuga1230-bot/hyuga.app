"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { analyzePair, type PairStats } from "@/lib/line/analyze";
import { generateDemoExport } from "@/lib/line/demo";
import { parseLineExport, type ParseResult } from "@/lib/line/parser";
import { judge, type Verdict } from "@/lib/line/verdict";
import { Results } from "./results";

const MIN_MESSAGES = 30;

type Phase =
  | { kind: "input" }
  | { kind: "pick"; parsed: ParseResult }
  | { kind: "result"; stats: PairStats; verdict: Verdict };

export default function AnalyzerClient() {
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runAnalysis = useCallback(
    (parsed: ParseResult, nameA: string, nameB: string) => {
      const stats = analyzePair(parsed.messages, nameA, nameB);
      if (stats === null || stats.totalMessages < MIN_MESSAGES) {
        setError(
          `この2人の間のメッセージが${stats?.totalMessages ?? 0}通しかありません。偏見を持つには${MIN_MESSAGES}通以上必要です。`,
        );
        return;
      }
      setError(null);
      setPhase({ kind: "result", stats, verdict: judge(stats) });
    },
    [],
  );

  const handleText = useCallback(
    (text: string) => {
      let parsed: ParseResult;
      try {
        parsed = parseLineExport(text);
      } catch {
        setError("読み込みに失敗しました。LINEのトーク履歴(.txt)か確認してください。");
        return;
      }
      if (parsed.messages.length < MIN_MESSAGES) {
        setError(
          parsed.messages.length === 0
            ? "メッセージを1通も読み取れませんでした。LINEアプリの「トーク履歴を送信」で書き出した.txtファイルを読み込ませてください。"
            : `読み取れたメッセージが${parsed.messages.length}通でした。偏見を持つには${MIN_MESSAGES}通以上のやりとりが必要です。もう少し会話を重ねてから来てください。`,
        );
        return;
      }
      if (parsed.participants.length < 2) {
        setError(
          "発言している人が1人しかいません。相手の返事があるトーク履歴を読み込ませてください。それはそれで心配ですが。",
        );
        return;
      }
      setError(null);
      if (parsed.participants.length === 2) {
        runAnalysis(
          parsed,
          parsed.participants[0].name,
          parsed.participants[1].name,
        );
      } else {
        // グループトーク等: 2人選んでもらう
        setPhase({ kind: "pick", parsed });
      }
    },
    [runAnalysis],
  );

  const handleFile = useCallback(
    async (file: File) => {
      try {
        handleText(await file.text());
      } catch {
        setError("ファイルを読み込めませんでした。");
      }
    },
    [handleText],
  );

  const reset = useCallback(() => {
    setPhase({ kind: "input" });
    setError(null);
    setPasted("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {phase.kind === "input" && (
        <>
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              // 子要素へ移っただけではハイライトを消さない
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              dragging
                ? "border-series-a bg-series-a/5"
                : "border-black/15 dark:border-white/20"
            }`}
          >
            <div className="text-4xl" aria-hidden>
              💬
            </div>
            <p className="text-sm text-ink-secondary">
              LINEのトーク履歴(.txt)をここにドロップ
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80"
            >
              ファイルを選ぶ
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // 同じファイルの再選択でもchangeが発火するように毎回リセット
                e.target.value = "";
                if (file) void handleFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => handleText(generateDemoExport())}
              className="text-xs text-ink-muted underline underline-offset-4 hover:text-foreground"
            >
              手元にない？サンプルデータで試す
            </button>
          </section>

          <details className="rounded-xl border border-black/10 p-4 text-sm dark:border-white/10">
            <summary className="cursor-pointer font-medium text-foreground">
              テキストを直接貼り付ける
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={8}
                placeholder={
                  "[LINE] ○○とのトーク履歴\n2026/07/01(水)\n21:04\tひなた\tおつかれ〜\n21:05\tゆうた\tおつ"
                }
                className="w-full rounded-lg border border-black/10 bg-transparent p-3 font-mono text-xs text-foreground placeholder:text-ink-muted dark:border-white/15"
              />
              <button
                type="button"
                onClick={() => handleText(pasted)}
                disabled={pasted.trim() === ""}
                className="self-end rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                これで診断する
              </button>
            </div>
          </details>

          <details className="rounded-xl border border-black/10 p-4 text-sm dark:border-white/10">
            <summary className="cursor-pointer font-medium text-foreground">
              トーク履歴の書き出し方
            </summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 leading-6 text-ink-secondary">
              <li>スマホのLINEで診断したいトークを開く</li>
              <li>右上のメニュー(≡)から「設定」を開く</li>
              <li>「トーク履歴を送信」を選び、.txtファイルを保存する</li>
              <li>そのファイルをこのページに読み込ませる</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              ※トーク履歴はブラウザの中だけで処理されます。サーバーへの送信・保存は一切ありません。
            </p>
          </details>
        </>
      )}

      {phase.kind === "pick" && (
        <ParticipantPicker
          parsed={phase.parsed}
          onPick={(a, b) => runAnalysis(phase.parsed, a, b)}
          onBack={reset}
        />
      )}

      {phase.kind === "result" && (
        <Results
          stats={phase.stats}
          verdict={phase.verdict}
          onReset={reset}
        />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-600/30 bg-red-600/5 p-3 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function ParticipantPicker({
  parsed,
  onPick,
  onBack,
}: {
  parsed: ParseResult;
  onPick: (a: string, b: string) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    parsed.participants.slice(0, 2).map((p) => p.name),
  );
  const totalMessages = useMemo(
    () => parsed.participants.reduce((sum, p) => sum + p.messageCount, 0),
    [parsed],
  );

  const toggle = (name: string) => {
    setSelected((cur) =>
      cur.includes(name)
        ? cur.filter((n) => n !== name)
        : cur.length < 2
          ? [...cur, name]
          : [cur[1], name],
    );
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/10">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          参加者が{parsed.participants.length}人います
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          診断したい2人を選んでください。
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {parsed.participants.map((p) => {
          const checked = selected.includes(p.name);
          return (
            <li key={p.name}>
              <label
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm transition-colors ${
                  checked
                    ? "border-series-a bg-series-a/10"
                    : "border-black/10 dark:border-white/15"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(p.name)}
                    className="h-4 w-4"
                  />
                  <span className="font-medium text-foreground">{p.name}</span>
                </span>
                <span className="text-xs tabular-nums text-ink-muted">
                  {p.messageCount.toLocaleString()}通 (
                  {Math.round((p.messageCount / totalMessages) * 100)}%)
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-black/10 px-5 py-2 text-sm text-foreground hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          戻る
        </button>
        <button
          type="button"
          disabled={selected.length !== 2}
          onClick={() => onPick(selected[0], selected[1])}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          この2人で診断する
        </button>
      </div>
    </section>
  );
}
