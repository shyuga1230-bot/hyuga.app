import type { ParsedMessage } from "./parser";

/**
 * 2人分のトーク統計。すべてブラウザ内で計算する。
 */

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
  };
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

  const counters: Record<
    string,
    {
      textCount: number;
      lateNight: number;
      emoji: number;
      heart: number;
      laugh: number;
      question: number;
      sticker: number;
      media: number;
    }
  > = {
    [nameA]: { textCount: 0, lateNight: 0, emoji: 0, heart: 0, laugh: 0, question: 0, sticker: 0, media: 0 },
    [nameB]: { textCount: 0, lateNight: 0, emoji: 0, heart: 0, laugh: 0, question: 0, sticker: 0, media: 0 },
  };

  let longestSilenceMs = 0;
  let sessionCount = 0;
  let callCount = 0;
  let totalCallSec = 0;
  const activeDaySet = new Set<string>();

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
  }

  const first = msgs[0].timestamp;
  const lastTs = msgs[msgs.length - 1].timestamp;
  const spanMs = lastTs - first;
  const spanDays = Math.max(1, spanMs / 86_400_000);

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
  };
}
