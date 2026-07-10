/**
 * LINEトーク履歴エクスポート(.txt)のパーサー。
 *
 * 対応形式:
 * - 日本語版 iOS/Android: 「[LINE] ○○とのトーク履歴」ヘッダー、
 *   日付行「2024/01/05(金)」「2024.01.05 金曜日」、
 *   メッセージ行「12:34\t名前\t本文」(タブ区切り)
 * - 英語版: "[LINE] Chat history with ○○" / 日付行 "Fri, 1/5/2024" など
 * - 12時間表記(午前/午後、AM/PM)
 * - 複数行メッセージ(継続行にはタイムスタンプが付かない)
 * - システム行(タブ2区切り: 「12:34\t○○がグループに参加しました」)
 */

export type MessageKind =
  | "text"
  | "sticker"
  | "image"
  | "video"
  | "voice"
  | "file"
  | "call"
  | "missed-call"
  | "unsent"
  | "other-media";

export interface ParsedMessage {
  /** エポックミリ秒。日付行 + 時刻行から合成 */
  timestamp: number;
  sender: string;
  text: string;
  kind: MessageKind;
  /** 通話メッセージの通話時間(秒)。通話以外はundefined */
  callDurationSec?: number;
}

export interface ParseResult {
  /** ヘッダーから取れたトーク相手名(取れなければnull) */
  chatTitle: string | null;
  messages: ParsedMessage[];
  /** 出現順・発言数つきの参加者一覧 */
  participants: { name: string; messageCount: number }[];
  /** パースできなかった行数(継続行を除く) */
  skippedLines: number;
}

// 日付ヘッダーのパターン。曜日つきはどこに現れてもヘッダーとみなすが、
// 曜日なしの裸の日付(「2026/02/14」等)はブロックの先頭(空行の直後など)に
// 限る — メッセージ本文中の日付をヘッダー扱いしないため。
interface DatePattern {
  re: RegExp;
  hasWeekday: boolean;
  /** 月/日/年 順(英語版) */
  mdy?: boolean;
}
const DATE_PATTERNS: DatePattern[] = [
  // 2024/01/05(金) / 2024/1/5(Fri) / 2024.01.05(金) / 2024年1月5日(金)
  {
    re: /^(\d{4})[/.年](\d{1,2})[/.月](\d{1,2})日?\s*(?:\([^)]+\)|（[^）]+）)\s*$/,
    hasWeekday: true,
  },
  // 2024.01.05 金曜日
  { re: /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})\s+\S+曜日\s*$/, hasWeekday: true },
  // Fri, 1/5/2024 (英語版: 月/日/年)
  {
    re: /^[A-Za-z]{3,9},\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/,
    hasWeekday: true,
    mdy: true,
  },
  // 2024/01/05 (曜日なし。ブロック先頭でのみヘッダー扱い)
  { re: /^(\d{4})[/.年](\d{1,2})[/.月](\d{1,2})日?\s*$/, hasWeekday: false },
];

// 「午前10:23」「午後 11:05」「10:23 AM」「23:45」「12:34:56(秒つき)」
const TIME_PART =
  "(?:(午前|午後|AM|PM|am|pm)\\s*)?(\\d{1,2}):(\\d{2})(?::\\d{2})?(?:\\s*(AM|PM|am|pm))?";

const MESSAGE_LINE = new RegExp(`^${TIME_PART}\\t([^\\t]+)\\t([\\s\\S]*)$`);
// 旧形式・PC版などタブではなくスペース区切りの場合のフォールバック
const MESSAGE_LINE_SPACE = new RegExp(
  `^${TIME_PART}[ \\u3000]+(\\S+)[ \\u3000]+([\\s\\S]*)$`,
);
const SYSTEM_LINE = new RegExp(`^${TIME_PART}\\t([^\\t]*)$`);

const HEADER_TITLE = [
  /^\[LINE\]\s*(.+?)\s*とのトーク履歴\s*$/,
  /^\[LINE\]\s*Chat history (?:with|in)\s*(.+?)\s*$/i,
];
const HEADER_SAVED = [/^保存日時[：:]/, /^Saved on[：:]/i];

interface KindRule {
  kind: MessageKind;
  test: (text: string) => boolean;
}

const KIND_RULES: KindRule[] = [
  { kind: "sticker", test: (t) => t === "[スタンプ]" || t === "[Sticker]" },
  { kind: "image", test: (t) => t === "[写真]" || t === "[Photo]" || t === "[画像]" },
  { kind: "video", test: (t) => t === "[動画]" || t === "[Video]" },
  {
    kind: "voice",
    test: (t) => t === "[ボイスメッセージ]" || t === "[Voice message]",
  },
  { kind: "file", test: (t) => t === "[ファイル]" || t === "[File]" },
  {
    kind: "other-media",
    test: (t) =>
      /^\[(アルバム|ノート|位置情報|連絡先|GIF|Album|Note|Location|Contact)\]/.test(t),
  },
  {
    // 通話時間つきの☎行だけが成立した通話。
    // 不在着信・キャンセル・応答なし等はすべて missed-call
    kind: "call",
    test: (t) => /^☎/.test(t) && /\d+:\d{2}/.test(t),
  },
  {
    kind: "missed-call",
    test: (t) => /^☎/.test(t),
  },
  {
    kind: "unsent",
    test: (t) =>
      /(メッセージの送信を取り消しました|unsent a message)/.test(t),
  },
];

function classify(text: string): MessageKind {
  for (const rule of KIND_RULES) {
    if (rule.test(text)) return rule.kind;
  }
  return "text";
}

/** 「☎ 通話時間 1:23:45」等から通話秒数を取り出す */
function parseCallDuration(text: string): number | undefined {
  const m = text.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!m) return undefined;
  if (m[3] !== undefined) {
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return Number(m[1]) * 60 + Number(m[2]);
}

function toHour24(
  h: number,
  prefix: string | undefined,
  suffix: string | undefined,
): number {
  const marker = (prefix ?? suffix ?? "").toLowerCase();
  if (marker === "午後" || marker === "pm") {
    return h === 12 ? 12 : h + 12;
  }
  if (marker === "午前" || marker === "am") {
    return h === 12 ? 0 : h;
  }
  return h;
}

function tryParseDateLine(
  line: string,
): { ms: number; hasWeekday: boolean } | null {
  for (const p of DATE_PATTERNS) {
    const m = line.match(p.re);
    if (!m) continue;
    const [y, mo, d] = p.mdy
      ? [Number(m[3]), Number(m[1]), Number(m[2])]
      : [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    return { ms: new Date(y, mo - 1, d).getTime(), hasWeekday: p.hasWeekday };
  }
  return null;
}

export function parseLineExport(raw: string): ParseResult {
  // まず標準のタブ区切りで解析し、1通も取れなければスペース区切りを試す
  const tab = parseWith(raw, MESSAGE_LINE);
  if (tab.messages.length > 0) return tab;
  const space = parseWith(raw, MESSAGE_LINE_SPACE);
  return space.messages.length > tab.messages.length ? space : tab;
}

function parseWith(raw: string, messageLine: RegExp): ParseResult {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");

  let chatTitle: string | null = null;
  let currentDate: number | null = null;
  const messages: ParsedMessage[] = [];
  let skippedLines = 0;
  let last: ParsedMessage | null = null;
  // iOS形式の引用符つき複数行メッセージ("で開いて後続行の"で閉じる)の内側か
  let inQuote = false;
  // 直前が空行(=ブロックの先頭)か。先頭行はブロック先頭扱い
  let prevBlank = true;

  for (const rawLine of lines) {
    // 複数行メッセージの継続行を先に判定したいので、trimは判定ごとに行う
    const line = rawLine.replace(/‎|‏|﻿/g, "");
    const trimmed = line.trim();

    if (trimmed === "") {
      // 空行: 複数行メッセージ内の空行の可能性もあるが、
      // エクスポート仕様では日付ブロックの区切りに使われるため無視する
      prevBlank = true;
      continue;
    }
    const atBlockStart = prevBlank;
    prevBlank = false;

    if (messages.length === 0) {
      let matchedHeader = false;
      if (chatTitle === null) {
        for (const p of HEADER_TITLE) {
          const m = trimmed.match(p);
          if (m) {
            chatTitle = m[1];
            matchedHeader = true;
            break;
          }
        }
      }
      if (matchedHeader) continue;
      if (HEADER_SAVED.some((p) => p.test(trimmed))) continue;
    }

    const dateParsed = tryParseDateLine(trimmed);
    // 日付ヘッダーは時系列で単調増加する。過去に戻る日付らしき行は
    // メッセージ本文の一部とみなす(誤検出でタイムスタンプが壊れるのを防ぐ)。
    // 曜日なしの裸の日付は、ブロック先頭または解析開始直後のみヘッダー扱い
    if (
      dateParsed !== null &&
      (dateParsed.hasWeekday || atBlockStart || last === null) &&
      (currentDate === null || dateParsed.ms >= currentDate)
    ) {
      currentDate = dateParsed.ms;
      last = null;
      inQuote = false;
      continue;
    }

    const msgMatch = line.match(messageLine);
    if (msgMatch && currentDate !== null) {
      const [, prefix, hStr, minStr, suffix, sender, body] = msgMatch;
      const hour = toHour24(Number(hStr), prefix, suffix);
      if (hour <= 23 && Number(minStr) <= 59) {
        const timestamp =
          currentDate + hour * 3600_000 + Number(minStr) * 60_000;
        // iOSは複数行メッセージを"で囲む(単一行は囲まない)。
        // 開き"だけの行は引用ブロックの開始。"で開いて"で閉じる
        // 単一行は本人が打った引用符なのでそのまま残す
        let text = body;
        inQuote = false;
        if (text.startsWith('"') && !(text.length > 1 && text.endsWith('"'))) {
          text = text.slice(1);
          inQuote = true;
        }
        const kind = classify(text);
        const msg: ParsedMessage = {
          timestamp,
          sender: sender.trim(),
          text,
          kind,
        };
        if (kind === "call") {
          msg.callDurationSec = parseCallDuration(text);
        }
        messages.push(msg);
        last = msg;
        continue;
      }
    }

    if (SYSTEM_LINE.test(line) && currentDate !== null) {
      // 「12:34\t○○が参加しました」等のシステム行。分析対象外
      last = null;
      inQuote = false;
      continue;
    }

    if (last !== null) {
      // タイムスタンプなし行 = 直前メッセージの続き。
      // 引用ブロック内なら閉じ"を取り除く
      let cont = line;
      if (inQuote && cont.endsWith('"')) {
        cont = cont.slice(0, -1);
        inQuote = false;
      }
      last.text += "\n" + cont;
      continue;
    }

    skippedLines++;
  }

  const counts = new Map<string, number>();
  for (const m of messages) {
    counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  }
  const participants = [...counts.entries()]
    .map(([name, messageCount]) => ({ name, messageCount }))
    .sort((a, b) => b.messageCount - a.messageCount);

  return { chatTitle, messages, participants, skippedLines };
}
