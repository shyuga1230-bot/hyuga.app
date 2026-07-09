export type Dream = {
  label: string;
  age: number;
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

let cache: Profile | null | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function read(): Profile | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    if (typeof p.birth !== "string" || typeof p.lifeYears !== "number") return null;
    return { ...p, dreams: Array.isArray(p.dreams) ? p.dreams : [] };
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
