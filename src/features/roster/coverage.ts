// ── پوشش یک روز: نیاز در برابر تخصیص (دور ۲۳ — موج ۱ UI) ─────────────────────
// نوار پوشش بالای گرید از همین تابع خالص تغذیه می‌شود: برای روز متمرکز، هر سه
// شیفت را با نیاز ثبت‌شدهٔ سرپرستار (dailyReqs) و شمارش واقعی گرید مقایسه
// می‌کند. نیاز صفر یعنی «عددی ثبت نشده» (unset) — نه کمبود.

import type { DailyReqs } from './rosterModel';

export type CoverageStatus = 'exact' | 'under' | 'over' | 'unset';
export type CoverageShift = 'morning' | 'evening' | 'night';

export interface ShiftCoverage {
  shift: CoverageShift;
  required: number;
  actual: number;
  delta: number;
  status: CoverageStatus;
}

export function coverageForDay(
  dailyReqs: DailyReqs,
  counts: { morning: number[]; evening: number[]; night: number[] },
  dayIndex: number,
): ShiftCoverage[] {
  return (['morning', 'evening', 'night'] as const).map((shift) => {
    const required = dailyReqs[shift][dayIndex] ?? 0;
    const actual = counts[shift][dayIndex] ?? 0;
    const delta = actual - required;
    const status: CoverageStatus =
      required === 0 ? 'unset' : delta === 0 ? 'exact' : delta < 0 ? 'under' : 'over';
    return { shift, required, actual, delta, status };
  });
}
