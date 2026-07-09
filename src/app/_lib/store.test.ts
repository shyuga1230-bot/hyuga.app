import { beforeEach, describe, expect, it, vi } from "vitest";

/* window.localStorage の最小スタブ(ブラウザ専用ストアを Node で試験する) */
function stubStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  vi.stubGlobal("window", { localStorage: storage });
  return map;
}

async function freshStore() {
  vi.resetModules();
  return import("./store");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubStorage();
});

describe("saveProfile / getProfileSnapshot", () => {
  it("保存した内容がそのまま読める", async () => {
    const s = await freshStore();
    const p = {
      birth: "1990-06-15",
      lifeYears: 80,
      dreams: [{ label: "本を書く", age: 40 }],
      createdAt: "2020-01-01T00:00:00.000Z",
    };
    s.saveProfile(p);
    expect(s.getProfileSnapshot()).toEqual(p);
  });

  it("clearProfile で null に戻る", async () => {
    const s = await freshStore();
    s.saveProfile({ birth: "1990-06-15", lifeYears: 80, dreams: [], createdAt: "x" });
    s.clearProfile();
    expect(s.getProfileSnapshot()).toBeNull();
  });
});

describe("exportProfile / importProfile", () => {
  it("書き出したバックアップを読み戻せる(ラウンドトリップ)", async () => {
    const s = await freshStore();
    s.saveProfile({
      birth: "1990-06-15",
      lifeYears: 80,
      dreams: [{ label: "山に登る", age: 45, done: true }],
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const json = s.exportProfile();

    const s2 = await freshStore();
    const p = s2.importProfile(json);
    expect(p?.birth).toBe("1990-06-15");
    expect(p?.dreams).toEqual([{ label: "山に登る", age: 45, done: true }]);
  });

  it("壊れたJSONは null(保存もされない)", async () => {
    const s = await freshStore();
    expect(s.importProfile("{ not json")).toBeNull();
    expect(s.getProfileSnapshot()).toBeNull();
  });

  it("birth の形式が不正なら拒否する", async () => {
    const s = await freshStore();
    const bad = JSON.stringify({ profile: { birth: "asdf", lifeYears: 80, dreams: [] } });
    expect(s.importProfile(bad)).toBeNull();
  });

  it("lifeYears が数値でなければ拒否する", async () => {
    const s = await freshStore();
    const bad = JSON.stringify({ profile: { birth: "1990-06-15", lifeYears: "80", dreams: [] } });
    expect(s.importProfile(bad)).toBeNull();
  });

  it("不正な夢エントリは黙って除外される", async () => {
    const s = await freshStore();
    const mixed = JSON.stringify({
      profile: {
        birth: "1990-06-15",
        lifeYears: 80,
        dreams: [{ label: "有効", age: 40 }, { label: 42 }, "文字列", null],
      },
    });
    const p = s.importProfile(mixed);
    expect(p?.dreams).toEqual([{ label: "有効", age: 40, done: false }]);
  });

  it("profile ラッパー無しの生オブジェクトも受け付ける", async () => {
    const s = await freshStore();
    const raw = JSON.stringify({ birth: "1990-06-15", lifeYears: 80, dreams: [] });
    expect(s.importProfile(raw)?.lifeYears).toBe(80);
  });
});

describe("readVisit / writeVisit", () => {
  it("訪問記録のラウンドトリップ", async () => {
    const s = await freshStore();
    expect(s.readVisit()).toBeNull();
    s.writeVisit({ day: "2026-07-09", week: "2026-W28" });
    expect(s.readVisit()).toEqual({ day: "2026-07-09", week: "2026-W28" });
  });
});
