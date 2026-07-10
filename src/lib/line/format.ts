/** 表示用フォーマッタ(UIと診断コメントで共用) */

export function fmtDuration(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return `${Math.round(ms / 1000)}秒`;
  if (min < 60) return `${Math.round(min)}分`;
  const h = min / 60;
  if (h < 48) return `${Math.round(h * 10) / 10}時間`;
  return `${Math.round(h / 24)}日`;
}

export function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
