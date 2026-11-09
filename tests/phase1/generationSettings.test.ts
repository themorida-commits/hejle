// دور ۱۵: چرخهٔ نسخهٔ قدیمی — سرپرستار اول خانه‌ها و گزینه‌ها را پر می‌کند،
// تولید خودکار از روی همان‌ها ادامه می‌دهد. این تست‌ها سه قرارداد را قفل می‌کنند:
// (۱) خانهٔ دستی در تولید حفظ و در خروجی هم دستی می‌ماند؛ (۲) تنظیمات پیشرفتهٔ
// تولید (توزیع/آخر هفته/استراحت) واقعاً روی خروجی اثر می‌گذارند و در پیش‌فرض
// رفتار قبلی عوض نمی‌شود؛ (۳) رنگ متن چیپ شیفت روی هر رنگی خواناست.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateScheduleDeterministic } from '../../src/core/scheduling/schedulerSolver';
import { contrastTextColor } from '../../src/features/roster/rosterModel';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import { DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../../src/core/defaults';
import { jalaliToGregorian, getPersianDayOfWeek } from '../../src/core/jalali';
import type { AiGenerationSettings, Personnel } from '../../src/core/types';

const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1');
const gdate = (jd: number) => {
  const [gy, gm, gd] = jalaliToGregorian(1405, 7, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
};
const gen = (over: Partial<Parameters<typeof generateScheduleDeterministic>[0]>) =>
  generateScheduleDeterministic({
    personnel: dep1, shiftTypes: MOCK_SHIFT_TYPES, currentSchedule: [], requests: [],
    rules: DEFAULT_RULES, aiSettings: DEFAULT_AI_SETTINGS,
    globalSettings: DEFAULT_GLOBAL_SETTINGS, jYear: 1405, jMonth: 7, ...over,
  });
const withSettings = (patch: Partial<AiGenerationSettings>): AiGenerationSettings => ({ ...DEFAULT_AI_SETTINGS, ...patch });

test('GS-1 خانهٔ دستیِ ازپیش‌پرشده در تولید حفظ می‌شود و در خروجی دستی می‌ماند', () => {
  const manual = [{ personnelId: 'p2', shiftTypeId: 's-e', date: gdate(5), isManualEntry: true }];
  const out = gen({ currentSchedule: manual });
  const cell = out.find(e => e.personnelId === 'p2' && e.date === gdate(5));
  assert.equal(cell?.shiftTypeId, 's-e');
  assert.equal(cell?.isManualEntry, true);
  // بقیهٔ ماه هم کامل پر شده است
  assert.equal(out.length, dep1.length * 30);
  assert.ok(out.every(e => e.shiftTypeId !== ''));
  const generated = out.find(e => e.personnelId === 'p2' && e.date === gdate(6));
  assert.equal(generated?.isManualEntry, false);
});

// فیکسچر ارشدیت: ۱۲ نفر همسان جز سنوات. سنجه «ساعت» است نه «روز»، چون اولویت
// ارشدیت در این حل‌کننده یعنی جذب شیفت‌های بلند (شب ۱۲ ساعته) — روزهای کاری
// ارشد کمتر ولی ساعاتش بیشتر می‌شود؛ و با تیم کوچک، قفل موقعیتیِ ترتیب تخصیص
// (شب←عصر←صبح) روی نتیجهٔ فردی غلبه می‌کند، پس گروهی می‌سنجیم.
const seniorityClones = (): Personnel[] => {
  const base = MOCK_PERSONNEL.find(p => p.id === 'p2')!;
  return [20, 18, 16, 14, 12, 10, 8, 6, 4, 3, 2, 1].map((lvl, i) => ({
    ...base, id: `c${i}`, name: `نفر ${i}`, personnelCode: `C-${i}`, seniorityLevel: lvl,
  }));
};
const hoursOf = (out: ReturnType<typeof gen>, ids: string[]) =>
  out.filter(e => ids.includes(e.personnelId)).reduce(
    (sum, e) => sum + (MOCK_SHIFT_TYPES.find(s => s.id === e.shiftTypeId)?.calculatedValue ?? 0), 0);

test('GS-2 الگوریتم «اولویت با ارشدیت»: سهم ساعت ارشدها نسبت به حالت یکنواخت بالا می‌رود', () => {
  const clones = seniorityClones();
  const top = clones.slice(0, 4).map(c => c.id);
  const bottom = clones.slice(8).map(c => c.id);
  const even = gen({ personnel: clones });
  const senior = gen({ personnel: clones, aiSettings: withSettings({ distributionAlgorithm: 'seniority' }) });
  assert.ok(hoursOf(senior, top) > hoursOf(even, top), `senior-top=${hoursOf(senior, top)} even-top=${hoursOf(even, top)}`);
  assert.ok(hoursOf(senior, top) > hoursOf(senior, bottom), `top=${hoursOf(senior, top)} bottom=${hoursOf(senior, bottom)}`);
});

test('GS-3 توزیع آخر هفته با ارشدیت: ساعت جمعهٔ ارشدها نسبت به حالت یکنواخت بالا می‌رود', () => {
  const clones = seniorityClones();
  const top = clones.slice(0, 4).map(c => c.id);
  const bottom = clones.slice(8).map(c => c.id);
  const fridays = new Set<string>();
  for (let d = 1; d <= 30; d++) {
    const [gy, gm, gd] = jalaliToGregorian(1405, 7, d);
    if (getPersianDayOfWeek(gy, gm, gd) === 'ج') fridays.add(gdate(d));
  }
  assert.ok(fridays.size >= 4);
  const friHours = (out: ReturnType<typeof gen>, ids: string[]) =>
    out.filter(e => ids.includes(e.personnelId) && fridays.has(e.date)).reduce(
      (sum, e) => sum + (MOCK_SHIFT_TYPES.find(s => s.id === e.shiftTypeId)?.calculatedValue ?? 0), 0);
  const even = gen({ personnel: clones });
  const senior = gen({ personnel: clones, aiSettings: withSettings({ weekendDistribution: 'seniority' }) });
  assert.ok(friHours(senior, top) > friHours(even, top), `senior=${friHours(senior, top)} even=${friHours(even, top)}`);
  assert.ok(friHours(senior, top) > friHours(senior, bottom), `top=${friHours(senior, top)} bottom=${friHours(senior, bottom)}`);
});

test('GS-4 حداقل استراحت ۵۰ ساعت پس از شبِ قفل‌شده: صبحِ روز سوم ممنوع می‌شود', () => {
  const manual = [{ personnelId: 'p2', shiftTypeId: 's-n', date: gdate(1), isManualEntry: true }];
  const out = gen({ currentSchedule: manual, aiSettings: withSettings({ minRestHours: 50 }) });
  const day3 = out.find(e => e.personnelId === 'p2' && e.date === gdate(3));
  // پایان شب روز ۱ = ۷ صبح روز ۲؛ صبح روز ۳ فقط ۴۸ ساعت فاصله دارد (< ۵۰)
  assert.notEqual(day3?.shiftTypeId, 's-m');
});

test('GS-5 توزیع تصادفی: خروجی کامل و قطعی (دو اجرا یکسان)', () => {
  const a = gen({ aiSettings: withSettings({ distributionAlgorithm: 'random' }) });
  const b = gen({ aiSettings: withSettings({ distributionAlgorithm: 'random' }) });
  assert.deepEqual(
    a.map(e => `${e.personnelId}|${e.date}|${e.shiftTypeId}`),
    b.map(e => `${e.personnelId}|${e.date}|${e.shiftTypeId}`),
  );
  assert.ok(a.every(e => e.shiftTypeId !== ''));
});

test('GS-6 رنگ متن چیپ: روی زرد/سبز روشن متن تیره، روی آبی تیره متن سفید', () => {
  assert.equal(contrastTextColor('#fbbf24'), '#0f172a');
  assert.equal(contrastTextColor('#34d399'), '#0f172a');
  assert.equal(contrastTextColor('#e2e8f0'), '#0f172a');
  assert.equal(contrastTextColor('#1e3a8a'), '#fff');
  assert.equal(contrastTextColor('#ec4899'), '#fff');
  assert.equal(contrastTextColor(undefined), '#fff');
});
