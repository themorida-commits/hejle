import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neighborCell, planCellDrag } from '../../src/features/roster/dragPlan';
import type { ScheduleEntry, ShiftType } from '../../src/core/types';

// درگ‌ودراپ و ناوبری صفحه‌کلید گرید (دور ۲۵): جابه‌جایی در ردیف خود فرد، سواپ
// بین دو نفر، و قانون ثابت سرپرستار که پیش از هر ویرایشی جلوی درگ را می‌گیرد.
const SHIFT_TYPES: ShiftType[] = [
  { id: 's-m', name: 'صبح', symbol: 'M', displayColor: '#fff', realDuration: 7, calculatedValue: 7, fridayCalculatedValue: 7, holidayCalculatedValue: 7, departmentIds: [] },
  { id: 's-e', name: 'عصر', symbol: 'E', displayColor: '#fff', realDuration: 7, calculatedValue: 7, fridayCalculatedValue: 7, holidayCalculatedValue: 7, departmentIds: [] },
  { id: 's-n', name: 'شب', symbol: 'N', displayColor: '#fff', realDuration: 12, calculatedValue: 12, fridayCalculatedValue: 12, holidayCalculatedValue: 12, departmentIds: [] },
  { id: 's-off', name: 'تعطیل', symbol: '-', displayColor: '#fff', realDuration: 0, calculatedValue: 0, fridayCalculatedValue: 0, holidayCalculatedValue: 0, departmentIds: [] },
];
const entry = (personnelId: string, shiftTypeId: string, date: string): ScheduleEntry =>
  ({ personnelId, shiftTypeId, date, isManualEntry: false });
const D1 = '2026-09-23', D2 = '2026-09-24';
const noHeadNurse = () => false;

test('DP-1: جابه‌جایی در ردیف خود فرد — مقصد شیفت را می‌گیرد و مبدأ تعطیل می‌شود', () => {
  const plan = planCellDrag({
    source: { personnelId: 'e1', dateISO: D1 }, target: { personnelId: 'e1', dateISO: D2 },
    entries: [entry('e1', 's-n', D1)], shiftTypes: SHIFT_TYPES, isHeadNurse: noHeadNurse,
  });
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.deepEqual(plan.edits, [
      { personnelId: 'e1', dateISO: D2, shiftTypeId: 's-n' },
      { personnelId: 'e1', dateISO: D1, shiftTypeId: 's-off' },
    ]);
  }
});

test('DP-2: سواپ بین دو نفر — هر دو طرف شیفت هم را می‌گیرند؛ خانهٔ خالی یعنی تعطیل', () => {
  const plan = planCellDrag({
    source: { personnelId: 'e1', dateISO: D1 }, target: { personnelId: 'e2', dateISO: D1 },
    entries: [entry('e1', 's-m', D1)], shiftTypes: SHIFT_TYPES, isHeadNurse: noHeadNurse,
  });
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.deepEqual(plan.edits, [
      { personnelId: 'e2', dateISO: D1, shiftTypeId: 's-m' },
      { personnelId: 'e1', dateISO: D1, shiftTypeId: 's-off' },
    ]);
  }
});

test('DP-3: مبدأ خالی یا همان خانه — بدون ویرایش، با دلیل', () => {
  const empty = planCellDrag({
    source: { personnelId: 'e1', dateISO: D1 }, target: { personnelId: 'e2', dateISO: D1 },
    entries: [], shiftTypes: SHIFT_TYPES, isHeadNurse: noHeadNurse,
  });
  assert.equal(empty.ok, false);
  const same = planCellDrag({
    source: { personnelId: 'e1', dateISO: D1 }, target: { personnelId: 'e1', dateISO: D1 },
    entries: [entry('e1', 's-m', D1)], shiftTypes: SHIFT_TYPES, isHeadNurse: noHeadNurse,
  });
  assert.equal(same.ok, false);
});

test('DP-4: قانون سرپرستار — کشیدن شیفت شب روی ردیف سرپرستار ممنوع؛ صبح آزاد است', () => {
  const isHeadNurse = (id: string) => id === 'hn';
  const blocked = planCellDrag({
    source: { personnelId: 'e1', dateISO: D1 }, target: { personnelId: 'hn', dateISO: D1 },
    entries: [entry('e1', 's-n', D1), entry('hn', 's-m', D1)], shiftTypes: SHIFT_TYPES, isHeadNurse,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.ok(blocked.reason.includes('سرپرستار'));
  const allowed = planCellDrag({
    source: { personnelId: 'e1', dateISO: D1 }, target: { personnelId: 'hn', dateISO: D1 },
    entries: [entry('e1', 's-m', D1), entry('hn', 's-off', D1)], shiftTypes: SHIFT_TYPES, isHeadNurse,
  });
  assert.equal(allowed.ok, true);
});

test('DP-5: ناوبری RTL — ArrowLeft روز بعد، ArrowRight روز قبل، لبه‌ها null', () => {
  assert.deepEqual(neighborCell(0, 0, 'ArrowLeft', 5, 30), { personIdx: 0, dayIdx: 1 });
  assert.equal(neighborCell(0, 0, 'ArrowRight', 5, 30), null);
  assert.equal(neighborCell(0, 29, 'ArrowLeft', 5, 30), null);
  assert.deepEqual(neighborCell(2, 3, 'ArrowDown', 5, 30), { personIdx: 3, dayIdx: 3 });
  assert.equal(neighborCell(0, 3, 'ArrowUp', 5, 30), null);
  assert.equal(neighborCell(0, 3, 'Enter', 5, 30), null);
});
