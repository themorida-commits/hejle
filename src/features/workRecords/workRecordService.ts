// ─────────────────────────────────────────────────────────────────────────────
// کارکرد ماهانه (P1-03): از برنامهٔ منتشرشده + مرخصی‌های تأییدشده، کارکرد هر
// نفر با ضرایب قانون بهره‌وری محاسبه می‌شود. خروجی این ماژول «ورودی حقوق» است،
// نه حقوق کامل (مرز DR-002) — CSV برای واحد حقوق/قاصدک صادر می‌شود.
// ─────────────────────────────────────────────────────────────────────────────
import type { GlobalDutySettings, Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import { buildEmployeeFacts } from '../../core/rules/engine';
import { calculateDutyHours } from '../../core/duty';
import { NATIONAL_HOLIDAYS } from '../../core/defaults';
import { getDaysInJalaliMonth } from '../../core/jalali';

export type WorkRecordStatus = 'draft' | 'approved' | 'exported';

export interface WorkRecord {
  employeeId: string;
  employeeName: string;
  personnelCode: string;
  dutyHours: number;
  workedHours: number;
  morningHours: number;
  eveningHours: number;
  nightHours: number;
  holidayHours: number;
  leaveDays: number;
  overtimeHours: number;
  nightPaid: number; // شب × ۱٫۵
  eveningPaid: number; // عصر × ۱٫۲
  totalPaidHours: number; // معادل پرداختی ماه
  status: WorkRecordStatus;
}

export const NIGHT_COEFFICIENT = 1.5;
export const EVENING_COEFFICIENT = 1.2;

export function computeWorkRecords(args: {
  personnel: Personnel[];
  entries: ScheduleEntry[];
  shiftTypes: ShiftType[];
  jYear: number;
  jMonth: number;
  globalSettings: GlobalDutySettings;
  leaveDatesByEmployee?: Map<string, Set<string>>;
}): WorkRecord[] {
  const daysInMonth = getDaysInJalaliMonth(args.jYear, args.jMonth);
  void daysInMonth;
  const holidaysCount = NATIONAL_HOLIDAYS.filter(h => h.month === args.jMonth).length;
  // کسر تعطیلات مثل محصول فعلی: ۶ ساعت به‌ازای هر تعطیل رسمی غیرجمعه (تقریب v1 —
  // محاسبهٔ دقیق جمعه‌بودن تعطیل در لایهٔ facts انجام می‌شود؛ اینجا سقف کسر ماهانه)
  const holidayDeduction = holidaysCount * 6;

  const duty = new Map(args.personnel.map(p => [
    p.id, calculateDutyHours(p, args.globalSettings, holidayDeduction, args.jYear, args.jMonth),
  ]));
  const facts = buildEmployeeFacts({
    personnel: args.personnel, entries: args.entries, shiftTypes: args.shiftTypes,
    jYear: args.jYear, jMonth: args.jMonth, dutyHoursByEmployee: duty,
    leaveDatesByEmployee: args.leaveDatesByEmployee,
  });

  return facts.map(f => {
    let morning = 0, holiday = 0, leaveDays = 0;
    for (const d of f.days) {
      if (d.category === 'morning') morning += d.hours;
      if (d.isHoliday && d.category !== 'off') holiday += d.hours;
      if (d.isLeave) leaveDays += 1;
    }
    const nightPaid = f.nightHours * NIGHT_COEFFICIENT;
    const eveningPaid = f.eveningHours * EVENING_COEFFICIENT;
    const totalPaidHours = f.workedHours - f.nightHours - f.eveningHours + nightPaid + eveningPaid;
    const person = args.personnel.find(p => p.id === f.employeeId)!;
    return {
      employeeId: f.employeeId,
      employeeName: f.employeeName,
      personnelCode: person.personnelCode,
      dutyHours: f.dutyHours,
      workedHours: f.workedHours,
      morningHours: morning,
      eveningHours: f.eveningHours,
      nightHours: f.nightHours,
      holidayHours: holiday,
      leaveDays,
      overtimeHours: f.overtimeHours,
      nightPaid,
      eveningPaid,
      totalPaidHours,
      status: 'draft' as WorkRecordStatus,
    };
  });
}

const HEADERS = [
  'کد پرسنلی', 'نام', 'موظفی (ساعت)', 'کارکرد (ساعت)', 'صبح (ساعت)', 'عصر (ساعت)',
  'شب (ساعت)', 'تعطیل (ساعت)', 'مرخصی (روز)', 'اضافه‌کار (ساعت)',
  'شب با ضریب ۱٫۵', 'عصر با ضریب ۱٫۲', 'جمع پرداختی (ساعت)', 'وضعیت',
];

const STATUS_FA: Record<WorkRecordStatus, string> = { draft: 'پیش‌نویس', approved: 'تأییدشده', exported: 'صادرشده' };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** CSV سازگار با اکسل (BOM + سربرگ فارسی) — ورودی واحد حقوق/قاصدک. */
export function workRecordsToCsv(records: WorkRecord[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [HEADERS.map(esc).join(',')];
  for (const r of records) {
    lines.push([
      r.personnelCode, r.employeeName, round1(r.dutyHours), round1(r.workedHours),
      round1(r.morningHours), round1(r.eveningHours), round1(r.nightHours), round1(r.holidayHours),
      r.leaveDays, round1(r.overtimeHours), round1(r.nightPaid), round1(r.eveningPaid),
      round1(r.totalPaidHours), STATUS_FA[r.status],
    ].map(esc).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
}
