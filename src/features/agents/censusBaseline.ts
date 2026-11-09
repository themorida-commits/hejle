// ─────────────────────────────────────────────────────────────────────────────
// پیش‌بینی خط مبنای census بخش — فاز ۲ لایهٔ ایجنت (Zone A، دور ۱۸، DR-003).
// این یک مدل کلاسیک آماری است، نه خروجی LLM: سری روزانهٔ تخت‌های اشغال‌شده از
// روی پذیرش/ترخیص ساخته می‌شود و پیش‌بینی «میانگین» است — با حداقل ۱۴ روز
// سابقه، میانگین همان روزِ هفته؛ وگرنه میانگین کل. بازه فقط «تقریبی» است
// (میانگین ± ۱٫۲۸ انحراف معیار سری ≈ بازهٔ ۸۰٪) و هرجا داده کم باشد صادقانه
// «ناکافی» برمی‌گردد، نه عدد ساخته‌شده. ورودی برنامه‌ریزی نیاز بخش است، نه
// تصمیم؛ عدد نهایی نیاز را سرپرستار در ردیف نیاز روزانه می‌گذارد.
// ─────────────────────────────────────────────────────────────────────────────

export interface CensusAdmissionLike {
  admittedAtISO: string;
  dischargedAtISO?: string;
}

export interface CensusDayPoint { dateISO: string; count: number }
export interface CensusForecastDay { dateISO: string; mean: number; low: number; high: number }

export type CensusForecast =
  | { insufficient: true; sampleDays: number }
  | {
      insufficient: false;
      sampleDays: number;
      series: CensusDayPoint[];
      forecast: CensusForecastDay[];
      /** انحراف معیار سری — مبنای بازهٔ تقریبی. */
      sd: number;
    };

const DAY_MS = 86400000;
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * سری census و خط مبنا. روزهای کاملِ سابقه = از نخستین روز پذیرش تا دیروز
 * (امروز هنوز کامل نیست و وارد میانگین نمی‌شود). بیمار در روز ترخیص شمرده
 * نمی‌شود (تخت از آن روز آزاد است)؛ ترخیص‌نداشته‌ها تا امروز بستری‌اند.
 */
export function forecastCensus(
  admissions: CensusAdmissionLike[],
  days = 7,
  todayISO: string,
): CensusForecast {
  const today = Date.parse(todayISO + 'T00:00:00Z');
  const yesterday = today - DAY_MS;

  // بازهٔ حضور هر پذیرش: [روز پذیرش، روز ترخیص) — بدون ترخیص یعنی تا امروز.
  const spans = admissions
    .map(a => ({
      from: Date.parse(a.admittedAtISO.slice(0, 10) + 'T00:00:00Z'),
      to: a.dischargedAtISO ? Date.parse(a.dischargedAtISO.slice(0, 10) + 'T00:00:00Z') : today,
    }))
    .filter(s => Number.isFinite(s.from));
  if (spans.length === 0) return { insufficient: true, sampleDays: 0 };

  const firstDay = Math.min(...spans.map(s => s.from));
  const sampleDays = Math.max(0, Math.round((yesterday - firstDay) / DAY_MS) + 1);
  if (sampleDays < 7) return { insufficient: true, sampleDays };

  const series: CensusDayPoint[] = [];
  for (let t = firstDay; t <= yesterday; t += DAY_MS) {
    const count = spans.filter(s => s.from <= t && t < s.to).length;
    series.push({ dateISO: isoOf(t), count });
  }

  const counts = series.map(p => p.count);
  const overallMean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((a, b) => a + (b - overallMean) ** 2, 0) / counts.length;
  const sd = Math.sqrt(variance);

  // میانگین ۱۴ روز اخیر — کفِ پیش‌بینی وقتی برای یک روز هفته نمونه نیست.
  const trailing = counts.slice(-14);
  const trailingMean = trailing.reduce((a, b) => a + b, 0) / trailing.length;
  const useWeekday = counts.length >= 14;
  const weekdayMeans = new Map<number, number>();
  if (useWeekday) {
    for (let dow = 0; dow < 7; dow++) {
      const same = series.filter(p => new Date(p.dateISO + 'T00:00:00Z').getUTCDay() === dow);
      if (same.length >= 2) {
        weekdayMeans.set(dow, same.reduce((a, p) => a + p.count, 0) / same.length);
      }
    }
  }

  const forecast: CensusForecastDay[] = [];
  for (let i = 0; i < days; i++) {
    const t = today + i * DAY_MS;
    const dow = new Date(t).getUTCDay();
    const mean = (useWeekday ? weekdayMeans.get(dow) : undefined) ?? (useWeekday ? trailingMean : overallMean);
    forecast.push({
      dateISO: isoOf(t),
      mean,
      low: Math.max(0, mean - 1.28 * sd),
      high: mean + 1.28 * sd,
    });
  }

  return { insufficient: false, sampleDays, series, forecast, sd };
}
