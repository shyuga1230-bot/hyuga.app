import { useEffect, useRef, useState } from "react";
import type { PairStats } from "@/lib/line/analyze";
import type { Verdict } from "@/lib/line/verdict";
import { fmtDate, fmtDuration, pct } from "@/lib/line/format";
import {
  BalanceMeter,
  ChartCard,
  CompareBars,
  HourHistogram,
  Legend,
  ShareBar,
  StatTile,
} from "./charts";

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-live="polite"
      className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
    >
      {state === "copied"
        ? "コピーしました ✓"
        : state === "failed"
          ? "コピーできませんでした"
          : "結果をコピー"}
    </button>
  );
}

function buildShareText(stats: PairStats, verdict: Verdict): string {
  return [
    `【LINEカップル偏見診断】`,
    `${stats.a.name} × ${stats.b.name} は「${verdict.archetype}」${verdict.emoji}`,
    `${verdict.tagline}`,
    `偏見ラブラブ度: ${verdict.loveScore}/100`,
    `来年も続いてる確率(偏見): ${verdict.survivalRate}%`,
  ].join("\n");
}

export function Results({
  stats,
  verdict,
  onReset,
}: {
  stats: PairStats;
  verdict: Verdict;
  onReset: () => void;
}) {
  const { a, b } = stats;

  const compareMetrics = [
    {
      label: "返信速度の中央値(短いほど即レス)",
      // nullは「返信実績なし」= バーを描かない(0にすると最速に見えてしまう)
      aValue: a.medianReplyMs ?? 0,
      bValue: b.medianReplyMs ?? 0,
      aDisplay:
        a.medianReplyMs !== null ? fmtDuration(a.medianReplyMs) : "返信なし",
      bDisplay:
        b.medianReplyMs !== null ? fmtDuration(b.medianReplyMs) : "返信なし",
    },
    {
      label: "平均文字数",
      aValue: a.avgLength,
      bValue: b.avgLength,
      aDisplay: `${Math.round(a.avgLength)}文字`,
      bDisplay: `${Math.round(b.avgLength)}文字`,
    },
    {
      label: "会話の口火を切った回数",
      aValue: a.sessionStarts,
      bValue: b.sessionStarts,
      aDisplay: `${a.sessionStarts}回`,
      bDisplay: `${b.sessionStarts}回`,
    },
    {
      label: "絵文字率",
      aValue: a.emojiRate,
      bValue: b.emojiRate,
      aDisplay: pct(a.emojiRate),
      bDisplay: pct(b.emojiRate),
    },
    {
      label: "笑い率(w・笑・草)",
      aValue: a.laughRate,
      bValue: b.laughRate,
      aDisplay: pct(a.laughRate),
      bDisplay: pct(b.laughRate),
    },
    {
      label: "スタンプ率",
      aValue: a.stickerRate,
      bValue: b.stickerRate,
      aDisplay: pct(a.stickerRate),
      bDisplay: pct(b.stickerRate),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 診断結果ヒーローカード */}
      <section className="rounded-2xl border border-black/10 bg-gradient-to-br from-viz-surface to-viz-surface p-6 text-center dark:border-white/10">
        <div className="text-sm text-ink-muted">
          {a.name} × {b.name} の偏見診断結果
        </div>
        <div className="mt-3 text-5xl" aria-hidden>
          {verdict.emoji}
        </div>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {verdict.archetype}
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">「{verdict.tagline}」</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {verdict.roles.map((r) => (
            <span
              key={r.name}
              className="rounded-full border border-black/10 px-3 py-1 text-xs text-ink-secondary dark:border-white/10"
            >
              {r.name}: {r.role}
            </span>
          ))}
        </div>
        <div className="mx-auto mt-5 flex max-w-lg flex-col gap-3 text-left">
          {verdict.comments.map((c, i) => (
            <p key={i} className="text-sm leading-6 text-foreground">
              {c}
            </p>
          ))}
        </div>
      </section>

      {/* スタットタイル */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="偏見ラブラブ度"
          value={`${verdict.loveScore}`}
          sub="/ 100"
        />
        <StatTile
          label="来年も続いてる確率(偏見)"
          value={`${verdict.survivalRate}%`}
        />
        <StatTile
          label="総メッセージ数"
          value={stats.totalMessages.toLocaleString()}
          sub={`${fmtDate(stats.firstTimestamp)}〜${fmtDate(stats.lastTimestamp)}`}
        />
        <StatTile
          label="1日平均"
          value={`${Math.round(stats.messagesPerDay * 10) / 10}通`}
          sub={`アクティブ${stats.activeDays}日`}
        />
      </section>

      <ChartCard title="パワーバランス(偏見)">
        <BalanceMeter
          aName={a.name}
          bName={b.name}
          balance={verdict.powerBalance}
        />
      </ChartCard>

      <ChartCard title="発言量シェア">
        <ShareBar
          aName={a.name}
          bName={b.name}
          aCount={a.messageCount}
          bCount={b.messageCount}
        />
      </ChartCard>

      <ChartCard title="ふたりの比較">
        <div className="mb-3">
          <Legend aName={a.name} bName={b.name} />
        </div>
        <CompareBars metrics={compareMetrics} />
      </ChartCard>

      <ChartCard title="時間帯別メッセージ数">
        <div className="mb-3">
          <Legend aName={a.name} bName={b.name} />
        </div>
        <HourHistogram
          aHist={a.hourHistogram}
          bHist={b.hourHistogram}
          aName={a.name}
          bName={b.name}
        />
      </ChartCard>

      {/* 細かい偏見 */}
      {verdict.observations.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-viz-surface p-4 dark:border-white/10">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            細かい偏見
          </h3>
          <ul className="flex flex-col gap-2">
            {verdict.observations.map((o, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-6 text-ink-secondary"
              >
                <span aria-hidden className="select-none text-ink-muted">
                  👀
                </span>
                {o}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <CopyButton text={buildShareText(stats, verdict)} />
        <button
          type="button"
          onClick={onReset}
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-80"
        >
          別のトークを診断する
        </button>
      </div>

      <p className="text-center text-xs leading-5 text-ink-muted">
        ※この診断はすべて偏見です。科学的根拠は一切ありません。
        <br />
        トーク履歴はブラウザ内でのみ処理され、どこにも送信・保存されません。
      </p>
    </div>
  );
}
