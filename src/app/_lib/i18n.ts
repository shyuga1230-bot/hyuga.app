/**
 * 最小のi18n。日本語が原文、英語は静かなトーンを保った翻訳。
 * useSyncExternalStore で購読できる小さな言語ストア付き。
 */

export type Lang = "ja" | "en";

const KEY = "muhaku.lang.v1";

let cache: Lang | undefined;
const listeners = new Set<() => void>();

export function getLangSnapshot(): Lang {
  if (cache === undefined) {
    cache =
      typeof window !== "undefined" &&
      window.localStorage.getItem(KEY) === "en"
        ? "en"
        : "ja";
  }
  return cache;
}

export function getServerLangSnapshot(): Lang {
  return "ja";
}

export function setLang(l: Lang): void {
  cache = l;
  window.localStorage.setItem(KEY, l);
  for (const cb of listeners) cb();
}

export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

type Entry = { ja: string; en: string };

export const STR = {
  /* 儀式 */
  ob0Title: { ja: "こぼれた一粒は、もう戻らない。", en: "A grain that spills never returns." },
  ob0Sub: {
    ja: "ここから先は、あなたの残り時間の話です。\n静かな場所で、ひとりで。",
    en: "What follows is about the time you have left.\nSomewhere quiet, alone.",
  },
  ob0Next: { ja: "すすむ", en: "begin" },
  obBirthQ: { ja: "あなたは、いつ始まりましたか。", en: "When did you begin?" },
  obBirthSub: { ja: "砂は、この日からこぼれはじめています。", en: "The sand has been spilling since this day." },
  obNext: { ja: "つぎへ", en: "next" },
  obLifeQ: { ja: "終わりの日を、あなたが決めてください。", en: "Choose your own ending." },
  obLifeSub: {
    ja: "ほんとうの答えは、誰も知りません。\nそれでも一度、仮の終わりを置く。そこからしか、残りは見えません。\nいつでも、決めなおせます。",
    en: "No one knows the true answer.\nStill, place a provisional end — only from there can the remainder be seen.\nYou can always change it.",
  },
  obLifeAria: { ja: "寿命(歳)", en: "Lifespan (years)" },
  obDreamQ: { ja: "終わるまでに、何をしますか。", en: "Before it ends, what will you do?" },
  obDreamSub: {
    ja: "いくつでも、かまいません。歳の深さを変えて、残りの中に沈めておきます。",
    en: "As many as you like. Each sinks to the depth of its age, into what remains.",
  },
  obDreamPh: { ja: "例: 海のそばに住む", en: "e.g. live by the sea" },
  obAgeSuffix: { ja: "歳までに", en: "by this age" },
  obAddMore: { ja: "もうひとつ沈める", en: "sink another" },
  obLater: { ja: "あとで決める", en: "decide later" },
  obFinalQ: { ja: "これが、あなたの残りになります。", en: "This becomes your remainder." },
  obFinalSub: {
    ja: "誰にも送られません。この端末の中だけに、残ります。",
    en: "Nothing is sent anywhere. It stays only on this device.",
  },
  obEnter: { ja: "砂に会う", en: "meet the sand" },
  errBirthEmpty: { ja: "その日から、砂はこぼれはじめています。", en: "The sand began spilling on that day." },
  errBirthFuture: { ja: "始まりは、今日より前の日のはずです。", en: "Your beginning must be before today." },
  errLifeRange: { ja: "1 から 130 のあいだで、仮の終わりを置いてください。", en: "Place the provisional end between 1 and 130." },
  errLifePassed: { ja: "その終わりは、もう過ぎています。", en: "That ending has already passed." },
  errDreamFull: { ja: "その器には、これ以上刻めません。(8つまで)", en: "The vessel holds no more. (8 at most)" },
  errDreamEmpty: { ja: "ひとつで、かまいません。", en: "One is enough." },
  errAgePast: { ja: "その歳は、もう通り過ぎました。", en: "You have already passed that age." },
  errAgeAfterEnd: { ja: "それは、終わりのあとになっています。", en: "That falls after the end." },

  /* メイン画面 */
  remainPre: { ja: "残り", en: "left" },
  nokori: { ja: "のこり", en: "remains" },
  ctxLife: { ja: "残り {days} 日", en: "{days} days left" },
  ctxYear: { ja: "今年の残りは、あと {days} 日", en: "{days} days left in this year" },
  ctxDay: { ja: "今日の残りは、あと {t}", en: "{t} left in today" },
  ctxSec: { ja: "この一秒も、こぼれている。", en: "This second, too, is spilling." },
  railSec: { ja: "秒", en: "s" },
  railDay: { ja: "日", en: "d" },
  railYear: { ja: "年", en: "y" },
  railLife: { ja: "生", en: "L" },
  dreamLeft: { ja: "あと {days} 日", en: "{days} days" },
  dreamDone: { ja: "達成", en: "done" },
  btnPast: { ja: "これまで", en: "so far" },
  btnGoal: { ja: "目標を足す", en: "add a goal" },
  btnMute: { ja: "音を消す", en: "mute" },
  btnUnmute: { ja: "音を出す", en: "sound on" },
  btnReset: { ja: "はじめから", en: "start over" },
  resetConfirm: { ja: "すべて消して、最初から?", en: "Erase everything and start over?" },
  yes: { ja: "はい", en: "yes" },
  no: { ja: "いいえ", en: "no" },
  hintZoom: { ja: "スクロールで、時間に近づく", en: "scroll to move closer to time" },
  hintBand: { ja: "この画面は、現実の時刻とともに移ろいます", en: "this scene shifts with the real time of day" },
  hintSound: { ja: "かすかな音が流れています。右下で消せます", en: "a faint sound is playing — mute it at lower right" },
  reveal: { ja: "これが、あなたの残りです。——いまも、一粒。", en: "This is your remainder. — even now, a grain." },
  daily: { ja: "今日のぶんが、こぼれはじめています。", en: "Today's share has begun to spill." },
  weekly: { ja: "この一週間で、{pct}% が消えました。", en: "In the past week, {pct}% disappeared." },
  celebrated: { ja: "ひとつ、間に合った。", en: "One of them — you made it in time." },

  /* 目標ダイアログ */
  goalQ: { ja: "終わるまでに、何をしますか。", en: "Before it ends, what will you do?" },
  goalS: {
    ja: "歳を決めて、残りの中に沈めます。砂面がその深さに届いた日が、その歳です。",
    en: "Choose an age; it sinks into the remainder. The day the sand reaches that depth is that age.",
  },
  goalPh: { ja: "例: 富士山に登る", en: "e.g. climb a mountain" },
  goalAdd: { ja: "沈める", en: "sink it" },
  goalClose: { ja: "とじる", en: "close" },
  goalRemove: { ja: "消す", en: "remove" },
  goalDone: { ja: "達成", en: "done" },
  lifeEditLabel: { ja: "終わりを決めなおす", en: "re-choose the ending" },
  lifeEditBtn: { ja: "決めなおす", en: "change" },

  /* これまでパネル */
  pastTitle: { ja: "これまで", en: "So far" },
  pastSub: {
    ja: "失っただけではありません。これだけの時間が、あなたを作りました。",
    en: "Not only loss — all of this time has made you.",
  },
  pastDays: { ja: "生きた日", en: "days lived" },
  pastMornings: { ja: "迎えた朝", en: "mornings met" },
  pastSprings: { ja: "巡った春", en: "springs passed" },
  pastMoons: { ja: "満ちた月", en: "full moons" },
  pastShare: { ja: "この画を保存する", en: "save this view" },
  pastExport: { ja: "記録を書き出す", en: "export your data" },
  pastImport: { ja: "記録を読み込む", en: "import your data" },
  importErr: { ja: "その記録は、読めませんでした。", en: "That record could not be read." },
  importOk: { ja: "記録が、戻ってきました。", en: "Your record has returned." },

  /* エラー */
  crashTitle: { ja: "画面が、途切れました。", en: "The scene was interrupted." },
  crashSub: { ja: "再読み込みで戻れます。記録は端末に残っています。", en: "Reload to return. Your record remains on this device." },
  crashReload: { ja: "再読み込み", en: "reload" },

  ariaStatus: { ja: "人生の残量 {pct}パーセント、残り {days} 日", en: "Life remaining {pct} percent, {days} days left" },
} satisfies Record<string, Entry>;

export type StrKey = keyof typeof STR;

export function tr(lang: Lang, key: StrKey, vars?: Record<string, string | number>): string {
  let s: string = STR[key][lang];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
