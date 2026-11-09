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

/**
 * چرخهٔ ویرایش دستی سلول. برای سرپرستار، طبق قانون ثابت جدول، فقط «صبح» و
 * «آف» در چرخه می‌ماند و امکان چرخش به عصر/شب از خود رابط گرفته می‌شود.
 */
export function nextManualShiftId(role: string, currentId: string | undefined): string {
  const order = role.includes('سرپرستار')
    ? ['s-m', 's-off']
    : ['s-m', 's-e', 's-n', 's-off'];
  return order[(order.indexOf(currentId ?? 's-off') + 1) % order.length]!;
}

/** نیاز روزانهٔ بخش به تفکیک روز ماه — همان سه ردیف بالای جدول برنامه و فرم چاپی. */
export interface DailyReqs {
  morning: number[];
  evening: number[];
  night: number[];
}

export type DailyReqShift = keyof DailyReqs;

/** مقدار سالم یک خانهٔ نیاز: عدد صحیح بین ۰ تا ۹۹؛ هر چیز دیگری صفر می‌شود. */
export const clampReqValue = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(99, Math.max(0, Math.floor(n)));
};

/** ساخت آرایه‌های ماه از روی سه‌تایی پیش‌فرض تنظیمات بیمارستان (مقدار ثابت همهٔ روزها). */
export function buildDailyReqs(
  triple: { morning: number; evening: number; night: number },
  days: number,
): DailyReqs {
  const fill = (v: number) => Array.from({ length: days }, () => clampReqValue(v));
  return { morning: fill(triple.morning), evening: fill(triple.evening), night: fill(triple.night) };
}

/**
 * نرمال‌سازی نیازهای ذخیره‌شده (jsonb روی رکورد برنامه): آرایهٔ ذخیره‌شده برای
 * هر شیفت بر سه‌تایی پیش‌فرض مقدم است؛ خانهٔ گمشده/خراب از پیش‌فرض همان شیفت
 * پر می‌شود و طول دقیقاً به روزهای ماه بریده/کشیده می‌شود.
 */
export function normalizeDailyReqs(
  raw: Partial<Record<DailyReqShift, unknown>> | null | undefined,
  days: number,
  triple: { morning: number; evening: number; night: number },
): DailyReqs {
  const base = buildDailyReqs(triple, days);
  if (!raw) return base;
  const out = { ...base };
  (Object.keys(base) as DailyReqShift[]).forEach(k => {
    const arr = raw[k];
    if (!Array.isArray(arr)) return;
    out[k] = Array.from({ length: days }, (_, i) => (i < arr.length ? clampReqValue(arr[i]) : base[k][i]!));
  });
  return out;
}

/** آیا سرپرستار عددی وارد کرده است؟ (صفرها یعنی «تصمیم با منطق پیش‌فرض حل‌کننده».) */
export const hasAnyDailyReq = (r: DailyReqs): boolean =>
  r.morning.some(v => v > 0) || r.evening.some(v => v > 0) || r.night.some(v => v > 0);

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
  { feature: 'چت دستیار AI', v2: 'هست — صفحهٔ دستیار توضیح‌دهنده از مسیر پروکسی (P0-07)' },
  { feature: 'تقویم و یادآور رویدادها', v2: 'خارج از اسکوپ ERP — حذف آگاهانه' },
] as const;
