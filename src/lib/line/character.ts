/**
 * ラブタイプ16のマスコットキャラクター生成。
 * まんまるボディのブロブをベースに、タイプごとに表情・小物・色を変えた
 * インラインSVG文字列を返す。外部アセットなし・ライト/ダーク両対応。
 */

const INK = "#4a4038";
const BLUSH = "#ff9db4";

interface CharSpec {
  /** 背景の円とボディの色 */
  bg: string;
  body: string;
  eyes: "sparkle" | "happy" | "flat" | "sleepy" | "dot" | "side";
  mouth: "smile" | "cat" | "flat" | "open" | "puku";
  blush: boolean;
  /** ボディより先に描く(背面) */
  behind?: string;
  /** ボディの上に描く(前面) */
  front?: string;
  /** ボディ自体の変形(省略時は標準のまんまる) */
  bodyShape?: string;
}

/* ---- 小物パーツ(viewBox 0 0 100 100 前提) ---- */

const heart = (x: number, y: number, s: number, fill = "#ff7ea0") =>
  `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" d="M0 3 C0 1 1.6 0 3 0 C4.2 0 5 .7 5.5 1.5 C6 .7 6.8 0 8 0 C9.4 0 11 1 11 3 C11 6 5.5 9.5 5.5 9.5 C5.5 9.5 0 6 0 3 Z"/>`;

const bolt = (x: number, y: number, s: number, fill = "#ffc24b") =>
  `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" d="M5 0 L0 7 L3.5 7 L2 13 L8 5.5 L4.5 5.5 L6.5 0 Z"/>`;

const zzz = (x: number, y: number) =>
  `<g stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".65">
    <path d="M${x} ${y} h5 l-5 5 h5"/>
    <path d="M${x + 9} ${y - 6} h3.6 l-3.6 3.6 h3.6"/>
  </g>`;

const sparkle = (x: number, y: number, s: number, fill = "#ffd34d") =>
  `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" d="M4 0 L5.1 2.9 L8 4 L5.1 5.1 L4 8 L2.9 5.1 L0 4 L2.9 2.9 Z"/>`;

const motionLines = (x: number, y: number) =>
  `<g stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".4">
    <line x1="${x}" y1="${y}" x2="${x + 8}" y2="${y}"/>
    <line x1="${x - 2}" y1="${y + 6}" x2="${x + 6}" y2="${y + 6}"/>
    <line x1="${x}" y1="${y + 12}" x2="${x + 8}" y2="${y + 12}"/>
  </g>`;

const sweat = (x: number, y: number) =>
  `<path fill="#9ecdf2" d="M${x} ${y} c2.6 3.4 2.6 5.4 0 6.6 c-2.6 -1.2 -2.6 -3.2 0 -6.6 Z" opacity=".9"/>`;

/* ---- 16タイプの仕様 ---- */

const SPECS: Record<string, CharSpec> = {
  // 猪突猛進シロップ漬け: シロップキャップがとろり、ハートまみれで突進
  追即甘重: {
    bg: "#ffe3ee",
    body: "#ffb3cd",
    eyes: "sparkle",
    mouth: "open",
    blush: true,
    behind: motionLines(12, 52),
    front: `
      <path fill="#e86a92" d="M28 46 q2 -18 22 -18 q20 0 22 18 q0 4 -5 3 q-3 6 -8 2 q-4 5 -9 1 q-4 5 -9 1 q-5 4 -8 -2 q-5 1 -5 -5 Z" opacity=".85"/>
      <path fill="#e86a92" d="M36 49 q1.6 6 -1 6 q-2.6 0 -1 -6 Z" opacity=".85"/>
      ${heart(66, 26, 0.9)} ${heart(78, 40, 0.6)} ${heart(20, 30, 0.55)}`,
  },
  // 陽キャ砂糖菓子: キャンディ包み+キラキラ
  追即甘軽: {
    bg: "#fff2d9",
    body: "#ffd28a",
    eyes: "sparkle",
    mouth: "open",
    blush: true,
    front: `
      <path fill="#ffab5e" d="M50 30 l-8 -8 l0 6 l-6 0 l6 4 l-6 4 l6 0 l0 6 Z" transform="rotate(24 50 30) translate(0 -2)"/>
      ${sparkle(70, 22, 1)} ${sparkle(24, 36, 0.7)} ${sparkle(78, 52, 0.6, "#ffab5e")}`,
  },
  // 執念のドライ刑事: 探偵帽+虫眼鏡、真顔
  追即塩重: {
    bg: "#e8ecf4",
    body: "#aebedd",
    eyes: "flat",
    mouth: "flat",
    blush: false,
    front: `
      <path fill="#5d6d94" d="M26 40 q24 -12 48 0 q-2 -7 -10 -9 q1 -6 -14 -6 q-15 0 -14 6 q-8 2 -10 9 Z"/>
      <rect x="24" y="38" width="52" height="4" rx="2" fill="#4d5b7d"/>
      <circle cx="76" cy="66" r="9" fill="none" stroke="#5d6d94" stroke-width="3"/>
      <circle cx="76" cy="66" r="7" fill="#dfe9f5" opacity=".7"/>
      <line x1="82" y1="73" x2="89" y2="80" stroke="#5d6d94" stroke-width="4" stroke-linecap="round"/>`,
  },
  // 反射神経だけの雑談屋: 吹き出し連打+稲妻
  追即塩軽: {
    bg: "#e5f5e5",
    body: "#a5d9a5",
    eyes: "dot",
    mouth: "open",
    blush: false,
    front: `
      <ellipse cx="24" cy="28" rx="9" ry="6.5" fill="#fff" stroke="${INK}" stroke-width="1.4"/>
      <path d="M28 33 l3 4 l1 -5" fill="#fff" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="20.5" cy="28" r="1.1" fill="${INK}"/><circle cx="24.5" cy="28" r="1.1" fill="${INK}"/><circle cx="28.5" cy="28" r="1.1" fill="${INK}"/>
      <ellipse cx="76" cy="22" rx="7" ry="5" fill="#fff" stroke="${INK}" stroke-width="1.2" opacity=".85"/>
      ${bolt(80, 38, 0.8)}`,
  },
  // スロー熟成ジャム: 瓶のフタ+いちご、まったり
  追マ甘重: {
    bg: "#f7e3f7",
    body: "#e3aee3",
    eyes: "sleepy",
    mouth: "smile",
    blush: true,
    front: `
      <rect x="34" y="26" width="32" height="9" rx="4" fill="#b477b4"/>
      <rect x="31" y="33" width="38" height="4" rx="2" fill="#9c5f9c"/>
      <circle cx="72" cy="30" r="4.5" fill="#ff7ea0"/>
      <path d="M72 25 l-1.6 -3 M72 25 l1.6 -3" stroke="#6fae6f" stroke-width="1.6" stroke-linecap="round"/>
      ${heart(18, 40, 0.55)}`,
  },
  // 気まぐれマシュマロ: ふわふわ白、ほっぺに渦巻き
  追マ甘軽: {
    bg: "#fdeee6",
    body: "#fff4ee",
    eyes: "happy",
    mouth: "cat",
    blush: true,
    bodyShape: `<path fill="#fff4ee" stroke="#f3d8ca" stroke-width="1.5" d="M28 66 q-4 -14 6 -22 q-2 -10 10 -9 q4 -8 12 -3 q10 -4 12 5 q10 4 5 14 q7 9 -3 16 q-2 8 -12 6 q-8 6 -16 1 q-11 3 -14 -8 Z"/>`,
    front: `<path d="M62 58 a3 3 0 1 1 -3 -3" fill="none" stroke="#f0c4b0" stroke-width="1.6" stroke-linecap="round"/>
      ${sparkle(22, 26, 0.6, "#ffd9c4")} ${sparkle(74, 30, 0.5, "#ffd9c4")}`,
  },
  // 不器用な岩塩: ごつごつ結晶、照れ隠し
  追マ塩重: {
    bg: "#eceae6",
    body: "#cfc9bd",
    eyes: "side",
    mouth: "flat",
    blush: true,
    bodyShape: `<path fill="#cfc9bd" stroke="#b5ad9e" stroke-width="1.5" d="M32 78 L26 56 L36 38 L54 32 L70 40 L76 60 L66 78 Z"/>`,
    front: `
      <path fill="#e3ddd2" d="M38 24 L44 16 L50 24 L44 30 Z"/>
      <path fill="#e3ddd2" d="M62 22 L66 16 L71 23 L66 28 Z" opacity=".9"/>
      ${sweat(80, 46)}`,
  },
  // 省エネハンター: 小さな旗を持って徒歩、うとうと
  追マ塩軽: {
    bg: "#eaf3e3",
    body: "#bcd9a8",
    eyes: "sleepy",
    mouth: "flat",
    blush: false,
    front: `
      <line x1="74" y1="30" x2="74" y2="58" stroke="#8a794f" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M74 30 L88 35 L74 40 Z" fill="#7fae5f"/>
      ${zzz(18, 30)}`,
  },
  // 構ってレーダー搭載機: 頭のパラボラアンテナ+受信波
  待即甘重: {
    bg: "#e3f0ff",
    body: "#a9cdf4",
    eyes: "sparkle",
    mouth: "puku",
    blush: true,
    front: `
      <line x1="50" y1="34" x2="50" y2="27" stroke="#5f87c0" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M39 19 a11 8 0 0 0 22 0 Z" fill="#7fa7c0" stroke="#5f87c0" stroke-width="1.8"/>
      <circle cx="50" cy="18" r="2.4" fill="#ff7ea0"/>
      <g stroke="#8fb6e6" stroke-width="1.6" fill="none" stroke-linecap="round">
        <path d="M63 12 a11 11 0 0 1 5 7"/>
        <path d="M68 7 a16 16 0 0 1 8 10"/>
      </g>
      ${heart(20, 24, 0.6)}`,
  },
  // 愛想満点フロント係: ピルボックス帽+蝶ネクタイ
  待即甘軽: {
    bg: "#fff0f0",
    body: "#ffc9c9",
    eyes: "happy",
    mouth: "open",
    blush: true,
    front: `
      <rect x="38" y="24" width="24" height="10" rx="3" fill="#e06c7d"/>
      <rect x="38" y="30" width="24" height="3" fill="#c95264"/>
      <path d="M50 76 l-7 -4.5 v9 Z M50 76 l7 -4.5 v9 Z" fill="#e06c7d"/>
      <circle cx="50" cy="76" r="2" fill="#c95264"/>`,
  },
  // ツンデレ監視塔: 壁からチラ見+双眼鏡
  待即塩重: {
    bg: "#efe9f7",
    body: "#c5b3e6",
    eyes: "side",
    mouth: "flat",
    blush: true,
    front: `
      <rect x="18" y="62" width="64" height="26" rx="3" fill="#ab97d6"/>
      <g stroke="#937fc4" stroke-width="1.4">
        <line x1="18" y1="71" x2="82" y2="71"/><line x1="18" y1="80" x2="82" y2="80"/>
        <line x1="38" y1="62" x2="38" y2="71"/><line x1="58" y1="62" x2="58" y2="71"/>
        <line x1="48" y1="71" x2="48" y2="80"/><line x1="28" y1="80" x2="28" y2="88"/><line x1="68" y1="80" x2="68" y2="88"/>
      </g>`,
  },
  // 既読製造マシーン: アンテナ+チェックマーク
  待即塩軽: {
    bg: "#e9eef1",
    body: "#c0ccd4",
    eyes: "flat",
    mouth: "flat",
    blush: false,
    front: `
      <line x1="50" y1="34" x2="50" y2="25" stroke="#7d8f9c" stroke-width="2.2"/>
      <circle cx="50" cy="23" r="3" fill="#ffc24b"/>
      <g stroke="#5f9e6f" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 30 l3 3 l5 -6"/>
        <path d="M72 20 l3 3 l5 -6"/>
      </g>`,
  },
  // 玉座の溺愛主: 王冠+クッション
  待マ甘重: {
    bg: "#fdeff7",
    body: "#f4b8dc",
    eyes: "sleepy",
    mouth: "smile",
    blush: true,
    behind: `<ellipse cx="50" cy="84" rx="30" ry="8" fill="#e06caa" opacity=".5"/>
      <ellipse cx="50" cy="82" rx="28" ry="7" fill="#f7cce3"/>`,
    front: `
      <path d="M38 30 L40 20 L46 27 L50 18 L54 27 L60 20 L62 30 Z" fill="#ffc24b" stroke="#e8a72e" stroke-width="1.4"/>
      <circle cx="50" cy="24" r="1.6" fill="#ff7ea0"/>
      ${heart(72, 30, 0.7)}`,
  },
  // ゆるふわ観葉植物: 頭から双葉、にこにこ
  待マ甘軽: {
    bg: "#e7f6ef",
    body: "#b9e6cf",
    eyes: "happy",
    mouth: "cat",
    blush: true,
    front: `
      <path d="M50 34 v-8" stroke="#6fae6f" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M50 26 q-10 -8 -14 2 q8 6 14 -2 Z" fill="#8fcf8f"/>
      <path d="M50 26 q10 -8 14 2 q-8 6 -14 -2 Z" fill="#a5d9a5"/>`,
  },
  // 無口な大黒柱: はちまき+どっしり
  待マ塩重: {
    bg: "#f0ebe3",
    body: "#d6c3a5",
    eyes: "flat",
    mouth: "flat",
    blush: false,
    bodyShape: `<path fill="#d6c3a5" stroke="#bfa987" stroke-width="1.5" d="M26 82 q-3 -40 8 -44 q7 -6 16 -6 q9 0 16 6 q11 4 8 44 Z"/>`,
    front: `
      <rect x="30" y="38" width="40" height="7" rx="3.5" fill="#b2543f"/>
      <path d="M70 41 l8 -4 l-2 6 l3 4 l-9 -2 Z" fill="#b2543f"/>`,
  },
  // 恋愛仙人: 雲乗り+白ひげ
  待マ塩軽: {
    bg: "#edf4f4",
    body: "#c3dede",
    eyes: "sleepy",
    mouth: "smile",
    blush: false,
    behind: `<g fill="#fff" stroke="#cfdede" stroke-width="1.4">
      <ellipse cx="42" cy="84" rx="16" ry="7"/>
      <ellipse cx="60" cy="86" rx="13" ry="6"/>
      <ellipse cx="50" cy="88" rx="20" ry="6"/>
    </g>`,
    front: `
      <path d="M38 62 q12 14 24 0 q1 12 -12 12 q-13 0 -12 -12 Z" fill="#fff" stroke="#d8e4e4" stroke-width="1.2"/>
      <line x1="78" y1="26" x2="78" y2="66" stroke="#a58a5f" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M78 26 q8 -6 6 4" fill="none" stroke="#a58a5f" stroke-width="2.4" stroke-linecap="round"/>
      ${sparkle(20, 22, 0.6, "#cfe4e4")}`,
  },
};

/* ---- 顔パーツ ---- */

function eyesSvg(kind: CharSpec["eyes"]): string {
  switch (kind) {
    case "sparkle":
      return `<circle cx="41" cy="54" r="3.6" fill="${INK}"/><circle cx="59" cy="54" r="3.6" fill="${INK}"/>
        <circle cx="42.3" cy="52.6" r="1.3" fill="#fff"/><circle cx="60.3" cy="52.6" r="1.3" fill="#fff"/>`;
    case "happy":
      return `<path d="M37 54 q4 -4.5 8 0 M55 54 q4 -4.5 8 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
    case "flat":
      return `<rect x="37" y="52.5" width="7" height="2.6" rx="1.3" fill="${INK}"/><rect x="56" y="52.5" width="7" height="2.6" rx="1.3" fill="${INK}"/>`;
    case "sleepy":
      return `<path d="M37 54 q4 3.5 8 0 M55 54 q4 3.5 8 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
    case "dot":
      return `<circle cx="41" cy="54" r="2.6" fill="${INK}"/><circle cx="59" cy="54" r="2.6" fill="${INK}"/>`;
    case "side":
      return `<circle cx="43" cy="53" r="2.8" fill="${INK}"/><circle cx="61" cy="53" r="2.8" fill="${INK}"/>`;
  }
}

function mouthSvg(kind: CharSpec["mouth"]): string {
  switch (kind) {
    case "smile":
      return `<path d="M46 61 q4 3.5 8 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
    case "cat":
      return `<path d="M45 61 q2.5 3 5 0 q2.5 3 5 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
    case "flat":
      return `<line x1="46" y1="62" x2="54" y2="62" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
    case "open":
      return `<path d="M45 60 q5 7 10 0 Z" fill="#e06c7d" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
    case "puku":
      return `<circle cx="50" cy="62" r="2.6" fill="none" stroke="${INK}" stroke-width="1.8"/>`;
  }
}

/**
 * ラブタイプのキーからマスコットSVG文字列を返す。
 * 未知のキーはまんまる素体で描く。
 */
export function loveCharacterSvg(key: string, size = 96, label = ""): string {
  const spec = SPECS[key] ?? {
    bg: "#eeeeee",
    body: "#d5d5d5",
    eyes: "dot" as const,
    mouth: "smile" as const,
    blush: false,
  };
  const body =
    spec.bodyShape ??
    `<path fill="${spec.body}" d="M50 32 q22 0 24 24 q1.5 24 -24 24 q-25.5 0 -24 -24 q2 -24 24 -24 Z"/>`;
  const blush = spec.blush
    ? `<ellipse cx="35" cy="60" rx="4" ry="2.4" fill="${BLUSH}" opacity=".55"/>
       <ellipse cx="65" cy="60" rx="4" ry="2.4" fill="${BLUSH}" opacity=".55"/>`
    : "";
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label}">
    <circle cx="50" cy="54" r="44" fill="${spec.bg}"/>
    ${spec.behind ?? ""}
    ${body}
    ${eyesSvg(spec.eyes)}
    ${blush}
    ${mouthSvg(spec.mouth)}
    ${spec.front ?? ""}
  </svg>`;
}
