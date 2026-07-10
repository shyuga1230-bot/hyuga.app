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

/**
 * 実測値と「典型値」の対数比っぽい比較(-1..1)。
 * x=0で-1、x=typで0、xが典型の3倍で+0.5。実際のトーク履歴の
 * 計測値(絵文字率0.6%、感嘆符1.5%、計画語0.1%など、想像より一桁
 * 小さい)に合わせて典型値を校正してある。
 */
const rel = (x: number, typ: number) => (x - typ) / (x + typ);

/** ペア内の相対差(-1..1)。二人の違いを必ず浮き上がらせる主成分 */
const diff = (mine: number, theirs: number, eps: number) =>
  (mine - theirs) / (mine + theirs + eps);

// 日本語トークの典型値(実データ計測に基づく校正値)
const TYP = {
  exclaim: 0.03,
  hedge: 0.03,
  concrete: 0.04,
  warm: 0.05,
  dry: 0.03,
  lateNight: 0.12,
  doubleText: 0.18,
  avgLen: 14,
  perDay: 25,
  hourEntropy: 0.72,
};

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
  // 小さな差も見えるように平方根で非線形に拡大(0.05→0.22, 0.3→0.55, 1→1)
  const strength = Math.sqrt(Math.abs(s));
  return {
    letters,
    labels,
    winner,
    strength,
    pct: Math.round(50 + strength * 45),
  };
}

/** 甘さの複合指標: 感情語+絵文字+ハート+愛情語 */
function warmth(p: PersonStats): number {
  const msgs = Math.max(1, p.messageCount);
  return (
    p.traits.emotion +
    p.emojiRate * 0.7 +
    p.heartRate * 2 +
    (p.affectionCount / msgs) * 1.5
  );
}

function diagnosePerson(
  p: PersonStats,
  partner: PersonStats,
  s: PairStats,
): PersonPersonality {
  const t = p.traits;
  const q = partner.traits;
  const startDiff = diff(p.sessionStarts, partner.sessionStarts, 1);
  const shareDiff = diff(p.messageCount, partner.messageCount, 1);
  const spanDays = Math.max(1, s.spanMs / 86_400_000);
  const perDay = p.messageCount / spanDays;

  // E/I: 口火・発言量・質問・感嘆符・連投。相対差が主成分、絶対値が補正
  const eScore =
    1.1 * startDiff +
    0.8 * shareDiff +
    0.8 * diff(p.questionRate, partner.questionRate, 0.01) +
    0.5 * diff(p.doubleTextRate, partner.doubleTextRate, 0.02) +
    0.4 * rel(t.exclaim, TYP.exclaim) +
    0.3 * rel(perDay, TYP.perDay);

  // S/N: 具体語 vs 曖昧・想像語
  const nScore =
    0.9 * diff(t.hedge, q.hedge, 0.005) +
    0.45 * rel(t.hedge, TYP.hedge) -
    0.9 * diff(t.concrete, q.concrete, 0.005) -
    0.45 * rel(t.concrete, TYP.concrete);

  // T/F: 感情表現の温度 vs ドライ返答
  const fScore =
    1.0 * diff(warmth(p), warmth(partner), 0.005) +
    0.55 * rel(warmth(p), TYP.warm) -
    1.0 * diff(t.dry, q.dry, 0.005) -
    0.55 * rel(t.dry, TYP.dry);

  // J/P: 計画語 vs ノリ語 + 生活リズムの規則性(時間帯エントロピー)
  const pfSelf = (t.plan - t.flex) / (t.plan + t.flex + 0.002);
  const pfPartner = (q.plan - q.flex) / (q.plan + q.flex + 0.002);
  const jScore =
    0.8 * pfSelf +
    0.5 * (pfSelf - pfPartner) +
    1.6 * (partner.hourEntropy - p.hourEntropy) +
    1.0 * (TYP.hourEntropy - p.hourEntropy);

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

  // ラブタイプ16(こちらも相対+校正絶対値のハイブリッド)
  const chase =
    0.9 * shareDiff +
    0.6 * startDiff +
    0.7 * diff(p.questionRate, partner.questionRate, 0.01) +
    0.7 * diff(p.doubleTextRate, partner.doubleTextRate, 0.02);
  const med = p.medianReplyMs;
  const medPartner = partner.medianReplyMs;
  const quick =
    med === null
      ? -0.3
      : 0.6 * bound((5 * 60_000 - med) / (5 * 60_000 + med)) +
        (medPartner !== null ? 0.4 * diff(medPartner, med, 30_000) : 0);
  const sweet =
    0.55 * rel(warmth(p), TYP.warm) +
    0.45 * diff(warmth(p), warmth(partner), 0.005);
  const msgs = Math.max(1, p.messageCount);
  const heavy =
    0.3 * rel(p.lateNightRate + 0.01, TYP.lateNight) +
    0.3 * rel(p.doubleTextRate + 0.01, TYP.doubleText) +
    0.2 * rel(p.apologyCount / msgs + 0.001, 0.004) +
    0.15 * rel(p.avgLength, TYP.avgLen) +
    0.15 * rel(perDay, 40);

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
