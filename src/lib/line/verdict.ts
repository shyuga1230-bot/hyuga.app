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
      const fast = (ms: number) => (ms < 2 * 60_000 ? 1 : ms < 10 * 60_000 ? 0.45 : 0);
      return (fast(a) + fast(b)) * 27 + Math.min(s.messagesPerDay / 60, 1) * 25;
    },
    comment: (s) =>
      `返信の中央値が${s.a.name}は${fmtDuration(s.a.medianReplyMs ?? 0)}、${s.b.name}は${fmtDuration(s.b.medianReplyMs ?? 0)}。1日平均${Math.round(s.messagesPerDay)}通。二人ともスマホを手放せない体になっています。愛というより相互監視。`,
  },
  {
    name: "絶賛加熱中型",
    emoji: "📈",
    tagline: "グラフが右肩上がりの恋",
    score: (s) =>
      s.heatTrend !== null && s.heatTrend > 1.5
        ? 58 + Math.min((s.heatTrend - 1.5) * 35, 35)
        : 0,
    comment: (s) =>
      `直近のメッセージ密度は初期の${Math.round((s.heatTrend ?? 1) * 100)}%。時間が経つほど増えるという、統計的にかなり珍しい曲線を描いています。沼はこれからが本番です。`,
  },
  {
    name: "省エネ安定期型",
    emoji: "📉",
    tagline: "「落ち着いた」と言い張るフェーズ",
    score: (s) =>
      s.heatTrend !== null && s.heatTrend < 0.55 && s.messagesPerDay > 3
        ? 55 + Math.min((0.55 - s.heatTrend) * 90, 35)
        : 0,
    comment: (s) =>
      `メッセージ量は初期の${Math.round((s.heatTrend ?? 1) * 100)}%まで減速。本人たちは「落ち着いた」と言いますが、グラフは正直です。安定期と倦怠期は紙一重。会って話す時間が増えたのなら、それが正解です。`,
  },
  {
    name: "週末恋人型",
    emoji: "📅",
    tagline: "平日は他人、週末は恋人",
    score: (s) => {
      const w = (s.a.weekendRate + s.b.weekendRate) / 2;
      return w > 0.4 ? (w - 0.4) * 220 + 40 : 0;
    },
    comment: (s) =>
      `メッセージの${pct((s.a.weekendRate + s.b.weekendRate) / 2)}が土日に集中。平日のトークは業務連絡以下です。週末に全てを賭けるタイプ。金曜の夜だけ人格が変わります。`,
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
      const emojiSum = s.a.emojiRate + s.b.emojiRate;
      const aff = s.a.affectionCount + s.b.affectionCount;
      const dry =
        (emojiSum < 0.02 ? 25 : emojiSum < 0.06 ? 12 : 0) +
        (s.messagesPerDay < 8 ? 30 : s.messagesPerDay < 15 ? 15 : 0) +
        ((s.a.avgLength + s.b.avgLength) / 2 < 10 ? 15 : 0) +
        (aff === 0 ? 25 : aff < 5 ? 12 : 0);
      // 1日25通以上やりとりしてる時点で熟年ではない
      return s.messagesPerDay > 25 ? dry * 0.25 : dry;
    },
    comment: (s) =>
      `1日平均${Math.round(s.messagesPerDay * 10) / 10}通、平均${Math.round((s.a.avgLength + s.b.avgLength) / 2)}文字。絵文字もほぼ使わない。もはや「牛乳買ってきて」で成立する関係です。ときめきは枯れましたが、安定感だけは老舗旅館。悪く言えば同居人、よく言えば運命共同体。`,
  },
  {
    name: "深夜依存型",
    emoji: "🌙",
    tagline: "日付が変わってからが本番",
    score: (s) =>
      Math.max(0, (s.a.lateNightRate + s.b.lateNightRate) / 2 - 0.08) * 320,
    comment: (s) =>
      `深夜0時〜5時のメッセージ率が${s.a.name}は${pct(s.a.lateNightRate)}、${s.b.name}は${pct(s.b.lateNightRate)}。昼間はまともなのに、深夜になると感情のフタが外れるタイプの二人です。深夜テンションで送った長文を朝読み返して悶絶する生活、いつまで続けますか。`,
  },
  {
    name: "スタンプ会話術型",
    emoji: "🐰",
    tagline: "言語を放棄した者たち",
    score: (s) => Math.min((s.a.stickerRate + s.b.stickerRate) * 250, 90),
    comment: (s) =>
      `メッセージの${pct((s.a.stickerRate + s.b.stickerRate) / 2)}がスタンプ。感情表現を全部クリエイターに外注しています。ケンカもスタンプで済ませてそう。仲は良いんです。ただ、文章力は確実に退化しています。`,
  },
  {
    name: "沸騰ラブラブ期型",
    emoji: "🔥",
    tagline: "見てるこっちが糖尿病になる",
    score: (s) => {
      const msgs = s.totalMessages;
      const affRate = (s.a.affectionCount + s.b.affectionCount) / msgs;
      return (
        Math.min(affRate * 1800, 40) +
        Math.min((s.a.heartRate + s.b.heartRate) * 2000, 25) +
        (s.messagesPerDay > 40 ? 15 : 0) +
        (s.heatTrend !== null && s.heatTrend > 1.2 ? 10 : 0)
      );
    },
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
      return avg > 45 ? 60 + Math.min(avg - 45, 40) : 0;
    },
    comment: (s) =>
      `平均${Math.round((s.a.avgLength + s.b.avgLength) / 2)}文字の長文の応酬。それはもう手紙です。電話をしましょう。真面目で誠実な二人ですが、既読がついてから返信が来るまでの間、相手は小論文を書いています。`,
  },
  {
    name: "波乱万丈ジェットコースター型",
    emoji: "🎢",
    tagline: "謝罪の数だけ強くなれる(?)",
    score: (s) => {
      // 1通あたりの謝罪率で判定(通数が多いだけで発火しないように)
      const apolRate =
        (s.a.apologyCount + s.b.apologyCount) / Math.max(1, s.totalMessages);
      return apolRate > 0.008
        ? 50 + Math.min((apolRate - 0.008) * 4000, 40)
        : 0;
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
  // 深読み観察。weightが大きいほど「その二人らしい」指摘として優先
  const cand: { text: string; weight: number }[] = [];
  const add = (weight: number, text: string) => cand.push({ text, weight });
  const { chaser, chased } = byShare(s);
  const fast = fasterReplier(s);

  const shareSkew = Math.abs(s.aShare - 0.5);
  if (shareSkew > 0.1) {
    add(
      shareSkew * 10,
      `発言量は${chaser.name}が${pct(Math.max(s.aShare, 1 - s.aShare))}を占有。${chased.name}、もう少し頑張りましょう。`,
    );
  } else if (shareSkew < 0.03) {
    add(1.2, "発言量はほぼ完全な五分五分。奇跡的なバランス感覚です。");
  }

  if (fast && s.a.medianReplyMs !== null && s.b.medianReplyMs !== null) {
    const slow = fast === s.a ? s.b : s.a;
    const ratio = (slow.medianReplyMs! + 1) / (fast.medianReplyMs! + 1);
    if (ratio > 3) {
      add(
        Math.min(ratio / 3, 3),
        `${fast.name}は${fmtDuration(fast.medianReplyMs!)}で返すのに、${slow.name}は${fmtDuration(slow.medianReplyMs!)}。この非対称、いつか議題に上がります。`,
      );
    }
  }

  const starterBias =
    s.a.sessionStarts + s.b.sessionStarts > 0
      ? s.a.sessionStarts / (s.a.sessionStarts + s.b.sessionStarts)
      : 0.5;
  if (starterBias > 0.65 || starterBias < 0.35) {
    const starter = starterBias > 0.5 ? s.a : s.b;
    add(
      Math.abs(starterBias - 0.5) * 6,
      `会話の口火を切るのは${pct(Math.max(starterBias, 1 - starterBias))}が${starter.name}。幹事お疲れさまです。`,
    );
  }

  // 連投癖
  const dtMax = s.a.doubleTextRate > s.b.doubleTextRate ? s.a : s.b;
  if (dtMax.doubleTextRate > 0.3) {
    add(
      dtMax.doubleTextRate * 4,
      `${dtMax.name}のメッセージの${pct(dtMax.doubleTextRate)}は、相手の返事を待たない連投。会話というより実況中継です。`,
    );
  }

  // 朝型・夜型のズレ
  const hourDiff = Math.min(
    Math.abs(s.a.peakHour - s.b.peakHour),
    24 - Math.abs(s.a.peakHour - s.b.peakHour),
  );
  if (hourDiff >= 5) {
    add(
      hourDiff / 3,
      `${s.a.name}の活動ピークは${s.a.peakHour}時台、${s.b.name}は${s.b.peakHour}時台。生活リズムのズレを既読スルーと誤解しないように。`,
    );
  }

  // 週末型・平日型
  const weekend = (s.a.weekendRate + s.b.weekendRate) / 2;
  if (weekend > 0.45) {
    add(weekend * 3, `メッセージの${pct(weekend)}が土日。平日のふたりは同僚より他人です。`);
  } else if (weekend < 0.18) {
    add(1.5, `トークはほぼ平日限定。週末は会えているからでしょう。のろけですか。`);
  }

  // 熱量トレンド
  if (s.heatTrend !== null) {
    if (s.heatTrend > 1.5) {
      add(
        s.heatTrend,
        `メッセージ量は初期の${Math.round(s.heatTrend * 100)}%に増加中。沼はまだ深くなっています。`,
      );
    } else if (s.heatTrend < 0.6) {
      add(
        1.4 / Math.max(s.heatTrend, 0.1),
        `メッセージ量は最初の頃の${Math.round(s.heatTrend * 100)}%まで減速。「安定期」と呼ぶか「倦怠期」と呼ぶかで、ふたりの意見が割れそうです。`,
      );
    }
  }

  // ありがとう収支
  const gTotal = s.a.gratitudeCount + s.b.gratitudeCount;
  if (gTotal > 20) {
    const gMax = s.a.gratitudeCount >= s.b.gratitudeCount ? s.a : s.b;
    const gMin = gMax === s.a ? s.b : s.a;
    if (gMax.gratitudeCount > gMin.gratitudeCount * 1.6) {
      add(
        1.8,
        `「ありがとう」の収支は${gMax.name}の払い過ぎ(${gMax.gratitudeCount}回 vs ${gMin.gratitudeCount}回)。${gMin.name}、たまには返しましょう。`,
      );
    }
  }

  // 「好き」の先攻
  const aTotal = s.a.affectionCount + s.b.affectionCount;
  if (aTotal > 10) {
    const aMax = s.a.affectionCount >= s.b.affectionCount ? s.a : s.b;
    const aMin = aMax === s.a ? s.b : s.a;
    if (aMax.affectionCount > aMin.affectionCount * 1.8) {
      add(
        2.2,
        `「好き」を口にするのは主に${aMax.name}(${aMax.affectionCount}回 vs ${aMin.affectionCount}回)。言わせてばかりだと利子がつきますよ、${aMin.name}。`,
      );
    }
  }

  // 文字数格差
  const lenMax = s.a.avgLength >= s.b.avgLength ? s.a : s.b;
  const lenMin = lenMax === s.a ? s.b : s.a;
  if (lenMin.avgLength > 0 && lenMax.avgLength / lenMin.avgLength > 2) {
    add(
      lenMax.avgLength / lenMin.avgLength / 2,
      `${lenMax.name}の平均${Math.round(lenMax.avgLength)}文字に対して${lenMin.name}は${Math.round(lenMin.avgLength)}文字。文字数にも格差社会が来ています。`,
    );
  }

  // 規則型と神出鬼没
  const entDiff = Math.abs(s.a.hourEntropy - s.b.hourEntropy);
  if (entDiff > 0.12) {
    const regular = s.a.hourEntropy < s.b.hourEntropy ? s.a : s.b;
    const chaotic = regular === s.a ? s.b : s.a;
    add(
      entDiff * 8,
      `${regular.name}は決まった時間に現れる規則型、${chaotic.name}は神出鬼没。時報と野良猫のカップルです。`,
    );
  }

  // 長電話
  if (s.callCount >= 5 && s.totalCallSec / s.callCount > 3600) {
    add(
      2.5,
      `1回の通話が平均${fmtDuration((s.totalCallSec / s.callCount) * 1000)}。それはもう同棲の予行演習です。`,
    );
  }

  // 笑いの供給元
  const laughDiff = Math.abs(s.a.laughRate - s.b.laughRate);
  if (laughDiff > 0.08) {
    const funnier = s.a.laughRate > s.b.laughRate ? s.a : s.b;
    add(
      laughDiff * 12,
      `笑っているのは主に${funnier.name}(笑い率${pct(funnier.laughRate)})。笑わせているのか、愛想笑いなのかは神のみぞ知る。`,
    );
  }

  const unsent = s.a.unsentCount + s.b.unsentCount;
  if (unsent > 5) {
    add(1.6, `送信取消が合計${unsent}回。消した内容の方が本音です。`);
  }

  if (s.longestSilenceMs > 7 * 86_400_000) {
    add(2.8, `最長${fmtDuration(s.longestSilenceMs)}の沈黙期間を検出。何があったんですか。`);
  }

  // 「その二人らしい」順に上位6件を選び、元の並び順で出す
  const top = new Set(
    [...cand].sort((x, y) => y.weight - x.weight).slice(0, 6),
  );
  return cand.filter((c) => top.has(c)).map((c) => c.text);
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
