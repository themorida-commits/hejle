// ── جست‌وجوی پالت فرمان (دور ۲۴ — موج ۲ UI) ─────────────────────────────────
// تطبیق فارسیِ ساده و قابل‌تست: نرمال‌سازی (ي/ك عربی، نیم‌فاصله، فاصله‌های
// تکراری) + امتیازدهی شفاف (دقیق > شروع‌شونده > شامل > زیررشتهٔ پراکنده).

export function normalizeFa(text: string): string {
  return text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** امتیاز تطبیق؛ ‎-1‎ یعنی بی‌ربط. هرچه بالاتر، مرتبط‌تر. */
export function scoreMatch(query: string, text: string): number {
  const q = normalizeFa(query);
  const t = normalizeFa(text);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  // همهٔ واژه‌های کوئری جایی در متن باشند (به هر ترتیب)
  const words = q.split(' ');
  if (words.length > 1 && words.every(w => t.includes(w))) return 50;
  // زیررشتهٔ پراکنده (subsequence) — برای تایپ ناقص
  let i = 0;
  for (const ch of t) { if (ch === q[i]) i++; if (i >= q.length) break; }
  if (i >= q.length) return 30;
  return -1;
}

export interface Rankable { title: string; hint?: string }

export function rankEntries<T extends Rankable>(query: string, entries: T[]): T[] {
  if (!normalizeFa(query)) return entries;
  return entries
    .map(e => ({ e, s: Math.max(scoreMatch(query, e.title), e.hint ? scoreMatch(query, e.hint) - 5 : -1) }))
    .filter(x => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.e);
}
