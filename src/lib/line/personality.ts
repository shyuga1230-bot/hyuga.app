import type { PairStats, PersonStats } from "./analyze";

/**
 * 性格診断エンジン(偏見)。
 * トークの言語特徴からMBTI風の4軸と「ラブタイプ16(偏見)」を断定する。
 * 本家MBTI・16Personalities・各種ラブタイプ診断とは一切関係のない、
 * 統計いじりによる偏見である。
 */

export interface AxisResult {
  /** 例: ["E", "I"] */
  letters: [string, string];
  labels: [string, string];
  /** 勝った側の文字 */
  winner: string;
  /** 勝った側への傾き 0..1 */
  strength: number;
  /** 表示用: 勝ち側% (50-95) */
  pct: number;
}

export interface PersonPersonality {
  name: string;
  mbti: {
    type: string;
    nickname: string;
    axes: AxisResult[];
    comment: string;
  };
  love: {
    key: string;
    name: string;
    tagline: string;
  };
}

export interface PairPersonality {
  a: PersonPersonality;
  b: PersonPersonality;
  /** ふたりの組み合わせに対する偏見 */
  compat: string[];
  /** ラブタイプ16同士の相性(偏見) */
  loveMatch: { score: number; comment: string };
}

const bound = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));

const MBTI_NICKNAMES: Record<string, string> = {
  INTJ: "策士",
  INTP: "理屈屋",
  ENTJ: "司令塔",
  ENTP: "屁理屈提供者",
  INFJ: "静かな預言者",
  INFP: "夢見る仲介人",
  ENFJ: "世話焼き主人公",
  ENFP: "お祭り広報",
  ISTJ: "几帳面な管理人",
  ISFJ: "縁の下の擁護者",
  ESTJ: "現場監督",
  ESFJ: "気配りの鬼",
  ISTP: "無口な職人",
  ISFP: "マイペース芸術家",
  ESTP: "ノリの起業家",
  ESFP: "パーティーの中心",
};

const MBTI_AXIS_COMMENTS: Record<string, string> = {
  E: "トークを回しているのは実質この人",
  I: "返してはくれるが、口火はあまり切らない",
  S: "話が具体的。時間と場所と値段で生きている",
  N: "「なんか」「かも」多め。雰囲気で会話するタイプ",
  T: "返事が「了解」で済みがち。感情より処理速度",
  F: "感情表現が豊か。テンションが文面に出る",
  J: "予定を決めたがる。段取りはこの人の担当",
  P: "「どっちでもいい」が口癖。流れに身を任せがち",
};

/** ラブタイプ16(偏見): 追/待 × 即/マ × 甘/塩 × 重/軽 */
const LOVE_TYPES: Record<string, { name: string; tagline: string }> = {
  追即甘重: { name: "猪突猛進シロップ漬け", tagline: "「好き」の圧が既読より速い" },
  追即甘軽: { name: "陽キャ砂糖菓子", tagline: "ノリと勢いで愛を配る" },
  追即塩重: { name: "執念のドライ刑事", tagline: "塩対応のくせに既読は1秒" },
  追即塩軽: { name: "反射神経だけの雑談屋", tagline: "速い。ただし中身はとくにない" },
  追マ甘重: { name: "スロー熟成ジャム", tagline: "遅れて届く激甘長文" },
  追マ甘軽: { name: "気まぐれマシュマロ", tagline: "甘いかどうかは気分次第" },
  追マ塩重: { name: "不器用な岩塩", tagline: "好きなのに素直になれない" },
  追マ塩軽: { name: "省エネハンター", tagline: "追ってはいる。ただし徒歩で" },
  待即甘重: { name: "構ってレーダー搭載機", tagline: "自分からは行かないが返しは秒" },
  待即甘軽: { name: "愛想満点フロント係", tagline: "待ちの姿勢で好感度だけ稼ぐ" },
  待即塩重: { name: "ツンデレ監視塔", tagline: "見てないふりして全部見てる" },
  待即塩軽: { name: "既読製造マシーン", tagline: "速い。それだけ" },
  待マ甘重: { name: "玉座の溺愛主", tagline: "動かないが愛は重い" },
  待マ甘軽: { name: "ゆるふわ観葉植物", tagline: "癒すが、動かない" },
  待マ塩重: { name: "無口な大黒柱", tagline: "何も言わないが、そこにいる" },
  待マ塩軽: { name: "恋愛仙人", tagline: "もはや浮世の外にいる" },
};

function axis(
  letters: [string, string],
  labels: [string, string],
  score: number,
): AxisResult {
  const s = bound(score);
  const winner = s >= 0 ? letters[0] : letters[1];
  const strength = Math.abs(s);
  return {
    letters,
    labels,
    winner,
    strength,
    pct: Math.round(50 + strength * 45),
  };
}

function diagnosePerson(
  p: PersonStats,
  partner: PersonStats,
  s: PairStats,
): PersonPersonality {
  const t = p.traits;
  const totalStarts = p.sessionStarts + partner.sessionStarts;
  const startShare = totalStarts > 0 ? p.sessionStarts / totalStarts : 0.5;
  const msgShare = p.messageCount / (p.messageCount + partner.messageCount);
  const spanDays = Math.max(1, s.spanMs / 86_400_000);
  const perDay = p.messageCount / spanDays;

  // E/I: 口火・発言量・質問・感嘆符
  const eScore =
    (startShare - 0.5) * 2 * 0.7 +
    (msgShare - 0.5) * 2 * 0.5 +
    (p.questionRate - partner.questionRate) * 2 +
    (t.exclaim - 0.15) * 0.8 +
    bound(perDay / 25 - 0.4, -0.3, 0.3);

  // S/N: 具体語 vs 曖昧・想像語
  const nScore = (t.hedge - 0.1) * 4 - (t.concrete - 0.2) * 2.5;

  // T/F: 感情表現 vs ドライ返答
  const fScore =
    (t.emotion - 0.08) * 3 +
    p.emojiRate * 1.2 +
    p.heartRate * 2 -
    (t.dry - 0.12) * 3;

  // J/P: 計画語 vs ノリ語(僅差なら即レス側をJに寄せる)
  const fastTiebreak =
    p.medianReplyMs !== null && p.medianReplyMs < 10 * 60_000 ? 0.12 : -0.12;
  const jScore = (t.plan - t.flex) * 10 + fastTiebreak;

  const axes = [
    axis(["E", "I"], ["外向", "内向"], eScore),
    axis(["S", "N"], ["現実", "直感"], -nScore),
    axis(["T", "F"], ["思考", "感情"], -fScore),
    axis(["J", "P"], ["計画", "ノリ"], jScore),
  ];
  const type = axes.map((a) => a.winner).join("");

  // MBTIコメント: いちばん傾きが強い軸を2つ拾う
  const strongest = [...axes]
    .sort((x, y) => y.strength - x.strength)
    .slice(0, 2)
    .map((a) => MBTI_AXIS_COMMENTS[a.winner]);

  // ラブタイプ16
  const chase =
    (msgShare - 0.5) * 2 * 0.7 +
    (startShare - 0.5) * 2 * 0.5 +
    (p.questionRate - partner.questionRate) * 2;
  const quick =
    p.medianReplyMs === null
      ? -0.3
      : bound((10 * 60_000 - p.medianReplyMs) / (10 * 60_000), -1, 1);
  const textCountApprox = Math.max(1, p.messageCount);
  const sweet =
    p.heartRate * 2.5 +
    p.emojiRate * 1.2 +
    (p.affectionCount / textCountApprox) * 8 +
    t.emotion * 1.5 -
    0.25;
  const heavy =
    p.lateNightRate * 3 +
    bound(perDay / 30, 0, 0.6) +
    (p.apologyCount / textCountApprox) * 4 +
    bound(p.avgLength / 70, 0, 0.5) -
    0.55;

  const key =
    (chase >= 0 ? "追" : "待") +
    (quick >= 0 ? "即" : "マ") +
    (sweet >= 0 ? "甘" : "塩") +
    (heavy >= 0 ? "重" : "軽");
  const love = LOVE_TYPES[key];

  return {
    name: p.name,
    mbti: {
      type,
      nickname: MBTI_NICKNAMES[type],
      axes,
      comment: strongest.join("。") + "。",
    },
    love: { key, name: love.name, tagline: love.tagline },
  };
}

function buildCompat(a: PersonPersonality, b: PersonPersonality): string[] {
  const compat: string[] = [];

  const aChase = a.love.key[0] === "追";
  const bChase = b.love.key[0] === "追";
  if (aChase && bChase) {
    compat.push("ふたりとも追うタイプ。アクセルが2つあってブレーキがありません。");
  } else if (!aChase && !bChase) {
    compat.push("ふたりとも待ちタイプ。動いた方が負けだと思っている節があります。よく成立しましたね。");
  } else {
    compat.push("追う側と待つ側。役割分担が完璧な、教科書どおりの共犯関係です。");
  }

  const aSweet = a.love.key[2] === "甘";
  const bSweet = b.love.key[2] === "甘";
  if (aSweet && bSweet) {
    compat.push("糖度過多コンビ。見ているこちらが虫歯になります。");
  } else if (!aSweet && !bSweet) {
    compat.push("塩と塩。うま味はあるが甘さはない、玄人向けの関係です。");
  } else {
    compat.push("甘口と塩。おにぎりとしてちょうど完成しています。");
  }

  const matches = a.mbti.type
    .split("")
    .filter((c, i) => c === b.mbti.type[i]).length;
  const matchComments = [
    "性格は4軸すべてバラバラ。ここまで違ってて続いてるのは、もはや才能です。",
    "性格の一致は4軸中1つ。ほぼ異文化交流ですが、それが飽きない秘訣かもしれません。",
    "性格の一致は4軸中2つ。ほどよく他人で、ほどよく仲間。いいバランスです。",
    "性格の一致は4軸中3つ。気が合うのも当然です。ケンカの原因は残りの1軸。",
    "まさかの4軸全一致。鏡と付き合っている可能性を一度疑ってください。",
  ];
  compat.push(matchComments[matches]);

  return compat;
}

/** ラブタイプ16同士の相性(偏見)。軸ごとの組み合わせを加点方式で採点 */
function buildLoveMatch(
  aKey: string,
  bKey: string,
): { score: number; comment: string } {
  const pair = (i: number) => aKey[i] + bKey[i];
  let score = 13; // 基礎点(ここまで読み込んだ努力への加点)

  // 主導: 追×待が黄金比
  const lead = pair(0);
  score += lead === "追待" || lead === "待追" ? 25 : lead === "追追" ? 12 : 6;
  // 速度: 揃っているほど楽
  const speed = pair(1);
  score += speed === "即即" ? 20 : speed === "ママ" ? 14 : 9;
  // 糖度: 甘甘は最強、甘塩はおにぎり
  const sugar = pair(2);
  score += sugar === "甘甘" ? 20 : sugar === "甘塩" || sugar === "塩甘" ? 14 : 7;
  // 重さ: 重×重は共鳴、重×軽は片方が潰れがち
  const weight = pair(3);
  score += weight === "重重" ? 18 : weight === "軽軽" ? 15 : 9;

  const comment =
    score >= 85
      ? "型の組み合わせとしてはほぼ理想形。この相性で別れたら型のせいにはできません。"
      : score >= 70
        ? "かなり噛み合う組み合わせです。うまくいっているのは偶然ではなかった。"
        : score >= 55
          ? "工夫次第の組み合わせ。うまく回っているなら、それはふたりの企業努力です。"
          : "型としては噛み合っていません。それでも続いているなら、毎日が小さな奇跡です。";

  return { score, comment };
}

export function diagnosePersonalities(s: PairStats): PairPersonality {
  const a = diagnosePerson(s.a, s.b, s);
  const b = diagnosePerson(s.b, s.a, s);
  return {
    a,
    b,
    compat: buildCompat(a, b),
    loveMatch: buildLoveMatch(a.love.key, b.love.key),
  };
}
