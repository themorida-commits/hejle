// ─────────────────────────────────────────────────────────────────────────────
// تست‌های طلایی (Golden) هستهٔ حجله — گیت G1 از اسپک فاز ۰+۱ (NUR-DR-2026-002)
//
// هدف: رفتار فعلی حل‌کنندهٔ قطعی، آشکارساز تعارض و ابزارهای جلالی/موظفی را
// قفل کند تا در بازنویسی پوسته و لایهٔ داده (فاز ۰) هر رگرسیونی بلافاصله
// دیده شود. هش‌ها از اجرای واقعی حل‌کننده روی دادهٔ نمونهٔ خود پروژه
// (constants.ts) در ۳ نوامبر ۲۰۲۶ گرفته شده‌اند — نه از حدس.
//
// اجرا:  npm run test:golden
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { generateScheduleDeterministic } from '../../src/core/scheduling/schedulerSolver';
import { detectConflicts } from '../../src/core/scheduling/conflictDetector';
import {
  MOCK_PERSONNEL,
  MOCK_SHIFT_TYPES,
} from '../../src/fixtures/sampleData';
import {
  DEFAULT_RULES,
  DEFAULT_AI_SETTINGS,
  DEFAULT_GLOBAL_SETTINGS,
} from '../../src/core/defaults';
import {
  jalaliToGregorian,
  getDaysInJalaliMonth,
} from '../../src/core/jalali';
import { calculateDutyHours } from '../../src/core/duty';
import type { ScheduleEntry, StaffRequest } from '../../src/core/types';

// ── ابزارها ──────────────────────────────────────────────────────────────────

function scheduleHash(entries: ScheduleEntry[]): string {
  const canonical = [...entries]
    .sort((a, b) => (a.personnelId + a.date).localeCompare(b.personnelId + b.date))
    .map(e => `${e.personnelId}|${e.date}|${e.shiftTypeId}|${e.isManualEntry ? 1 : 0}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

function gdate(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

function shiftOn(entries: ScheduleEntry[], personnelId: string, jy: number, jm: number, jd: number): string | undefined {
  const date = gdate(jy, jm, jd);
  return entries.find(e => e.personnelId === personnelId && e.date === date)?.shiftTypeId;
}

const baseParams = {
  shiftTypes: MOCK_SHIFT_TYPES,
  currentSchedule: [] as ScheduleEntry[],
  requests: [] as StaffRequest[],
  rules: DEFAULT_RULES,
  aiSettings: DEFAULT_AI_SETTINGS,
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
};

const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1'); // ۱۴ نفر — بخش داخلی

// ── سناریوهای طلایی حل‌کننده ────────────────────────────────────────────────

test('G1-1 قطعیت: اجرای دوباره با ورودی یکسان، خروجی کاملاً یکسان می‌دهد', () => {
  const a = generateScheduleDeterministic({ ...baseParams, personnel: dep1, jYear: 1405, jMonth: 7 });
  const b = generateScheduleDeterministic({ ...baseParams, personnel: dep1, jYear: 1405, jMonth: 7 });
  assert.deepEqual(a, b);
});

test('G1-2 اسنپ‌شات طلایی: بخش داخلی (۱۴ نفر)، مهر ۱۴۰۵', () => {
  const out = generateScheduleDeterministic({ ...baseParams, personnel: dep1, jYear: 1405, jMonth: 7 });
  assert.equal(out.length, 14 * 30);
  assert.equal(scheduleHash(out), '9d390ab1974812343b74b393f12e73cca4bf5342a5bf47479cdd190faa2f52b1');
});

test('G1-3 اسنپ‌شات طلایی: بخش داخلی، فروردین ۱۴۰۵ (مسیر تعطیلات رسمی و کسر موظفی)', () => {
  const out = generateScheduleDeterministic({ ...baseParams, personnel: dep1, jYear: 1405, jMonth: 1 });
  assert.equal(out.length, 14 * 31);
  // هش ۲۰۲۶-۱۱-۰۷ دوباره برکت داده شد: فهرست تعطیلات ۱۴۰۵ کامل شد (۲۵ فروردین،
  // شهادت امام صادق، از تقویم رسمی کشور اضافه شد) — تغییر رفتار عمدی و مستند است.
  assert.equal(scheduleHash(out), 'eec659bf0d771168666bba7273bfcc70daac2ec41b40f97adab862c010e1d341');
  // سرپرستار در تعطیلات رسمی فروردین (۱ تا ۴، ۱۲، ۱۳ و ۲۵) باید آف باشد
  for (const d of [1, 2, 3, 4, 12, 13, 25]) {
    assert.equal(shiftOn(out, 'p1', 1405, 1, d), 's-off', `روز ${d} فروردین`);
  }
});

test('G1-4 اسنپ‌شات طلایی: کل نمونهٔ پروژه (۴۲ نفر)، مهر ۱۴۰۵', () => {
  const out = generateScheduleDeterministic({ ...baseParams, personnel: MOCK_PERSONNEL, jYear: 1405, jMonth: 7 });
  assert.equal(out.length, 42 * 30);
  assert.equal(scheduleHash(out), '2fc11f35d87786e451a65efbdd37ab1b312655a739331bd046cf79901d47786e');
});

test('G1-5 مرخصی: روزهای مرخصی دقیقاً آف می‌شوند و بقیهٔ برنامه پایدار می‌ماند', () => {
  const requests: StaffRequest[] = [10, 11, 12].map((d, i) => ({
    id: `lv${i}`, personnelId: 'p2', date: gdate(1405, 7, d), requestType: 'Leave' as const,
  }));
  const out = generateScheduleDeterministic({ ...baseParams, personnel: dep1, requests, jYear: 1405, jMonth: 7 });
  for (const d of [10, 11, 12]) {
    assert.equal(shiftOn(out, 'p2', 1405, 7, d), 's-off', `روز ${d} مهر`);
  }
  assert.equal(scheduleHash(out), '367d5c6d4d02123b197ac9a780e855aab9ae6960dd2d9e0e684701da46ee898d');
});

test('G1-6 قفل دستی: تخصیص‌های دستی کاربر عیناً حفظ می‌شوند', () => {
  const locks: ScheduleEntry[] = [
    { personnelId: 'p3', shiftTypeId: 's-n', date: gdate(1405, 7, 5), isManualEntry: true },
    { personnelId: 'p3', shiftTypeId: 's-m', date: gdate(1405, 7, 6), isManualEntry: true },
  ];
  const out = generateScheduleDeterministic({ ...baseParams, personnel: dep1, currentSchedule: locks, jYear: 1405, jMonth: 7 });
  assert.equal(shiftOn(out, 'p3', 1405, 7, 5), 's-n');
  assert.equal(shiftOn(out, 'p3', 1405, 7, 6), 's-m');
  // دور ۱۵: خروجی حل‌کننده برای خانه‌های قفل‌شده isManualEntry را حفظ می‌کند
  // (قبلاً پرچم دستی در خروجی می‌افتاد)؛ تخصیص‌ها نسبت به هش قبلی بی‌تغییرند —
  // با هشِ بدون پرچم روی هر دو نسخهٔ حل‌کننده راستی‌آزمایی شد (f9f2386f…).
  assert.equal(scheduleHash(out), 'bef0e789528cec6b61f7157dce45546b0c8673a8be4dba4bd0be2e782ab92aba');
});

test('G1-7 درخواست شیفت ترجیحی رعایت می‌شود', () => {
  const requests: StaffRequest[] = [{
    id: 'pf1', personnelId: 'p4', date: gdate(1405, 7, 8),
    requestType: 'Preferred Shift', preferredShiftId: 's-m',
  }];
  const out = generateScheduleDeterministic({ ...baseParams, personnel: dep1, requests, jYear: 1405, jMonth: 7 });
  assert.equal(shiftOn(out, 'p4', 1405, 7, 8), 's-m');
  assert.equal(scheduleHash(out), '78afef34708455bd1116ce53453113580041b34dbd4ec0e42ae63465b8111702');
});

test('G1-8 نیاز روزانهٔ سفارشی: شمارش هر روز دقیقاً برابر نیاز اعلامی است', () => {
  const dailyReqs = { morning: Array(30).fill(5), evening: Array(30).fill(3), night: Array(30).fill(2) };
  const out = generateScheduleDeterministic({ ...baseParams, personnel: dep1, dailyReqs, jYear: 1405, jMonth: 7 });
  for (let d = 1; d <= 30; d++) {
    const day = out.filter(e => e.date === gdate(1405, 7, d));
    assert.equal(day.filter(e => e.shiftTypeId === 's-m').length, 5, `صبح روز ${d}`);
    assert.equal(day.filter(e => e.shiftTypeId === 's-e').length, 3, `عصر روز ${d}`);
    assert.equal(day.filter(e => e.shiftTypeId === 's-n').length, 2, `شب روز ${d}`);
  }
  assert.equal(scheduleHash(out), 'fecbaa52db3ef81944b66aa96d0b143b7d20df33b90cdef3168a6e2729cb8ce7');
});

// ── ناورداها (Invariants) روی خروجی واقعی حل‌کننده ────────────────────────────

function assertInvariants(entries: ScheduleEntry[], personnel: typeof dep1, jy: number, jm: number, days: number) {
  for (const p of personnel) {
    let consecutiveNights = 0;
    for (let d = 1; d <= days; d++) {
      const s = shiftOn(entries, p.id, jy, jm, d);
      // شب‌کاری متوالی حداکثر ۲ (قاعدهٔ پیش‌فرض پروژه)
      if (s === 's-n') {
        consecutiveNights++;
        assert.ok(consecutiveNights <= 2, `${p.id} روز ${d}: بیش از ۲ شب متوالی`);
      } else consecutiveNights = 0;
      if (d > 1) {
        const prev = shiftOn(entries, p.id, jy, jm, d - 1);
        // ریکاوری: بعد از شیفت شب، روز بعد حتماً آف
        if (prev === 's-n') assert.equal(s, 's-off', `${p.id} روز ${d}: نقض ریکاوری شب`);
        // توالی عصر ← صبح ممنوع
        assert.ok(!(prev === 's-e' && s === 's-m'), `${p.id} روز ${d}: توالی عصر-صبح`);
      }
      // سرپرستار: جمعه‌ها آف، روزهای عادی فقط صبح یا آف
      if (p.role.includes('سرپرستار')) {
        const [gy, gm, gd] = jalaliToGregorian(jy, jm, d);
        const isFriday = new Date(gy, gm - 1, gd).getDay() === 5;
        if (isFriday) assert.equal(s, 's-off', `${p.id} روز ${d}: سرپرستار در جمعه نباید شیفت داشته باشد`);
        else assert.ok(s === 's-m' || s === 's-off', `${p.id} روز ${d}: سرپرستار در روز عادی فقط صبح/آف`);
      }
    }
  }
}

test('G1-9 ناورداهای قواعد روی خروجی مهر و فروردین برقرارند', () => {
  const mehr = generateScheduleDeterministic({ ...baseParams, personnel: dep1, jYear: 1405, jMonth: 7 });
  assertInvariants(mehr, dep1, 1405, 7, 30);
  const farvardin = generateScheduleDeterministic({ ...baseParams, personnel: dep1, jYear: 1405, jMonth: 1 });
  assertInvariants(farvardin, dep1, 1405, 1, 31);
});

test('G1-10 آشکارساز تعارض روی خروجی سالم حل‌کننده هیچ تعارضی گزارش نمی‌کند', () => {
  const out = generateScheduleDeterministic({ ...baseParams, personnel: dep1, jYear: 1405, jMonth: 7 });
  const { cellConflicts, dayConflicts } = detectConflicts(out, dep1, MOCK_SHIFT_TYPES, DEFAULT_RULES, [], 1405, 7);
  assert.equal(cellConflicts.size, 0);
  assert.equal(dayConflicts.size, 0);
});

test('G1-11 آشکارساز تعارض، نقض کاشته‌شده را می‌گیرد (ریکاوری + مرخصی)', () => {
  const planted: ScheduleEntry[] = [
    { personnelId: 'p2', shiftTypeId: 's-n', date: gdate(1405, 7, 3), isManualEntry: true },
    { personnelId: 'p2', shiftTypeId: 's-m', date: gdate(1405, 7, 4), isManualEntry: true }, // نقض ریکاوری
    { personnelId: 'p5', shiftTypeId: 's-m', date: gdate(1405, 7, 9), isManualEntry: true }, // مغایر مرخصی
  ];
  const requests: StaffRequest[] = [{
    id: 'lvx', personnelId: 'p5', date: gdate(1405, 7, 9), requestType: 'Leave' as const,
  }];
  const { cellConflicts } = detectConflicts(planted, dep1, MOCK_SHIFT_TYPES, DEFAULT_RULES, requests, 1405, 7);
  const recovery = cellConflicts.get(`p2-${gdate(1405, 7, 4)}`) ?? [];
  assert.ok(recovery.some(m => m.includes('ریکاوری')), 'پیام ریکاوری باید ثبت شود');
  const leave = cellConflicts.get(`p5-${gdate(1405, 7, 9)}`) ?? [];
  assert.ok(leave.some(m => m.includes('مرخصی')), 'پیام مغایرت مرخصی باید ثبت شود');
});

// ── ابزارهای جلالی و موظفی ────────────────────────────────────────────────────

test('G1-12 تبدیل جلالی به میلادی — مقادیر شناخته‌شده', () => {
  assert.deepEqual(jalaliToGregorian(1405, 1, 1), [2026, 3, 21]); // نوروز ۱۴۰۵
  assert.deepEqual(jalaliToGregorian(1405, 7, 1), [2026, 9, 23]); // اول مهر ۱۴۰۵
});

test('G1-13 طول ماه‌های جلالی و کبیسه', () => {
  assert.equal(getDaysInJalaliMonth(1405, 1), 31);
  assert.equal(getDaysInJalaliMonth(1405, 7), 30);
  assert.equal(getDaysInJalaliMonth(1403, 12), 30); // ۱۴۰۳ کبیسه
  assert.equal(getDaysInJalaliMonth(1405, 12), 29); // ۱۴۰۵ کبیسه نیست
});

test('G1-14 محاسبهٔ ساعت موظفی: پایه + کسر سابقه − کسر تعطیلات', () => {
  const p2 = MOCK_PERSONNEL.find(p => p.id === 'p2')!; // رسمی، شروع ۱۳۹۲/۰۵ → تا مهر ۱۴۰۵: ۱۵۸ ماه → کسر ۵ ساعت
  assert.equal(calculateDutyHours(p2, DEFAULT_GLOBAL_SETTINGS, 0, 1405, 7), 176 - 5);
  assert.equal(calculateDutyHours(p2, DEFAULT_GLOBAL_SETTINGS, 36, 1405, 7), 176 - 5 - 36);
  // baseDutyHours صریح، همهٔ فرمول را کنار می‌زند (جز کسر تعطیلات)
  const custom = { ...p2, baseDutyHours: 150 };
  assert.equal(calculateDutyHours(custom, DEFAULT_GLOBAL_SETTINGS, 12, 1405, 7), 150 - 12);
});
