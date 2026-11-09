// ─────────────────────────────────────────────────────────────────────────────
// تریاژ مرخصی — فاز ۲ لایهٔ ایجنت (Zone C، دور ۱۸، NUR-DR-2026-003).
// خروجی فقط «پیشنهاد مستدل» است: سهمیه از روی ماندهٔ ثبت‌شده، پوشش از روی
// برنامهٔ ماه و نیاز روزانهٔ بخش (دور ۱۱) سنجیده می‌شود و پیشنهاد + دلیل‌ها
// در یک پیش‌نویس (agent_drafts) می‌نشیند. تصمیم و اکشن فقط با انسان و از
// مسیر موجود تأیید/رد زنجیره است — این ماژول هیچ‌وقت خودش تصمیم نمی‌گیرد.
// ─────────────────────────────────────────────────────────────────────────────

import type { Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import { categorizeShift, type ShiftCategory } from '../../core/rules/engine';
import { getDaysInJalaliMonth } from '../../core/jalali';
import {
  LEAVE_TYPES, chainStepRole, hourlyCoversWholeShift, isoFromJalali,
  leaveDaysInRange, leaveDurationDays, type LeaveRequest,
} from '../leave/leaveService';
import type { DailyReqs } from '../roster/rosterModel';

export type TriageSuggestion = 'approve' | 'reject' | 'review';
export type TriageShift = 'morning' | 'evening' | 'night';

export interface TriageCoverageCell {
  dateISO: string;
  shift: TriageShift;
  /** نیروی بخش در آن شیفت بعد از کسر خود درخواست‌دهنده (اگر آن روز/شیفت کار می‌کرد). */
  staffAfter: number;
  required: number;
  short: boolean;
}

export interface TriageQuota {
  type: string;
  typeName: string;
  used: number;
  quota: number;
  remaining: number;
  requestedDays: number;
}

export interface LeaveTriageInput {
  request: LeaveRequest;
  /** پرسنل همان بخش (برای نام و وجود درخواست‌دهنده). */
  personnel: Personnel[];
  /** مدخل‌های برنامهٔ ماه همان بخش؛ خالی = برنامه‌ای در دسترس نیست. */
  entries: ScheduleEntry[];
  shiftTypes: ShiftType[];
  /** نیاز روزانهٔ بخش برای همین ماه؛ وقتی برنامه نیست null بدهید. */
  dailyReqs: DailyReqs | null;
  hasSchedule: boolean;
  /** ماندهٔ مرخصی استحقاقی به‌ازای کارمند — تنها مانده‌ای که استور ردیابی می‌کند. */
  leaveBalances: Record<string, { entitled: number; used: number }>;
  approvalChain: string[];
  jYear: number;
  jMonth: number;
}

export interface LeaveTriageBrief {
  requestId: string;
  employeeId: string;
  employeeName: string;
  leaveTypeName: string;
  requestedDays: number;
  suggestion: TriageSuggestion;
  reasons: string[];
  coverage: TriageCoverageCell[] | null;
  quota: TriageQuota | null;
}

const faNum = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 2 });
const SHIFT_FA: Record<TriageShift, string> = { morning: 'صبح', evening: 'عصر', night: 'شب' };
const CATS: TriageShift[] = ['morning', 'evening', 'night'];

export function buildLeaveTriage(input: LeaveTriageInput): LeaveTriageBrief {
  const { request } = input;
  const reasons: string[] = [];
  let level: TriageSuggestion = 'approve';
  const escalate = (to: 'reject' | 'review') => {
    if (to === 'reject') level = 'reject';
    else if (level === 'approve') level = 'review';
  };

  const employee = input.personnel.find(p => p.id === request.employeeId);
  const employeeName = employee?.name ?? request.employeeId;
  const leaveTypeName = LEAVE_TYPES.find(t => t.code === request.leaveTypeCode)?.name ?? request.leaveTypeCode;
  const requestedDays = leaveDurationDays(request);

  if (request.status !== 'pending') {
    escalate('review');
    reasons.push('این درخواست قبلاً تعیین‌تکلیف شده و دیگر در صف بررسی نیست.');
  }
  if (!employee) {
    escalate('review');
    reasons.push('پرسنل درخواست‌دهنده در دادهٔ این بخش پیدا نشد؛ بررسی دستی لازم است.');
  }
  if (request.status === 'pending' && !chainStepRole(input.approvalChain, request)) {
    escalate('review');
    reasons.push('برای این درخواست گام فعالی در زنجیرهٔ تأیید تعریف نشده است (زنجیره خالی است یا گام‌ها تمام شده‌اند).');
  }

  // ── سهمیه: ماندهٔ ردیابی‌شده در استور فقط «استحقاقی» است ──────────────────
  let quota: TriageQuota | null = null;
  if (request.leaveTypeCode === 'annual') {
    const bal = input.leaveBalances[request.employeeId];
    if (!bal) {
      escalate('review');
      reasons.push('ماندهٔ مرخصی استحقاقی این فرد در سیستم ثبت نشده است؛ سهمیه قابل سنجش نیست.');
    } else {
      const remaining = bal.entitled - bal.used;
      quota = {
        type: 'annual', typeName: leaveTypeName,
        used: bal.used, quota: bal.entitled, remaining, requestedDays,
      };
      if (requestedDays > remaining) {
        escalate('reject');
        reasons.push(
          `ماندهٔ مرخصی استحقاقی کافی نیست: ${faNum(bal.used)} روز از سهمیهٔ ${faNum(bal.entitled)} روز مصرف شده و فقط ${faNum(remaining)} روز مانده، ولی این درخواست ${faNum(requestedDays)} روز است.`,
        );
      } else {
        reasons.push(
          `ماندهٔ مرخصی استحقاقی کافی است: ${faNum(remaining)} روز از ${faNum(bal.entitled)} روز باقی مانده و این درخواست ${faNum(requestedDays)} روز است.`,
        );
      }
    }
  } else {
    reasons.push(`برای مرخصی «${leaveTypeName}» ماندهٔ جداگانه‌ای در سیستم ردیابی نمی‌شود؛ سهمیه از مسیر خودش (اسناد/اداری) بررسی شود.`);
    escalate('review');
  }

  // ── پوشش: روزهای مرخصی در برابر نیاز روزانهٔ بخش روی برنامهٔ ماه ─────────
  let coverage: TriageCoverageCell[] | null = null;
  if (!input.hasSchedule || input.entries.length === 0 || !input.dailyReqs) {
    coverage = null;
    escalate('review');
    reasons.push('برنامهٔ این ماه در دسترس نیست؛ پوشش بخش در روزهای مرخصی قابل سنجش نیست.');
  } else {
    const daysInMonth = getDaysInJalaliMonth(input.jYear, input.jMonth);
    const jDayOf = new Map<string, number>();
    for (let d = 1; d <= daysInMonth; d++) jDayOf.set(isoFromJalali(input.jYear, input.jMonth, d), d);
    const shiftById = new Map(input.shiftTypes.map(s => [s.id, s]));
    const catOf = (e: ScheduleEntry): ShiftCategory => {
      const st = shiftById.get(e.shiftTypeId);
      return st ? categorizeShift(st) : 'other';
    };
    // مرخصی ساعتیِ جزئی شیفت را خالی نمی‌کند؛ فقط پوشش کاملِ شیفت مثل روزانه است.
    const removesShift = !request.isHourly || hourlyCoversWholeShift(request, input.entries, input.shiftTypes);
    const reqDays = leaveDaysInRange(request.startISO, request.endISO);
    const cells: TriageCoverageCell[] = [];
    for (const dateISO of reqDays) {
      const jDay = jDayOf.get(dateISO);
      if (jDay == null) continue; // روز بیرون از ماه جاریِ برنامه
      for (const cat of CATS) {
        const required = input.dailyReqs[cat][jDay - 1] ?? 0;
        if (required <= 0) continue;
        let staff = 0;
        for (const e of input.entries) {
          if (e.date !== dateISO || catOf(e) !== cat) continue;
          if (removesShift && e.personnelId === request.employeeId) continue;
          staff++;
        }
        cells.push({ dateISO, shift: cat, staffAfter: staff, required, short: staff < required });
      }
    }
    coverage = cells;
    const shorts = cells.filter(c => c.short);
    if (cells.length === 0) {
      reasons.push('برای روزهای این مرخصی نیاز روزانه‌ای در بخش ثبت نشده است؛ کمبودی از این مسیر دیده نمی‌شود.');
    } else if (shorts.length > 0) {
      escalate('review');
      for (const s of shorts) {
        reasons.push(
          `پوشش روز ${s.dateISO} شیفت ${SHIFT_FA[s.shift]} بعد از این مرخصی ${faNum(s.staffAfter)} نفر می‌شود؛ نیاز بخش ${faNum(s.required)} نفر است.`,
        );
      }
    } else {
      reasons.push('پوشش بخش در همهٔ روزهای مرخصی روی یا بالای نیاز روزانهٔ ثبت‌شده می‌ماند.');
    }
  }

  return {
    requestId: request.id, employeeId: request.employeeId, employeeName,
    leaveTypeName, requestedDays, suggestion: level, reasons, coverage, quota,
  };
}
