import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFa, rankEntries, scoreMatch } from '../../src/features/oversight/paletteSearch';

// پالت فرمان (دور ۲۴): تطبیق فارسی باید با خطاهای رایج تایپ کنار بیاید — ي/ك
// عربیِ صفحه‌کلیدهای موبایل و نیم‌فاصله نباید جست‌وجو را کور کند.
test('PS-1: نرمال‌سازی — ي/ك عربی و نیم‌فاصله یکی می‌شوند', () => {
  assert.equal(normalizeFa('كارانهٔ پرستاري'), 'کارانهٔ پرستاری');
  assert.equal(normalizeFa('مرخصی‌ها'), 'مرخصی ها');
});

test('PS-2: امتیاز — دقیق بالاتر از پیشوندی، پیشوندی بالاتر از شامل، بی‌ربط ‎-1‎', () => {
  assert.equal(scoreMatch('کارانه', 'کارانه'), 100);
  assert.ok(scoreMatch('کار', 'کارانه') > scoreMatch('کار', 'مرکز کارانه'));
  assert.equal(scoreMatch('xyz', 'کارانه'), -1);
});

test('PS-3: رتبه‌بندی — کوئری عربی‌خط هم عنوان فارسی را پیدا می‌کند', () => {
  const entries = [
    { title: 'برنامهٔ شیفت' },
    { title: 'کارانه' },
    { title: 'پرونده پرسنلی' },
  ];
  const ranked = rankEntries('كارانه', entries);
  assert.equal(ranked[0]!.title, 'کارانه');
  assert.equal(ranked.length, 1);
});

test('PS-4: کوئری خالی یعنی بدون فیلتر (نمایش پیش‌فرض پالت)', () => {
  const entries = [{ title: 'الف' }, { title: 'ب' }];
  assert.deepEqual(rankEntries('', entries), entries);
});
