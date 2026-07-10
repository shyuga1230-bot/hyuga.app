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

const DATE_PATTERNS: RegExp[] = [
  // 2024/01/05(金) / 2024/1/5(Fri) / 2024.01.05(金)
  /^(\d{4})[/.年](\d{1,2})[/.月](\d{1,2})日?\s*(?:\([^)]+\)|（[^）]+）)?\s*$/,
  // 2024.01.05 金曜日
  /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})\s+\S+曜日\s*$/,
  // Fri, 1/5/2024 (英語版: 月/日/年)
  /^[A-Za-z]{3,9},\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/,
];

// 「午前10:23」「午後 11:05」「10:23 AM」「23:45」
const TIME_PART =
  "(?:(午前|午後|AM|PM|am|pm)\\s*)?(\\d{1,2}):(\\d{2})(?:\\s*(AM|PM|am|pm))?";

const MESSAGE_LINE = new RegExp(`^${TIME_PART}\\t([^\\t]+)\\t([\\s\\S]*)$`);
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
    kind: "missed-call",
    test: (t) => /^☎\s*(不在着信|応答なし|Missed call|No answer)/.test(t),
  },
  {
    kind: "call",
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

function tryParseDateLine(line: string): number | null {
  for (let i = 0; i < DATE_PATTERNS.length; i++) {
    const m = line.match(DATE_PATTERNS[i]);
    if (!m) continue;
    // 英語版パターン(index 2)は 月/日/年 の順
    const [y, mo, d] =
      i === 2
        ? [Number(m[3]), Number(m[1]), Number(m[2])]
        : [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    return new Date(y, mo - 1, d).getTime();
  }
  return null;
}

export function parseLineExport(raw: string): ParseResult {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");

  let chatTitle: string | null = null;
  let currentDate: number | null = null;
  const messages: ParsedMessage[] = [];
  let skippedLines = 0;
  let last: ParsedMessage | null = null;

  for (const rawLine of lines) {
    // 複数行メッセージの継続行を先に判定したいので、trimは判定ごとに行う
    const line = rawLine.replace(/‎|‏|﻿/g, "");
    const trimmed = line.trim();

    if (trimmed === "") {
      // 空行: 複数行メッセージ内の空行の可能性もあるが、
      // エクスポート仕様では日付ブロックの区切りに使われるため無視する
      continue;
    }

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

    const dateMs = tryParseDateLine(trimmed);
    if (dateMs !== null) {
      currentDate = dateMs;
      last = null;
      continue;
    }

    const msgMatch = line.match(MESSAGE_LINE);
    if (msgMatch && currentDate !== null) {
      const [, prefix, hStr, minStr, suffix, sender, body] = msgMatch;
      const hour = toHour24(Number(hStr), prefix, suffix);
      if (hour <= 23 && Number(minStr) <= 59) {
        const timestamp =
          currentDate + hour * 3600_000 + Number(minStr) * 60_000;
        const text = body.replace(/^"|"$/g, "");
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
      continue;
    }

    if (last !== null) {
      // タイムスタンプなし行 = 直前メッセージの続き
      last.text += "\n" + line.replace(/"$/g, "");
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
