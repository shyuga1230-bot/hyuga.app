import type { ReactNode } from "react";

/** 診断結果ページのチャート部品。すべて純CSS/HTML、依存ライブラリなし */

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-viz-surface p-4 dark:border-white/10">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-secondary">{sub}</div>}
    </div>
  );
}

export function Legend({ aName, bName }: { aName: string; bName: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-secondary">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-series-a" />
        {aName}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-series-b" />
        {bName}
      </span>
    </div>
  );
}

export function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-viz-surface p-4 dark:border-white/10">
      <h3 className="mb-3 text-sm font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

/** 発言量シェアの積み上げ横棒(2セグメント、2pxギャップ、直接ラベル) */
export function ShareBar({
  aName,
  bName,
  aCount,
  bCount,
}: {
  aName: string;
  bName: string;
  aCount: number;
  bCount: number;
}) {
  const total = aCount + bCount;
  const aPct = total > 0 ? (aCount / total) * 100 : 50;
  // ラベルの合計が100%になるように片側だけ丸める
  const aPctLabel = Math.round(aPct);
  const bPctLabel = 100 - aPctLabel;
  return (
    <div>
      <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-md">
        <div
          className="rounded-l-md bg-series-a"
          style={{ width: `${aPct}%` }}
          title={`${aName}: ${aCount}通`}
        />
        <div
          className="flex-1 rounded-r-md bg-series-b"
          title={`${bName}: ${bCount}通`}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-ink-secondary">
        <span>
          {aName} {aCount.toLocaleString()}通 ({aPctLabel}%)
        </span>
        <span>
          {bName} {bCount.toLocaleString()}通 ({bPctLabel}%)
        </span>
      </div>
    </div>
  );
}

export interface CompareMetric {
  label: string;
  aValue: number;
  bValue: number;
  aDisplay: string;
  bDisplay: string;
}

/** 指標ごとの2人比較横棒(≤24px、データ端のみ4px丸め、値は直接ラベル) */
export function CompareBars({ metrics }: { metrics: CompareMetric[] }) {
  return (
    <div className="flex flex-col gap-4">
      {metrics.map((m) => {
        const max = Math.max(m.aValue, m.bValue, 1e-9);
        return (
          <div key={m.label}>
            <div className="mb-1 text-xs text-ink-muted">{m.label}</div>
            <div className="flex flex-col gap-[3px]">
              {(
                [
                  ["bg-series-a", m.aValue, m.aDisplay],
                  ["bg-series-b", m.bValue, m.bDisplay],
                ] as const
              ).map(([color, value, display], i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-3 flex-1">
                    <div
                      className={`h-full rounded-r ${color}`}
                      style={{
                        // 0(データなし)はバーを描かない。それ以外は最低1%は見せる
                        width:
                          value <= 0
                            ? 0
                            : `${Math.max((value / max) * 100, 1)}%`,
                      }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-secondary">
                    {display}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 24時間ヒストグラム(積み上げ縦棒、2pxギャップ、ホバーで内訳) */
export function HourHistogram({
  aHist,
  bHist,
  aName,
  bName,
}: {
  aHist: number[];
  bHist: number[];
  aName: string;
  bName: string;
}) {
  const max = Math.max(...aHist.map((v, i) => v + bHist[i]), 1);
  return (
    <div>
      <div className="flex h-28 items-end gap-[2px] border-b border-viz-baseline">
        {aHist.map((a, hour) => {
          const b = bHist[hour];
          return (
            <div
              key={hour}
              className="flex h-full flex-1 flex-col justify-end gap-[2px]"
              title={`${hour}時台 — ${aName}: ${a}通 / ${bName}: ${b}通`}
            >
              <div
                className="w-full rounded-t-[3px] bg-series-b"
                style={{ height: `${(b / max) * 100}%` }}
              />
              <div
                className="w-full bg-series-a"
                style={{
                  height: `${(a / max) * 100}%`,
                  borderRadius: b === 0 ? "3px 3px 0 0" : 0,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-muted">
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h}>{h}時</span>
        ))}
      </div>
    </div>
  );
}

/** パワーバランスメーター(-100〜+100、中心基準) */
export function BalanceMeter({
  aName,
  bName,
  balance,
}: {
  aName: string;
  bName: string;
  /** -100(a側が尽くしてる)〜+100(b側が尽くしてる) */
  balance: number;
}) {
  const clamped = Math.max(-100, Math.min(100, balance));
  // マーカー位置: 0% = a側全振り, 100% = b側全振り
  const pos = 50 + clamped / 2;
  return (
    <div>
      <div className="relative h-4 w-full rounded-full bg-viz-grid">
        <div className="absolute left-1/2 top-0 h-full w-px bg-viz-baseline" />
        <div
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-viz-surface bg-foreground shadow"
          style={{ left: `${pos}%` }}
          title={
            Math.abs(clamped) < 5
              ? "パワーバランス: ほぼ対等"
              : `パワーバランス: ${clamped > 0 ? bName : aName}側が尽くし気味`
          }
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-ink-secondary">
        <span>{aName}が尽くしてる</span>
        <span className="text-ink-muted">対等</span>
        <span>{bName}が尽くしてる</span>
      </div>
    </div>
  );
}
