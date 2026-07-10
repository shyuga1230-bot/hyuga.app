import type { PairStats, PersonStats } from "./analyze";
import { fmtDuration, pct } from "./format";

/**
 * 偏見診断エンジン。
 * 統計から「カップルアーキタイプ」をスコアリングで断定し、
 * 実データを引用した偏見コメントを生成する。
 * 科学的根拠は一切ない。それがコンセプト。
 */

export interface Verdict {
  /** アーキタイプ名(断定) */
  archetype: string;
  emoji: string;
  /** 一言キャッチコピー */
  tagline: string;
  /** 偏見コメント(段落) */
  comments: string[];
  /** それぞれの「役割」ラベル */
  roles: { name: string; role: string }[];
  /** 偏見ラブラブ度 0-100 */
  loveScore: number;
  /** 偏見パワーバランス: -100(a側が尽くしてる)〜+100(b側が尽くしてる) */
  powerBalance: number;
  /** 来年も続いてる確率(偏見) 0-100 */
  survivalRate: number;
  /** 細かい偏見の指摘(箇条書き) */
  observations: string[];
}

interface Archetype {
  name: string;
  emoji: string;
  tagline: string;
  score: (s: PairStats) => number;
  comment: (s: PairStats) => string;
}

/** 発言量が多い側・少ない側を返す */
function byShare(s: PairStats): { chaser: PersonStats; chased: PersonStats } {
  return s.aShare >= 0.5
    ? { chaser: s.a, chased: s.b }
    : { chaser: s.b, chased: s.a };
}

function fasterReplier(s: PairStats): PersonStats | null {
  if (s.a.medianReplyMs === null || s.b.medianReplyMs === null) return null;
  return s.a.medianReplyMs <= s.b.medianReplyMs ? s.a : s.b;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

const ARCHETYPES: Archetype[] = [
  {
    name: "即レス相互監視型",
    emoji: "⚡",
    tagline: "通知が鳴った0.2秒後には既読",
    score: (s) => {
      const a = s.a.medianReplyMs;
      const b = s.b.medianReplyMs;
      if (a === null || b === null) return 0;
      const fast = (ms: number) => (ms < 3 * 60_000 ? 1 : ms < 10 * 60_000 ? 0.4 : 0);
      return (fast(a) + fast(b)) * 30 + Math.min(s.messagesPerDay / 50, 1) * 30;
    },
    comment: (s) =>
      `返信の中央値が${s.a.name}は${fmtDuration(s.a.medianReplyMs ?? 0)}、${s.b.name}は${fmtDuration(s.b.medianReplyMs ?? 0)}。二人ともスマホを手放せない体になっています。仕事中も画面の端でLINEが光るのを待っているタイプ。愛というより相互監視。`,
  },
  {
    name: "片思い延長戦型",
    emoji: "🏃",
    tagline: "付き合ってるのに、まだ追いかけてる",
    score: (s) => {
      const skew = Math.abs(s.aShare - 0.5) * 2; // 0..1
      const { chaser } = byShare(s);
      const questionBias = chaser.questionRate > 0.2 ? 15 : 0;
      return skew > 0.15 ? skew * 100 + questionBias : 0;
    },
    comment: (s) => {
      const { chaser, chased } = byShare(s);
      const share = Math.max(s.aShare, 1 - s.aShare);
      return `メッセージの${pct(share)}が${chaser.name}発信。${chased.name}はもう「返してあげてる」側です。${chaser.name}の質問率${pct(chaser.questionRate)}は、会話を続けたい必死さの数値化。交際は成立していても、力関係は片思い時代のまま延長戦です。`;
    },
  },
  {
    name: "熟年夫婦型",
    emoji: "🍵",
    tagline: "会話の9割が業務連絡",
    score: (s) => {
      const dry =
        (s.a.emojiRate + s.b.emojiRate < 0.2 ? 30 : 0) +
        (s.messagesPerDay < 10 ? 25 : 0) +
        ((s.a.avgLength + s.b.avgLength) / 2 < 12 ? 25 : 0) +
        (s.a.affectionCount + s.b.affectionCount === 0 ? 20 : 0);
      return dry;
    },
    comment: (s) =>
      `1日平均${Math.round(s.messagesPerDay * 10) / 10}通、平均${Math.round((s.a.avgLength + s.b.avgLength) / 2)}文字。絵文字もほぼ使わない。もはや「牛乳買ってきて」で成立する関係です。ときめきは枯れましたが、安定感だけは老舗旅館。悪く言えば同居人、よく言えば運命共同体。`,
  },
  {
    name: "深夜依存型",
    emoji: "🌙",
    tagline: "日付が変わってからが本番",
    score: (s) => (s.a.lateNightRate + s.b.lateNightRate) * 250,
    comment: (s) =>
      `深夜0時〜5時のメッセージ率が${s.a.name}は${pct(s.a.lateNightRate)}、${s.b.name}は${pct(s.b.lateNightRate)}。昼間はまともなのに、深夜になると感情のフタが外れるタイプの二人です。深夜テンションで送った長文を朝読み返して悶絶する生活、いつまで続けますか。`,
  },
  {
    name: "スタンプ会話術型",
    emoji: "🐰",
    tagline: "言語を放棄した者たち",
    score: (s) => (s.a.stickerRate + s.b.stickerRate) * 200,
    comment: (s) =>
      `メッセージの${pct((s.a.stickerRate + s.b.stickerRate) / 2)}がスタンプ。感情表現を全部クリエイターに外注しています。ケンカもスタンプで済ませてそう。仲は良いんです。ただ、文章力は確実に退化しています。`,
  },
  {
    name: "沸騰ラブラブ期型",
    emoji: "🔥",
    tagline: "見てるこっちが糖尿病になる",
    score: (s) =>
      (s.a.heartRate + s.b.heartRate) * 150 +
      Math.min(s.a.affectionCount + s.b.affectionCount, 50) +
      (s.messagesPerDay > 30 ? 20 : 0),
    comment: (s) =>
      `「好き」系ワードが合計${s.a.affectionCount + s.b.affectionCount}回、ハート率も高水準。今が人生で一番浮かれている時期です。おそらく付き合って1年未満。このトーク履歴を3年後に読み返すと羞恥で床を転がることが統計的に確定しています(偏見)。`,
  },
  {
    name: "既読スルー耐久戦型",
    emoji: "🧊",
    tagline: "返信は、忘れた頃にやってくる",
    score: (s) => {
      const a = s.a.medianReplyMs;
      const b = s.b.medianReplyMs;
      if (a === null || b === null) return 0;
      const slow = (ms: number) => (ms > 3 * 3600_000 ? 1 : ms > 3600_000 ? 0.5 : 0);
      return (slow(a) + slow(b)) * 40;
    },
    comment: (s) =>
      `返信中央値が${s.a.name}は${fmtDuration(s.a.medianReplyMs ?? 0)}、${s.b.name}は${fmtDuration(s.b.medianReplyMs ?? 0)}。お互い「すぐ返したら負け」だと思っている節があります。最長${fmtDuration(s.longestSilenceMs)}の沈黙を挟んでも自然に再開できるのは、信頼か、無関心か。`,
  },
  {
    name: "小説家気取り長文型",
    emoji: "📜",
    tagline: "LINEでやる内容じゃない",
    score: (s) => {
      const avg = (s.a.avgLength + s.b.avgLength) / 2;
      return avg > 60 ? 60 + Math.min(avg - 60, 40) : 0;
    },
    comment: (s) =>
      `平均${Math.round((s.a.avgLength + s.b.avgLength) / 2)}文字の長文の応酬。それはもう手紙です。電話をしましょう。真面目で誠実な二人ですが、既読がついてから返信が来るまでの間、相手は小論文を書いています。`,
  },
  {
    name: "波乱万丈ジェットコースター型",
    emoji: "🎢",
    tagline: "謝罪の数だけ強くなれる(?)",
    score: (s) => {
      const apologies = s.a.apologyCount + s.b.apologyCount;
      const perDay = apologies / Math.max(1, s.activeDays);
      return perDay > 0.3 ? 50 + Math.min(perDay * 50, 40) : 0;
    },
    comment: (s) =>
      `謝罪ワードが合計${s.a.apologyCount + s.b.apologyCount}回。定期的に何かをやらかしては修復するサイクルで回っています。送信取消も${s.a.unsentCount + s.b.unsentCount}回。打っては消し、消しては謝る。忙しい恋ですね。それでも続いているのだから、なんだかんだ相性はいいのでしょう。`,
  },
  {
    name: "電話魔カップル型",
    emoji: "📞",
    tagline: "文字はただの着信予告",
    score: (s) => {
      const callsPerWeek = s.callCount / Math.max(1, s.spanMs / (7 * 86_400_000));
      return callsPerWeek > 2 ? 50 + Math.min(callsPerWeek * 5, 40) : 0;
    },
    comment: (s) =>
      `通話${s.callCount}回、合計${fmtDuration(s.totalCallSec * 1000)}。テキストは「電話していい?」を送るためだけに存在しています。声を聞かないと不安になるタイプ。パケットより通話時間を気にする、古き良き恋人たちです。`,
  },
];

function buildObservations(s: PairStats): string[] {
  const obs: string[] = [];
  const { chaser, chased } = byShare(s);
  const fast = fasterReplier(s);

  if (Math.abs(s.aShare - 0.5) > 0.1) {
    obs.push(
      `発言量は${chaser.name}が${pct(Math.max(s.aShare, 1 - s.aShare))}を占有。${chased.name}、もう少し頑張りましょう。`,
    );
  } else {
    obs.push("発言量はほぼ五分五分。奇跡的なバランス感覚です。");
  }

  if (fast && s.a.medianReplyMs !== null && s.b.medianReplyMs !== null) {
    const slow = fast === s.a ? s.b : s.a;
    if ((slow.medianReplyMs ?? 0) > (fast.medianReplyMs ?? 0) * 3) {
      obs.push(
        `${fast.name}は${fmtDuration(fast.medianReplyMs!)}で返すのに、${slow.name}は${fmtDuration(slow.medianReplyMs!)}。この非対称、いつか議題に上がります。`,
      );
    }
  }

  const starterBias =
    s.a.sessionStarts + s.b.sessionStarts > 0
      ? s.a.sessionStarts / (s.a.sessionStarts + s.b.sessionStarts)
      : 0.5;
  if (starterBias > 0.65) {
    obs.push(`会話の口火を切るのは${pct(starterBias)}が${s.a.name}。幹事お疲れさまです。`);
  } else if (starterBias < 0.35) {
    obs.push(`会話の口火を切るのは${pct(1 - starterBias)}が${s.b.name}。幹事お疲れさまです。`);
  }

  const laughDiff = Math.abs(s.a.laughRate - s.b.laughRate);
  if (laughDiff > 0.15) {
    const funnier = s.a.laughRate > s.b.laughRate ? s.a : s.b;
    obs.push(`笑い率は${funnier.name}が圧勝(${pct(funnier.laughRate)})。笑わせているのか、愛想笑いなのかは神のみぞ知る。`);
  }

  if (s.a.gratitudeCount + s.b.gratitudeCount > s.activeDays * 0.5) {
    obs.push("「ありがとう」の頻度が高め。育ちの良さがにじみ出ています。");
  }

  const unsent = s.a.unsentCount + s.b.unsentCount;
  if (unsent > 5) {
    obs.push(`送信取消が${unsent}回。消した内容の方が本音です。`);
  }

  if (s.longestSilenceMs > 7 * 86_400_000) {
    obs.push(`最長${fmtDuration(s.longestSilenceMs)}の沈黙期間を検出。何があったんですか。`);
  }

  return obs;
}

function assignRoles(s: PairStats): { name: string; role: string }[] {
  const { chaser, chased } = byShare(s);
  const fast = fasterReplier(s);
  const roles: { name: string; role: string }[] = [];

  if (Math.abs(s.aShare - 0.5) > 0.1) {
    roles.push({ name: chaser.name, role: "追う人" });
    roles.push({ name: chased.name, role: "追われる人" });
  } else if (fast) {
    const slow = fast === s.a ? s.b : s.a;
    roles.push({ name: fast.name, role: "即レス番長" });
    roles.push({ name: slow.name, role: "マイペース大臣" });
  } else {
    roles.push({ name: s.a.name, role: "共犯者A" });
    roles.push({ name: s.b.name, role: "共犯者B" });
  }
  return roles;
}

export function judge(s: PairStats): Verdict {
  const scored = ARCHETYPES.map((a) => ({ a, score: a.score(s) })).sort(
    (x, y) => y.score - x.score,
  );
  const winner = scored[0].score > 0 ? scored[0].a : null;
  const runnerUp = scored[1]?.score > 25 ? scored[1].a : null;

  // 偏見ラブラブ度: 頻度・ハート・愛情語・返信速度・バランスから合成
  const freqScore = clamp(s.messagesPerDay * 2, 0, 30);
  const heartScore = clamp((s.a.heartRate + s.b.heartRate) * 100, 0, 20);
  const affectionScore = clamp((s.a.affectionCount + s.b.affectionCount) / 2, 0, 20);
  const balanceScore = clamp((1 - Math.abs(s.aShare - 0.5) * 2) * 15, 0, 15);
  const replyScore = (() => {
    const vals = [s.a.medianReplyMs, s.b.medianReplyMs].filter(
      (v): v is number => v !== null,
    );
    if (vals.length === 0) return 5;
    const avg = vals.reduce((x, y) => x + y, 0) / vals.length;
    return clamp(15 - avg / 3600_000, 0, 15);
  })();
  const loveScore = Math.round(
    clamp(freqScore + heartScore + affectionScore + balanceScore + replyScore),
  );

  const powerBalance = Math.round((s.aShare - 0.5) * -200);

  // 来年も続いてる確率(偏見): ラブラブ度と安定要素の合成に偏見係数を掛ける
  const stability =
    clamp((s.spanMs / (365 * 86_400_000)) * 30, 0, 30) +
    clamp((s.a.gratitudeCount + s.b.gratitudeCount) / 5, 0, 15);
  const survivalRate = Math.round(clamp(loveScore * 0.6 + stability + 10, 3, 97));

  const comments: string[] = [];
  if (winner) {
    comments.push(winner.comment(s));
  } else {
    comments.push(
      "特徴が薄すぎて偏見の持ちようがありません。ある意味いちばん健全なカップルです。悔しい。",
    );
  }
  if (runnerUp && runnerUp !== winner) {
    comments.push(
      `ちなみに「${runnerUp.name}」の気配も検出されています。油断しないでください。`,
    );
  }

  return {
    archetype: winner ? winner.name : "無味無臭型",
    emoji: winner ? winner.emoji : "🫥",
    tagline: winner ? winner.tagline : "強いて言えば、普通",
    comments,
    roles: assignRoles(s),
    loveScore,
    powerBalance,
    survivalRate,
    observations: buildObservations(s),
  };
}
