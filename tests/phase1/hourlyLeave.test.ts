// تست‌های مرخصی ساعتی (نسخهٔ ۱٫۱): تبدیل ساعت به روز، شبیه‌سازی بدون حذف شیفت،
// نگهبان تأیید، و کسر از کارکرد با ضریب همان شیفت.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  simulateLeaveCoverage, approveLeave, isoFromJalali, leaveDurationDays,
  hourlyCoversWholeShift, type LeaveRequest,
} from '../../src/features/leave/leaveService';
import { computeWorkRecords } from '../../src/features/workRecords/workRecordService';
import { MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import { DEFAULT_GLOBAL_SETTINGS } from '../../src/core/defaults';
import type { Personnel, ScheduleEntry } from '../../src/core/types';

const nurse = (id: string, name: string): Personnel => ({
  id, name, personnelCode: id.toUpperCase(), role: 'پرستار', departmentId: 'd1',
  seniorityLevel: 1, nationalCode: '', contactNumber: '', employmentStatus: 'رسمی', employmentDate: '1400/01/01',
});
const PEOPLE = [nurse('a', 'الف'), nurse('b', 'ب'), nurse('c', 'ج')];
const iso = (d: number) => isoFromJalali(1405, 7, d);
const entry = (pid: string, d: number, s: string): ScheduleEntry => ({ personnelId: pid, shiftTypeId: s, date: iso(d), isManualEntry: false });

const ENTRIES: ScheduleEntry[] = [];
for (const d of [10, 11, 12]) {
  ENTRIES.push(entry('a', d, 's-n'), entry('b', d, 's-m'), entry('c', d, 's-e'));
}
const DUTY = new Map(PEOPLE.map(p => [p.id, 100]));

test('H1 طول مرخصی: روزانه برحسب روز، ساعتی برحسب ساعت تقسیم بر موظفی روزانه', () => {
  assert.equal(leaveDurationDays({ startISO: iso(10), endISO: iso(12) }), 3);
  const oneDay = leaveDurationDays({ isHourly: true, hours: 44 / 6, startISO: iso(10), endISO: iso(10) });
  assert.ok(Math.abs(oneDay - 1) < 1e-9);
  const threeHours = leaveDurationDays({ isHourly: true, hours: 3, startISO: iso(10), endISO: iso(10) });
  assert.ok(Math.abs(threeHours - 3 / (44 / 6)) < 1e-9);
});

test('H2 شبیه‌سازی ساعتی جزئی: شیفت حذف نمی‌شود، کمبودی ساخته نمی‌شود، مانده کسری سنجیده می‌شود', () => {
  const request: LeaveRequest = {
    id: 'h1', employeeId: 'b', leaveTypeCode: 'annual',
    startISO: iso(10), endISO: iso(10), isHourly: true, hours: 3, status: 'pending',
  };
  const sim = simulateLeaveCoverage({
    request, entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES, personnel: PEOPLE,
    jYear: 1405, jMonth: 7, dutyHoursByEmployee: DUTY,
    minimums: { morning: 1, evening: 1, night: 1 }, balance: { entitled: 26, used: 25.8 },
  });
  assert.equal(sim.shortfalls.length, 0);
  assert.equal(sim.balanceOk, false); // ۰٫۲ روز مانده < ۰٫۴۱ روز درخواستی
  const sim2 = simulateLeaveCoverage({
    request, entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES, personnel: PEOPLE,
    jYear: 1405, jMonth: 7, dutyHoursByEmployee: DUTY,
    minimums: { morning: 1, evening: 1, night: 1 }, balance: { entitled: 26, used: 20 },
  });
  assert.equal(sim2.ok, true);
  assert.match(sim2.summary, /ساعتی/);
});

test('H3 تأیید ساعتی جزئی برنامه را دست نمی‌زند؛ پوشش کامل شیفت آن را آف می‌کند', () => {
  const partial: LeaveRequest = {
    id: 'h2', employeeId: 'b', leaveTypeCode: 'annual',
    startISO: iso(10), endISO: iso(10), isHourly: true, hours: 3, status: 'pending',
  };
  assert.equal(hourlyCoversWholeShift(partial, ENTRIES, MOCK_SHIFT_TYPES), false);
  const res = approveLeave({ request: partial, approverEmployeeId: 'a', entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES });
  assert.equal(res.ok, true);
  if (res.ok) {
    const dayB = res.entryPatch.find(e => e.personnelId === 'b' && e.date === iso(10));
    assert.equal(dayB?.shiftTypeId, 's-m'); // سر جایش
  }
  const whole: LeaveRequest = { ...partial, id: 'h3', hours: 6 }; // شیفت صبح ۶ ساعته
  assert.equal(hourlyCoversWholeShift(whole, ENTRIES, MOCK_SHIFT_TYPES), true);
  const res2 = approveLeave({ request: whole, approverEmployeeId: 'a', entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES });
  assert.equal(res2.ok, true);
  if (res2.ok) {
    const dayB = res2.entryPatch.find(e => e.personnelId === 'b' && e.date === iso(10));
    assert.notEqual(dayB?.shiftTypeId, 's-m'); // آف شده
  }
});

test('H4 کسر از کارکرد: صبح با ضریب ۱ و شب با ضریب ۱٫۵', () => {
  const base = computeWorkRecords({
    personnel: PEOPLE, entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES,
    jYear: 1405, jMonth: 7, globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });
  const withLeave = computeWorkRecords({
    personnel: PEOPLE, entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES,
    jYear: 1405, jMonth: 7, globalSettings: DEFAULT_GLOBAL_SETTINGS,
    hourlyLeaves: [
      { employeeId: 'b', dateISO: iso(10), hours: 3 },  // صبح ۶ساعته → کسر ۳ از کارکرد و پرداختی
      { employeeId: 'a', dateISO: iso(11), hours: 4 },  // شب ۱۲ساعته → کسر ۴ از کارکرد، ۶ از پرداختی
    ],
  });
  const bBase = base.find(r => r.employeeId === 'b')!;
  const bNew = withLeave.find(r => r.employeeId === 'b')!;
  assert.equal(bNew.hourlyLeaveHours, 3);
  assert.equal(Math.round((bBase.workedHours - bNew.workedHours) * 10) / 10, 3);
  assert.equal(Math.round((bBase.totalPaidHours - bNew.totalPaidHours) * 10) / 10, 3);
  const aBase = base.find(r => r.employeeId === 'a')!;
  const aNew = withLeave.find(r => r.employeeId === 'a')!;
  assert.equal(aNew.hourlyLeaveHours, 4);
  assert.equal(Math.round((aBase.totalPaidHours - aNew.totalPaidHours) * 10) / 10, 6);
});
