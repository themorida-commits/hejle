import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageForDay } from '../../src/features/roster/coverage';
import type { DailyReqs } from '../../src/features/roster/rosterModel';

// نوار پوشش گرید (دور ۲۳): نیاز در برابر تخصیص برای روز متمرکز؛ نیاز صفر
// «ثبت‌نشده» است، نه کمبود — وگرنه نوار از روز اول دروغ می‌گوید.

function reqs(m: number, e: number, n: number): DailyReqs {
  return {
    morning: Array(30).fill(m),
    evening: Array(30).fill(e),
    night: Array(30).fill(n),
  };
}
function counts(m: number, e: number, n: number) {
  return {
    morning: Array(30).fill(m),
    evening: Array(30).fill(e),
    night: Array(30).fill(n),
  };
}

test('CV-1: تخصیص برابر نیاز → exact در هر سه شیفت', () => {
  const out = coverageForDay(reqs(5, 4, 3), counts(5, 4, 3), 9);
  assert.ok(out.every(c => c.status === 'exact' && c.delta === 0));
});

test('CV-2: کمتر از نیاز → under با دلتا منفی؛ بیشتر → over', () => {
  const out = coverageForDay(reqs(5, 4, 3), counts(3, 6, 3), 0);
  assert.equal(out[0]!.status, 'under');
  assert.equal(out[0]!.delta, -2);
  assert.equal(out[1]!.status, 'over');
  assert.equal(out[1]!.delta, 2);
  assert.equal(out[2]!.status, 'exact');
});

test('CV-3: نیاز صفر → unset، حتی اگر تخصیص صفر نباشد', () => {
  const out = coverageForDay(reqs(0, 0, 0), counts(2, 0, 1), 4);
  assert.ok(out.every(c => c.status === 'unset'));
  assert.equal(out[0]!.actual, 2);
});

test('CV-4: روز خارج از بازهٔ آرایه‌ها صفر خوانده می‌شود و خطا نمی‌دهد', () => {
  const out = coverageForDay(reqs(1, 1, 1), counts(1, 1, 1), 45);
  assert.equal(out.length, 3);
  assert.ok(out.every(c => c.required === 0 && c.actual === 0 && c.status === 'unset'));
});
