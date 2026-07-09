export type Dream = {
  label: string;
  age: number;
  /** 達成した目標。リングは白く変わり、静かに残る */
  done?: boolean;
};

export type Profile = {
  /** ISO date string, e.g. "1999-02-20" */
  birth: string;
  /** self-chosen end, in years of age */
  lifeYears: number;
  dreams: Dream[];
  createdAt: string;
};

const KEY = "muhaku.profile.v1";
const VISIT_KEY = "muhaku.visit.v1";

let cache: Profile | null | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function isDream(d: unknown): d is Dream {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  return typeof o.label === "string" && typeof o.age === "number";
}

function normalize(raw: unknown): Profile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.birth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.birth)) return null;
  if (typeof p.lifeYears !== "number" || !Number.isFinite(p.lifeYears)) return null;
  const dreams = Array.isArray(p.dreams) ? p.dreams.filter(isDream) : [];
  return {
    birth: p.birth,
    lifeYears: p.lifeYears,
    dreams: dreams.map((d) => ({ label: d.label, age: d.age, done: !!d.done })),
    createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
  };
}

function read(): Profile | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function subscribeProfile(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getProfileSnapshot(): Profile | null {
  if (cache === undefined) cache = read();
  return cache;
}

export function getServerProfileSnapshot(): Profile | null {
  return null;
}

export function saveProfile(p: Profile): void {
  cache = p;
  window.localStorage.setItem(KEY, JSON.stringify(p));
  emit();
}

export function clearProfile(): void {
  cache = null;
  window.localStorage.removeItem(KEY);
  emit();
}

/* ---------- バックアップ ---------- */

export function exportProfile(): string {
  return JSON.stringify(
    { app: "muhaku", version: 1, profile: getProfileSnapshot() },
    null,
    2,
  );
}

export function importProfile(json: string): Profile | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const p = normalize(raw.profile ?? raw);
    if (!p) return null;
    saveProfile(p);
    return p;
  } catch {
    return null;
  }
}

/* ---------- 訪問記録(今日の一粒・週次サマリー用) ---------- */

export type VisitState = { day: string; week: string };

export function readVisit(): VisitState | null {
  try {
    const raw = window.localStorage.getItem(VISIT_KEY);
    return raw ? (JSON.parse(raw) as VisitState) : null;
  } catch {
    return null;
  }
}

export function writeVisit(v: VisitState): void {
  window.localStorage.setItem(VISIT_KEY, JSON.stringify(v));
}
