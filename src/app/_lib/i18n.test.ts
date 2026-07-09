import { describe, expect, it } from "vitest";
import { STR, tr, type StrKey } from "./i18n";

describe("STR 辞書", () => {
  it("全キーに ja / en 両方の文字列がある(空でない)", () => {
    for (const [key, entry] of Object.entries(STR)) {
      expect(entry.ja.length, `${key}.ja`).toBeGreaterThan(0);
      expect(entry.en.length, `${key}.en`).toBeGreaterThan(0);
    }
  });

  it("ja に埋め込み変数 {x} があれば en にも同じ変数がある", () => {
    const varsOf = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, entry] of Object.entries(STR)) {
      expect(varsOf(entry.en), key).toEqual(varsOf(entry.ja));
    }
  });
});

describe("tr", () => {
  it("言語ごとの文字列を返す", () => {
    expect(tr("ja", "obNext")).toBe("つぎへ");
    expect(tr("en", "obNext")).toBe("next");
  });

  it("{var} を補間する", () => {
    const key = Object.keys(STR).find((k) =>
      STR[k as StrKey].ja.includes("{days}"),
    ) as StrKey;
    expect(key).toBeDefined();
    expect(tr("ja", key, { days: 1234 })).toContain("1234");
    expect(tr("ja", key, { days: 1234 })).not.toContain("{days}");
  });
});
