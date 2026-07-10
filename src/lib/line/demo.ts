/**
 * デモ用のLINEトーク履歴を「エクスポート形式のテキスト」として生成する。
 * 実際のパーサーに食わせることで、パーサーの動作確認も兼ねる。
 * シード付き乱数で毎回同じ結果になる。
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HINATA = [
  "おはよ〜！今日もがんばろ💪",
  "ねえねえ、昨日言ってたカフェ行かない？",
  "今日の空すごい綺麗だった📷",
  "[写真]",
  "お昼なに食べた？",
  "えーいいなあ！わたしコンビニだった😂",
  "しごおわ！！今日は早く帰れる〜",
  "ほんと？？やった！！💕",
  "[スタンプ]",
  "うける www",
  "それな笑",
  "ねむい、、、でも話したい",
  "電話していい？",
  "☎ 通話時間 42:15",
  "今日ありがとう！たのしかった〜💖",
  "大好きだよ",
  "おやすみ🌙また明日ね",
  "ごめん、さっきのは言い過ぎた",
  "週末どこ行く？？",
  "会いたいな〜",
];

const YUTA = [
  "おはよう",
  "いいよ、いつにする？",
  "たしかに",
  "ラーメン",
  "w",
  "了解",
  "おつかれ",
  "[スタンプ]",
  "おれも",
  "うん",
  "そだね",
  "いいよ",
  "ねよう",
  "おやすみ",
  "ありがとう",
  "こちらこそ",
  "土曜なら空いてる",
  "気にしないで",
  "映画とかどう",
  "おれも会いたい",
];

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function generateDemoExport(): string {
  const rand = mulberry32(20260214);
  const lines: string[] = [
    "[LINE] ひなたとのトーク履歴",
    "保存日時：2026/07/01 21:00",
    "",
  ];

  // 90日分の会話を生成
  const start = new Date(2026, 3, 1); // 2026/04/01
  for (let day = 0; day < 90; day++) {
    const date = new Date(start.getTime() + day * 86_400_000);
    if (rand() < 0.15) continue; // たまに会話がない日

    lines.push(
      `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}(${WEEKDAYS[date.getDay()]})`,
    );

    // 1日1〜3セッション
    const sessions = 1 + Math.floor(rand() * 3);
    for (let sIdx = 0; sIdx < sessions; sIdx++) {
      let hour = [8, 12, 21][sIdx] + Math.floor(rand() * 2);
      let minute = Math.floor(rand() * 60);
      // ひなたが口火を切りがち(偏見診断の見せ場を作る)
      let turn: "h" | "y" = rand() < 0.75 ? "h" : "y";
      const exchanges = 2 + Math.floor(rand() * 6);

      for (let e = 0; e < exchanges; e++) {
        const pool = turn === "h" ? HINATA : YUTA;
        const name = turn === "h" ? "ひなた" : "ゆうた";
        const text = pool[Math.floor(rand() * pool.length)];
        lines.push(`${pad(hour)}:${pad(minute)}\t${name}\t${text}`);

        // ひなたは即レス、ゆうたはのんびり
        const wait = turn === "y" ? 1 + Math.floor(rand() * 4) : 4 + Math.floor(rand() * 35);
        minute += wait;
        while (minute >= 60) {
          minute -= 60;
          hour++;
        }
        if (hour >= 24) break;
        turn = turn === "h" ? "y" : "h";
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
