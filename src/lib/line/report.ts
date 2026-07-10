import type { PairStats, PersonStats } from "./analyze";
import { fmtDate, fmtDuration, pct } from "./format";
import type { PairPersonality, PersonPersonality } from "./personality";
import type { Verdict } from "./verdict";

/**
 * ふたりの偏見レポート: 統計から1ページ分の読み物を生成する。
 * すべてテンプレートと実測値の組み合わせで、カップルごとに内容が変わる。
 */

export interface Report {
  sections: { heading: string; body: string }[];
}

/** カップルごとに文選びを変えるための決定的シード */
function seedOf(s: PairStats): number {
  return Math.abs(
    Math.floor(s.firstTimestamp / 86_400_000) + s.totalMessages,
  );
}

const pick = <T>(arr: T[], seed: number): T => arr[seed % arr.length];

/* ---- 人物像 ---- */

interface Fragment {
  salience: number;
  text: string;
}

function personFragments(p: PersonStats, s: PairStats): Fragment[] {
  const f: Fragment[] = [];
  const add = (salience: number, text: string) => f.push({ salience, text });
  const spanDays = Math.max(1, s.spanMs / 86_400_000);
  const perDay = p.messageCount / spanDays;

  if (p.medianReplyMs !== null) {
    if (p.medianReplyMs < 90_000) {
      add(
        2.5,
        `返信の中央値${fmtDuration(p.medianReplyMs)}は、もはや反射神経の領域。スマホが体の一部になっています。`,
      );
    } else if (p.medianReplyMs > 3600_000) {
      add(
        2.2,
        `返信中央値${fmtDuration(p.medianReplyMs)}のマイペースぶりで、相手の「?」を平気で一晩寝かせます。`,
      );
    }
  }
  if (p.doubleTextRate > 0.35) {
    add(
      p.doubleTextRate * 6,
      `全メッセージの${pct(p.doubleTextRate)}が連投。「返事を待つ」という概念を持ち合わせていません。`,
    );
  }
  if (p.lateNightRate > 0.15) {
    add(
      p.lateNightRate * 8,
      `メッセージの${pct(p.lateNightRate)}が深夜帯。夜になると人格のリミッターが外れるタイプです。`,
    );
  }
  if (p.laughRate > 0.12) {
    add(
      p.laughRate * 8,
      `笑い率${pct(p.laughRate)}。とりあえず笑っておけば世界は平和だと知っています。`,
    );
  }
  if (p.questionRate > 0.08) {
    add(
      p.questionRate * 12,
      `質問率${pct(p.questionRate)}で、会話の燃料補給を一手に担当しています。`,
    );
  }
  if (p.emojiRate > 0.15) {
    add(
      p.emojiRate * 5,
      `絵文字率${pct(p.emojiRate)}の賑やかな文面。読むだけでテンションが伝わってきます。`,
    );
  } else if (p.emojiRate < 0.01 && p.messageCount > 100) {
    add(1.2, `絵文字はほぼ使わない硬派な文面。ドライに見えて、実は行動で語る派です。`);
  }
  if (p.avgLength > 40) {
    add(
      p.avgLength / 25,
      `平均${Math.round(p.avgLength)}文字の長文派。LINEを手紙だと思っている節があります。`,
    );
  } else if (p.avgLength < 7 && p.messageCount > 100) {
    add(
      1.6,
      `平均${Math.round(p.avgLength)}文字の省エネ文体。単語だけで会話が成立すると信じています(実際している)。`,
    );
  }
  if (p.hourEntropy < 0.55) {
    add(1.5, `現れる時間帯がほぼ固定の規則型。生活が読めるので時報として使えます。`);
  } else if (p.hourEntropy > 0.85) {
    add(1.5, `神出鬼没で、いつ現れるか誰にも予測できません。野良猫と同じ習性です。`);
  }
  const affRate = p.affectionCount / Math.max(1, p.messageCount);
  if (p.affectionCount > 20 && affRate > 0.005) {
    add(
      affRate * 300,
      `「好き」系ワードを${p.affectionCount}回言語化済み。感情の在庫を隠す気がありません。`,
    );
  }
  if (p.stickerRate > 0.2) {
    add(
      p.stickerRate * 5,
      `スタンプ率${pct(p.stickerRate)}。言葉にできない感情は、すべてスタンプのキャラクターに代弁させています。`,
    );
  }
  if (perDay > 60) {
    add(1.4, `1日平均${Math.round(perDay)}通の物量。可処分時間のかなりの割合がこのトークに溶けています。`);
  }
  // 何も特徴がない人のための保険
  if (f.length < 2) {
    add(0.5, `突出した癖のない、統計泣かせの安定型。ただしそれは「掴みどころがない」の同義語でもあります。`);
  }
  return f;
}

function personParagraph(
  p: PersonStats,
  per: PersonPersonality,
  s: PairStats,
): string {
  const frags = personFragments(p, s)
    .sort((x, y) => y.salience - x.salience)
    .slice(0, 3)
    .map((x) => x.text);
  const intro = `${p.name}は${per.mbti.type}(${per.mbti.nickname})、ラブタイプは「${per.love.name}」。`;
  const outro = `ひとことで言えば「${per.love.tagline}」の人です。`;
  return intro + frags.join("") + outro;
}

/* ---- 口癖と語彙 ---- */

function vocabularyParagraph(s: PairStats): string {
  const parts: string[] = [];
  const phraseList = (p: PersonStats) =>
    p.topPhrases
      .map((x) => `「${x.token}」(${x.count}回)`)
      .join("、");

  if (s.a.topPhrases.length > 0) {
    parts.push(`${s.a.name}が相手より突出して使う言葉は${phraseList(s.a)}。`);
  }
  if (s.b.topPhrases.length > 0) {
    parts.push(`対する${s.b.name}の口癖は${phraseList(s.b)}。`);
  }
  if (parts.length === 2) {
    parts.push(`口癖は本人だけが気付いていません。この診断の主な用途は指摘です。`);
  } else if (parts.length === 0) {
    parts.push(`ふたりとも言葉の偏りが少なく、口癖レーダーには引っかかりませんでした。文体まで空気を読むタイプです。`);
  }

  if (s.sharedPhrases.length > 0) {
    const shared = s.sharedPhrases
      .map((x) => `「${x.token}」(合計${x.count}回)`)
      .join("、");
    parts.push(
      `そして、ふたりの間でだけ高頻度に流通している言葉が${shared}。辞書に載っていない語彙こそ、関係の年輪です。`,
    );
  } else {
    parts.push(`一方で「ふたりだけの言葉」はまだ検出されず。これから育てる余地があります。`);
  }
  return parts.join("");
}

/* ---- 愛着スタイル(偏見) ---- */

type Attachment = "安定型" | "不安型" | "回避型";

function attachmentOf(p: PersonStats, partner: PersonStats): Attachment {
  const starts = p.sessionStarts + partner.sessionStarts;
  const startShare = starts > 0 ? p.sessionStarts / starts : 0.5;
  const fast =
    p.medianReplyMs !== null && p.medianReplyMs < 3 * 60_000 ? 1 : 0;
  const anxious =
    (p.doubleTextRate > 0.35 ? 1 : 0) +
    (startShare > 0.58 ? 1 : 0) +
    fast +
    (p.lateNightRate > 0.2 ? 1 : 0);
  const slow =
    p.medianReplyMs !== null && p.medianReplyMs > 45 * 60_000 ? 1 : 0;
  const avoidant =
    slow +
    (p.avgLength < 7 ? 1 : 0) +
    (startShare < 0.42 ? 1 : 0) +
    (p.emojiRate < 0.01 ? 1 : 0);
  if (anxious >= 3 && anxious > avoidant) return "不安型";
  if (avoidant >= 3 && avoidant > anxious) return "回避型";
  return "安定型";
}

const ATTACHMENT_DESC: Record<Attachment, string> = {
  不安型:
    "つながっていない時間に耐性がなく、連投・即レス・深夜行動で接続を確認しにいくタイプ",
  回避型:
    "距離が詰まりすぎると一歩引く省エネ通信型。素っ気なさは防御であって無関心ではない",
  安定型: "近すぎず遠すぎずの等速巡航型。相手の波にも動じない",
};

function attachmentParagraph(s: PairStats, seed: number): string {
  const styleA = attachmentOf(s.a, s.b);
  const styleB = attachmentOf(s.b, s.a);
  const parts: string[] = [
    `愛着スタイル風に断定すると、${s.a.name}は${styleA}(${ATTACHMENT_DESC[styleA]})、${s.b.name}は${styleB}(${ATTACHMENT_DESC[styleB]})。`,
  ];
  const pair = [styleA, styleB].sort().join("×");
  if (pair === "不安型×回避型") {
    parts.push(
      `不安型が追うほど回避型は下がり、下がるほど追いたくなる。心理学の教科書が「よくある」と書く永久機関ですが、このトーク量を見る限り、ふたりは機関を回しながらちゃんと前に進んでいます。`,
    );
  } else if (pair === "不安型×不安型") {
    parts.push(
      `相互確認の応酬で安心を発電する共依存気味の構造。燃費は悪いですが、出力は最強です。`,
    );
  } else if (pair === "回避型×回避型") {
    parts.push(
      `お互い深追いしない者同士。世間はそれを冷めていると呼び、ふたりはそれを快適と呼びます。正しいのはふたりです。`,
    );
  } else if (pair === "安定型×安定型") {
    parts.push(
      pick(
        [
          `安定×安定の教科書ペア。ドラマ性はゼロですが、ドラマは観るものであって住むものではありません。`,
          `どちらも地面が揺れないタイプ。地味に見えて、これが一番の贅沢です。`,
        ],
        seed,
      ),
    );
  } else {
    const stable = styleA === "安定型" ? s.a.name : s.b.name;
    const other = styleA === "安定型" ? s.b.name : s.a.name;
    parts.push(
      `${stable}が地面役、${other}が天気役の分業制。天気は変わるものなので、地面は動じないのが仕事です。現状うまく機能しています。`,
    );
  }
  parts.push(`※愛着理論の用語を拝借しただけの偏見です。`);
  return parts.join("");
}

/* ---- ふたりの記録簿 ---- */

function recordsParagraph(s: PairStats): string {
  const parts: string[] = [];
  if (s.busiestDay !== null) {
    parts.push(
      `観測史上、最も燃えた日は${s.busiestDay.label}の${s.busiestDay.count}通。この日に何があったかは、履歴だけが知っています。`,
    );
  }
  if (s.longestStreakDays >= 14) {
    parts.push(
      `1日も途切れずやりとりした最長記録は${s.longestStreakDays}日連続。もはやライフラインです。`,
    );
  } else if (s.longestStreakDays >= 3) {
    parts.push(`連続やりとり記録は${s.longestStreakDays}日。`);
  }
  if (s.quarrelIntervalDays !== null) {
    parts.push(
      `謝罪イベントはおよそ${Math.round(s.quarrelIntervalDays)}日周期で発生。ケンカではなく定期メンテナンスと呼びましょう。`,
    );
  }
  const workA = s.a.workReplyMedianMs;
  const workB = s.b.workReplyMedianMs;
  const worker =
    workA !== null && workA < 5 * 60_000
      ? s.a
      : workB !== null && workB < 5 * 60_000
        ? s.b
        : null;
  if (worker !== null) {
    const both =
      workA !== null && workA < 5 * 60_000 && workB !== null && workB < 5 * 60_000;
    parts.push(
      both
        ? `平日9〜18時の返信中央値はふたりとも5分未満。あの、お仕事は…?`
        : `${worker.name}は平日9〜18時でも中央値${fmtDuration(worker.workReplyMedianMs!)}で返信。勤務中の生存確認、お疲れさまです。`,
    );
  }
  if (s.maxCallSec >= 3600) {
    parts.push(
      `最長通話記録は${fmtDuration(s.maxCallSec * 1000)}。通話でそれは、もう一緒に住んだ方が早い。`,
    );
  }
  if (parts.length === 0) {
    parts.push(`特筆すべき異常値はなし。健全すぎて記録簿が白紙です。それはそれで記録的。`);
  }
  return parts.join("");
}

/* ---- ふたりの力学 ---- */

function dynamicsParagraph(s: PairStats, personality: PairPersonality): string {
  const parts: string[] = [];
  const { a, b } = s;
  const chaser = s.aShare >= 0.5 ? a : b;
  const chased = chaser === a ? b : a;
  const share = Math.max(s.aShare, 1 - s.aShare);

  if (share > 0.58) {
    parts.push(
      `会話の${pct(share)}を${chaser.name}が供給し、${chased.name}がそれを受け止める構図が固定化しています。`,
    );
  } else {
    parts.push(
      `発言量は${pct(s.aShare)}対${pct(1 - s.aShare)}のほぼ互角。会話の主導権は日替わりで入れ替わっています。`,
    );
  }

  const starterTotal = a.sessionStarts + b.sessionStarts;
  if (starterTotal > 0) {
    const starter = a.sessionStarts >= b.sessionStarts ? a : b;
    const bias = Math.max(a.sessionStarts, b.sessionStarts) / starterTotal;
    if (bias > 0.6) {
      parts.push(
        `沈黙を破って会話を再開させるのは${pct(bias)}の確率で${starter.name}。関係のエンジンはこちら側に付いています。`,
      );
    }
  }

  if (a.medianReplyMs !== null && b.medianReplyMs !== null) {
    const fast = a.medianReplyMs <= b.medianReplyMs ? a : b;
    const slow = fast === a ? b : a;
    const ratio = (slow.medianReplyMs! + 1) / (fast.medianReplyMs! + 1);
    if (ratio > 2.5) {
      parts.push(
        `返信速度は${fast.name}の${fmtDuration(fast.medianReplyMs!)}に対して${slow.name}は${fmtDuration(slow.medianReplyMs!)}。この時間差を${fast.name}が「そういう人だから」で処理できているうちは平和です。`,
      );
    } else {
      parts.push(
        `返信速度はほぼ同じテンポで、会話のラリーが心地よく続く組み合わせです。`,
      );
    }
  }

  const gMax = a.gratitudeCount >= b.gratitudeCount ? a : b;
  const gMin = gMax === a ? b : a;
  if (gMax.gratitudeCount > gMin.gratitudeCount * 1.6 && gMax.gratitudeCount > 20) {
    parts.push(
      `「ありがとう」の収支は${gMax.name}が${gMax.gratitudeCount}回、${gMin.name}が${gMin.gratitudeCount}回と貿易不均衡。`,
    );
  }

  parts.push(personality.compat[0]);
  return parts.join("");
}

/* ---- ケンカの形 ---- */

function conflictParagraph(
  s: PairStats,
  personality: PairPersonality,
  seed: number,
): string {
  const parts: string[] = [];
  const { a, b } = s;
  const apolRate = (a.apologyCount + b.apologyCount) / Math.max(1, s.totalMessages);
  const typeA = personality.a.mbti.type;
  const typeB = personality.b.mbti.type;

  if (apolRate > 0.008) {
    parts.push(
      `謝罪ワードが合計${a.apologyCount + b.apologyCount}回と多め。定期的に小さな事故を起こしては修復するサイクルが確立しています。`,
    );
  } else if (apolRate < 0.002) {
    parts.push(
      `謝罪ワードはほとんど検出されず、大きな衝突の痕跡がありません。ケンカが少ないのか、LINE外で処理しているのか。前者だと信じたい。`,
    );
  } else {
    parts.push(`謝罪の頻度はごく標準的。ほどほどにぶつかり、ほどほどに直っています。`);
  }

  const tfA = typeA[2];
  const tfB = typeB[2];
  if (tfA !== tfB) {
    const tPerson = tfA === "T" ? a.name : b.name;
    const fPerson = tfA === "T" ? b.name : a.name;
    parts.push(
      `もめた場合の様式は予測済みです: ${tPerson}が正論を積み上げ、${fPerson}は「言い方」の話をし始めます。議題が途中ですり替わっていることに、当人たちは気付きません。`,
    );
  } else if (tfA === "T") {
    parts.push(
      `ふたりともT型なので、ケンカは感情戦にならない代わりに、正論と正論の消耗戦になります。先に「もういいよ」と言った方が優しさで勝ちです。`,
    );
  } else {
    parts.push(
      `ふたりともF型なので、こじれるときは理屈ゼロの感情戦。ただし仲直りも感情なので、回復は早いはずです。`,
    );
  }

  if (s.quarrelPattern !== null) {
    parts.push(
      `なお法医学的に言うと、謝罪ワードの発生は${s.quarrelPattern}に集中しています。その時間帯の会話には地雷が埋まっているということです。`,
    );
  }
  if (s.makeupMedianMs !== null) {
    parts.push(
      s.makeupMedianMs < 30 * 60_000
        ? `謝罪から相手の返信までの中央値は${fmtDuration(s.makeupMedianMs)}。仲直りの速さは一級品です。`
        : `謝罪から相手の返信までは中央値${fmtDuration(s.makeupMedianMs)}。許すまでの「間」も、様式美として確立しています。`,
    );
  }
  const unsent = a.unsentCount + b.unsentCount;
  if (unsent > 5) {
    parts.push(`なお送信取消が${unsent}回。消された言葉の中にこそ、本当の議事録があります。`);
  }
  if (s.longestSilenceMs > 7 * 86_400_000) {
    parts.push(
      `過去には最長${fmtDuration(s.longestSilenceMs)}の沈黙も記録されています。あれを乗り越えたなら、大抵のことは大丈夫です。`,
    );
  } else {
    parts.push(
      pick(
        [
          `長期間の沈黙は一度も記録されていません。切れない通信、それがふたりのインフラです。`,
          `目立った音信不通の形跡はなし。ケンカしても翌日には通常運転に戻る回復力があります。`,
        ],
        seed,
      ),
    );
  }
  return parts.join("");
}

/* ---- 一年後の予報 ---- */

function forecastParagraph(
  s: PairStats,
  verdict: Verdict,
  personality: PairPersonality,
  seed: number,
): string {
  const parts: string[] = [];
  if (s.heatTrend !== null) {
    if (s.heatTrend > 1.4) {
      parts.push(
        `メッセージ量は初期の${Math.round(s.heatTrend * 100)}%へと増加中で、グラフは今も右肩上がり。普通は減るんです。減らないのは異常値であり、つまりのろけです。`,
      );
    } else if (s.heatTrend < 0.6) {
      parts.push(
        `メッセージ量は初期の${Math.round(s.heatTrend * 100)}%まで落ち着きました。文字が減った分をどこで補っているかが、この関係の本当の決算です。`,
      );
    } else {
      parts.push(`メッセージ量は大きな増減なく安定飛行。無理のない巡航速度に入っています。`);
    }
  }
  parts.push(
    `ラブタイプ相性は${personality.loveMatch.score}%、偏見ラブラブ度は${verdict.loveScore}/100。以上を総合した来年も続いてる確率(偏見)は${verdict.survivalRate}%です。`,
  );
  parts.push(
    pick(
      [
        `この数字を外したら、それは統計ではなくふたりの自由意志のせいです。`,
        `保証はできませんが、偏見に保証を求める方が間違っています。`,
        `数字が良くても悪くても、明日も普通にLINEするんでしょう。知ってます。`,
      ],
      seed + 1,
    ),
  );
  return parts.join("");
}

/* ---- 総評イントロと結び ---- */

function introParagraph(s: PairStats, verdict: Verdict): string {
  const days = Math.round(s.spanMs / 86_400_000);
  return (
    `${fmtDate(s.firstTimestamp)}から${fmtDate(s.lastTimestamp)}までの${days}日間、` +
    `${s.totalMessages.toLocaleString()}通のやりとりを解析しました。診断名は「${verdict.archetype}」。` +
    `以下、本文${s.totalMessages.toLocaleString()}通ぶんの証拠に基づいた、科学的根拠のない偏見をお届けします。`
  );
}

function closingLine(personality: PairPersonality, seed: number): string {
  return pick(
    [
      `「${personality.a.love.name}」と「${personality.b.love.name}」。この組み合わせを思いつく脚本家はいません。現実だけが書けるカップルです。お幸せに。`,
      `ふたりの会話は、他人が読んでも1ミリも面白くないでしょう。それこそが、いい関係の証拠です。お幸せに。`,
      `統計はここまでです。ここから先は、ふたりにしか書けない部分なので、引き続きよろしくお願いします。`,
    ],
    seed + 2,
  );
}

export function buildReport(
  s: PairStats,
  verdict: Verdict,
  personality: PairPersonality,
): Report {
  const seed = seedOf(s);
  return {
    sections: [
      { heading: "総評", body: introParagraph(s, verdict) },
      {
        heading: `${s.a.name}という人物(偏見)`,
        body: personParagraph(s.a, personality.a, s),
      },
      {
        heading: `${s.b.name}という人物(偏見)`,
        body: personParagraph(s.b, personality.b, s),
      },
      {
        heading: "口癖と語彙(偏見)",
        body: vocabularyParagraph(s),
      },
      {
        heading: "愛着スタイル(偏見)",
        body: attachmentParagraph(s, seed),
      },
      {
        heading: "ふたりの力学",
        body: dynamicsParagraph(s, personality),
      },
      {
        heading: "ケンカをするなら(偏見)",
        body: conflictParagraph(s, personality, seed),
      },
      {
        heading: "ふたりの記録簿",
        body: recordsParagraph(s),
      },
      {
        heading: "一年後の予報(偏見)",
        body: forecastParagraph(s, verdict, personality, seed),
      },
      { heading: "結びに", body: closingLine(personality, seed) },
    ],
  };
}
