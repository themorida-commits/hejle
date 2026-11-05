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
import type { AttendanceSummary } from '../attendance/attendanceService';

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
  /** مرخصی ساعتیِ تأییدشدهٔ کسرشده از کارکرد این ماه (ساعت) — نسخهٔ ۱٫۱. */
  hourlyLeaveHours?: number;
  overtimeHours: number;
  nightPaid: number; // شب × ۱٫۵
  eveningPaid: number; // عصر × ۱٫۲
  totalPaidHours: number; // معادل پرداختی ماه
  status: WorkRecordStatus;
  // حضور واقعی (اختیاری — وقتی رویدادهای حضور و غیاب وصل‌اند پر می‌شود)
  actualWorkedHours?: number;
  actualOvertimeHours?: number;
  absentDays?: number;
  lateMinutes?: number;
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
  /** مرخصی‌های ساعتی تأییدشدهٔ همین ماه: از کارکرد همان روز (با ضریب همان شیفت) کسر می‌شود. */
  hourlyLeaves?: { employeeId: string; dateISO: string; hours: number }[];
  attendanceSummaries?: AttendanceSummary[];
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
    let totalPaidHours = f.workedHours - f.nightHours - f.eveningHours + nightPaid + eveningPaid;
    // کسر مرخصی ساعتی: سقفش ساعت همان روز است و با ضریب دستهٔ همان شیفت از پرداختی کم می‌شود
    let workedHours = f.workedHours;
    let hourlyLeaveHours = 0;
    for (const hl of args.hourlyLeaves ?? []) {
      if (hl.employeeId !== f.employeeId) continue;
      const day = f.days.find(d => d.dateISO === hl.dateISO);
      if (!day || day.hours <= 0) continue;
      const ded = Math.min(hl.hours, day.hours);
      const coef = day.category === 'night' ? NIGHT_COEFFICIENT : day.category === 'evening' ? EVENING_COEFFICIENT : 1;
      workedHours -= ded;
      totalPaidHours -= ded * coef;
      hourlyLeaveHours += ded;
    }
    const person = args.personnel.find(p => p.id === f.employeeId)!;
    const att = args.attendanceSummaries?.find(a => a.employeeId === f.employeeId);
    return {
      employeeId: f.employeeId,
      employeeName: f.employeeName,
      personnelCode: person.personnelCode,
      dutyHours: f.dutyHours,
      workedHours,
      morningHours: morning,
      eveningHours: f.eveningHours,
      nightHours: f.nightHours,
      holidayHours: holiday,
      leaveDays,
      hourlyLeaveHours,
      overtimeHours: f.overtimeHours,
      nightPaid,
      eveningPaid,
      totalPaidHours,
      status: 'draft' as WorkRecordStatus,
      ...(att ? {
        actualWorkedHours: Math.round(att.totalWorkedMinutes / 6) / 10,
        actualOvertimeHours: Math.round(att.totalOvertimeMinutes / 6) / 10,
        absentDays: att.absentDays,
        lateMinutes: att.totalLateMinutes,
      } : {}),
    };
  });
}

/** گزارش تجمیعی بخش (خروجی P1-03 اسپک): جمع‌ها، توزیع شب‌کاری و معادل پرداختی ماه. */
export interface WardWorkSummary {
  headcount: number;
  totalDutyHours: number;
  totalWorkedHours: number;
  totalPaidHours: number;
  totalOvertimeHours: number;
  totalNightHours: number;
  totalEveningHours: number;
  totalMorningHours: number;
  totalHolidayHours: number;
  totalLeaveDays: number;
  totalHourlyLeaveHours: number;
  nightSharePct: number;
  avgOvertimePerPerson: number;
  topNight: { employeeName: string; nightHours: number }[];
}

export function summarizeWardWork(records: WorkRecord[]): WardWorkSummary {
  const sum = (f: (r: WorkRecord) => number) => records.reduce((a, r) => a + f(r), 0);
  const totalWorkedHours = sum(r => r.workedHours);
  const totalNightHours = sum(r => r.nightHours);
  const totalOvertimeHours = sum(r => r.overtimeHours);
  return {
    headcount: records.length,
    totalDutyHours: sum(r => r.dutyHours),
    totalWorkedHours,
    totalPaidHours: sum(r => r.totalPaidHours),
    totalOvertimeHours,
    totalNightHours,
    totalEveningHours: sum(r => r.eveningHours),
    totalMorningHours: sum(r => r.morningHours),
    totalHolidayHours: sum(r => r.holidayHours),
    totalLeaveDays: sum(r => r.leaveDays),
    totalHourlyLeaveHours: sum(r => r.hourlyLeaveHours ?? 0),
    nightSharePct: totalWorkedHours > 0 ? (totalNightHours / totalWorkedHours) * 100 : 0,
    avgOvertimePerPerson: records.length > 0 ? totalOvertimeHours / records.length : 0,
    topNight: [...records]
      .sort((a, b) => b.nightHours - a.nightHours)
      .slice(0, 3)
      .map(r => ({ employeeName: r.employeeName, nightHours: r.nightHours })),
  };
}

export function wardSummaryToCsv(s: WardWorkSummary, wardName: string): string {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const rows: [string, number | string][] = [
    ['بخش', wardName],
    ['تعداد پرسنل', s.headcount],
    ['مجموع موظفی (ساعت)', r1(s.totalDutyHours)],
    ['مجموع کارکرد (ساعت)', r1(s.totalWorkedHours)],
    ['مجموع معادل پرداختی (ساعت)', r1(s.totalPaidHours)],
    ['مجموع اضافه‌کار (ساعت)', r1(s.totalOvertimeHours)],
    ['میانگین اضافه‌کار هر نفر (ساعت)', r1(s.avgOvertimePerPerson)],
    ['مجموع صبح (ساعت)', r1(s.totalMorningHours)],
    ['مجموع عصر (ساعت)', r1(s.totalEveningHours)],
    ['مجموع شب (ساعت)', r1(s.totalNightHours)],
    ['سهم شب از کارکرد (٪)', r1(s.nightSharePct)],
    ['مجموع تعطیل (ساعت)', r1(s.totalHolidayHours)],
    ['مجموع مرخصی (روز)', r1(s.totalLeaveDays)],
    ['مجموع مرخصی ساعتی (ساعت)', r1(s.totalHourlyLeaveHours)],
    ...s.topNight.map((t, i) => [`بیشترین شب‌کاری ${i + 1}`, `${t.employeeName}: ${r1(t.nightHours)} ساعت`] as [string, string]),
  ];
  return '\uFEFF' + rows.map(([k, v]) => `${k},${v}`).join('\n');
}

const HEADERS = [
  'کد پرسنلی', 'نام', 'موظفی (ساعت)', 'کارکرد (ساعت)', 'صبح (ساعت)', 'عصر (ساعت)',
  'شب (ساعت)', 'تعطیل (ساعت)', 'مرخصی (روز)', 'مرخصی ساعتی (ساعت)', 'اضافه‌کار (ساعت)',
  'شب با ضریب ۱٫۵', 'عصر با ضریب ۱٫۲', 'جمع پرداختی (ساعت)', 'وضعیت',
  'کارکرد واقعی (ساعت)', 'اضافه‌کار واقعی (ساعت)', 'غیبت (روز)', 'تأخیر (دقیقه)',
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
      r.leaveDays, round1(r.hourlyLeaveHours ?? 0), round1(r.overtimeHours), round1(r.nightPaid), round1(r.eveningPaid),
      round1(r.totalPaidHours), STATUS_FA[r.status],
      r.actualWorkedHours != null ? round1(r.actualWorkedHours) : '',
      r.actualOvertimeHours != null ? round1(r.actualOvertimeHours) : '',
      r.absentDays ?? '', r.lateMinutes ?? '',
    ].map(esc).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
}
