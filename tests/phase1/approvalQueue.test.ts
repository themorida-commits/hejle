import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApprovalQueue, type ApprovalQueueInput } from '../../src/features/oversight/approvalQueue';
import { isoFromJalali, type LeaveRequest } from '../../src/features/leave/leaveService';
import { buildDailyReqs } from '../../src/features/roster/rosterModel';
import type { SwapRequest } from '../../src/features/swaps/swapService';
import type { AgentDraftRecord } from '../../src/services/data/types';
import type { Personnel, ScheduleEntry, ShiftType } from '../../src/core/types';

// صف تأیید واحد (دور ۲۴): فقط «قابل‌اقدام برای همین بازیگر» وارد صف می‌شود و
// «کم‌ریسک» (مجوز تأیید گروهی) فقط وقتی است که هر سه شرط با هم برقرار باشد:
// گام نهایی زنجیره + پیشنهاد تریاژ «تأیید» + نبود کمبود پوشش.
const JY = 1405, JM = 7;
const day = (d: number) => isoFromJalali(JY, JM, d);

const SHIFT_TYPES: ShiftType[] = [
  { id: 's-m', name: 'صبح', symbol: 'M', displayColor: '#fff', realDuration: 7, calculatedValue: 7, fridayCalculatedValue: 7, holidayCalculatedValue: 7, departmentIds: [] },
  { id: 's-e', name: 'عصر', symbol: 'E', displayColor: '#fff', realDuration: 7, calculatedValue: 7, fridayCalculatedValue: 7, holidayCalculatedValue: 7, departmentIds: [] },
  { id: 's-n', name: 'شب', symbol: 'N', displayColor: '#fff', realDuration: 12, calculatedValue: 12, fridayCalculatedValue: 12, holidayCalculatedValue: 12, departmentIds: [] },
];
const person = (id: string, name: string): Personnel => ({
  id, name, personnelCode: id.toUpperCase(), role: 'پرستار', departmentId: 'dep1',
  seniorityLevel: 1, nationalCode: '0010000000', contactNumber: '09120000000', employmentStatus: 'رسمی',
});
const PEOPLE = [person('e1', 'نفر یک'), person('e2', 'نفر دو'), person('e3', 'نفر سه')];
const entry = (personnelId: string, shiftTypeId: string, date: string): ScheduleEntry =>
  ({ personnelId, shiftTypeId, date, isManualEntry: false });
const annualReq = (id: string, from: number, to: number, step = 0): LeaveRequest => ({
  id, employeeId: 'e1', leaveTypeCode: 'annual', startISO: day(from), endISO: day(to),
  status: 'pending', approvalStep: step,
});

function baseInput(over: Partial<ApprovalQueueInput>): ApprovalQueueInput {
  const reqs = buildDailyReqs({ morning: 0, evening: 0, night: 0 }, 30);
  reqs.morning[11] = 2; // روز ۱۲: نیاز صبح ۲ نفر
  return {
    leaves: [], actor: { employeeId: 'boss', role: 'ward_manager' },
    approvalChain: ['ward_manager'],
    swaps: [], drafts: [],
    personnel: PEOPLE,
    entries: [entry('e2', 's-m', day(12)), entry('e3', 's-m', day(12))],
    shiftTypes: SHIFT_TYPES, dailyReqs: reqs, hasSchedule: true,
    leaveBalances: { e1: { entitled: 30, used: 5 } },
    jYear: JY, jMonth: JM,
    ...over,
  };
}

test('APQ-1: مرخصی تمیزِ گام نهایی در صف است و کم‌ریسک (قابل تأیید گروهی)', () => {
  const q = buildApprovalQueue(baseInput({ leaves: [annualReq('l1', 12, 12)] }));
  assert.equal(q.length, 1);
  assert.equal(q[0]!.kind, 'leave');
  assert.equal(q[0]!.bulkEligible, true);
  assert.ok(q[0]!.context.some(c => c.includes('گام')), 'بافت باید جای درخواست در زنجیره را بگوید');
});

test('APQ-2: گام میانی زنجیره در صف هست ولی هرگز گروهی تأیید نمی‌شود', () => {
  const q = buildApprovalQueue(baseInput({
    leaves: [annualReq('l1', 12, 12)],
    approvalChain: ['ward_manager', 'matron'],
  }));
  assert.equal(q.length, 1);
  assert.equal(q[0]!.bulkEligible, false);
});

test('APQ-3: نوبتِ نقش دیگر یعنی اصلاً در صف این بازیگر نیست', () => {
  const q = buildApprovalQueue(baseInput({
    leaves: [annualReq('l1', 12, 12)],
    approvalChain: ['matron'],
  }));
  assert.equal(q.length, 0);
});

test('APQ-4: افت پوشش → در صف هست، کم‌ریسک نیست', () => {
  const reqs = buildDailyReqs({ morning: 0, evening: 0, night: 0 }, 30);
  reqs.morning[9] = 2; // روز ۱۰: نیاز ۲، با رفتن e1 فقط ۱ می‌ماند
  const q = buildApprovalQueue(baseInput({
    leaves: [annualReq('l1', 10, 10)],
    dailyReqs: reqs,
    entries: [entry('e1', 's-m', day(10)), entry('e2', 's-m', day(10))],
  }));
  assert.equal(q.length, 1);
  assert.equal(q[0]!.bulkEligible, false);
});

test('APQ-5: جابه‌جایی فقط برای سرپرستار؛ پیش‌نویس برای هر دو؛ ترتیب: مرخصی، جابه‌جایی، پیش‌نویس', () => {
  const swap: SwapRequest = {
    id: 'sw1', fromEmployeeId: 'e2', toEmployeeId: 'e3',
    dateISO: day(15), status: 'accepted',
  };
  const draft: AgentDraftRecord = {
    id: 'd1', hospitalId: 'h1', runId: null, kind: 'leave-triage',
    payload: {}, status: 'draft', decidedBy: null, decidedAt: null,
    createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
  };
  const forManager = buildApprovalQueue(baseInput({ leaves: [annualReq('l1', 12, 12)], swaps: [swap], drafts: [draft] }));
  assert.deepEqual(forManager.map(i => i.kind), ['leave', 'swap', 'draft']);
  const forMatron = buildApprovalQueue(baseInput({
    leaves: [], swaps: [swap], drafts: [draft],
    actor: { employeeId: 'm1', role: 'matron' },
  }));
  assert.deepEqual(forMatron.map(i => i.kind), ['draft']);
});
