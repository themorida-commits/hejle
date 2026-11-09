// دور ۱۱: نیاز روزانهٔ بخش، ورودی مستقیم سرپرستار در جدول برنامه.
// سه ردیف «تعداد صبح/عصر/شب (نیاز بخش)» از نمایش ثابتِ تنظیمات به آرایه‌های
// per-day تبدیل شدند؛ این تست‌ها مدل داده و اتصالش به حل‌کننده را قفل می‌کنند.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDailyReqs, normalizeDailyReqs, hasAnyDailyReq, clampReqValue,
} from '../../src/features/roster/rosterModel';
import { generateScheduleDeterministic } from '../../src/core/scheduling/schedulerSolver';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import { DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS, holidaysFor } from '../../src/core/defaults';
import { jalaliToGregorian, getDaysInJalaliMonth, getPersianDayOfWeek } from '../../src/core/jalali';
import { calculateDutyHours, calculateShiftHoursDetailed } from '../../src/core/duty';
import type { ScheduleEntry } from '../../src/core/types';

const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1');
const gdate = (jd: number) => {
  const [gy, gm, gd] = jalaliToGregorian(1405, 7, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
};

test('DR-1 ساخت از سه‌تایی تنظیمات: هر سه آرایه به طول ماه و با همان مقدار پر می‌شود', () => {
  const r = buildDailyReqs({ morning: 3, evening: 2, night: 2 }, 30);
  assert.equal(r.morning.length, 30);
  assert.ok(r.morning.every(v => v === 3));
  assert.ok(r.evening.every(v => v === 2));
  assert.ok(r.night.every(v => v === 2));
  assert.equal(clampReqValue(2.9), 2);
  assert.equal(clampReqValue(-4), 0);
  assert.equal(clampReqValue(450), 99);
  assert.equal(clampReqValue('x'), 0);
});

test('DR-2 نرمال‌سازی ذخیره‌شده: آرایهٔ ذخیره‌شده مقدم است، خانهٔ خراب/گمشده از پیش‌فرض پر می‌شود', () => {
  const stored = { morning: [5, 5, -3, 'x', 4], night: [1] };
  const r = normalizeDailyReqs(stored, 30, { morning: 3, evening: 2, night: 2 });
  assert.deepEqual(r.morning.slice(0, 5), [5, 5, 0, 0, 4]);
  assert.equal(r.morning[5], 3); // بعد از طول ذخیره‌شده، پیش‌فرض
  assert.equal(r.morning.length, 30);
  assert.deepEqual(r.night.slice(0, 3), [1, 2, 2]);
  assert.ok(r.evening.every(v => v === 2)); // شیفتِ غایب در ذخیره = پیش‌فرض کامل
  const fromNull = normalizeDailyReqs(null, 30, { morning: 3, evening: 2, night: 2 });
  assert.deepEqual(fromNull, buildDailyReqs({ morning: 3, evening: 2, night: 2 }, 30));
});

test('DR-3 همه‌صفر یعنی «عددی وارد نشده» تا منطق پیش‌فرض حل‌کننده تصمیم بگیرد', () => {
  assert.equal(hasAnyDailyReq(buildDailyReqs({ morning: 0, evening: 0, night: 0 }, 30)), false);
  const r = buildDailyReqs({ morning: 0, evening: 0, night: 0 }, 30);
  r.night[10] = 1;
  assert.equal(hasAnyDailyReq(r), true);
});

test('DR-4 حل‌کننده با نیاز per-day دقیقاً همان تعدادها را می‌چیند (یک روز متفاوت)', () => {
  const reqs = buildDailyReqs({ morning: 5, evening: 3, night: 2 }, 30);
  reqs.morning[11] = 4; // روز ۱۲ مهر: صبح یکی کمتر
  const out = generateScheduleDeterministic({
    personnel: dep1, shiftTypes: MOCK_SHIFT_TYPES, currentSchedule: [], requests: [],
    rules: DEFAULT_RULES, aiSettings: DEFAULT_AI_SETTINGS,
    globalSettings: DEFAULT_GLOBAL_SETTINGS, dailyReqs: reqs, jYear: 1405, jMonth: 7,
  });
  for (let d = 1; d <= 30; d++) {
    const day = out.filter(e => e.date === gdate(d));
    assert.equal(day.filter(e => e.shiftTypeId === 's-m').length, d === 12 ? 4 : 5, `صبح روز ${d}`);
    assert.equal(day.filter(e => e.shiftTypeId === 's-e').length, 3, `عصر روز ${d}`);
    assert.equal(day.filter(e => e.shiftTypeId === 's-n').length, 2, `شب روز ${d}`);
  }
});

// ── دور ۲۱: کیفیت حل‌کننده روی مسیر نیاز سفارشی (اوراکل CP-SAT) ─────────────
// اسپایک و اوراکل CP-SAT نشان دادند روی همین ورودی‌ها (G1-8) حل‌کننده ۴ جفت
// عصر→صبحِ قابل‌اجتناب می‌ساخت (امتیاز ۵۱۶۰ در برابر ۳۹۶۰ CP-SAT با همان
// انحراف ساعت ۲۶۴) چون جریمهٔ نرمِ نامزدها (−۱۵۰) زیر فشار پوشش خنثی می‌شد.
// از دور ۲۱ این توالی در تولیدِ مسیر سفارشی سخت مسدود است (قرینهٔ ریکاوری شب).

const REQS_532 = { morning: Array(30).fill(5), evening: Array(30).fill(3), night: Array(30).fill(2) };

function solve532(extra: Partial<Parameters<typeof generateScheduleDeterministic>[0]> = {}) {
  return generateScheduleDeterministic({
    personnel: dep1, shiftTypes: MOCK_SHIFT_TYPES, currentSchedule: [], requests: [],
    rules: DEFAULT_RULES, aiSettings: DEFAULT_AI_SETTINGS,
    globalSettings: DEFAULT_GLOBAL_SETTINGS, dailyReqs: REQS_532, jYear: 1405, jMonth: 7,
    ...extra,
  });
}

function eveningMorningPairs(out: ScheduleEntry[]): Array<{ personnelId: string; day: number }> {
  const pairs: Array<{ personnelId: string; day: number }> = [];
  for (const p of dep1) {
    for (let d = 2; d <= 30; d++) {
      const prev = out.find(e => e.personnelId === p.id && e.date === gdate(d - 1));
      const cur = out.find(e => e.personnelId === p.id && e.date === gdate(d));
      if (prev?.shiftTypeId === 's-e' && cur?.shiftTypeId === 's-m' && !prev.isManualEntry && !cur.isManualEntry) {
        pairs.push({ personnelId: p.id, day: d });
      }
    }
  }
  return pairs;
}

// انحراف ساعت کل، دقیقاً با قرارداد checker.py اوراکل: Σ|موظفی − کارکرد| با
// ساعت‌های calculateShiftHoursDetailed و کسر تعطیلات (تعطیلِ غیرجمعه × ۶).
function totalHoursDeviation(out: ScheduleEntry[]): number {
  const daysInMonth = getDaysInJalaliMonth(1405, 7);
  const holidays = new Set(holidaysFor(1405, 7).map(h => h.day));
  let holidayCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const [gy, gm, gd] = jalaliToGregorian(1405, 7, d);
    if (getPersianDayOfWeek(gy, gm, gd) !== 'ج' && holidays.has(d)) holidayCount++;
  }
  const holidayDeduction = holidayCount * 6;
  let total = 0;
  for (const p of dep1) {
    const target = calculateDutyHours(p, DEFAULT_GLOBAL_SETTINGS, holidayDeduction, 1405, 7);
    let worked = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const [gy, gm, gd] = jalaliToGregorian(1405, 7, d);
      const entry = out.find(e => e.personnelId === p.id && e.date === gdate(d));
      const shift = MOCK_SHIFT_TYPES.find(s => s.id === entry?.shiftTypeId);
      if (shift) {
        worked += calculateShiftHoursDetailed(shift, getPersianDayOfWeek(gy, gm, gd) === 'ج', holidays.has(d));
      }
    }
    total += Math.abs(target - worked);
  }
  return total;
}

test('DR-5 مسیر سفارشی: صفر جفت عصر→صبحِ قابل‌اجتناب، پوشش کامل، انحراف ساعت در سطح CP-SAT', () => {
  const out = solve532();
  // پوشش دقیقاً برابر نیاز، بدون پسرفت نسبت به خروجی پیش از فیکس
  for (let d = 1; d <= 30; d++) {
    const day = out.filter(e => e.date === gdate(d));
    assert.equal(day.filter(e => e.shiftTypeId === 's-m').length, 5, `صبح روز ${d}`);
    assert.equal(day.filter(e => e.shiftTypeId === 's-e').length, 3, `عصر روز ${d}`);
    assert.equal(day.filter(e => e.shiftTypeId === 's-n').length, 2, `شب روز ${d}`);
  }
  // پیش از دور ۲۱: ۴ جفت (p5 روز ۱۶، p7 روز ۷، p12 روز ۱۹، p14 روز ۱۰)
  assert.deepEqual(eveningMorningPairs(out), []);
  // CP-SAT روی همین فیكسچر: انحراف ۲۶۴ با صفر نقض؛ ما هم همان‌جا یا بهتر
  assert.ok(totalHoursDeviation(out) <= 264, `انحراف ساعت ${totalHoursDeviation(out)} > ۲۶۴`);
});

test('DR-6 قفل دستی بر بلوک عصر→صبح مقدم است: جفتِ قفل‌شده عیناً می‌ماند', () => {
  const locks: ScheduleEntry[] = [
    { personnelId: 'p3', shiftTypeId: 's-e', date: gdate(5), isManualEntry: true },
    { personnelId: 'p3', shiftTypeId: 's-m', date: gdate(6), isManualEntry: true },
  ];
  const out = solve532({ currentSchedule: locks });
  const e5 = out.find(e => e.personnelId === 'p3' && e.date === gdate(5));
  const m6 = out.find(e => e.personnelId === 'p3' && e.date === gdate(6));
  assert.equal(e5?.shiftTypeId, 's-e');
  assert.equal(m6?.shiftTypeId, 's-m');
  assert.equal(e5?.isManualEntry, true);
  assert.equal(m6?.isManualEntry, true);
  // و به‌جز همین جفتِ اجباری، هیچ جفت تولیدیِ دیگری ساخته نشده است
  assert.deepEqual(eveningMorningPairs(out), []);
});
