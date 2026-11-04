// P0-06: تست موتور قواعد — هر قاعده با نقض کاشته‌شده، و خروجی سالم حل‌کننده بدون نقض سخت.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEmployeeFacts, buildWardFacts, evaluateRules,
  DEFAULT_RULE_CONFIGS, type RuleConfig,
} from '../../src/core/rules/engine';
import { generateScheduleDeterministic } from '../../src/core/scheduling/schedulerSolver';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import { DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../../src/core/defaults';
import { calculateDutyHours } from '../../src/core/duty';
import { jalaliToGregorian } from '../../src/core/jalali';
import type { Personnel, ScheduleEntry, ShiftType, StaffRequest } from '../../src/core/types';

const SHIFTS: ShiftType[] = [
  { id: 'm', name: 'صبح', symbol: 'M', displayColor: '', realDuration: 6, calculatedValue: 6, fridayCalculatedValue: 6, holidayCalculatedValue: 6, departmentIds: [] },
  { id: 'e', name: 'عصر', symbol: 'E', displayColor: '', realDuration: 6, calculatedValue: 6, fridayCalculatedValue: 6, holidayCalculatedValue: 6, departmentIds: [] },
  { id: 'n', name: 'شب', symbol: 'N', displayColor: '', realDuration: 12, calculatedValue: 12, fridayCalculatedValue: 12, holidayCalculatedValue: 12, departmentIds: [] },
  { id: 'long', name: 'ترکیبی', symbol: 'EN', displayColor: '', realDuration: 22.5, calculatedValue: 22.5, fridayCalculatedValue: 22.5, holidayCalculatedValue: 22.5, departmentIds: [] },
  { id: 'off', name: 'تعطیل', symbol: '-', displayColor: '', realDuration: 0, calculatedValue: 0, fridayCalculatedValue: 0, holidayCalculatedValue: 0, departmentIds: [] },
];

const NURSE: Personnel = {
  id: 'x1', name: 'تست پرستار', personnelCode: 'T-1', role: 'پرستار', departmentId: 'd1',
  seniorityLevel: 1, nationalCode: '', contactNumber: '', employmentStatus: 'رسمی',
  employmentDate: '1400/01/01',
};

function iso(jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(1405, 7, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}
const entry = (jd: number, shift: string): ScheduleEntry => ({ personnelId: 'x1', shiftTypeId: shift, date: iso(jd), isManualEntry: true });

function factsFor(entries: ScheduleEntry[], opts?: { duty?: number; claimed?: { nightPaid?: number; eveningPaid?: number } }) {
  return buildEmployeeFacts({
    personnel: [NURSE], entries, shiftTypes: SHIFTS, jYear: 1405, jMonth: 7,
    dutyHoursByEmployee: new Map([['x1', opts?.duty ?? 176]]),
    claimedPaidByEmployee: opts?.claimed ? new Map([['x1', opts.claimed]]) : undefined,
  });
}
const types = (vs: { ruleType: string }[]) => vs.map(v => v.ruleType);

test('R-1 سه شب متوالی + کار بعد از شب: نقض سقف شب متوالی و استراحت', () => {
  const vs = evaluateRules({ facts: factsFor([entry(1, 'n'), entry(2, 'n'), entry(3, 'n'), entry(5, 'n'), entry(6, 'm')]), configs: DEFAULT_RULE_CONFIGS });
  assert.ok(types(vs).includes('max_consecutive_nights'));
  assert.ok(types(vs).includes('min_rest_hours'));
  assert.ok(vs.every(v => v.message.length > 5 && v.message.includes('تست پرستار')));
});

test('R-2 شیفت ۲۲٫۵ ساعته: نقض سقف کار متوالی', () => {
  const vs = evaluateRules({ facts: factsFor([entry(2, 'long')]), configs: DEFAULT_RULE_CONFIGS });
  assert.ok(types(vs).includes('max_consecutive_hours'));
});

test('R-3 اضافه‌کار بالای ۸۰: نقض سخت؛ ۷۵ ساعت: فقط هشدار نزدیک‌شدن', () => {
  // duty=60 و ۱۲ شیفت شب (۱۴۴ ساعت) → اضافه‌کار ۸۴
  const many = Array.from({ length: 12 }, (_, i) => entry(1 + i * 2, 'n'));
  const hard = evaluateRules({ facts: factsFor(many, { duty: 60 }), configs: DEFAULT_RULE_CONFIGS });
  assert.ok(hard.some(v => v.ruleType === 'overtime_cap_monthly' && v.severity === 'hard'));
  // duty=69 و همان برنامه → اضافه‌کار ۷۵
  const warn = evaluateRules({ facts: factsFor(many, { duty: 69 }), configs: DEFAULT_RULE_CONFIGS });
  assert.ok(warn.some(v => v.ruleType === 'overtime_cap_monthly' && v.severity === 'warn'));
  assert.ok(!warn.some(v => v.ruleType === 'overtime_cap_monthly' && v.severity === 'hard'));
});

test('R-4 ضریب شب اشتباه در عدد پرداختی: نقض ضریب؛ عدد درست: بدون نقض', () => {
  const entries = [entry(1, 'n'), entry(3, 'n')]; // ۲۴ ساعت شب → پرداختی درست ۳۶
  const bad = evaluateRules({ facts: factsFor(entries, { claimed: { nightPaid: 24 } }), configs: DEFAULT_RULE_CONFIGS });
  assert.ok(types(bad).includes('night_coefficient'));
  const good = evaluateRules({ facts: factsFor(entries, { claimed: { nightPaid: 36 } }), configs: DEFAULT_RULE_CONFIGS });
  assert.ok(!types(good).includes('night_coefficient'));
});

test('R-5 هشت روز کاری متوالی: هشدار روزهای متوالی', () => {
  const entries = Array.from({ length: 8 }, (_, i) => entry(1 + i, 'm'));
  const vs = evaluateRules({ facts: factsFor(entries), configs: DEFAULT_RULE_CONFIGS });
  assert.ok(vs.some(v => v.ruleType === 'max_consecutive_work_days' && v.severity === 'warn'));
});

test('R-6 حداقل نیروی شیفت شب رعایت نشده: نقض سطح بخش', () => {
  const entries = [entry(1, 'm'), entry(1, 'm')];
  const ward = buildWardFacts({ entries, shiftTypes: SHIFTS, jYear: 1405, jMonth: 7 });
  const vs = evaluateRules({ facts: [], configs: DEFAULT_RULE_CONFIGS, wardFacts: ward, minimums: { night: 1 } });
  assert.ok(vs.some(v => v.ruleType === 'min_staff_per_shift' && v.jDay === 1));
});

test('R-7 قاعدهٔ خاموش، نقض تولید نمی‌کند', () => {
  const off: RuleConfig[] = DEFAULT_RULE_CONFIGS.map(c => c.ruleType === 'max_consecutive_nights' ? { ...c, isEnabled: false } : c);
  const vs = evaluateRules({ facts: factsFor([entry(1, 'n'), entry(2, 'n'), entry(3, 'n')]), configs: off });
  assert.ok(!types(vs).includes('max_consecutive_nights'));
});

test('R-8 خروجی واقعی حل‌کننده (بخش داخلی، مهر) هیچ نقض سختی در شب/استراحت/روز متوالی ندارد', () => {
  const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1');
  const out = generateScheduleDeterministic({
    personnel: dep1, shiftTypes: MOCK_SHIFT_TYPES, currentSchedule: [], requests: [] as StaffRequest[],
    rules: DEFAULT_RULES, aiSettings: DEFAULT_AI_SETTINGS, globalSettings: DEFAULT_GLOBAL_SETTINGS, jYear: 1405, jMonth: 7,
  });
  const duty = new Map(dep1.map(p => [p.id, calculateDutyHours(p, DEFAULT_GLOBAL_SETTINGS, 0, 1405, 7)]));
  const facts = buildEmployeeFacts({ personnel: dep1, entries: out, shiftTypes: MOCK_SHIFT_TYPES, jYear: 1405, jMonth: 7, dutyHoursByEmployee: duty });
  const vs = evaluateRules({ facts, configs: DEFAULT_RULE_CONFIGS });
  const hardBad = vs.filter(v => v.severity === 'hard' && ['max_consecutive_nights', 'min_rest_hours'].includes(v.ruleType));
  assert.deepEqual(hardBad, []);
  const workWarn = vs.filter(v => v.ruleType === 'max_consecutive_work_days');
  assert.deepEqual(workWarn, []);
});
