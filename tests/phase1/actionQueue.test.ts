import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActionQueue } from '../../src/features/oversight/actionQueue';
import type { LeaveRequest } from '../../src/features/leave/leaveService';
import type { Credential } from '../../src/features/credentials/credentialService';

// صف اقدام داشبورد (دور ۲۳): ترتیب فوریت، شمارش درست، و حاضرشدن/نشدن هر آیتم
// دقیقاً در شرط خودش — داشبورد نباید عددی را نشان دهد که اقدامی پشتش نیست.

const nameOf = (id: string) => ({ e1: 'سارا رضایی', e2: 'مریم احمدی' })[id] ?? id;
const TODAY = '2026-11-19';

function leave(id: string, employeeId: string, startISO: string): LeaveRequest {
  return {
    id, employeeId, leaveTypeCode: 'annual', startISO, endISO: startISO,
    isHourly: false, hours: null, status: 'pending',
  };
}

const base = {
  hardViolations: 0,
  warnViolations: 0,
  pendingLeaves: [] as LeaveRequest[],
  pendingFinalSwaps: 0,
  scheduleStatus: 'published' as const,
  entriesCount: 120,
  credentials: [] as Credential[],
  nameOf,
  todayISO: TODAY,
};

test('AQ-1: هیچ مسئله‌ای نیست → صف خالی است', () => {
  assert.deepEqual(buildActionQueue(base), []);
});

test('AQ-2: نقض سخت قواعد، بحرانی و اول صف است', () => {
  const q = buildActionQueue({
    ...base, hardViolations: 3, warnViolations: 2,
    pendingLeaves: [leave('l1', 'e1', '2026-09-28')],
    pendingFinalSwaps: 1,
  });
  assert.equal(q[0]!.id, 'rule-violations');
  assert.equal(q[0]!.severity, 'critical');
  assert.equal(q[0]!.count, 3);
  assert.equal(q.at(-1)!.id, 'pending-swaps');
  assert.equal(q.at(-1)!.severity, 'info');
});

test('AQ-3: مرخصی در انتظار — شمارش و نزدیک‌ترین شروع در بافت', () => {
  const q = buildActionQueue({
    ...base,
    pendingLeaves: [leave('l2', 'e1', '2026-10-05'), leave('l1', 'e2', '2026-09-25')],
  });
  const item = q.find(i => i.id === 'pending-leaves')!;
  assert.equal(item.count, 2);
  assert.ok(item.context.includes('مریم احمدی'), 'بافت باید نام صاحب نزدیک‌ترین شروع را داشته باشد');
  assert.equal(item.href, '/leave');
});

test('AQ-4: برنامهٔ منتشرنشده فقط وقتی آیتم می‌شود که پیش‌نویسِ ساخته‌شده باشد', () => {
  const draft = buildActionQueue({ ...base, scheduleStatus: 'draft', entriesCount: 40 });
  assert.ok(draft.some(i => i.id === 'unpublished'));
  const draftEmpty = buildActionQueue({ ...base, scheduleStatus: 'draft', entriesCount: 0 });
  assert.ok(!draftEmpty.some(i => i.id === 'unpublished'));
  const published = buildActionQueue({ ...base, scheduleStatus: 'published', entriesCount: 40 });
  assert.ok(!published.some(i => i.id === 'unpublished'));
});

test('AQ-5: مدرک منقضی بحرانی است؛ در آستانهٔ انقضا فقط هشدار', () => {
  const expired: Credential = { id: 'c1', employeeId: 'e1', kind: 'license', title: 'پروانهٔ اشتغال', expiresOnISO: '2026-10-01' };
  const q1 = buildActionQueue({ ...base, credentials: [expired] });
  const cred1 = q1.find(i => i.id === 'credentials')!;
  assert.equal(cred1.severity, 'critical');
  assert.equal(cred1.count, 1);

  const expiring: Credential = { id: 'c2', employeeId: 'e2', kind: 'certificate', title: 'گواهینامهٔ احیا', expiresOnISO: '2026-12-20' };
  const q2 = buildActionQueue({ ...base, credentials: [expiring] });
  const cred2 = q2.find(i => i.id === 'credentials')!;
  assert.equal(cred2.severity, 'warning');
  assert.ok(cred2.context.includes('مریم احمدی'));
});
