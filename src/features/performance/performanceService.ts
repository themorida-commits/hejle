// ─────────────────────────────────────────────────────────────────────────────
// برگهٔ کارانه (فاز ۴) — ورودی شفافِ محاسبهٔ کارانه برای واحد حقوق/قاصدک.
// اصل: هیچ «امتیاز» مبهمی ساخته نمی‌شود؛ مؤلفه‌ها همان اعداد کارکرد و حضورند
// و فرمول نهایی کارانه سیاست بیمارستان است (پرسش‌های باز Q1/Q3)، نه این ماژول.
// ─────────────────────────────────────────────────────────────────────────────
import type { WorkRecord } from '../workRecords/workRecordService';
import type { AttendanceSummary } from '../attendance/attendanceService';

export interface KaranehRow {
  employeeId: string;
  employeeName: string;
  personnelCode: string;
  dutyHours: number;
  totalPaidHours: number; // جمع پرداختی با ضرایب بهره‌وری
  nightHours: number;
  holidayHours: number;
  overtimeHours: number;
  presentDays: number | null;
  absentDays: number | null;
  lateMinutes: number | null;
  /** شاخص حضور = حضور / (حضور + غیبت) — فقط داده، نه امتیاز نهایی. */
  attendanceRate: number | null;
  leaveDays: number;
}

export function buildKaranehSheet(
  records: WorkRecord[],
  attendance: AttendanceSummary[],
): KaranehRow[] {
  return records.map(r => {
    const att = attendance.find(a => a.employeeId === r.employeeId);
    const denom = att ? att.presentDays + att.absentDays : 0;
    return {
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      personnelCode: r.personnelCode,
      dutyHours: r.dutyHours,
      totalPaidHours: r.totalPaidHours,
      nightHours: r.nightHours,
      holidayHours: r.holidayHours,
      overtimeHours: r.overtimeHours,
      presentDays: att?.presentDays ?? null,
      absentDays: att?.absentDays ?? null,
      lateMinutes: att?.totalLateMinutes ?? null,
      attendanceRate: att && denom > 0 ? Math.round((att.presentDays / denom) * 1000) / 10 : null,
      leaveDays: r.leaveDays,
    };
  });
}

export function karanehToCsv(rows: KaranehRow[]): string {
  const header = [
    'کد پرسنلی', 'نام', 'موظفی (ساعت)', 'جمع پرداختی با ضرایب (ساعت)', 'شب (ساعت)',
    'تعطیل (ساعت)', 'اضافه‌کار (ساعت)', 'روز حضور', 'روز غیبت', 'تأخیر (دقیقه)',
    'شاخص حضور (٪)', 'مرخصی (روز)',
  ];
  const r1 = (n: number | null) => (n == null ? '' : Math.round(n * 10) / 10);
  const body = rows.map(r => [
    r.personnelCode, r.employeeName, r1(r.dutyHours), r1(r.totalPaidHours), r1(r.nightHours),
    r1(r.holidayHours), r1(r.overtimeHours), r.presentDays ?? '', r.absentDays ?? '',
    r.lateMinutes ?? '', r.attendanceRate ?? '', r.leaveDays,
  ].join(','));
  return '\uFEFF' + [header.join(','), ...body].join('\n');
}
