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
import { DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../../src/core/defaults';
import { jalaliToGregorian } from '../../src/core/jalali';

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
