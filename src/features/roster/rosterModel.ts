// مدل برنامهٔ شیفت (P1-01) — گرید ماه، ویرایش دستی، وضعیت انتشار.
// چک‌لیست برابری با نسخهٔ فعلی در PARITY_CHECKLIST آمده و در تست‌ها نگه داشته می‌شود.
import type { Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import { getDaysInJalaliMonth, jalaliToGregorian } from '../../core/jalali';
import { isoFromJalali } from '../leave/leaveService';

export type ScheduleStatus = 'draft' | 'published';

export interface RosterCell {
  dateISO: string;
  jDay: number;
  isFriday: boolean;
  entry: ScheduleEntry | null;
}

export function buildMonthGrid(args: {
  personnel: Personnel[];
  entries: ScheduleEntry[];
  jYear: number;
  jMonth: number;
}): Map<string, RosterCell[]> {
  const days = getDaysInJalaliMonth(args.jYear, args.jMonth);
  const byKey = new Map(args.entries.map(e => [`${e.personnelId}|${e.date}`, e]));
  const grid = new Map<string, RosterCell[]>();
  for (const p of args.personnel) {
    const row: RosterCell[] = [];
    for (let d = 1; d <= days; d++) {
      const dateISO = isoFromJalali(args.jYear, args.jMonth, d);
      const [gy, gm, gd] = jalaliToGregorian(args.jYear, args.jMonth, d);
      row.push({
        dateISO,
        jDay: d,
        isFriday: new Date(gy, gm - 1, gd).getDay() === 5,
        entry: byKey.get(`${p.id}|${dateISO}`) ?? null,
      });
    }
    grid.set(p.id, row);
  }
  return grid;
}

/** ویرایش دستی یک سلول — فقط در وضعیت پیش‌نویس (نگهبان در لایهٔ صفحه/استور هم هست). */
export function applyManualEdit(
  entries: ScheduleEntry[],
  personnelId: string,
  dateISO: string,
  shiftTypeId: string,
): ScheduleEntry[] {
  const found = entries.some(e => e.personnelId === personnelId && e.date === dateISO);
  if (!found) {
    return [...entries, { personnelId, shiftTypeId, date: dateISO, isManualEntry: true }];
  }
  return entries.map(e =>
    e.personnelId === personnelId && e.date === dateISO
      ? { ...e, shiftTypeId, isManualEntry: true }
      : e,
  );
}

export function shiftSymbol(shiftTypes: ShiftType[], id: string | undefined): string {
  if (!id) return '·';
  return shiftTypes.find(s => s.id === id)?.symbol ?? '?';
}

// چک‌لیست برابری با قابلیت‌های صفحهٔ برنامهٔ نسخهٔ فعلی (از ممیزی ۲ نوامبر) —
// هر آیتم یا در v2 هست یا صریحاً به فاز بعد افتاده.
export const PARITY_CHECKLIST = [
  { feature: 'تولید خودکار برنامه با حل‌کننده', v2: 'هست (ورکر + همان خروجی طلایی)' },
  { feature: 'ویرایش دستی سلول و قفل دستی', v2: 'هست (applyManualEdit + isManualEntry)' },
  { feature: 'آشکارسازی تعارض لحظه‌ای', v2: 'هست (conflictDetector + موتور قواعد)' },
  { feature: 'درخواست مرخصی و شیفت ترجیحی در تولید', v2: 'هست (همان ورودی حل‌کننده)' },
  { feature: 'نیاز روزانهٔ سفارشی بخش', v2: 'هست (dailyReqs حل‌کننده)' },
  { feature: 'بایگانی ماه‌های گذشته', v2: 'فاز ۱٫۵ — جدول schedules وضعیت و ماه را نگه می‌دارد؛ صفحهٔ بایگانی جدا می‌آید' },
  { feature: 'چت دستیار AI', v2: 'هست از مسیر پروکسی (P0-07)؛ صفحه‌اش فاز ۲' },
  { feature: 'تقویم و یادآور رویدادها', v2: 'خارج از اسکوپ ERP — حذف آگاهانه' },
] as const;
