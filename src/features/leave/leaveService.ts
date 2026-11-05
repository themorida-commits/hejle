// ─────────────────────────────────────────────────────────────────────────────
// ماژول مرخصی (P1-02) — قلبش «شبیه‌سازی پوشش پیش از تأیید» است: قبل از اینکه
// سرپرستار تأیید کند، دقیقاً می‌بیند در روزهای مرخصی کدام شیفت‌ها زیر حداقل
// نیرو می‌روند و چه قواعدی نقض می‌شوند. هیچ تأییدی خودکار نیست (قانون DR-002).
// ─────────────────────────────────────────────────────────────────────────────
import type { Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import {
  buildEmployeeFacts, buildWardFacts, evaluateRules,
  DEFAULT_RULE_CONFIGS, categorizeShift, type RuleViolation,
} from '../../core/rules/engine';
import { jalaliToGregorian } from '../../core/jalali';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeCode: string; // annual | sick | unpaid | mission | maternity | marriage | bereavement | hajj
  startISO: string;
  endISO: string;
  /** مرخصی ساعتی (نسخهٔ ۱٫۱ اسپک): تک‌روزه، با تعداد ساعت؛ شیفت روز دست‌نخورده می‌ماند مگر ساعت‌ها کل شیفت را بپوشاند. */
  isHourly?: boolean;
  hours?: number | null;
  /** مسیر پیوست مدرک (استعلاجی) در Storage؛ در حالت دمو فقط نام فایل نگه داشته می‌شود. */
  attachmentPath?: string | null;
  reason?: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewNote?: string;
}

export const LEAVE_TYPES = [
  { code: 'annual', name: 'استحقاقی', isPaid: true },
  { code: 'sick', name: 'استعلاجی', isPaid: true },
  { code: 'unpaid', name: 'بدون حقوق', isPaid: false },
  { code: 'mission', name: 'مأموریت', isPaid: true },
  { code: 'maternity', name: 'زایمان', isPaid: true },
  { code: 'marriage', name: 'ازدواج', isPaid: true },
  { code: 'bereavement', name: 'فوت بستگان', isPaid: true },
  { code: 'hajj', name: 'حج', isPaid: true },
] as const;

/** ساعت موظفی یک روز — مبنای تبدیل مرخصی ساعتی به روز (۴۴ ساعت هفته ÷ ۶ روز کاری). */
export const HOURS_PER_DAY = 44 / 6;

/** طول مرخصی به «روز» — روزانه: تعداد روزهای بازه؛ ساعتی: ساعت ÷ موظفی روزانه. */
export function leaveDurationDays(request: Pick<LeaveRequest, 'isHourly' | 'hours' | 'startISO' | 'endISO'>): number {
  if (request.isHourly) return (request.hours ?? 0) / HOURS_PER_DAY;
  return leaveDaysInRange(request.startISO, request.endISO).length;
}

/** آیا مرخصی ساعتی کل شیفت آن روز فرد را می‌پوشاند؟ (آن‌وقت مثل مرخصی روزانه با برنامه برخورد می‌شود) */
export function hourlyCoversWholeShift(
  request: LeaveRequest,
  entries: ScheduleEntry[],
  shiftTypes: ShiftType[],
): boolean {
  if (!request.isHourly) return false;
  const entry = entries.find(e => e.personnelId === request.employeeId && e.date === request.startISO);
  if (!entry) return false;
  const st = shiftTypes.find(s => s.id === entry.shiftTypeId);
  if (!st || categorizeShift(st) === 'off') return false;
  return (request.hours ?? 0) >= st.calculatedValue;
}

export function leaveDaysInRange(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const cur = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function findOffShiftId(shiftTypes: ShiftType[]): string {
  const off = shiftTypes.find(s => categorizeShift(s) === 'off');
  if (!off) throw new Error('no off shift type defined');
  return off.id;
}

/** برنامهٔ فرضی بعد از اعمال مرخصی: روزهای کاری فرد در بازه آف می‌شوند. */
export function applyLeaveToEntries(
  entries: ScheduleEntry[],
  shiftTypes: ShiftType[],
  employeeId: string,
  startISO: string,
  endISO: string,
): ScheduleEntry[] {
  const offId = findOffShiftId(shiftTypes);
  const days = new Set(leaveDaysInRange(startISO, endISO));
  return entries.map(e =>
    e.personnelId === employeeId && days.has(e.date) && e.shiftTypeId !== offId
      ? { ...e, shiftTypeId: offId, isManualEntry: true }
      : e,
  );
}

export interface CoverageSimulation {
  requestId: string;
  shortfalls: { dateISO: string; category: 'morning' | 'evening' | 'night'; count: number; minimum: number }[];
  newViolations: RuleViolation[];
  balanceOk: boolean;
  balanceMessage: string;
  ok: boolean;
  summary: string;
}

export function simulateLeaveCoverage(args: {
  request: LeaveRequest;
  entries: ScheduleEntry[];
  shiftTypes: ShiftType[];
  personnel: Personnel[];
  jYear: number;
  jMonth: number;
  dutyHoursByEmployee: Map<string, number>;
  minimums: Partial<Record<'morning' | 'evening' | 'night', number>>;
  balance?: { entitled: number; used: number };
  configs?: typeof DEFAULT_RULE_CONFIGS;
}): CoverageSimulation {
  const { request } = args;
  const configs = args.configs ?? DEFAULT_RULE_CONFIGS;
  // مرخصی ساعتیِ جزئی شیفت را حذف نمی‌کند؛ فقط وقتی کل شیفت پوشانده شود مثل روزانه عمل می‌کند
  const coversWhole = !request.isHourly || hourlyCoversWholeShift(request, args.entries, args.shiftTypes);
  const simulated = coversWhole
    ? applyLeaveToEntries(args.entries, args.shiftTypes, request.employeeId, request.startISO, request.endISO)
    : args.entries;

  // کمبود نیرو در روزهای مرخصی نسبت به حداقل‌ها
  const ward = buildWardFacts({ entries: simulated, shiftTypes: args.shiftTypes, jYear: args.jYear, jMonth: args.jMonth });
  const days = new Set(leaveDaysInRange(request.startISO, request.endISO));
  const shortfalls: CoverageSimulation['shortfalls'] = [];
  for (const day of ward) {
    if (!days.has(day.dateISO)) continue;
    for (const cat of ['morning', 'evening', 'night'] as const) {
      const min = args.minimums[cat];
      if (min != null && day.counts[cat] < min) {
        shortfalls.push({ dateISO: day.dateISO, category: cat, count: day.counts[cat], minimum: min });
      }
    }
  }

  // نقض‌های تازه‌ای که خود مرخصی برای فرد می‌سازد (مثلاً روی هم افتادن با قواعد)
  const factsBefore = buildEmployeeFacts({
    personnel: args.personnel, entries: args.entries, shiftTypes: args.shiftTypes,
    jYear: args.jYear, jMonth: args.jMonth, dutyHoursByEmployee: args.dutyHoursByEmployee,
  });
  const factsAfter = buildEmployeeFacts({
    personnel: args.personnel, entries: simulated, shiftTypes: args.shiftTypes,
    jYear: args.jYear, jMonth: args.jMonth, dutyHoursByEmployee: args.dutyHoursByEmployee,
  });
  const key = (v: RuleViolation) => `${v.ruleType}|${v.employeeId}|${v.jDay}|${v.message}`;
  const beforeKeys = new Set(evaluateRules({ facts: factsBefore, configs }).map(key));
  const newViolations = evaluateRules({ facts: factsAfter, configs }).filter(v => !beforeKeys.has(key(v)));

  // ماندهٔ مرخصی — ساعتی با تبدیل ساعت به روز سنجیده می‌شود
  const requestedDays = leaveDurationDays(request);
  const fmtD = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 2 });
  let balanceOk = true;
  let balanceMessage = 'ماندهٔ مرخصی بررسی نشده است.';
  if (args.balance) {
    const remaining = args.balance.entitled - args.balance.used;
    balanceOk = requestedDays <= remaining;
    balanceMessage = balanceOk
      ? `ماندهٔ مرخصی کافی است: ${fmtD(remaining)} روز از ${fmtD(args.balance.entitled)} روز باقی مانده و این درخواست ${fmtD(requestedDays)} روز است.`
      : `ماندهٔ مرخصی کافی نیست: فقط ${fmtD(remaining)} روز باقی مانده ولی درخواست ${fmtD(requestedDays)} روز است.`;
  }

  const ok = shortfalls.length === 0 && balanceOk;
  const hourlyNote = request.isHourly && !coversWhole
    ? ' این مرخصی ساعتی است و شیفت آن روز سر جایش می‌ماند؛ ساعت‌ها از کارکرد همان روز کسر می‌شود.'
    : '';
  const summary = ok
    ? `پوشش بخش در روزهای مرخصی کامل می‌ماند و مانده کافی است؛ تأیید این مرخصی از نظر پوشش امن است.${hourlyNote}`
    : `این مرخصی ${shortfalls.length.toLocaleString('fa-IR')} کمبود نیرو در شیفت‌ها می‌سازد${balanceOk ? '' : ' و ماندهٔ مرخصی هم کافی نیست'}؛ پیش از تأیید باید جایگزین مشخص شود.`;

  return { requestId: request.id, shortfalls, newViolations, balanceOk, balanceMessage, ok, summary };
}

export type ReviewResult =
  | { ok: true; request: LeaveRequest; entryPatch: ScheduleEntry[] }
  | { ok: false; error: string };

/** تأیید مرخصی — نگهبان‌ها: خودتأییدی ممنوع، فقط از وضعیت pending. */
export function approveLeave(args: {
  request: LeaveRequest;
  approverEmployeeId: string;
  entries: ScheduleEntry[];
  shiftTypes: ShiftType[];
}): ReviewResult {
  const { request } = args;
  if (request.status !== 'pending') return { ok: false, error: 'این درخواست قبلاً تعیین تکلیف شده است.' };
  if (args.approverEmployeeId === request.employeeId) return { ok: false, error: 'تأیید مرخصی توسط خود درخواست‌دهنده مجاز نیست.' };
  // ساعتیِ جزئی: برنامه دست نمی‌خورد (کسر از کارکرد انجام می‌شود)؛ پوشش کامل = رفتار روزانه
  const entryPatch = request.isHourly && !hourlyCoversWholeShift(request, args.entries, args.shiftTypes)
    ? args.entries
    : applyLeaveToEntries(args.entries, args.shiftTypes, request.employeeId, request.startISO, request.endISO);
  return {
    ok: true,
    request: { ...request, status: 'approved', reviewedBy: args.approverEmployeeId },
    entryPatch,
  };
}

export function rejectLeave(args: { request: LeaveRequest; approverEmployeeId: string; note?: string }): ReviewResult {
  const { request } = args;
  if (request.status !== 'pending') return { ok: false, error: 'این درخواست قبلاً تعیین تکلیف شده است.' };
  if (args.approverEmployeeId === request.employeeId) return { ok: false, error: 'رد مرخصی توسط خود درخواست‌دهنده مجاز نیست.' };
  return { ok: true, request: { ...request, status: 'rejected', reviewedBy: args.approverEmployeeId, reviewNote: args.note }, entryPatch: [] };
}

export function isoFromJalali(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}
