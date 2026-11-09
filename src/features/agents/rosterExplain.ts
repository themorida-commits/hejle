// ─────────────────────────────────────────────────────────────────────────────
// توضیح برنامهٔ ماه — فاز ۲ لایهٔ ایجنت (Zone C، دور ۱۸، NUR-DR-2026-003).
// solver برنامه را می‌سازد و تصمیم انتشار با انسان است؛ این ماژول فقط خروجی
// را «قابل خواندن» می‌کند: توازن بار و شب‌ها، خانه‌های نیاز روزانه‌ای که پر
// نشده‌اند، قفل‌های دستیِ نگه‌داشته‌شده و چک قانون ثابت سرپرستار. همهٔ عددها
// از روی همان مدخل‌های برنامه شمرده می‌شوند — عدد تازه‌ای ساخته نمی‌شود.
// ─────────────────────────────────────────────────────────────────────────────

import type { Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import { categorizeShift, type ShiftCategory } from '../../core/rules/engine';
import { getDaysInJalaliMonth, jalaliToGregorian } from '../../core/jalali';
import { isoFromJalali } from '../leave/leaveService';
import type { DailyReqs } from '../roster/rosterModel';

export interface EmployeeRosterStat {
  employeeId: string;
  name: string;
  total: number;
  mornings: number;
  evenings: number;
  nights: number;
  /** شیفت‌های روزهای جمعه (آخر هفتهٔ ایران). */
  weekends: number;
  /** سلول‌های دستی — در تولید خودکار قفل می‌مانند. */
  manual: number;
}

export interface UnfilledCell {
  dateISO: string;
  jDay: number;
  shift: 'morning' | 'evening' | 'night';
  required: number;
  actual: number;
}

export interface RosterExplainInput {
  scheduleId?: string | null;
  /** پرسنل همان بخش. */
  personnel: Personnel[];
  /** مدخل‌های برنامهٔ ماه همان بخش. */
  entries: ScheduleEntry[];
  shiftTypes: ShiftType[];
  dailyReqs: DailyReqs;
  jYear: number;
  jMonth: number;
}

export interface RosterBrief {
  scheduleId: string | null;
  perEmployee: EmployeeRosterStat[];
  nightsSpread: { min: number; max: number; avg: number };
  unfilled: UnfilledCell[];
  manualLocks: number;
  headNurseViolations: number;
  lines: string[];
}

const faNum = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });
const SHIFT_FA = { morning: 'صبح', evening: 'عصر', night: 'شب' } as const;
const CATS = ['morning', 'evening', 'night'] as const;

export function explainRoster(input: RosterExplainInput): RosterBrief {
  const shiftById = new Map(input.shiftTypes.map(s => [s.id, s]));
  const catOf = (e: ScheduleEntry): ShiftCategory => {
    const st = shiftById.get(e.shiftTypeId);
    return st ? categorizeShift(st) : 'other';
  };
  const daysInMonth = getDaysInJalaliMonth(input.jYear, input.jMonth);
  const fridays = new Set<string>();
  for (let d = 1; d <= daysInMonth; d++) {
    const [gy, gm, gd] = jalaliToGregorian(input.jYear, input.jMonth, d);
    if (new Date(gy, gm - 1, gd).getDay() === 5) fridays.add(isoFromJalali(input.jYear, input.jMonth, d));
  }

  const stats = new Map<string, EmployeeRosterStat>(
    input.personnel.map(p => [p.id, {
      employeeId: p.id, name: p.name, total: 0, mornings: 0, evenings: 0, nights: 0, weekends: 0, manual: 0,
    }]),
  );
  const perDayCat = new Map<string, Record<'morning' | 'evening' | 'night', number>>();
  let manualLocks = 0;
  let headNurseViolations = 0;
  const headNurseIds = new Set(input.personnel.filter(p => p.role.includes('سرپرستار')).map(p => p.id));

  for (const e of input.entries) {
    const s = stats.get(e.personnelId);
    const cat = catOf(e);
    if (e.isManualEntry) {
      manualLocks++;
      if (s) s.manual++;
    }
    if (headNurseIds.has(e.personnelId) && (cat === 'evening' || cat === 'night' || cat === 'other')) {
      headNurseViolations++;
    }
    if (cat === 'morning' || cat === 'evening' || cat === 'night') {
      const day = perDayCat.get(e.date) ?? { morning: 0, evening: 0, night: 0 };
      day[cat]++;
      perDayCat.set(e.date, day);
    }
    if (!s || cat === 'off') continue;
    s.total++;
    if (cat === 'morning') s.mornings++;
    else if (cat === 'evening') s.evenings++;
    else if (cat === 'night') s.nights++;
    if (fridays.has(e.date)) s.weekends++;
  }

  const perEmployee = [...stats.values()];
  const nightCounts = perEmployee.map(s => s.nights);
  const nightsSpread = {
    min: nightCounts.length ? Math.min(...nightCounts) : 0,
    max: nightCounts.length ? Math.max(...nightCounts) : 0,
    avg: nightCounts.length ? nightCounts.reduce((a, b) => a + b, 0) / nightCounts.length : 0,
  };

  const unfilled: UnfilledCell[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateISO = isoFromJalali(input.jYear, input.jMonth, d);
    const day = perDayCat.get(dateISO) ?? { morning: 0, evening: 0, night: 0 };
    for (const cat of CATS) {
      const required = input.dailyReqs[cat][d - 1] ?? 0;
      if (required > 0 && day[cat] < required) {
        unfilled.push({ dateISO, jDay: d, shift: cat, required, actual: day[cat] });
      }
    }
  }

  // ── خط‌های trade-off — فقط جملاتی که از همین عددها برمی‌آیند ───────────────
  const lines: string[] = [];
  lines.push(`این برنامه ${faNum(input.entries.length)} مدخل دارد و برای ${faNum(perEmployee.length)} نفر از پرسنل بخش چیده شده است.`);
  if (nightsSpread.max > 0) {
    lines.push(
      `پراکندگی شیفت شب: کم‌ترین ${faNum(nightsSpread.min)} و بیشترین ${faNum(nightsSpread.max)} شب برای هر نفر (میانگین ${faNum(nightsSpread.avg)}).` +
      (nightsSpread.max - nightsSpread.min >= 3
        ? ' اختلاف شب‌ها زیاد است؛ اگر جابه‌جایی دستی می‌زنید، اول از پرشب‌ترین‌ها کم کنید.'
        : ' توزیع شب‌ها نسبتاً متوازن است.'),
    );
  }
  if (unfilled.length > 0) {
    const first = unfilled[0]!;
    lines.push(
      `${faNum(unfilled.length)} خانهٔ نیاز روزانه پر نشده است؛ نمونه: روز ${faNum(first.jDay)} شیفت ${SHIFT_FA[first.shift]} نیاز ${faNum(first.required)} نفر بود و ${faNum(first.actual)} نفر چیده شد. تا این خانه‌ها پر نشوند برنامه از نظر نیاز بخش کامل نیست.`,
    );
  } else {
    lines.push('همهٔ خانه‌های نیاز روزانهٔ ثبت‌شده با نیروی کافی پر شده‌اند.');
  }
  lines.push(manualLocks > 0
    ? `${faNum(manualLocks)} سلول دستی قفل شده و در تولید خودکار دست نخورده مانده است؛ بازتولید برنامه این‌ها را جابه‌جا نمی‌کند.`
    : 'سلول دستیِ قفل‌شده‌ای در این برنامه نیست.');
  lines.push(headNurseViolations === 0
    ? 'قانون ثابت سرپرستار سالم است: هیچ سلول عصر/شب/ترکیبی برای سرپرستار نیست.'
    : `⚠ قانون ثابت سرپرستار ${faNum(headNurseViolations)} نقض دارد (سلول غیرصبح برای سرپرستار)؛ برنامه نباید با این نقض منتشر شود.`);
  const busiest = [...perEmployee].sort((a, b) => b.total - a.total)[0];
  if (busiest && busiest.total > 0) {
    lines.push(`بیشترین بار کاری: ${busiest.name} با ${faNum(busiest.total)} شیفت (${faNum(busiest.nights)} شب، ${faNum(busiest.weekends)} جمعه).`);
  }

  return {
    scheduleId: input.scheduleId ?? null,
    perEmployee, nightsSpread, unfilled, manualLocks, headNurseViolations, lines,
  };
}
