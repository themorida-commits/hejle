// ─────────────────────────────────────────────────────────────────────────────
// حضور و غیاب (فاز ۲) — رویدادهای خام ورود/خروج ← روزهای تطبیق‌یافته با برنامه.
// اصل حاکم (مثل بقیهٔ حجله): محاسبه قطعی و قابل توضیح است؛ هیچ عددی را مدل
// زبانی تولید نمی‌کند. ساعت شروع اسمی شیفت‌ها پارامتر است، نه ثابتِ پنهان.
// ─────────────────────────────────────────────────────────────────────────────
import type { Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import { categorizeShift } from '../../core/rules/engine';

export interface AttendanceEvent {
  id: string;
  employeeId: string;
  dateISO: string; // میلادی YYYY-MM-DD
  type: 'in' | 'out';
  time: string; // 'HH:MM'
  source: 'manual' | 'device' | 'import';
}

export type DayStatus = 'present' | 'absent' | 'off' | 'leave' | 'incomplete';

export interface AttendanceDay {
  employeeId: string;
  dateISO: string;
  scheduledShiftTypeId: string | null;
  status: DayStatus;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  note: string;
}

/** ساعت شروع اسمی بر اساس ردهٔ شیفت (قابل پیکربندی از تنظیمات بیمارستان). */
export const NOMINAL_START: Record<string, string> = { morning: '07:00', evening: '14:00', night: '19:00' };
export const NOMINAL_END: Record<string, string> = { morning: '13:00', evening: '20:00', night: '07:00' };

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export interface PairedDay {
  checkIn: string;
  checkOut: string | null;
  complete: boolean;
  workedMinutes: number;
  /** دقیقهٔ خروج نسبت به نیمه‌شبِ روز ورود (برای شیفت شب می‌تواند > ۱۴۴۰ باشد). */
  outAbsMinutes: number | null;
}

const dayIndex = (dateISO: string) => Math.floor(Date.parse(dateISO + 'T00:00:00Z') / 86400000);

/**
 * جفت‌سازی روی خط زمان (نه بر اساس روز تقویمی): هر خروج به تازه‌ترین ورودِ
 * بی‌جفتِ قبل از خودش می‌رسد — خروج صبحِ شیفت شب روی تاریخ فردا می‌نشیند و
 * باز هم درست جفت می‌شود. کلید خروجی: «کارمند|تاریخ ورود».
 */
export function pairEventsTimeline(events: AttendanceEvent[]): Map<string, PairedDay> {
  const byEmp = new Map<string, AttendanceEvent[]>();
  for (const ev of events) byEmp.set(ev.employeeId, [...(byEmp.get(ev.employeeId) ?? []), ev]);
  const out = new Map<string, PairedDay>();
  for (const [emp, list] of byEmp) {
    const sorted = [...list].sort((a, b) =>
      (a.dateISO + a.time).localeCompare(b.dateISO + b.time) || (a.type === 'in' ? -1 : 1));
    let pending: { dateISO: string; time: string } | null = null;
    const closeIncomplete = () => {
      if (pending) {
        out.set(`${emp}|${pending.dateISO}`, {
          checkIn: pending.time, checkOut: null, complete: false, workedMinutes: 0, outAbsMinutes: null,
        });
        pending = null;
      }
    };
    for (const ev of sorted) {
      if (ev.type === 'in') {
        closeIncomplete();
        pending = { dateISO: ev.dateISO, time: ev.time };
      } else if (pending) {
        const gapDays = dayIndex(ev.dateISO) - dayIndex(pending.dateISO);
        if (gapDays >= 0 && gapDays <= 1) {
          const worked = gapDays * 1440 + toMin(ev.time) - toMin(pending.time);
          out.set(`${emp}|${pending.dateISO}`, {
            checkIn: pending.time, checkOut: ev.time, complete: worked >= 0,
            workedMinutes: Math.max(0, worked), outAbsMinutes: gapDays * 1440 + toMin(ev.time),
          });
          pending = null;
        }
      }
    }
    closeIncomplete();
  }
  return out;
}

/**
 * تطبیق یک ماه: برای هر پرسنل × روزِ دارای برنامه یا رویداد، یک AttendanceDay.
 * leaveDates: روزهای مرخصی تأییدشده (از ماژول مرخصی) تا غیبت با مرخصی قاطی نشود.
 */
export function reconcileAttendance(args: {
  personnel: Personnel[];
  entries: ScheduleEntry[];
  events: AttendanceEvent[];
  shiftTypes: ShiftType[];
  leaveDatesByEmployee: Map<string, Set<string>>;
  offShiftTypeId?: string;
}): AttendanceDay[] {
  const offId = args.offShiftTypeId ?? args.shiftTypes.find(s => s.symbol === '-')?.id ?? 's-off';
  const paired = pairEventsTimeline(args.events);
  const eventDates = new Set(args.events.map(e => `${e.employeeId}|${e.dateISO}`));
  const entryByEmpDay = new Map(args.entries.map(e => [`${e.personnelId}|${e.date}`, e]));
  const keys = new Set<string>([...entryByEmpDay.keys(), ...paired.keys(), ...eventDates]);
  const out: AttendanceDay[] = [];

  for (const key of keys) {
    const [employeeId, dateISO] = key.split('|') as [string, string];
    const entry = entryByEmpDay.get(key);
    const pair = paired.get(key);
    const hasEvents = eventDates.has(key) || !!pair;
    const checkIn = pair?.checkIn ?? null;
    const checkOut = pair?.checkOut ?? null;
    const isOff = !entry || entry.shiftTypeId === offId;
    const onLeave = args.leaveDatesByEmployee.get(employeeId)?.has(dateISO) ?? false;

    if (isOff) {
      // روز آف: حضور یعنی شیفت فوق‌العاده — ثبت می‌شود ولی غیبت حساب نمی‌شود
      out.push({
        employeeId, dateISO, scheduledShiftTypeId: entry?.shiftTypeId ?? null,
        status: pair ? 'present' : 'off',
        checkIn, checkOut, workedMinutes: pair?.workedMinutes ?? 0, lateMinutes: 0, earlyLeaveMinutes: 0,
        overtimeMinutes: pair?.workedMinutes ?? 0, note: pair ? 'حضور در روز آف (فوق‌العاده)' : '',
      });
      continue;
    }
    if (onLeave) {
      out.push({
        employeeId, dateISO, scheduledShiftTypeId: entry.shiftTypeId, status: 'leave',
        checkIn, checkOut, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0,
        note: 'مرخصی تأییدشده',
      });
      continue;
    }
    const st = args.shiftTypes.find(s => s.id === entry.shiftTypeId);
    const cat = st ? categorizeShift(st) : 'other';
    const start = NOMINAL_START[cat];
    const end = NOMINAL_END[cat];
    if (!hasEvents) {
      out.push({
        employeeId, dateISO, scheduledShiftTypeId: entry.shiftTypeId, status: 'absent',
        checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0,
        overtimeMinutes: 0, note: 'شیفت برنامه‌ریزی‌شده بدون هیچ رویداد حضور',
      });
      continue;
    }
    if (!pair?.complete || pair.outAbsMinutes === null || !start || !end) {
      out.push({
        employeeId, dateISO, scheduledShiftTypeId: entry.shiftTypeId, status: 'incomplete',
        checkIn, checkOut, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0,
        note: 'رویداد ناقص (ورود یا خروج ثبت نشده)',
      });
      continue;
    }
    const late = Math.max(0, toMin(pair.checkIn) - toMin(start));
    const endAbs = toMin(end) + (cat === 'night' ? 1440 : 0);
    const early = Math.max(0, endAbs - pair.outAbsMinutes);
    const overtime = Math.max(0, pair.outAbsMinutes - endAbs);
    out.push({
      employeeId, dateISO, scheduledShiftTypeId: entry.shiftTypeId, status: 'present',
      checkIn, checkOut, workedMinutes: pair.workedMinutes, lateMinutes: late, earlyLeaveMinutes: early,
      overtimeMinutes: overtime,
      note: [late ? `تأخیر ${late} دقیقه` : '', early ? `تعجیل ${early} دقیقه` : ''].filter(Boolean).join(' · '),
    });
  }
  return out.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.employeeId.localeCompare(b.employeeId));
}

export interface AttendanceSummary {
  employeeId: string;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  incompleteDays: number;
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
}

export function summarizeAttendance(days: AttendanceDay[]): AttendanceSummary[] {
  const map = new Map<string, AttendanceSummary>();
  for (const d of days) {
    const s = map.get(d.employeeId) ?? {
      employeeId: d.employeeId, presentDays: 0, absentDays: 0, leaveDays: 0, incompleteDays: 0,
      totalWorkedMinutes: 0, totalLateMinutes: 0, totalOvertimeMinutes: 0,
    };
    if (d.status === 'present') s.presentDays++;
    if (d.status === 'absent') s.absentDays++;
    if (d.status === 'leave') s.leaveDays++;
    if (d.status === 'incomplete') s.incompleteDays++;
    s.totalWorkedMinutes += d.workedMinutes;
    s.totalLateMinutes += d.lateMinutes;
    s.totalOvertimeMinutes += d.overtimeMinutes;
    map.set(d.employeeId, s);
  }
  return [...map.values()];
}

// ── آداپتور فایل (دستگاه اثر انگشت / قاصدک) ───────────────────────────────────
// قالب دقیق خروجی هر دستگاه با Q3 بیمارستان قطعی می‌شود؛ این آداپتور نگاشت
// ستون را پارامتر می‌گیرد تا بدون تغییر کد با هر فرمتی کار کند.
export interface CsvColumnMap {
  personnelCode: string;
  date: string;
  time: string;
  type?: string; // ستون نوع رویداد (اختیاری؛ مقادیرش با inValue/outValue خوانده می‌شود)
  inValue?: string;
  outValue?: string;
}

export const DEFAULT_GHASEDAK_MAP: CsvColumnMap = {
  personnelCode: 'کد پرسنلی', date: 'تاریخ', time: 'ساعت', type: 'نوع', inValue: 'ورود', outValue: 'خروج',
};

export function parseAttendanceCsv(
  csv: string,
  personnelByCode: Map<string, string>, // کد پرسنلی → شناسهٔ کارمند
  map: CsvColumnMap = DEFAULT_GHASEDAK_MAP,
): { events: AttendanceEvent[]; skipped: number } {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { events: [], skipped: 0 };
  const headers = lines[0]!.split(',').map(h => h.trim());
  const idx = (name: string) => headers.indexOf(name);
  const iCode = idx(map.personnelCode), iDate = idx(map.date), iTime = idx(map.time);
  const iType = map.type ? idx(map.type) : -1;
  if (iCode < 0 || iDate < 0 || iTime < 0) throw new Error('ستون‌های لازم در فایل پیدا نشد (کد پرسنلی/تاریخ/ساعت)');
  const events: AttendanceEvent[] = [];
  let skipped = 0;
  let seq = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map(c => c.trim());
    const empId = personnelByCode.get(cells[iCode] ?? '');
    if (!empId) { skipped++; continue; }
    // تاریخ دستگاه‌ها معمولاً میلادی یا شمسیِ YYYY/MM/DD است؛ اینجا میلادیِ ISO انتظار می‌رود
    const dateISO = (cells[iDate] ?? '').replaceAll('/', '-');
    const type: 'in' | 'out' = iType >= 0 ? (cells[iType] === map.outValue ? 'out' : 'in') : 'in';
    events.push({ id: `imp-${++seq}`, employeeId: empId, dateISO, type, time: cells[iTime] ?? '00:00', source: 'import' });
  }
  return { events, skipped };
}

export function attendanceSummaryToCsv(rows: AttendanceSummary[], nameOf: (id: string) => { name: string; code: string }): string {
  const header = ['کد پرسنلی', 'نام', 'روز حضور', 'روز غیبت', 'روز مرخصی', 'روز ناقص', 'کارکرد واقعی (ساعت)', 'تأخیر (دقیقه)', 'اضافه‌کار واقعی (ساعت)'];
  const body = rows.map(r => {
    const { name, code } = nameOf(r.employeeId);
    return [code, name, r.presentDays, r.absentDays, r.leaveDays, r.incompleteDays,
      (r.totalWorkedMinutes / 60).toFixed(1), r.totalLateMinutes, (r.totalOvertimeMinutes / 60).toFixed(1)].join(',');
  });
  return '\uFEFF' + [header.join(','), ...body].join('\n');
}
