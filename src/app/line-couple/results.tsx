import { useEffect, useMemo, useRef, useState } from "react";
import type { PairStats } from "@/lib/line/analyze";
import { loveCharacterSvg } from "@/lib/line/character";
import {
  diagnosePersonalities,
  type AxisResult,
  type PairPersonality,
  type PersonPersonality,
} from "@/lib/line/personality";
import type { ParsedMessage } from "@/lib/line/parser";
import { buildReport } from "@/lib/line/report";
import type { Verdict } from "@/lib/line/verdict";
import { fmtDate, fmtDuration, pct } from "@/lib/line/format";
import {
  BalanceMeter,
  ChartCard,
  CompareBars,
  HourHistogram,
  Legend,
  MonthlyChart,
  ShareBar,
  StatTile,
} from "./charts";

function CopyButton({
  text,
  label = "結果をコピー",
}: {
  text: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const [showManual, setShowManual] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      // 埋め込みページ等でクリップボード権限がない場合は旧方式へ
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    setState(ok ? "copied" : "failed");
    if (!ok) setShowManual(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };

  return (
    <>
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
            : label}
      </button>
      {showManual && (
        <div className="w-full">
          <p className="mb-2 text-xs text-ink-secondary">
            自動コピーできない環境のようです。下の文章を長押し(または全選択)してコピーしてください。
          </p>
          <textarea
            readOnly
            value={text}
            rows={7}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-lg border border-black/10 bg-transparent p-3 text-xs leading-relaxed text-foreground dark:border-white/15"
          />
        </div>
      )}
    </>
  );
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return `${fmtDate(ms)} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** ふたり史年表: 「初めて」の記録 */
function FirstsTimeline({ stats }: { stats: PairStats }) {
  const { firsts } = stats;
  const items: { ts: number; title: string; detail: string }[] = [
    {
      ts: firsts.message.timestamp,
      title: "記録上、最初のメッセージ",
      detail: `${firsts.message.sender}「${truncate(firsts.message.text, 42)}」`,
    },
  ];
  if (firsts.midnight) {
    items.push({
      ts: firsts.midnight.timestamp,
      title: "初めて日付を越えた夜",
      detail: `先に沈黙を破ったのは${firsts.midnight.sender}`,
    });
  }
  if (firsts.call) {
    items.push({
      ts: firsts.call.timestamp,
      title: "初めての通話",
      detail:
        firsts.call.durationSec > 0
          ? `通話時間 ${fmtDuration(firsts.call.durationSec * 1000)}`
          : "記念すべき第一声",
    });
  }
  if (firsts.affection) {
    items.push({
      ts: firsts.affection.timestamp,
      title: "初「好き」検出",
      detail: `${firsts.affection.sender}「${truncate(firsts.affection.text, 42)}」`,
    });
  }
  items.sort((x, y) => x.ts - y.ts);
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <li key={item.title} className="relative flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span
              aria-hidden
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-series-a"
            />
            {i < items.length - 1 && (
              <span aria-hidden className="mt-1 w-px flex-1 bg-viz-grid" />
            )}
          </div>
          <div>
            <div className="text-[11px] tabular-nums text-ink-muted">
              {fmtDateTime(item.ts)}
            </div>
            <div className="text-sm font-medium text-foreground">
              {item.title}
            </div>
            <div className="text-xs leading-5 text-ink-secondary">
              {item.detail}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

const REPLAY_LIMIT = 40;

/** 名場面リプレイ: 最も燃えた日の会話をLINE風に再生 */
function BusiestDayReplay({
  stats,
  messages,
}: {
  stats: PairStats;
  messages: ParsedMessage[];
}) {
  const dayMessages = useMemo(() => {
    if (!stats.busiestDay) return [];
    const [y, mo, d] = stats.busiestDay.label.split("/").map(Number);
    return messages.filter((m) => {
      if (m.sender !== stats.a.name && m.sender !== stats.b.name) return false;
      const t = new Date(m.timestamp);
      return (
        t.getFullYear() === y && t.getMonth() + 1 === mo && t.getDate() === d
      );
    });
  }, [stats, messages]);

  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const total = Math.min(dayMessages.length, REPLAY_LIMIT);

  const startPlay = () => {
    setPlaying(true);
    // 動きを減らす設定なら一括表示
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(total);
    }
  };

  useEffect(() => {
    if (!playing || shown >= total) return;
    const t = setTimeout(() => setShown((n) => n + 1), 170);
    return () => clearTimeout(t);
  }, [playing, shown, total]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown]);

  if (!stats.busiestDay || dayMessages.length === 0) return null;

  return (
    <ChartCard
      title={`名場面リプレイ — ${stats.busiestDay.label}(${stats.busiestDay.count}通)`}
    >
      <p className="mb-3 text-xs leading-5 text-ink-secondary">
        観測史上いちばん燃えた日の冒頭を再生します。
      </p>
      {!playing ? (
        <button
          type="button"
          onClick={startPlay}
          className="w-full rounded-xl border border-dashed border-viz-baseline py-8 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          ▶ 再生する
        </button>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex max-h-80 flex-col gap-1.5 overflow-y-auto rounded-xl bg-black/[.03] p-3 dark:bg-white/5"
          >
            {dayMessages.slice(0, shown).map((m, i) => {
              const isA = m.sender === stats.a.name;
              return (
                <div
                  key={i}
                  className={`flex ${isA ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-xs leading-5 ${
                      isA
                        ? "rounded-bl-sm bg-series-a/15 text-foreground"
                        : "rounded-br-sm bg-series-b/20 text-foreground"
                    }`}
                  >
                    {truncate(m.text, 80)}
                    <span className="ml-1.5 align-bottom text-[9px] text-ink-muted">
                      {new Date(m.timestamp).getHours()}:
                      {String(new Date(m.timestamp).getMinutes()).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {shown >= total && dayMessages.length > REPLAY_LIMIT && (
            <p className="mt-2 text-center text-xs text-ink-muted">
              …この日はこの後さらに{(stats.busiestDay.count - REPLAY_LIMIT).toLocaleString()}通続きました。続きは本物のLINEでどうぞ。
            </p>
          )}
        </>
      )}
    </ChartCard>
  );
}

function buildShareText(
  stats: PairStats,
  verdict: Verdict,
  personality: PairPersonality,
): string {
  return [
    `【LINEカップル偏見診断】`,
    `${stats.a.name} × ${stats.b.name} は「${verdict.archetype}」${verdict.emoji}`,
    `${verdict.tagline}`,
    `偏見ラブラブ度: ${verdict.loveScore}/100`,
    `来年も続いてる確率(偏見): ${verdict.survivalRate}%`,
    `${personality.a.name}: ${personality.a.mbti.type}(${personality.a.mbti.nickname})・${personality.a.love.name}`,
    `${personality.b.name}: ${personality.b.mbti.type}(${personality.b.mbti.nickname})・${personality.b.love.name}`,
    `ラブタイプ相性(偏見): ${personality.loveMatch.score}%`,
  ].join("\n");
}

function AxisMeter({ axis }: { axis: AxisResult }) {
  const towardLeft = axis.winner === axis.letters[0];
  const pos = towardLeft ? 50 - axis.strength * 45 : 50 + axis.strength * 45;
  return (
    <div
      className="flex items-center gap-2 text-xs"
      title={`${axis.labels[0]}(${axis.letters[0]}) − ${axis.labels[1]}(${axis.letters[1]})`}
    >
      <span
        className={`w-7 text-right ${towardLeft ? "font-bold text-foreground" : "text-ink-muted"}`}
      >
        {axis.letters[0]}
      </span>
      <div className="relative h-2 flex-1 rounded-full bg-viz-grid">
        <div className="absolute left-1/2 top-0 h-full w-px bg-viz-baseline" />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-viz-surface bg-foreground"
          style={{ left: `${pos}%` }}
        />
      </div>
      <span
        className={`w-7 ${towardLeft ? "text-ink-muted" : "font-bold text-foreground"}`}
      >
        {axis.letters[1]}
      </span>
      <span className="w-14 shrink-0 text-right tabular-nums text-ink-secondary">
        {axis.winner} {axis.pct}%
      </span>
    </div>
  );
}

function PersonalityBlock({
  person,
  colorClass,
}: {
  person: PersonPersonality;
  colorClass: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
        {person.name}
      </div>
      <div>
        <div className="text-2xl font-bold tracking-wide text-foreground">
          {person.mbti.type}
        </div>
        <div className="text-xs text-ink-secondary">
          {person.mbti.nickname}(偏見)
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {person.mbti.axes.map((a) => (
          <AxisMeter key={a.letters[0]} axis={a} />
        ))}
      </div>
      <p className="text-xs leading-5 text-ink-secondary">
        {person.mbti.comment}
      </p>
      <div className="border-t border-black/10 pt-3 dark:border-white/10">
        <div className="text-[11px] text-ink-muted">
          ラブタイプ16(偏見) — {person.love.key}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span
            className="shrink-0"
            dangerouslySetInnerHTML={{
              __html: loveCharacterSvg(person.love.key, 68, person.love.name),
            }}
          />
          <div>
            <div className="text-base font-semibold text-foreground">
              {person.love.name}
            </div>
            <div className="text-xs text-ink-secondary">
              「{person.love.tagline}」
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Results({
  stats,
  verdict,
  messages,
  onReset,
}: {
  stats: PairStats;
  verdict: Verdict;
  messages: ParsedMessage[];
  onReset: () => void;
}) {
  const { a, b } = stats;
  const personality = useMemo(() => diagnosePersonalities(stats), [stats]);
  const report = useMemo(
    () => buildReport(stats, verdict, personality),
    [stats, verdict, personality],
  );
  const reportText = useMemo(
    () =>
      [
        `【ふたりの偏見レポート】${a.name} × ${b.name}`,
        ...report.sections.map((sec) => `■ ${sec.heading}\n${sec.body}`),
      ].join("\n\n"),
    [report, a.name, b.name],
  );

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

      <ChartCard title="ふたり史年表">
        <FirstsTimeline stats={stats} />
      </ChartCard>

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

      <ChartCard title="ふたりの性格診断(偏見)">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PersonalityBlock person={personality.a} colorClass="bg-series-a" />
          <PersonalityBlock person={personality.b} colorClass="bg-series-b" />
        </div>
        <div className="mt-4 rounded-xl border border-black/10 p-4 text-center dark:border-white/10">
          <div className="text-xs text-ink-muted">ラブタイプ相性(偏見)</div>
          <div className="mt-2 flex items-center justify-center gap-3">
            <span
              dangerouslySetInnerHTML={{
                __html: loveCharacterSvg(
                  personality.a.love.key,
                  60,
                  personality.a.love.name,
                ),
              }}
            />
            <span aria-hidden className="text-sm text-ink-muted">
              ×
            </span>
            <span
              dangerouslySetInnerHTML={{
                __html: loveCharacterSvg(
                  personality.b.love.key,
                  60,
                  personality.b.love.name,
                ),
              }}
            />
          </div>
          <div className="mt-1 text-sm text-ink-secondary">
            {personality.a.love.name} × {personality.b.love.name}
          </div>
          <div className="mt-1 text-3xl font-bold text-foreground">
            {personality.loveMatch.score}%
          </div>
          <p className="mt-2 text-xs leading-5 text-ink-secondary">
            {personality.loveMatch.comment}
          </p>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {personality.compat.map((c, i) => (
            <li
              key={i}
              className="flex gap-2 text-sm leading-6 text-ink-secondary"
            >
              <span aria-hidden className="select-none text-ink-muted">
                💘
              </span>
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-4 text-ink-muted">
          ※本家MBTI・16Personalities・各種ラブタイプ診断とは一切関係のない、トーク統計いじりによる偏見です。
        </p>
      </ChartCard>

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

      {stats.monthly.length >= 2 && (
        <ChartCard title="熱量の推移(月別メッセージ数)">
          <div className="mb-3">
            <Legend aName={a.name} bName={b.name} />
          </div>
          <MonthlyChart monthly={stats.monthly} aName={a.name} bName={b.name} />
          {stats.heatTrend !== null && (
            <p className="mt-3 text-xs leading-5 text-ink-secondary">
              {stats.heatTrend > 1.3
                ? `直近の熱量は初期の${Math.round(stats.heatTrend * 100)}%。まだ上り坂です。`
                : stats.heatTrend < 0.7
                  ? `直近の熱量は初期の${Math.round(stats.heatTrend * 100)}%。落ち着いてきました(悪いことではない)。`
                  : "熱量はほぼ横ばい。安定飛行中です。"}
            </p>
          )}
        </ChartCard>
      )}

      <BusiestDayReplay stats={stats} messages={messages} />

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

      {/* 偏見レポート */}
      <section className="rounded-xl border border-black/10 bg-viz-surface p-5 dark:border-white/10">
        <h3 className="mb-4 text-sm font-medium text-foreground">
          ふたりの偏見レポート
        </h3>
        <div className="flex flex-col gap-4">
          {report.sections.map((sec) => (
            <div key={sec.heading}>
              <h4 className="mb-1 text-xs font-bold tracking-wide text-ink-muted">
                {sec.heading}
              </h4>
              <p className="text-sm leading-7 text-foreground">{sec.body}</p>
            </div>
          ))}
        </div>
      </section>

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
        <CopyButton text={buildShareText(stats, verdict, personality)} />
        <CopyButton text={reportText} label="レポートをコピー" />
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
