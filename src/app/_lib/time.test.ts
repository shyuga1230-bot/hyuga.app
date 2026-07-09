import { describe, expect, it } from "vitest";
import type { Profile } from "./store";
import {
  DAY_MS,
  ageYears,
  birthMs,
  deathMs,
  dreamFrac,
  dreamMs,
  dreamRemainDays,
  nf,
  remainDays,
  remainFrac,
  remainPct,
} from "./time";

function profile(birth: string, lifeYears: number): Profile {
  return { birth, lifeYears, dreams: [], createdAt: "2020-01-01T00:00:00.000Z" };
}

describe("remainFrac", () => {
  const p = profile("1990-06-15", 80);

  it("誕生の瞬間は 1", () => {
    expect(remainFrac(p, birthMs(p))).toBe(1);
  });

  it("終わりの瞬間は 0", () => {
    expect(remainFrac(p, deathMs(p))).toBe(0);
  });

  it("ちょうど中間で 0.5 付近", () => {
    const mid = (birthMs(p) + deathMs(p)) / 2;
    expect(remainFrac(p, mid)).toBeCloseTo(0.5, 10);
  });

  it("範囲外は 0..1 にクランプされる", () => {
    expect(remainFrac(p, birthMs(p) - DAY_MS)).toBe(1);
    expect(remainFrac(p, deathMs(p) + DAY_MS)).toBe(0);
  });

  it("時間が進むと単調に減る", () => {
    const t0 = birthMs(p) + 1000 * DAY_MS;
    expect(remainFrac(p, t0 + DAY_MS)).toBeLessThan(remainFrac(p, t0));
  });
});

describe("remainPct", () => {
  it("指定桁数の文字列を返す", () => {
    const p = profile("1990-06-15", 80);
    const mid = (birthMs(p) + deathMs(p)) / 2;
    expect(remainPct(p, 7, mid)).toBe("50.0000000");
    expect(remainPct(p, 2, deathMs(p))).toBe("0.00");
  });
});

describe("remainDays", () => {
  const p = profile("1990-06-15", 80);

  it("終わりの日に 0、それ以降も 0(負にならない)", () => {
    expect(remainDays(p, deathMs(p))).toBe(0);
    expect(remainDays(p, deathMs(p) + 10 * DAY_MS)).toBe(0);
  });

  it("ちょうど1日前は 1", () => {
    expect(remainDays(p, deathMs(p) - DAY_MS)).toBe(1);
  });

  it("1日未満の端数は切り捨て", () => {
    expect(remainDays(p, deathMs(p) - DAY_MS + 1)).toBe(0);
  });
});

describe("deathMs / うるう年", () => {
  it("2月29日生まれでも終わりの日が算出できる(3月1日に繰り上がる)", () => {
    const p = profile("2000-02-29", 80);
    const d = new Date(deathMs(p));
    // 2080年はうるう年なので 2/29 のまま
    expect(d.getFullYear()).toBe(2080);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });

  it("2月29日生まれ+うるう年でない年は 3月1日", () => {
    const p = profile("2000-02-29", 81); // 2081年は平年
    const d = new Date(deathMs(p));
    expect(d.getFullYear()).toBe(2081);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(1);
  });

  it("うるう年をまたいでも誕生日どうしの差はちょうど N 年", () => {
    const p = profile("1990-06-15", 80);
    const d = new Date(deathMs(p));
    expect(d.getFullYear()).toBe(2070);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });
});

describe("ageYears / 誕生日またぎ", () => {
  const p = profile("1990-06-15", 80);

  it("30回目の誕生日当日は 30", () => {
    const t = new Date("2020-06-15T00:00:00").getTime();
    expect(ageYears(p, t)).toBe(30);
  });

  it("誕生日の前日は 29", () => {
    const t = new Date("2020-06-14T00:00:00").getTime();
    expect(ageYears(p, t)).toBe(29);
  });
});

describe("dream 系", () => {
  const p = profile("1990-06-15", 80);
  const dream = { label: "本を書く", age: 40 };

  it("dreamMs は 40歳の誕生日ちょうど", () => {
    const d = new Date(dreamMs(p, dream));
    expect(d.getFullYear()).toBe(2030);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  it("dreamFrac は残り半分の高さ(40/80 = 0.5 付近)", () => {
    expect(dreamFrac(p, dream)).toBeCloseTo(0.5, 2);
  });

  it("dreamRemainDays は過ぎた夢で 0", () => {
    expect(dreamRemainDays(p, dream, dreamMs(p, dream) + DAY_MS)).toBe(0);
  });

  it("dreamRemainDays は端数を切り上げ", () => {
    expect(dreamRemainDays(p, dream, dreamMs(p, dream) - 1)).toBe(1);
  });
});

describe("nf", () => {
  it("桁区切りで整形する", () => {
    expect(nf(1234567)).toBe("1,234,567");
    expect(nf(0)).toBe("0");
  });
});
