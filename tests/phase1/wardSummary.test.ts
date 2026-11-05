// تست گزارش تجمیعی بخش (خروجی P1-03): جمع‌ها، سهم شب، میانگین اضافه‌کار و CSV.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeWardWork, wardSummaryToCsv, type WorkRecord } from '../../src/features/workRecords/workRecordService';

const rec = (name: string, patch: Partial<WorkRecord>): WorkRecord => ({
  employeeId: name, employeeName: name, personnelCode: name,
  dutyHours: 170, workedHours: 160, morningHours: 60, eveningHours: 40, nightHours: 60,
  holidayHours: 10, leaveDays: 2, hourlyLeaveHours: 0, overtimeHours: 20,
  nightPaid: 90, eveningPaid: 48, totalPaidHours: 198, status: 'draft',
  ...patch,
});

test('W1 تجمیع بخش: جمع‌ها و سهم شب و میانگین اضافه‌کار درست است', () => {
  const s = summarizeWardWork([
    rec('الف', {}),
    rec('ب', { workedHours: 100, nightHours: 20, overtimeHours: 5, leaveDays: 0, hourlyLeaveHours: 3 }),
  ]);
  assert.equal(s.headcount, 2);
  assert.equal(s.totalWorkedHours, 260);
  assert.equal(s.totalNightHours, 80);
  assert.equal(Math.round(s.nightSharePct * 10) / 10, 30.8);
  assert.equal(s.avgOvertimePerPerson, 12.5);
  assert.equal(s.totalHourlyLeaveHours, 3);
  assert.equal(s.topNight[0]!.employeeName, 'الف');
});

test('W2 تجمیع خالی صفر می‌دهد و CSV فارسی با BOM ساخته می‌شود', () => {
  const s = summarizeWardWork([]);
  assert.equal(s.headcount, 0);
  assert.equal(s.nightSharePct, 0);
  const csv = wardSummaryToCsv(summarizeWardWork([rec('الف', {})]), 'داخلی');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /بخش,داخلی/);
  assert.match(csv, /مجموع معادل پرداختی/);
});
