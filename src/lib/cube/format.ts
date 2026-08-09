export function formatTime(ms: number, locale = "en-US"): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const cs = Math.floor((ms % 1000) / 10);
  const pad = (n: number, l = 2) => n.toString().padStart(l, "0");
  // locale kept for API symmetry; fixed digit clock is locale-neutral
  void locale;
  return m > 0 ? `${m}:${pad(s)}.${pad(cs)}` : `${pad(s)}.${pad(cs)}`;
}

export function bestRecord<T extends { timeMs: number }>(
  records: T[],
): T | null {
  if (records.length === 0) return null;
  return records.reduce((a, b) => (a.timeMs <= b.timeMs ? a : b));
}
