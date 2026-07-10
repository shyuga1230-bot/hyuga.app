import type { ParsedMessage } from "./parser";

/**
 * 2人分のトーク統計。すべてブラウザ内で計算する。
 */

/** 性格診断(偏見)に使う言語特徴。テキストメッセージ中の出現率 */
export interface TextTraits {
  /** 数字・時刻・場所など具体情報を含む率(S寄り) */
  concrete: number;
  /** 「かも」「なんか」「気がする」等の曖昧・想像表現率(N寄り) */
  hedge: number;
  /** 感情語(嬉しい・楽しい・やばい等)率(F寄り) */
  emotion: number;
  /** 「了解」「なるほど」等の短いドライ返答・分析語率(T寄り) */
  dry: number;
  /** 予定・予約・日程など計画語率(J寄り) */
  plan: number;
  /** 「どっちでも」「ノリで」等の無計画語率(P寄り) */
  flex: number;
  /** 感嘆符率 */
  exclaim: number;
}

export interface PersonStats {
  name: string;
  messageCount: number;
  /** テキストメッセージの総文字数 */
  charCount: number;
  /** テキストメッセージの平均文字数 */
  avgLength: number;
  /** 相手のメッセージへの返信時間の中央値(ミリ秒)。会話セッション内のみ */
  medianReplyMs: number | null;
  /** 会話セッション(6時間以上空いた後)の口火を切った回数 */
  sessionStarts: number;
  /** 会話セッションの最後の発言者だった回数 */
  sessionEnds: number;
  /** 深夜(0時〜4時台)のメッセージ率 */
  lateNightRate: number;
  /** 絵文字を含むメッセージ率 */
  emojiRate: number;
  /** ハート系絵文字を含むメッセージ率 */
  heartRate: number;
  /** 笑い表現(w, 笑, 草, ｗ)を含むメッセージ率 */
  laughRate: number;
  /** 疑問符で終わる・含むメッセージ率 */
  questionRate: number;
  /** スタンプ率(全メッセージ中) */
  stickerRate: number;
  /** 写真・動画率 */
  mediaRate: number;
  /** 「好き」「大好き」「愛してる」等の回数 */
  affectionCount: number;
  /** 「ごめん」「すまん」等の回数 */
  apologyCount: number;
  /** 「ありがとう」等の回数 */
  gratitudeCount: number;
  /** 送信取消回数 */
  unsentCount: number;
  /** 時間帯ヒストグラム(24要素) */
  hourHistogram: number[];
  /** 性格診断(偏見)用の言語特徴 */
  traits: TextTraits;
  /** 連投率: 相手の返事を待たず自分のメッセージに続けた割合 */
  doubleTextRate: number;
  /** 時間帯の散らばり(0=毎日同じ時間, 1=完全にバラバラ) */
  hourEntropy: number;
  /** 週末(土日)のメッセージ率 */
  weekendRate: number;
  /** いちばん発言が多い時間帯(0-23) */
  peakHour: number;
}

export interface PairStats {
  a: PersonStats;
  b: PersonStats;
  totalMessages: number;
  /** トーク期間(最初〜最後、ミリ秒) */
  spanMs: number;
  firstTimestamp: number;
  lastTimestamp: number;
  /** メッセージのあった日数 */
  activeDays: number;
  /** 期間中の1日平均メッセージ数(アクティブ日ベースではなく暦日ベース) */
  messagesPerDay: number;
  /** 最長沈黙(ミリ秒) */
  longestSilenceMs: number;
  /** 会話セッション数 */
  sessionCount: number;
  /** 通話回数と総通話秒数 */
  callCount: number;
  totalCallSec: number;
  /** aのメッセージ占有率(0..1) */
  aShare: number;
  /** 月別メッセージ数(時系列順) */
  monthly: { label: string; a: number; b: number }[];
  /**
   * 熱量トレンド: 期間を3等分した最後の区間の1日あたり通数 ÷ 最初の区間。
   * 1より大きければ加熱中、小さければ減速中。期間30日未満はnull
   */
  heatTrend: number | null;
}

const SESSION_GAP_MS = 6 * 3600_000;

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const HEART_RE = /[❤🧡💛💚💙💜🖤🤍🤎💕💞💓💗💖💘💝♥️😍🥰😘]/u;
// 「まじかw」「w」単体も笑いとして拾い、"windows"等の英単語中のwは拾わない
const LAUGH_RE = /(ｗ|笑|草|ワロタ)|(?:^|[^0-9A-Za-z])w+(?![0-9A-Za-z])/;
const QUESTION_RE = /[?？]/;
const URL_RE = /https?:\/\/\S+/g;

/** URLを除いた本文(URL内のwwwや?が笑い・質問判定を汚染しないように) */
function textForMatching(text: string): string {
  return text.replace(URL_RE, "");
}
const AFFECTION_RE =
  /(好き|大好き|だいすき|すき|愛してる|あいしてる|会いたい|あいたい|love you|luv u)/i;
const APOLOGY_RE = /(ごめん|ゴメン|すまん|すみません|申し訳|sorry|my bad)/i;
const GRATITUDE_RE = /(ありがとう|ありがと|感謝|thank|thx|サンキュ)/i;

// 性格診断(偏見)用の言語特徴
const CONCRETE_RE = /[0-9０-９]|時半|何時|駅|円|番線|丁目|住所|地図/;
const HEDGE_RE =
  /(かも|なんか|多分|たぶん|きっと|気がする|っぽい|ような気|もしかして|エモ|雰囲気|イメージ)/;
const EMOTION_RE =
  /(嬉し|うれし|楽し|たのし|悲し|かなし|寂し|さみし|さびし|つらい|辛い|最高|幸せ|しあわせ|泣け|泣い|感動|やば|尊い|テンション|happy)/i;
const DRY_ACK_RE =
  /^(了解|りょ+|おけ+|おっけ+|ok|okay|うん+|うい+|はい+|わかった|わかりました|なるほど|ふ[ーぅ]ん|へ[ーぇ]+|そうなんだ|それな|たしかに|確かに|そだね)[。.!！?？~〜ー\s]*$/i;
const ANALYTIC_RE = /(なぜ|理由|原因|つまり|要するに|効率|コスパ|論理|根拠|客観|整理する)/;
const PLAN_RE =
  /(予定|予約|何時に|集合|日程|スケジュール|段取り|確認しと|締切|しめきり|リマインド|決めよ|決めとこ|決めない|カレンダー)/;
const FLEX_RE =
  /(どっちでも|どちらでも|なんでもいい|何でもいい|いつでもいい|適当に|てきとー|テキトー|気分で|ノリで|そのうち|あとで考え|行き当たり)/;
const EXCLAIM_RE = /[!！]/;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function emptyPerson(name: string): PersonStats {
  return {
    name,
    messageCount: 0,
    charCount: 0,
    avgLength: 0,
    medianReplyMs: null,
    sessionStarts: 0,
    sessionEnds: 0,
    lateNightRate: 0,
    emojiRate: 0,
    heartRate: 0,
    laughRate: 0,
    questionRate: 0,
    stickerRate: 0,
    mediaRate: 0,
    affectionCount: 0,
    apologyCount: 0,
    gratitudeCount: 0,
    unsentCount: 0,
    hourHistogram: new Array(24).fill(0),
    traits: {
      concrete: 0,
      hedge: 0,
      emotion: 0,
      dry: 0,
      plan: 0,
      flex: 0,
      exclaim: 0,
    },
    doubleTextRate: 0,
    hourEntropy: 0,
    weekendRate: 0,
    peakHour: 12,
  };
}

/** 時間帯分布の正規化エントロピー(0=一極集中, 1=完全均等) */
function normalizedEntropy(hist: number[]): number {
  const total = hist.reduce((x, y) => x + y, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const v of hist) {
    if (v === 0) continue;
    const p = v / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(hist.length);
}

/**
 * 指定した2人のメッセージだけを対象に統計を計算する。
 * messagesは時系列順である前提(パーサーの出力順)。
 */
export function analyzePair(
  messages: ParsedMessage[],
  nameA: string,
  nameB: string,
): PairStats | null {
  const msgs = messages.filter(
    (m) => m.sender === nameA || m.sender === nameB,
  );
  if (msgs.length < 2) return null;

  const persons: Record<string, PersonStats> = {
    [nameA]: emptyPerson(nameA),
    [nameB]: emptyPerson(nameB),
  };
  const replyTimes: Record<string, number[]> = { [nameA]: [], [nameB]: [] };

  const emptyCounter = () => ({
    textCount: 0,
    lateNight: 0,
    emoji: 0,
    heart: 0,
    laugh: 0,
    question: 0,
    sticker: 0,
    media: 0,
    concrete: 0,
    hedge: 0,
    emotion: 0,
    dry: 0,
    plan: 0,
    flex: 0,
    exclaim: 0,
  });
  const counters: Record<string, ReturnType<typeof emptyCounter>> = {
    [nameA]: emptyCounter(),
    [nameB]: emptyCounter(),
  };

  let longestSilenceMs = 0;
  let sessionCount = 0;
  let callCount = 0;
  let totalCallSec = 0;
  const activeDaySet = new Set<string>();
  const doubleTexts: Record<string, number> = { [nameA]: 0, [nameB]: 0 };
  const weekendCounts: Record<string, number> = { [nameA]: 0, [nameB]: 0 };
  const monthlyMap = new Map<string, { a: number; b: number }>();

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const p = persons[m.sender];
    const c = counters[m.sender];
    p.messageCount++;

    const date = new Date(m.timestamp);
    p.hourHistogram[date.getHours()]++;
    activeDaySet.add(
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    );
    if (date.getHours() < 5) c.lateNight++;
    if (date.getDay() === 0 || date.getDay() === 6) weekendCounts[m.sender]++;
    const ym = `${date.getFullYear() % 100}/${date.getMonth() + 1}`;
    const month = monthlyMap.get(ym) ?? { a: 0, b: 0 };
    if (m.sender === nameA) month.a++;
    else month.b++;
    monthlyMap.set(ym, month);

    if (m.kind === "sticker") c.sticker++;
    if (m.kind === "image" || m.kind === "video") c.media++;
    if (m.kind === "unsent") p.unsentCount++;
    if (m.kind === "call") {
      callCount++;
      totalCallSec += m.callDurationSec ?? 0;
    }

    if (m.kind === "text") {
      c.textCount++;
      p.charCount += m.text.length;
      const t = textForMatching(m.text);
      if (EMOJI_RE.test(t)) c.emoji++;
      if (HEART_RE.test(t)) c.heart++;
      if (LAUGH_RE.test(t)) c.laugh++;
      if (QUESTION_RE.test(t)) c.question++;
      p.affectionCount += t.match(AFFECTION_RE) ? 1 : 0;
      p.apologyCount += t.match(APOLOGY_RE) ? 1 : 0;
      p.gratitudeCount += t.match(GRATITUDE_RE) ? 1 : 0;
      if (CONCRETE_RE.test(t)) c.concrete++;
      if (HEDGE_RE.test(t)) c.hedge++;
      if (EMOTION_RE.test(t)) c.emotion++;
      if (
        (t.trim().length <= 12 && DRY_ACK_RE.test(t.trim())) ||
        ANALYTIC_RE.test(t)
      ) {
        c.dry++;
      }
      if (PLAN_RE.test(t)) c.plan++;
      if (FLEX_RE.test(t)) c.flex++;
      if (EXCLAIM_RE.test(t)) c.exclaim++;
    }

    const prev = i > 0 ? msgs[i - 1] : null;
    const gap = prev !== null ? m.timestamp - prev.timestamp : 0;
    if (prev !== null) {
      longestSilenceMs = Math.max(longestSilenceMs, gap);
    }
    if (prev === null || gap >= SESSION_GAP_MS) {
      // 新しい会話セッションの開始
      sessionCount++;
      p.sessionStarts++;
      if (prev !== null) {
        persons[prev.sender].sessionEnds++;
      }
    } else if (prev.sender !== m.sender && gap >= 0) {
      // セッション内で相手に返信した(負の間隔は壊れた入力なので除外)
      replyTimes[m.sender].push(gap);
    } else if (prev.sender === m.sender && gap >= 0 && gap < 30 * 60_000) {
      // 相手の返事を待たない連投
      doubleTexts[m.sender]++;
    }
  }
  persons[msgs[msgs.length - 1].sender].sessionEnds++;

  for (const name of [nameA, nameB]) {
    const p = persons[name];
    const c = counters[name];
    const n = p.messageCount;
    p.avgLength = c.textCount > 0 ? p.charCount / c.textCount : 0;
    p.medianReplyMs = median(replyTimes[name]);
    p.lateNightRate = n > 0 ? c.lateNight / n : 0;
    p.stickerRate = n > 0 ? c.sticker / n : 0;
    p.mediaRate = n > 0 ? c.media / n : 0;
    p.emojiRate = c.textCount > 0 ? c.emoji / c.textCount : 0;
    p.heartRate = c.textCount > 0 ? c.heart / c.textCount : 0;
    p.laughRate = c.textCount > 0 ? c.laugh / c.textCount : 0;
    p.questionRate = c.textCount > 0 ? c.question / c.textCount : 0;
    const rate = (v: number) => (c.textCount > 0 ? v / c.textCount : 0);
    p.traits = {
      concrete: rate(c.concrete),
      hedge: rate(c.hedge),
      emotion: rate(c.emotion),
      dry: rate(c.dry),
      plan: rate(c.plan),
      flex: rate(c.flex),
      exclaim: rate(c.exclaim),
    };
    p.doubleTextRate = n > 0 ? doubleTexts[name] / n : 0;
    p.weekendRate = n > 0 ? weekendCounts[name] / n : 0;
    p.hourEntropy = normalizedEntropy(p.hourHistogram);
    p.peakHour = p.hourHistogram.indexOf(Math.max(...p.hourHistogram));
  }

  const first = msgs[0].timestamp;
  const lastTs = msgs[msgs.length - 1].timestamp;
  const spanMs = lastTs - first;
  const spanDays = Math.max(1, spanMs / 86_400_000);

  // 熱量トレンド: 期間を3等分して最初と最後の区間の密度を比較
  let heatTrend: number | null = null;
  if (spanDays >= 30) {
    const t1 = first + spanMs / 3;
    const t2 = first + (spanMs * 2) / 3;
    let firstCount = 0;
    let lastCount = 0;
    for (const m of msgs) {
      if (m.timestamp < t1) firstCount++;
      else if (m.timestamp >= t2) lastCount++;
    }
    if (firstCount > 0) heatTrend = lastCount / firstCount;
  }

  const monthly = [...monthlyMap.entries()].map(([label, v]) => ({
    label,
    a: v.a,
    b: v.b,
  }));

  return {
    a: persons[nameA],
    b: persons[nameB],
    totalMessages: msgs.length,
    spanMs,
    firstTimestamp: first,
    lastTimestamp: lastTs,
    activeDays: activeDaySet.size,
    messagesPerDay: msgs.length / spanDays,
    longestSilenceMs,
    sessionCount,
    callCount,
    totalCallSec,
    aShare: persons[nameA].messageCount / msgs.length,
    monthly,
    heatTrend,
  };
}
