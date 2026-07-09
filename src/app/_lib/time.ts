import type { Dream, Profile } from "./store";

export const DAY_MS = 86_400_000;

function atBirth(p: Profile): Date {
  return new Date(p.birth + "T00:00:00");
}

export function birthMs(p: Profile): number {
  return atBirth(p).getTime();
}

export function deathMs(p: Profile): number {
  const d = atBirth(p);
  d.setFullYear(d.getFullYear() + p.lifeYears);
  return d.getTime();
}

/** 残りの割合 0..1 */
export function remainFrac(p: Profile, now = Date.now()): number {
  const b = birthMs(p);
  const d = deathMs(p);
  return Math.min(1, Math.max(0, (d - now) / (d - b)));
}

/** "65.7814063" のような残り%文字列 */
export function remainPct(p: Profile, digits = 7, now = Date.now()): string {
  return (remainFrac(p, now) * 100).toFixed(digits);
}

export function remainDays(p: Profile, now = Date.now()): number {
  return Math.max(0, Math.floor((deathMs(p) - now) / DAY_MS));
}

export function ageYears(p: Profile, now = Date.now()): number {
  return Math.floor((now - birthMs(p)) / (365.2425 * DAY_MS));
}

export function dreamMs(p: Profile, dream: Dream): number {
  const d = atBirth(p);
  d.setFullYear(d.getFullYear() + dream.age);
  return d.getTime();
}

export function dreamRemainDays(p: Profile, dream: Dream, now = Date.now()): number {
  return Math.max(0, Math.ceil((dreamMs(p, dream) - now) / DAY_MS));
}

/** 夢に到達する瞬間の「残りの割合」。砂面がこの高さまで沈んだ日が、その年齢 */
export function dreamFrac(p: Profile, dream: Dream): number {
  const b = birthMs(p);
  const d = deathMs(p);
  return (d - dreamMs(p, dream)) / (d - b);
}

export function nf(n: number): string {
  return n.toLocaleString("ja-JP");
}
