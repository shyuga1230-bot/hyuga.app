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
  /** 相手と比べて特徴的によく使う言葉(口癖)上位 */
  topPhrases: { token: string; count: number }[];
  /** 平日9〜18時の返信中央値(勤務時間中の即レス度) */
  workReplyMedianMs: number | null;
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
  /** 二人ともよく使う「ふたり語」(汎用語を除く) */
  sharedPhrases: { token: string; count: number }[];
  /** ふたり史年表: 「初めて」の記録 */
  firsts: {
    message: { timestamp: number; sender: string; text: string };
    affection: { timestamp: number; sender: string; text: string } | null;
    call: { timestamp: number; durationSec: number } | null;
    midnight: { timestamp: number; sender: string } | null;
  };
  /** 謝罪から相手の返信(仲直り)までの中央値 */
  makeupMedianMs: number | null;
  /** ケンカ(謝罪)が発生しやすい曜日・時間帯(例: 「日曜日の深夜」) */
  quarrelPattern: string | null;
  /** 観測史上最もメッセージが多かった日 */
  busiestDay: { label: string; count: number } | null;
  /** 連続でやりとりした最長日数 */
  longestStreakDays: number;
  /** 謝罪イベント(2日以上空けてクラスタ化)の間隔中央値(日)。3回未満はnull */
  quarrelIntervalDays: number | null;
  /** 最長の1回の通話(秒) */
  maxCallSec: number;
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
    topPhrases: [],
    workReplyMedianMs: null,
  };
}

// 口癖抽出: 形態素解析なしの簡易トークン化。
// 記号・数字・絵文字で区切り、2〜8文字の短い言い回しを数える。
// 全角記号は見た目で区別しづらいのでコードポイントで明示する
const TOKEN_SPLIT = new RegExp(
  "[\\s、。,.・…~!?:;\"'/\\\\*+=<>@#$%^&|{}\\[\\]()「」『』【】0-9０-９" +
    "\\u30FC\\uFF70" + // ー ｰ (長音)
    "\\uFF01\\uFF1F\\uFF5E\\u301C" + // ！ ？ ~ 〜
    "\\uFF08\\uFF09\\uFF1A\\uFF1B\\uFF0C\\uFF0E" + // () : ; , .
    "]+",
  "u",
);

function extractTokens(text: string): string[] {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ");
  const tokens = cleaned
    .split(TOKEN_SPLIT)
    .filter((t) => t.length >= 2 && t.length <= 8);
  return tokens;
}

// 「ふたり語」から除外する、どのカップルでも頻出する汎用語
const GENERIC_TOKENS = new Set([
  "うん", "そう", "はい", "了解", "りょ", "おけ", "おっけ", "ok", "OK",
  "わかった", "なるほど", "たしかに", "確かに", "そだね", "それな",
  "おはよう", "おはよ", "おやすみ", "おつかれ", "お疲れ", "ありがとう",
  "ありがと", "ごめん", "です", "ます", "した", "から", "けど", "って",
  "だから", "でも", "まじ", "ほんと", "本当", "今日", "明日", "昨日",
  "そして", "あと", "なんか", "ちょっと", "やっぱ", "まあ", "うける",
]);

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
  const tokenMaps: Record<string, Map<string, number>> = {
    [nameA]: new Map(),
    [nameB]: new Map(),
  };
  const workReplyTimes: Record<string, number[]> = { [nameA]: [], [nameB]: [] };
  const dayCounts = new Map<string, number>();
  const dayNumbers = new Set<number>();
  const apologyTimestamps: number[] = [];
  const apologyEvents: { ts: number; sender: string; index: number }[] = [];
  let maxCallSec = 0;
  let firstAffection: PairStats["firsts"]["affection"] = null;
  let firstCall: PairStats["firsts"]["call"] = null;
  let firstMidnight: PairStats["firsts"]["midnight"] = null;

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const p = persons[m.sender];
    const c = counters[m.sender];
    p.messageCount++;

    const date = new Date(m.timestamp);
    p.hourHistogram[date.getHours()]++;
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    activeDaySet.add(dayKey);
    dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
    dayNumbers.add(
      Math.floor(
        new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
        ).getTime() / 86_400_000,
      ),
    );
    if (date.getHours() < 5) {
      c.lateNight++;
      if (firstMidnight === null) {
        firstMidnight = { timestamp: m.timestamp, sender: m.sender };
      }
    }
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
      maxCallSec = Math.max(maxCallSec, m.callDurationSec ?? 0);
      if (firstCall === null) {
        firstCall = {
          timestamp: m.timestamp,
          durationSec: m.callDurationSec ?? 0,
        };
      }
    }

    if (m.kind === "text") {
      c.textCount++;
      p.charCount += m.text.length;
      const t = textForMatching(m.text);
      if (EMOJI_RE.test(t)) c.emoji++;
      if (HEART_RE.test(t)) c.heart++;
      if (LAUGH_RE.test(t)) c.laugh++;
      if (QUESTION_RE.test(t)) c.question++;
      if (AFFECTION_RE.test(t)) {
        p.affectionCount++;
        if (firstAffection === null) {
          firstAffection = {
            timestamp: m.timestamp,
            sender: m.sender,
            text: m.text,
          };
        }
      }
      if (APOLOGY_RE.test(t)) {
        p.apologyCount++;
        apologyTimestamps.push(m.timestamp);
        if (
          apologyEvents.length === 0 ||
          m.timestamp - apologyEvents[apologyEvents.length - 1].ts >
            2 * 86_400_000
        ) {
          apologyEvents.push({ ts: m.timestamp, sender: m.sender, index: i });
        }
      }
      p.gratitudeCount += t.match(GRATITUDE_RE) ? 1 : 0;
      const tokens = extractTokens(t);
      const map = tokenMaps[m.sender];
      for (const token of tokens) {
        map.set(token, (map.get(token) ?? 0) + 1);
      }
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
      // 平日9〜18時の返信は勤務中即レス度として別集計
      const d = new Date(m.timestamp);
      if (d.getDay() >= 1 && d.getDay() <= 5 && d.getHours() >= 9 && d.getHours() < 18) {
        workReplyTimes[m.sender].push(gap);
      }
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
    p.workReplyMedianMs = median(workReplyTimes[name]);
  }

  // 口癖: 相手との使用比(ログオッズ)×頻度で「その人らしい」言葉を選ぶ
  for (const [name, other] of [
    [nameA, nameB],
    [nameB, nameA],
  ] as const) {
    const mine = tokenMaps[name];
    const theirs = tokenMaps[other];
    persons[name].topPhrases = [...mine.entries()]
      .filter(([, cnt]) => cnt >= 8)
      .map(([token, cnt]) => ({
        token,
        count: cnt,
        score:
          Math.log((cnt + 1) / ((theirs.get(token) ?? 0) + 1)) *
          Math.log(1 + cnt),
      }))
      .filter((x) => x.score > 0.8)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3)
      .map(({ token, count }) => ({ token, count }));
  }

  // ふたり語: 双方がよく使い、かつ汎用語でないもの
  const sharedPhrases = [...tokenMaps[nameA].entries()]
    .filter(([token, cnt]) => {
      const otherCnt = tokenMaps[nameB].get(token) ?? 0;
      return cnt >= 10 && otherCnt >= 10 && !GENERIC_TOKENS.has(token);
    })
    .map(([token, cnt]) => ({
      token,
      count: cnt + (tokenMaps[nameB].get(token) ?? 0),
      min: Math.min(cnt, tokenMaps[nameB].get(token) ?? 0),
    }))
    .sort((x, y) => y.min - x.min)
    .slice(0, 3)
    .map(({ token, count }) => ({ token, count }));

  // 記録簿: 最も燃えた日
  let busiestDay: { label: string; count: number } | null = null;
  for (const [key, count] of dayCounts) {
    if (busiestDay === null || count > busiestDay.count) {
      const [y, mo, d] = key.split("-").map(Number);
      busiestDay = { label: `${y}/${mo + 1}/${d}`, count };
    }
  }

  // 記録簿: 連続会話日数
  const sortedDays = [...dayNumbers].sort((x, y) => x - y);
  let longestStreakDays = sortedDays.length > 0 ? 1 : 0;
  let streak = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    streak = sortedDays[i] === sortedDays[i - 1] + 1 ? streak + 1 : 1;
    longestStreakDays = Math.max(longestStreakDays, streak);
  }

  // 記録簿: 謝罪イベントの周期
  let quarrelIntervalDays: number | null = null;
  if (apologyEvents.length >= 3) {
    const intervals = apologyEvents
      .slice(1)
      .map((e, i) => (e.ts - apologyEvents[i].ts) / 86_400_000);
    quarrelIntervalDays = median(intervals);
  }

  // ケンカの法医学: 謝罪→相手の返信(仲直り)までの時間
  const makeupTimes: number[] = [];
  for (const event of apologyEvents) {
    for (let j = event.index + 1; j < msgs.length; j++) {
      const next = msgs[j];
      if (next.timestamp - event.ts > 48 * 3600_000) break;
      if (next.sender !== event.sender) {
        makeupTimes.push(next.timestamp - event.ts);
        break;
      }
    }
  }
  const makeupMedianMs = median(makeupTimes);

  // ケンカが発生しやすい曜日・時間帯
  let quarrelPattern: string | null = null;
  if (apologyTimestamps.length >= 5) {
    const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
    const BANDS: [string, (h: number) => boolean][] = [
      ["深夜", (h) => h < 5],
      ["朝", (h) => h >= 5 && h < 11],
      ["昼", (h) => h >= 11 && h < 17],
      ["夜", (h) => h >= 17],
    ];
    const wdCounts = new Array(7).fill(0);
    const bandCounts = new Array(BANDS.length).fill(0);
    for (const ts of apologyTimestamps) {
      const d = new Date(ts);
      wdCounts[d.getDay()]++;
      bandCounts[BANDS.findIndex(([, test]) => test(d.getHours()))]++;
    }
    const topWd = wdCounts.indexOf(Math.max(...wdCounts));
    const topBand = bandCounts.indexOf(Math.max(...bandCounts));
    const wdShare = wdCounts[topWd] / apologyTimestamps.length;
    const bandShare = bandCounts[topBand] / apologyTimestamps.length;
    if (wdShare > 0.3 && bandShare > 0.35) {
      quarrelPattern = `${WEEKDAYS[topWd]}曜日の${BANDS[topBand][0]}`;
    } else if (bandShare > 0.45) {
      quarrelPattern = BANDS[topBand][0];
    }
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
    sharedPhrases,
    firsts: {
      message: {
        timestamp: msgs[0].timestamp,
        sender: msgs[0].sender,
        text: msgs[0].text,
      },
      affection: firstAffection,
      call: firstCall,
      midnight: firstMidnight,
    },
    makeupMedianMs,
    quarrelPattern,
    busiestDay,
    longestStreakDays,
    quarrelIntervalDays,
    maxCallSec,
  };
}
