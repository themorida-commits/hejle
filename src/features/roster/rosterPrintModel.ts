// مدل فرم چاپی «برنامه چینش شیفت» (دور ۷) — وضعیت سلول، جمع روزانه، ضمیمه‌های ماه.
// همهٔ اعداد از همان سرویس‌های موجود می‌آیند (کارکرد/موظفی/مانده)؛ این ماژول فقط
// نمایش را می‌سازد و هیچ محاسبهٔ موازیِ دومی ندارد.
import type { Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import { getDaysInJalaliMonth, jalaliToGregorian, getPersianDayOfWeek } from '../../core/jalali';
import { holidaysFor } from '../../core/defaults';
import { categorizeShift } from '../../core/rules/engine';
import { isoFromJalali, type LeaveRequest } from '../leave/leaveService';

/** برچسب و رنگ سلول برای هر نوع مرخصی — همان راهنمای رنگ فرم کاغذی. */
export const LEAVE_CELL: Record<string, { label: string; bg: string; name: string }> = {
  annual: { label: 'مر', bg: '#fecdd3', name: 'مرخصی استحقاقی' },
  sick: { label: 'اس', bg: '#bbf7d0', name: 'استعلاجی' },
  incentive: { label: 'تش', bg: '#fecdd3', name: 'تشویقی' },
  enroute: { label: 'تر', bg: '#ddd6fe', name: 'تو راهی' },
  mission: { label: 'مأ', bg: '#dbeafe', name: 'مأموریت' },
  maternity: { label: 'زا', bg: '#fde68a', name: 'زایمان' },
  unpaid: { label: 'ب ح', bg: '#e2e8f0', name: 'بدون حقوق' },
  marriage: { label: 'از', bg: '#fde68a', name: 'ازدواج' },
  bereavement: { label: 'ف ب', bg: '#e2e8f0', name: 'فوت بستگان' },
  hajj: { label: 'حج', bg: '#fde68a', name: 'حج' },
};

export const HOLIDAY_BG = '#fef08a'; // زرد تعطیلی در راهنمای فرم

/**
 * رنگ‌های هم‌خانواده با رابط کاربری حجله برای نمایش روی سایت — ساختار و معنا همان
 * راهنمای فرم است، ولی رنگ‌ها از پالت محصول می‌آیند (ملایم، کرم/سبز تیرهٔ حجله)،
 * نه رنگ‌های خام نسخهٔ کاغذی. خروجی چاپ از LEAVE_CELL و HOLIDAY_BG استفاده می‌کند.
 */
export const SCREEN_LEAVE_BG: Record<string, string> = {
  annual: '#fff1f2',
  sick: '#f0fdf4',
  incentive: '#fff1f2',
  enroute: '#eae7fb',
  mission: '#e7edfb',
  maternity: '#fffbeb',
  unpaid: '#f1f5f9',
  marriage: '#fffbeb',
  bereavement: '#f1f5f9',
  hajj: '#fffbeb',
};
export const SCREEN_HOLIDAY_BG = '#fffbeb';

/** حروف روزهای هفته برای هر روز ماه (ش ی د س چ پ ج). */
export function weekdayLetters(jYear: number, jMonth: number): string[] {
  const days = getDaysInJalaliMonth(jYear, jMonth);
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
    out.push(getPersianDayOfWeek(gy, gm, gd));
  }
  return out;
}

/** روزهای تعطیل رسمی ماه (شمارهٔ روز جلالی) — سال‌محور، از همان منبع موتور. */
export function holidayDayNumbers(jYear: number, jMonth: number): Set<number> {
  return new Set(holidaysFor(jYear, jMonth).map(h => h.day));
}

function expandDates(startISO: string, endISO: string): string[] {
  // UTC صریح: ساخت Date محلی + toISOString روز را در منطقه‌های جلوتر از UTC
  // یک روز عقب می‌انداخت (باگ R3 — روی ماشین تهران تک‌روزها گم می‌شدند).
  const out: string[] = [];
  const cur = new Date(startISO + 'T00:00:00Z');
  const end = new Date(endISO + 'T00:00:00Z');
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * وضعیت مرخصی هر سلول: کلید «employeeId|dateISO» → کد نوع مرخصی.
 * فقط مرخصی‌های تأییدشده و غیرساعتی (ساعتی روز را نمی‌بندد — همان قاعدهٔ کارکرد).
 */
export function buildLeaveCellStates(leaves: LeaveRequest[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const l of leaves) {
    if (l.status !== 'approved' || l.isHourly) continue;
    for (const iso of expandDates(l.startISO, l.endISO)) {
      map.set(`${l.employeeId}|${iso}`, l.leaveTypeCode);
    }
  }
  return map;
}

/** نقشهٔ تاریخ‌های مرخصی برای computeWorkRecords — عین منطق صفحهٔ کارکرد. */
export function buildLeaveDatesMap(leaves: LeaveRequest[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const l of leaves) {
    if (l.status !== 'approved' || l.isHourly) continue;
    const set = map.get(l.employeeId) ?? new Set<string>();
    for (const iso of expandDates(l.startISO, l.endISO)) set.add(iso);
    map.set(l.employeeId, set);
  }
  return map;
}

/** جمع واقعی هر دسته در هر روز ماه (ردیف‌های پایین فرم). */
export function dayCountsByCategory(
  entries: ScheduleEntry[],
  shiftTypes: ShiftType[],
  employeeIds: Set<string>,
  jYear: number,
  jMonth: number,
): { morning: number[]; evening: number[]; night: number[] } {
  const days = getDaysInJalaliMonth(jYear, jMonth);
  const out = {
    morning: new Array<number>(days).fill(0),
    evening: new Array<number>(days).fill(0),
    night: new Array<number>(days).fill(0),
  };
  const byId = new Map(shiftTypes.map(s => [s.id, s]));
  const dayOfIso = new Map<string, number>();
  for (let d = 1; d <= days; d++) dayOfIso.set(isoFromJalali(jYear, jMonth, d), d);
  for (const e of entries) {
    if (!employeeIds.has(e.personnelId)) continue;
    const shift = byId.get(e.shiftTypeId);
    if (!shift) continue;
    const cat = categorizeShift(shift);
    if (cat !== 'morning' && cat !== 'evening' && cat !== 'night') continue;
    const d = dayOfIso.get(e.date);
    if (d) out[cat][d - 1]! += 1;
  }
  return out;
}

export interface AnnexRow { name: string; detail: string }
export interface RosterAnnex {
  incentive: AnnexRow[];
  enroute: AnnexRow[];
  sick: AnnexRow[];
  mission: AnnexRow[];
}

/** ضمیمه‌های صفحهٔ دوم فرم: مرخصی‌های تأییدشدهٔ هم‌پوشان با این ماه، بر حسب نوع. */
export function buildAnnex(
  leaves: LeaveRequest[],
  personnel: Personnel[],
  jYear: number,
  jMonth: number,
): RosterAnnex {
  const days = getDaysInJalaliMonth(jYear, jMonth);
  const monthStart = isoFromJalali(jYear, jMonth, 1);
  const monthEnd = isoFromJalali(jYear, jMonth, days);
  const nameOf = (id: string) => personnel.find(p => p.id === id)?.name ?? id;
  const fa = (n: number) => n.toLocaleString('fa-IR');
  const buckets: RosterAnnex = { incentive: [], enroute: [], sick: [], mission: [] };
  const keyOf = (code: string): keyof RosterAnnex | null =>
    code === 'incentive' ? 'incentive' : code === 'enroute' ? 'enroute'
    : code === 'sick' ? 'sick' : code === 'mission' ? 'mission' : null;
  for (const l of leaves) {
    if (l.status !== 'approved') continue;
    const key = keyOf(l.leaveTypeCode);
    if (!key) continue;
    if (l.endISO < monthStart || l.startISO > monthEnd) continue;
    const overlap = expandDates(
      l.startISO < monthStart ? monthStart : l.startISO,
      l.endISO > monthEnd ? monthEnd : l.endISO,
    ).length;
    const detail = `${fa(overlap)} روز${l.reason ? ` — ${l.reason}` : ''}`;
    buckets[key].push({ name: nameOf(l.employeeId), detail });
  }
  return buckets;
}

/** وضعیت استخدامی تک‌حرفی فرم (ک = قراردادی، وظ = وظیفه، ر = رسمی، پ = پیمانی). */
export function employmentShort(status: string): string {
  if (status.includes('قرارداد')) return 'ک';
  if (status.includes('وظیفه')) return 'وظ';
  if (status.includes('رسمی')) return 'ر';
  if (status.includes('پیمانی')) return 'پ';
  return status;
}
