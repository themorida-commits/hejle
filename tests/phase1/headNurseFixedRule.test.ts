// قانون ثابت جدول برنامهٔ شیفت (تصمیم سعید، ۲۰۲۶-۱۱-۰۸):
// سرپرستار فقط شیفت صبح دارد. این قانون به فعال‌بودن رکورد قاعده وابسته نیست
// و در تولید خودکار، آشکارسازی تعارض، ویرایش دستی و جابه‌جایی اعمال می‌شود.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateScheduleDeterministic } from '../../src/core/scheduling/schedulerSolver';
import { detectConflicts } from '../../src/core/scheduling/conflictDetector';
import { nextManualShiftId } from '../../src/features/roster/rosterModel';
import { createSwap, acceptSwap, approveSwap } from '../../src/features/swaps/swapService';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import { DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS, holidaysFor } from '../../src/core/defaults';
import { jalaliToGregorian, getPersianDayOfWeek } from '../../src/core/jalali';
import { isoFromJalali } from '../../src/features/leave/leaveService';
import type { ScheduleEntry } from '../../src/core/types';

const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1');
const headNurse = dep1.find(p => p.role.includes('سرپرستار'))!;
const nurse = dep1.find(p => p.id !== headNurse.id)!;
const disabledRules = DEFAULT_RULES.map(r =>
  r.type === 'head_nurse_morning' ? { ...r, isEnabled: false } : r,
);
const gdate = (jd: number) => {
  const [gy, gm, gd] = jalaliToGregorian(1405, 7, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
};

test('HN-1 حل‌کننده حتی با قاعدهٔ غیرفعال هم به سرپرستار عصر/شب نمی‌دهد', () => {
  const out = generateScheduleDeterministic({
    personnel: dep1, shiftTypes: MOCK_SHIFT_TYPES, currentSchedule: [], requests: [],
    rules: disabledRules, aiSettings: DEFAULT_AI_SETTINGS,
    globalSettings: DEFAULT_GLOBAL_SETTINGS, jYear: 1405, jMonth: 7,
  });
  const holidays = new Set(holidaysFor(1405, 7).map(h => h.day));
  const mine = out.filter(e => e.personnelId === headNurse.id);
  assert.equal(mine.length, 30);
  mine.forEach((entry, idx) => {
    const day = idx + 1;
    const [gy, gm, gd] = jalaliToGregorian(1405, 7, day);
    const isRestDay = getPersianDayOfWeek(gy, gm, gd) === 'ج' || holidays.has(day);
    if (isRestDay) assert.equal(entry.shiftTypeId, 's-off', `روز ${day}: سرپرستار در روز استراحت باید آف باشد`);
    else assert.ok(entry.shiftTypeId === 's-m' || entry.shiftTypeId === 's-off', `روز ${day}: فقط صبح/آف مجاز است، نه ${entry.shiftTypeId}`);
  });
});

test('HN-2 آشکارساز تعارض، عصرِ سرپرستار را حتی با قاعدهٔ غیرفعال خطای قانون ثابت می‌گیرد', () => {
  const planted: ScheduleEntry[] = [
    { personnelId: headNurse.id, shiftTypeId: 's-e', date: gdate(11), isManualEntry: true },
  ];
  const { cellConflicts } = detectConflicts(planted, dep1, MOCK_SHIFT_TYPES, disabledRules, [], 1405, 7);
  const messages = cellConflicts.get(`${headNurse.id}-${gdate(11)}`) ?? [];
  assert.ok(messages.some(m => m.includes('[خطا]') && m.includes('قانون ثابت: سرپرستار فقط شیفت صبح دارد')), messages.join(' | '));
});

test('HN-3 چرخهٔ ویرایش دستی سرپرستار فقط صبح و آف است', () => {
  assert.equal(nextManualShiftId('سرپرستار', 's-m'), 's-off');
  assert.equal(nextManualShiftId('سرپرستار', 's-off'), 's-m');
  assert.equal(nextManualShiftId('سرپرستار', 's-e'), 's-m'); // مقدار نامعتبر قبلی هم به صبح برمی‌گردد
  assert.equal(nextManualShiftId('پرستار', 's-m'), 's-e');
  assert.equal(nextManualShiftId('پرستار', 's-n'), 's-off');
});

test('HN-4 جابه‌جایی‌ای که به سرپرستار عصر/شب برساند از ساخت و تأیید رد می‌شود', () => {
  const dateISO = isoFromJalali(1405, 7, 11);
  const entries: ScheduleEntry[] = [
    { personnelId: headNurse.id, shiftTypeId: 's-m', date: dateISO, isManualEntry: false },
    { personnelId: nurse.id, shiftTypeId: 's-e', date: dateISO, isManualEntry: false },
  ];
  const guard = { personnel: dep1, shiftTypes: MOCK_SHIFT_TYPES };
  const created = createSwap({
    id: 'sw-hn', fromEmployeeId: nurse.id, toEmployeeId: headNurse.id,
    dateISO, entries, ...guard,
  });
  assert.equal(created.ok, false);
  if (!created.ok) assert.ok(created.error.includes('قانون ثابت'));

  // مسیر قدیمیِ بدون نگهبان ساخته شده باشد هم در لحظهٔ تأیید متوقف می‌شود.
  const legacy = createSwap({ id: 'sw-hn-legacy', fromEmployeeId: nurse.id, toEmployeeId: headNurse.id, dateISO, entries });
  assert.equal(legacy.ok, true);
  if (!legacy.ok) return;
  const accepted = acceptSwap(legacy.swap, headNurse.id);
  assert.ok(!('error' in accepted));
  if ('error' in accepted) return;
  const third = dep1.find(p => p.id !== headNurse.id && p.id !== nurse.id)!;
  const approved = approveSwap(accepted, entries, third.id, guard);
  assert.equal(approved.ok, false);
  if (!approved.ok) assert.ok(approved.error.includes('قانون ثابت'));
});
