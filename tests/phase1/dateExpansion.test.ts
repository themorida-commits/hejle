// @ts-nocheck
/**
 * رگرسیون منطقهٔ زمانی (پیداشده ۲۰۲۶-۱۱-۰۷): بسط بازهٔ تاریخ با Date محلی +
 * toISOString در منطقه‌های جلوتر از UTC یک روز عقب می‌افتاد. این تست‌ها باید
 * زیر هر TZ (از جمله Asia/Tehran) سبز بمانند — گیت مک با TZ=Asia/Tehran اجرا شود.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveDaysInRange } from '../../src/features/leave/leaveService';

test('D1: روزهای بازه دقیقاً همان رشته‌های ورودی‌اند — بدون شیفت منطقهٔ زمانی', () => {
  assert.deepEqual(leaveDaysInRange('2026-09-25', '2026-09-27'),
    ['2026-09-25', '2026-09-26', '2026-09-27']);
  assert.deepEqual(leaveDaysInRange('2026-09-25', '2026-09-25'), ['2026-09-25']);
  // عبور از مرز ماه و سال هم باید دقیق بماند
  assert.deepEqual(leaveDaysInRange('2026-12-31', '2027-01-02'),
    ['2026-12-31', '2027-01-01', '2027-01-02']);
});
