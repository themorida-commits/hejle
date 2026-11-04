// ─────────────────────────────────────────────────────────────────────────────
// موتور قواعد نسخهٔ ۱ (P0-06) — قانون ارتقاء بهره‌وری کارکنان بالینی و قواعد
// ایمنی برنامه. قطعی و بدون AI: هر نقض با «توضیح فارسی» برمی‌گردد تا سرپرستار
// بفهمد کدام قانون، برای چه کسی، در چه روزی و چقدر نقض شده است.
// پیکربندی از جدول rules دیتابیس می‌آید (params jsonb) — هیچ عددی hard-code نیست.
// ─────────────────────────────────────────────────────────────────────────────
import type { Personnel, ScheduleEntry, ShiftType } from '../types';
import { jalaliToGregorian, getDaysInJalaliMonth } from '../jalali';
import { calculateShiftHoursDetailed } from '../duty';
import { NATIONAL_HOLIDAYS } from '../defaults';

export type RuleSeverity = 'hard' | 'warn';

export interface RuleConfig {
  ruleType: string;
  value?: number;
  severity: RuleSeverity;
  isEnabled: boolean;
}

// پیش‌فرض‌های اسپک فاز ۰ (از متن قانون بهره‌وری) — قابل بازنویسی از دیتابیس.
export const DEFAULT_RULE_CONFIGS: RuleConfig[] = [
  { ruleType: 'max_consecutive_hours', value: 12, severity: 'hard', isEnabled: true },
  { ruleType: 'overtime_cap_monthly', value: 80, severity: 'hard', isEnabled: true },
  { ruleType: 'night_coefficient', value: 1.5, severity: 'hard', isEnabled: true },
  { ruleType: 'evening_coefficient', value: 1.2, severity: 'hard', isEnabled: true },
  { ruleType: 'weekly_hours_base', value: 44, severity: 'warn', isEnabled: true },
  { ruleType: 'weekly_reduction_max', value: 8, severity: 'warn', isEnabled: true },
  { ruleType: 'min_rest_hours', value: 11, severity: 'hard', isEnabled: true },
  { ruleType: 'max_consecutive_nights', value: 2, severity: 'hard', isEnabled: true },
  { ruleType: 'max_consecutive_work_days', value: 6, severity: 'warn', isEnabled: true },
  { ruleType: 'min_staff_per_shift', severity: 'warn', isEnabled: true },
  // credential_valid: رزرو فاز ۳ (اعتباربخشی) — اگر دادهٔ مدرک برسد فعال می‌شود.
  { ruleType: 'credential_valid', severity: 'warn', isEnabled: false },
];

export type ShiftCategory = 'morning' | 'evening' | 'night' | 'off' | 'other';

export function categorizeShift(shift: ShiftType): ShiftCategory {
  const sym = (shift.symbol || '').toUpperCase();
  const name = shift.name || '';
  if (sym === '-' || sym === 'OFF' || shift.id === 's-off' || name.includes('تعطیل')) return 'off';
  if (sym === 'N' || name.includes('شب')) return 'night';
  if (sym === 'E' || sym === 'EN' || name.includes('عصر')) return 'evening';
  if (sym === 'M' || name.includes('صبح')) return 'morning';
  return 'other';
}

export interface DayFact {
  jDay: number;
  dateISO: string;
  shift: ShiftType | null;
  category: ShiftCategory;
  isFriday: boolean;
  isHoliday: boolean;
  isLeave: boolean;
  hours: number; // مقدار محاسباتی شیفت (با ارزش جمعه/تعطیل)
}

export interface CredentialFact {
  title: string;
  expiresOnISO: string; // 'YYYY-MM-DD' میلادی
}

export interface EmployeeMonthFacts {
  employeeId: string;
  employeeName: string;
  days: DayFact[];
  dutyHours: number; // موظفی ماه (خروجی calculateDutyHours)
  workedHours: number; // مجموع مقادیر محاسباتی شیفت‌های کاری
  nightHours: number;
  eveningHours: number;
  overtimeHours: number; // max(0, worked - duty)
  weeklyReductionHours: number; // کسر هفتگی اعمال‌شده برای این فرد (از جدول سختی/سابقه — Q2)
  claimedPaid?: { nightPaid?: number; eveningPaid?: number };
  credentials?: CredentialFact[];
  monthEndISO: string;
}

export interface WardDayFact {
  jDay: number;
  dateISO: string;
  counts: Record<'morning' | 'evening' | 'night', number>;
}

export interface RuleViolation {
  ruleType: string;
  severity: RuleSeverity;
  employeeId?: string;
  employeeName?: string;
  jDay?: number;
  value?: number;
  limit?: number;
  message: string;
}

const faNum = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });

function isoOf(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

// ── ساخت واقعیت‌های ماه از روی خروجی برنامه ───────────────────────────────────
export function buildEmployeeFacts(args: {
  personnel: Personnel[];
  entries: ScheduleEntry[];
  shiftTypes: ShiftType[];
  jYear: number;
  jMonth: number;
  dutyHoursByEmployee: Map<string, number>;
  leaveDatesByEmployee?: Map<string, Set<string>>;
  weeklyReductionByEmployee?: Map<string, number>;
  claimedPaidByEmployee?: Map<string, { nightPaid?: number; eveningPaid?: number }>;
  credentialsByEmployee?: Map<string, CredentialFact[]>;
}): EmployeeMonthFacts[] {
  const { personnel, entries, shiftTypes, jYear, jMonth } = args;
  const daysInMonth = getDaysInJalaliMonth(jYear, jMonth);
  const shiftById = new Map(shiftTypes.map(s => [s.id, s]));
  const holidays = new Set(NATIONAL_HOLIDAYS.filter(h => h.month === jMonth).map(h => h.day));
  const entryByKey = new Map(entries.map(e => [`${e.personnelId}|${e.date}`, e]));

  return personnel.map(p => {
    const days: DayFact[] = [];
    let worked = 0, night = 0, evening = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateISO = isoOf(jYear, jMonth, d);
      const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
      const isFriday = new Date(gy, gm - 1, gd).getDay() === 5;
      const isHoliday = holidays.has(d);
      const entry = entryByKey.get(`${p.id}|${dateISO}`);
      const shift = entry ? shiftById.get(entry.shiftTypeId) ?? null : null;
      const category = shift ? categorizeShift(shift) : 'off';
      const hours = shift && category !== 'off' ? calculateShiftHoursDetailed(shift, isFriday, isHoliday) : 0;
      if (category !== 'off') {
        worked += hours;
        if (category === 'night') night += hours;
        if (category === 'evening') evening += hours;
      }
      days.push({
        jDay: d, dateISO, shift, category, isFriday, isHoliday,
        isLeave: args.leaveDatesByEmployee?.get(p.id)?.has(dateISO) ?? false,
        hours,
      });
    }
    const duty = args.dutyHoursByEmployee.get(p.id) ?? 0;
    return {
      employeeId: p.id,
      employeeName: p.name,
      days,
      dutyHours: duty,
      workedHours: worked,
      nightHours: night,
      eveningHours: evening,
      overtimeHours: Math.max(0, worked - duty),
      weeklyReductionHours: args.weeklyReductionByEmployee?.get(p.id) ?? 0,
      claimedPaid: args.claimedPaidByEmployee?.get(p.id),
      credentials: args.credentialsByEmployee?.get(p.id),
      monthEndISO: isoOf(jYear, jMonth, daysInMonth),
    };
  });
}

export function buildWardFacts(args: {
  entries: ScheduleEntry[];
  shiftTypes: ShiftType[];
  jYear: number;
  jMonth: number;
}): WardDayFact[] {
  const daysInMonth = getDaysInJalaliMonth(args.jYear, args.jMonth);
  const shiftById = new Map(args.shiftTypes.map(s => [s.id, s]));
  const out: WardDayFact[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateISO = isoOf(args.jYear, args.jMonth, d);
    const counts = { morning: 0, evening: 0, night: 0 };
    for (const e of args.entries) {
      if (e.date !== dateISO) continue;
      const cat = categorizeShift(shiftById.get(e.shiftTypeId)!);
      if (cat === 'morning' || cat === 'evening' || cat === 'night') counts[cat]++;
    }
    out.push({ jDay: d, dateISO, counts });
  }
  return out;
}

// ── ارزیابی ────────────────────────────────────────────────────────────────────
// جفت‌های استراحت ناکافی (نسخهٔ ۱، بر پایهٔ زمان‌های اسمی شیفت‌ها):
// شب (پایان ۷ صبح) یا شیفت ترکیبی طولانی → هر شیفت کاری روز بعد یعنی استراحت < ۱۱ ساعت.
// عصر → صبح روز بعد: هشدار (در عمل محصول هم تعارض محسوب می‌شود).
const REST_HARD_AFTER: ReadonlySet<ShiftCategory> = new Set(['night']);

export function evaluateRules(args: {
  facts: EmployeeMonthFacts[];
  configs: RuleConfig[];
  wardFacts?: WardDayFact[];
  minimums?: Partial<Record<'morning' | 'evening' | 'night', number>>;
}): RuleViolation[] {
  const cfg = new Map(args.configs.filter(c => c.isEnabled).map(c => [c.ruleType, c]));
  const out: RuleViolation[] = [];
  const push = (v: RuleViolation) => out.push(v);

  for (const f of args.facts) {
    const who = { employeeId: f.employeeId, employeeName: f.employeeName };

    // سقف ساعت متوالی: طول واقعی هر شیفت منفرد
    const maxH = cfg.get('max_consecutive_hours');
    if (maxH?.value != null) {
      for (const day of f.days) {
        if (day.shift && day.category !== 'off' && day.shift.realDuration > maxH.value) {
          push({
            ...who, ruleType: 'max_consecutive_hours', severity: maxH.severity, jDay: day.jDay,
            value: day.shift.realDuration, limit: maxH.value,
            message: `${f.employeeName} در روز ${faNum(day.jDay)} شیفت ${faNum(day.shift.realDuration)} ساعته دارد؛ سقف کار متوالی ${faNum(maxH.value)} ساعت است.`,
          });
        }
      }
    }

    // سقف اضافه‌کار ماهانه + هشدار نزدیک‌شدن (۹۰٪)
    const ot = cfg.get('overtime_cap_monthly');
    if (ot?.value != null) {
      if (f.overtimeHours > ot.value) {
        push({
          ...who, ruleType: 'overtime_cap_monthly', severity: ot.severity,
          value: f.overtimeHours, limit: ot.value,
          message: `اضافه‌کار ${f.employeeName} ${faNum(f.overtimeHours)} ساعت است و از سقف قانونی ${faNum(ot.value)} ساعت گذشته است.`,
        });
      } else if (f.overtimeHours >= ot.value * 0.9 && f.overtimeHours > 0) {
        push({
          ...who, ruleType: 'overtime_cap_monthly', severity: 'warn',
          value: f.overtimeHours, limit: ot.value,
          message: `اضافه‌کار ${f.employeeName} به ${faNum(f.overtimeHours)} ساعت رسیده و به سقف ${faNum(ot.value)} ساعت نزدیک است.`,
        });
      }
    }

    // ضرایب شب و عصر: اگر عدد پرداختی ادعایی با ضریب قانونی نخواند
    const nc = cfg.get('night_coefficient');
    if (nc?.value != null && f.claimedPaid?.nightPaid != null) {
      const expected = f.nightHours * nc.value;
      if (Math.abs(f.claimedPaid.nightPaid - expected) > 0.05) {
        push({
          ...who, ruleType: 'night_coefficient', severity: nc.severity,
          value: f.claimedPaid.nightPaid, limit: expected,
          message: `کارکرد شب ${f.employeeName} با ضریب ${faNum(nc.value)} باید ${faNum(expected)} ساعت پرداخت شود، اما ${faNum(f.claimedPaid.nightPaid)} ساعت ثبت شده است.`,
        });
      }
    }
    const ec = cfg.get('evening_coefficient');
    if (ec?.value != null && f.claimedPaid?.eveningPaid != null) {
      const expected = f.eveningHours * ec.value;
      if (Math.abs(f.claimedPaid.eveningPaid - expected) > 0.05) {
        push({
          ...who, ruleType: 'evening_coefficient', severity: ec.severity,
          value: f.claimedPaid.eveningPaid, limit: expected,
          message: `کارکرد عصر ${f.employeeName} با ضریب ${faNum(ec.value)} باید ${faNum(expected)} ساعت پرداخت شود، اما ${faNum(f.claimedPaid.eveningPaid)} ساعت ثبت شده است.`,
        });
      }
    }

    // سقف ساعت هفتگی قانونی → معادل ماهانه: موظفی نباید از (پایه − کسر) × ۵۲/۱۲ بیشتر شود
    const wb = cfg.get('weekly_hours_base');
    const wr = cfg.get('weekly_reduction_max');
    if (wb?.value != null) {
      const reduction = Math.min(f.weeklyReductionHours, wr?.value ?? 0);
      const legalMonthly = (wb.value - reduction) * 52 / 12;
      if (f.dutyHours > legalMonthly + 0.5) {
        push({
          ...who, ruleType: 'weekly_hours_base', severity: wb.severity,
          value: f.dutyHours, limit: Math.round(legalMonthly * 10) / 10,
          message: `موظفی ماهانهٔ ${f.employeeName} (${faNum(f.dutyHours)} ساعت) از سقف قانونی معادل ${faNum(wb.value)} ساعت هفتگی (${faNum(legalMonthly)} ساعت) بیشتر است.`,
        });
      }
    }

    // استراحت حداقل + شب‌های متوالی + روزهای کاری متوالی (پیمایش یک‌باره)
    const rest = cfg.get('min_rest_hours');
    const maxN = cfg.get('max_consecutive_nights');
    const maxW = cfg.get('max_consecutive_work_days');
    let consecNights = 0, consecWork = 0;
    for (let i = 0; i < f.days.length; i++) {
      const day = f.days[i]!;
      consecNights = day.category === 'night' ? consecNights + 1 : 0;
      consecWork = day.category !== 'off' && !day.isLeave ? consecWork + 1 : 0;
      if (maxN?.value != null && consecNights === maxN.value + 1) {
        push({
          ...who, ruleType: 'max_consecutive_nights', severity: maxN.severity, jDay: day.jDay,
          value: consecNights, limit: maxN.value,
          message: `${f.employeeName} تا روز ${faNum(day.jDay)} بیش از ${faNum(maxN.value)} شب متوالی کار کرده است.`,
        });
      }
      if (maxW?.value != null && consecWork === maxW.value + 1) {
        push({
          ...who, ruleType: 'max_consecutive_work_days', severity: maxW.severity, jDay: day.jDay,
          value: consecWork, limit: maxW.value,
          message: `${f.employeeName} تا روز ${faNum(day.jDay)} بیش از ${faNum(maxW.value)} روز متوالی بدون استراحت کار کرده است.`,
        });
      }
      if (rest && i > 0) {
        const prev = f.days[i - 1]!;
        if (day.category !== 'off' && REST_HARD_AFTER.has(prev.category)) {
          push({
            ...who, ruleType: 'min_rest_hours', severity: rest.severity, jDay: day.jDay,
            limit: rest.value,
            message: `${f.employeeName} روز ${faNum(day.jDay)} بلافاصله بعد از شیفت شب کار می‌کند؛ استراحت حداقل ${faNum(rest.value ?? 11)} ساعت رعایت نشده است.`,
          });
        } else if (day.category === 'morning' && prev.category === 'evening') {
          push({
            ...who, ruleType: 'min_rest_hours', severity: 'warn', jDay: day.jDay,
            limit: rest.value,
            message: `${f.employeeName} روز ${faNum(day.jDay)} بعد از شیفت عصر، صبح کار می‌کند؛ فاصلهٔ استراحت مرزی است.`,
          });
        }
      }
    }

    // اعتبار مدرک (رزرو فاز ۳): فقط اگر دادهٔ مدرک رسیده باشد
    const cred = cfg.get('credential_valid');
    if (cred && f.credentials) {
      for (const c of f.credentials) {
        if (c.expiresOnISO < f.monthEndISO) {
          push({
            ...who, ruleType: 'credential_valid', severity: cred.severity,
            message: `مدرک «${c.title}» ${f.employeeName} پیش از پایان ماه منقضی می‌شود (${c.expiresOnISO}).`,
          });
        }
      }
    }
  }

  // حداقل نیروی هر شیفت (سطح بخش)
  const minCfg = cfg.get('min_staff_per_shift');
  if (minCfg && args.wardFacts && args.minimums) {
    const labels = { morning: 'صبح', evening: 'عصر', night: 'شب' } as const;
    for (const day of args.wardFacts) {
      for (const cat of ['morning', 'evening', 'night'] as const) {
        const min = args.minimums[cat];
        if (min != null && day.counts[cat] < min) {
          push({
            ruleType: 'min_staff_per_shift', severity: minCfg.severity, jDay: day.jDay,
            value: day.counts[cat], limit: min,
            message: `روز ${faNum(day.jDay)} شیفت ${labels[cat]} فقط ${faNum(day.counts[cat])} نفر دارد؛ حداقل ${faNum(min)} نفر لازم است.`,
          });
        }
      }
    }
  }

  return out;
}
