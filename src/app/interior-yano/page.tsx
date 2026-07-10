import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "インテリア矢野ふすま本店|ふすま・障子・網戸・畳の張替え",
  description:
    "宮崎県日向市のふすま・障子・網戸・畳の張替えから内装リフォームまで。和室のことなら、インテリア矢野ふすま本店へ。一枚からのご依頼も歓迎、お見積りは無料です。",
};

// ===== 店舗情報 =====
// NOTE: 下記は仮の値です。正式な住所・電話番号・営業時間に差し替えてください。
// 差し替えが済んだら SHOP.isPlaceholder を false にすると「準備中」の注記が消えます。
const SHOP = {
  name: "インテリア矢野ふすま本店",
  address: "宮崎県日向市◯◯町0-00",
  tel: "0982-00-0000",
  hours: "8:00 〜 18:00",
  closed: "日曜・祝日",
  area: "日向市を中心とした近隣地域(門川町・美郷町・都農町 ほか)",
  isPlaceholder: true,
};

const NAV = [
  { href: "#services", label: "承ります" },
  { href: "#reasons", label: "当店のこと" },
  { href: "#flow", label: "ご依頼の流れ" },
  { href: "#faq", label: "よくあるご質問" },
  { href: "#info", label: "店舗情報" },
];

// 落ち着いた和の配色(生成り × 藍 × 墨)。ダークモードは prefers-color-scheme に追従
const paper = "bg-[#f7f4ec] dark:bg-[#141310]";
const card = "bg-[#fffdf8] dark:bg-[#1d1b17]";
const ink = "text-[#241f18] dark:text-[#ece7db]";
const inkSoft = "text-[#5d574c] dark:text-[#a8a193]";
const indigo = "text-[#31517c] dark:text-[#93b2da]";
const line = "border-[#241f18]/10 dark:border-[#ece7db]/15";

type Service = {
  title: string;
  reading: string;
  description: string;
  icon: React.ReactNode;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const SERVICES: Service[] = [
  {
    title: "襖",
    reading: "ふすま",
    description:
      "張替え・新調・骨の修理まで。定番の鳥の子紙から織物襖紙、モダン柄まで、見本帳からお選びいただけます。",
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true" {...stroke}>
        <rect x="8" y="6" width="15" height="36" />
        <rect x="25" y="6" width="15" height="36" />
        <circle cx="21" cy="24" r="1.8" />
        <circle cx="27" cy="24" r="1.8" />
      </svg>
    ),
  },
  {
    title: "障子",
    reading: "しょうじ",
    description:
      "普通紙のほか、破れにくい強化障子紙やワーロン紙もご用意。桟の折れ・建付けの調整もあわせて承ります。",
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true" {...stroke}>
        <rect x="9" y="6" width="30" height="36" />
        <path d="M9 18h30M9 30h30M19 6v36M29 6v36" />
      </svg>
    ),
  },
  {
    title: "網戸",
    reading: "あみど",
    description:
      "張替えは一枚からよろこんで。お急ぎの場合は最短当日仕上げもご相談ください。ペットのいるお宅には破れに強いネットもおすすめです。",
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true" {...stroke}>
        <rect x="9" y="6" width="30" height="36" />
        <path d="M15 6v36M24 6v36M33 6v36M9 14h30M9 24h30M9 34h30" strokeWidth="0.8" />
      </svg>
    ),
  },
  {
    title: "畳",
    reading: "たたみ",
    description:
      "裏返し・表替え・新調まで。国産い草から和紙畳・カラー畳まで、暮らしに合わせてご提案します。",
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true" {...stroke}>
        <rect x="6" y="12" width="36" height="24" />
        <path d="M6 20h36M6 28h36" strokeWidth="0.8" />
        <path d="M12 12v24M36 12v24" />
      </svg>
    ),
  },
  {
    title: "表装・掛軸",
    reading: "ひょうそう・かけじく",
    description:
      "掛軸や屏風の仕立て直し、額装のご相談も承ります。まずは現物を拝見してご案内いたします。",
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true" {...stroke}>
        <path d="M14 8h20M14 8v30a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V8" />
        <path d="M19 14h10M24 20v12" strokeWidth="0.8" />
        <circle cx="24" cy="8" r="2" />
      </svg>
    ),
  },
  {
    title: "内装リフォーム",
    reading: "ないそう",
    description:
      "壁紙(クロス)の張替えや和室まわりの小さな修繕など、内装のお困りごとをまとめてどうぞ。",
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true" {...stroke}>
        <path d="M10 16a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v2H10z" />
        <path d="M24 18v8M24 26h-4v12h8V26z" />
      </svg>
    ),
  },
];

const REASONS = [
  {
    title: "手仕事のていねいさ",
    body: "一枚一枚、下地から確かめて張り上げます。角の納まりや紙の目まで、仕上がりの美しさにこだわります。",
  },
  {
    title: "地域密着のフットワーク",
    body: "地元のお店だから、下見もお届けもすぐに伺えます。ご近所の和室まわりの「困った」の駆け込み先に。",
  },
  {
    title: "一枚からよろこんで",
    body: "「網戸一枚だけ」「破れた障子だけ」も大歓迎。小さなご依頼こそ、お気軽にお声がけください。",
  },
];

const FLOW = [
  {
    step: "01",
    title: "お電話でご相談",
    body: "「ふすまを何枚か替えたい」だけで大丈夫。ご希望をおおまかにお聞かせください。",
  },
  {
    step: "02",
    title: "下見・お見積り(無料)",
    body: "ご自宅へ伺い、寸法と傷み具合を拝見。見本帳から紙をお選びいただき、その場でお見積りします。",
  },
  {
    step: "03",
    title: "お預かり・施工",
    body: "建具はお預かりして工房で施工。ご不便を最小限に、できる限り早くお返しします。",
  },
  {
    step: "04",
    title: "納品・建付け調整",
    body: "お納めの際に開け閉めまで確認して完了です。施工後の気になる点もお気軽にどうぞ。",
  },
];

const FAQ = [
  {
    q: "一枚だけでもお願いできますか?",
    a: "はい、一枚からよろこんでお受けします。網戸や障子の部分的な張替えもお気軽にご相談ください。",
  },
  {
    q: "仕上がりまで何日くらいかかりますか?",
    a: "枚数や紙の在庫によりますが、数日〜1週間程度が目安です。お急ぎの場合は下見の際にご相談ください。",
  },
  {
    q: "料金はどのくらいですか?",
    a: "選ばれる紙のグレードと枚数で変わりますので、無料の下見・お見積りでご案内しています。お見積り後のキャンセルももちろん可能です。",
  },
  {
    q: "古い襖や障子の処分もお願いできますか?",
    a: "新調の際の古い建具のお引き取りも承ります。下見の際にあわせてお申し付けください。",
  },
];

function SectionHeading({
  id,
  en,
  children,
}: {
  id?: string;
  en: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-28 text-center">
      <p className={`text-[11px] font-medium uppercase tracking-[0.3em] ${indigo}`}>
        {en}
      </p>
      <h2 className={`mt-2 font-serif text-2xl font-semibold tracking-widest sm:text-3xl ${ink}`}>
        {children}
      </h2>
      <span
        aria-hidden
        className="mx-auto mt-4 block h-px w-10 bg-[#31517c]/60 dark:bg-[#93b2da]/60"
      />
    </div>
  );
}

// 七宝繋ぎ文様(装飾)。同一ページで複数回使うため pattern の id は呼び出し側で一意にする
function ShippouPattern({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse">
          {[
            [28, 28],
            [0, 0],
            [56, 0],
            [0, 56],
            [56, 56],
          ].map(([cx, cy]) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// ふすまのイラスト(装飾)
function FusumaArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 200" className={className} aria-hidden="true" {...stroke}>
      {/* 鴨居と敷居 */}
      <path d="M10 18h240M10 182h240" strokeWidth="3" />
      {/* 左の襖 */}
      <rect x="28" y="26" width="98" height="148" />
      <rect x="36" y="34" width="82" height="132" strokeWidth="0.8" />
      <circle cx="114" cy="102" r="4" />
      {/* 引手側の霞模様 */}
      <path d="M46 132c14-6 26-6 40 0M52 144c10-4 20-4 30 0" strokeWidth="0.8" />
      {/* 右の襖(手前) */}
      <rect x="132" y="26" width="98" height="148" className="fill-[#fffdf8] dark:fill-[#1d1b17]" />
      <rect x="140" y="34" width="82" height="132" strokeWidth="0.8" />
      <circle cx="146" cy="102" r="4" />
      {/* 山霞の模様 */}
      <path d="M156 70c12-10 24-10 36 0s24 10 36 0" strokeWidth="0.8" />
      <path d="M156 84c12-10 24-10 36 0s24 10 36 0" strokeWidth="0.8" />
    </svg>
  );
}

export default function InteriorYanoPage() {
  return (
    <div className={`flex flex-1 flex-col font-sans ${paper} ${ink}`}>
      {/* ヘッダー */}
      <header
        className={`sticky top-0 z-10 border-b ${line} bg-[#f7f4ec]/90 backdrop-blur dark:bg-[#141310]/90`}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3">
          <p className="font-serif text-base font-semibold tracking-widest sm:text-lg">
            インテリア矢野<span className={`${indigo}`}>ふすま本店</span>
          </p>
          <nav aria-label="ページ内">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-[13px]">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={`inline-block py-1 ${inkSoft} transition-colors hover:text-[#31517c] dark:hover:text-[#93b2da]`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4">
        {/* ヒーロー */}
        <section className="relative overflow-hidden py-16 sm:py-24">
          <ShippouPattern
            id="shippou-hero"
            className="absolute inset-0 h-full w-full text-[#31517c]/[0.07] dark:text-[#93b2da]/[0.06]"
          />
          <div className="relative flex flex-col items-center gap-10 sm:flex-row sm:justify-between">
            <div className="max-w-xl text-center sm:text-left">
              <p className={`text-sm tracking-[0.25em] ${indigo}`}>
                ふすま・障子・網戸・畳
              </p>
              <h1 className="mt-4 font-serif text-[1.375rem] font-semibold leading-snug tracking-wide sm:text-[2.6rem] sm:leading-tight sm:tracking-widest">
                <span className="inline-block">張り替えるのは、紙一枚。</span>
                <span className="inline-block">変わるのは、部屋の空気。</span>
              </h1>
              <p className={`mt-6 text-sm leading-7 ${inkSoft}`}>
                {SHOP.name}は、和室まわりの張替えと修繕の専門店です。
                日々の暮らしの中でくたびれてきた襖や障子を、確かな手仕事でよみがえらせます。
                下見・お見積りは無料、一枚からのご依頼も歓迎です。
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
                <a
                  href="#info"
                  className="rounded-full bg-[#31517c] px-6 py-3 text-sm font-medium tracking-wider text-[#f7f4ec] transition-opacity hover:opacity-85 dark:bg-[#93b2da] dark:text-[#141310]"
                >
                  お見積りのご相談
                </a>
                <a
                  href="#services"
                  className={`text-sm tracking-wider ${indigo} hover:underline`}
                >
                  できることを見る →
                </a>
              </div>
            </div>
            <FusumaArt className="w-56 shrink-0 text-[#241f18]/70 dark:text-[#ece7db]/60 sm:w-64" />
          </div>
        </section>

        {/* 承ります */}
        <section className="py-14">
          <SectionHeading id="services" en="Services">
            承ります
          </SectionHeading>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <article key={s.title} className={`rounded-2xl border ${line} ${card} p-6`}>
                <div className={`h-12 w-12 ${indigo}`}>{s.icon}</div>
                <h3 className="mt-4 font-serif text-lg font-semibold tracking-widest">
                  {s.title}
                  <span className={`ml-2 text-xs font-normal tracking-wider ${inkSoft}`}>
                    {s.reading}
                  </span>
                </h3>
                <p className={`mt-2 text-sm leading-6 ${inkSoft}`}>{s.description}</p>
              </article>
            ))}
          </div>
          <p className={`mt-6 text-center text-xs leading-6 ${inkSoft}`}>
            料金は紙のグレードや枚数によって変わります。下見のうえ、無料でお見積りいたします。
          </p>
        </section>

        {/* 当店のこと */}
        <section className="py-14">
          <SectionHeading id="reasons" en="About">
            当店のこと
          </SectionHeading>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {REASONS.map((r, i) => (
              <div key={r.title} className={`rounded-2xl border ${line} ${card} p-6`}>
                <p className={`font-serif text-2xl ${indigo}`} aria-hidden>
                  {["壱", "弐", "参"][i]}
                </p>
                <h3 className="mt-3 font-serif text-base font-semibold tracking-widest">
                  {r.title}
                </h3>
                <p className={`mt-2 text-sm leading-6 ${inkSoft}`}>{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ご依頼の流れ */}
        <section className="py-14">
          <SectionHeading id="flow" en="Flow">
            ご依頼の流れ
          </SectionHeading>
          <ol className="mx-auto mt-10 grid max-w-3xl gap-3">
            {FLOW.map((f) => (
              <li
                key={f.step}
                className={`flex items-start gap-5 rounded-2xl border ${line} ${card} p-5`}
              >
                <span
                  className={`shrink-0 font-serif text-xl tabular-nums ${indigo}`}
                  aria-hidden
                >
                  {f.step}
                </span>
                <div>
                  <h3 className="font-serif text-base font-semibold tracking-widest">
                    {f.title}
                  </h3>
                  <p className={`mt-1 text-sm leading-6 ${inkSoft}`}>{f.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* よくあるご質問 */}
        <section className="py-14">
          <SectionHeading id="faq" en="FAQ">
            よくあるご質問
          </SectionHeading>
          <div className="mx-auto mt-10 max-w-3xl">
            <dl className={`divide-y ${line} rounded-2xl border ${line} ${card}`}>
              {FAQ.map((item) => (
                <div key={item.q} className="p-5">
                  <dt className="flex gap-3 text-sm font-semibold leading-6">
                    <span className={`font-serif ${indigo}`} aria-hidden>
                      問
                    </span>
                    {item.q}
                  </dt>
                  <dd className={`mt-2 flex gap-3 text-sm leading-6 ${inkSoft}`}>
                    <span className={`font-serif ${indigo}`} aria-hidden>
                      答
                    </span>
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* 店舗情報 */}
        <section className="py-14">
          <SectionHeading id="info" en="Information">
            店舗情報
          </SectionHeading>
          <div
            className={`relative mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border ${line} ${card} p-6 sm:p-8`}
          >
            <ShippouPattern
              id="shippou-info"
              className="absolute inset-0 h-full w-full text-[#31517c]/[0.05] dark:text-[#93b2da]/[0.05]"
            />
            <div className="relative">
              <h3 className="text-center font-serif text-xl font-semibold tracking-widest">
                {SHOP.name}
              </h3>
              <div className="mt-6 flex flex-col items-center gap-1 text-center">
                <p className={`text-xs tracking-widest ${inkSoft}`}>
                  お電話でのご相談・お見積り
                </p>
                <a
                  href={`tel:${SHOP.tel.replaceAll("-", "")}`}
                  className={`font-serif text-3xl font-semibold tracking-wider ${indigo}`}
                >
                  {SHOP.tel}
                </a>
                <p className={`text-xs ${inkSoft}`}>
                  受付 {SHOP.hours}(定休日: {SHOP.closed})
                </p>
              </div>
              <dl className="mx-auto mt-8 grid max-w-xl gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
                <dt className={`tracking-widest ${inkSoft}`}>所在地</dt>
                <dd>{SHOP.address}</dd>
                <dt className={`tracking-widest ${inkSoft}`}>営業時間</dt>
                <dd>
                  {SHOP.hours}(定休日: {SHOP.closed})
                </dd>
                <dt className={`tracking-widest ${inkSoft}`}>対応エリア</dt>
                <dd>{SHOP.area}</dd>
              </dl>
              {SHOP.isPlaceholder && (
                <p className={`mt-6 text-center text-xs ${inkSoft}`}>
                  ※ 店舗情報は現在準備中です。正式な住所・電話番号は追って掲載いたします。
                </p>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* フッター */}
      <footer className={`mt-10 border-t ${line}`}>
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs">
          <p className={inkSoft}>© {SHOP.name}</p>
          <Link href="/" className={`${inkSoft} hover:underline`}>
            hyuga.app へ戻る
          </Link>
        </div>
      </footer>
    </div>
  );
}
