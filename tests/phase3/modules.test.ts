// تست‌های فاز ۳ و ۴: اعتبارنامه‌ها، برگهٔ کارانه، کارکرد با حضور واقعی.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { credentialStatus, summarizeCompliance, type Credential } from '../../src/features/credentials/credentialService';
import { buildKaranehSheet, karanehToCsv } from '../../src/features/performance/performanceService';
import { computeWorkRecords } from '../../src/features/workRecords/workRecordService';
import { MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import { DEFAULT_GLOBAL_SETTINGS } from '../../src/core/defaults';
import type { Personnel, ScheduleEntry } from '../../src/core/types';
import type { WorkRecord } from '../../src/features/workRecords/workRecordService';

const TODAY = '2026-09-23';
const cred = (expiresOnISO?: string): Credential => ({
  id: 'c1', employeeId: 'a', kind: 'license', title: 'پروانه', expiresOnISO,
});

test('P-1 وضعیت اعتبار: منقضی/آستانه/معتبر/بدون انقضا', () => {
  assert.equal(credentialStatus(cred('2026-09-22'), TODAY), 'expired');
  assert.equal(credentialStatus(cred('2026-10-20'), TODAY), 'expiring');
  assert.equal(credentialStatus(cred('2027-09-23'), TODAY), 'valid');
  assert.equal(credentialStatus(cred(undefined), TODAY), 'no_expiry');
});

test('P-2 خلاصهٔ انطباق: شمارش و فهرست پیگیری مرتب بر اساس انقضا', () => {
  const creds: Credential[] = [
    { ...cred('2026-08-01'), id: 'x1', employeeId: 'a' },
    { ...cred('2026-10-01'), id: 'x2', employeeId: 'b' },
    { ...cred('2028-01-01'), id: 'x3', employeeId: 'a' },
  ];
  const s = summarizeCompliance(creds, id => `نام-${id}`, TODAY);
  assert.equal(s.total, 3);
  assert.equal(s.expired, 1);
  assert.equal(s.expiring, 1);
  assert.equal(s.attention[0]!.credential.id, 'x1');
  assert.equal(s.attention[0]!.employeeName, 'نام-a');
});

test('P-3 برگهٔ کارانه: شاخص حضور و مؤلفه‌ها؛ بدون حضور null می‌ماند', () => {
  const rec: WorkRecord = {
    employeeId: 'a', employeeName: 'الف', personnelCode: 'C-a', dutyHours: 176, workedHours: 180,
    morningHours: 60, eveningHours: 40, nightHours: 80, holidayHours: 12, leaveDays: 2,
    overtimeHours: 4, nightPaid: 120, eveningPaid: 48, totalPaidHours: 228, status: 'approved',
  };
  const rows = buildKaranehSheet([rec], [{
    employeeId: 'a', presentDays: 20, absentDays: 2, leaveDays: 2, incompleteDays: 0,
    totalWorkedMinutes: 10000, totalLateMinutes: 35, totalOvertimeMinutes: 120,
  }]);
  assert.equal(rows[0]!.attendanceRate, 90.9);
  assert.equal(rows[0]!.totalPaidHours, 228);
  const noAtt = buildKaranehSheet([rec], []);
  assert.equal(noAtt[0]!.attendanceRate, null);
  assert.ok(karanehToCsv(rows).includes('شاخص حضور'));
});

test('P-4 کارکرد با حضور واقعی: ستون‌های واقعی از خلاصهٔ حضور پر می‌شود', () => {
  const nurse: Personnel = {
    id: 'a', name: 'الف', personnelCode: 'C-a', role: 'پرستار', departmentId: 'd1',
    seniorityLevel: 1, nationalCode: '', contactNumber: '', employmentStatus: 'رسمی', employmentDate: '1400/01/01',
  };
  const entries: ScheduleEntry[] = [
    { personnelId: 'a', shiftTypeId: 's-m', date: '2026-09-23', isManualEntry: false },
    { personnelId: 'a', shiftTypeId: 's-m', date: '2026-09-24', isManualEntry: false },
  ];
  const records = computeWorkRecords({
    personnel: [nurse], entries, shiftTypes: MOCK_SHIFT_TYPES,
    jYear: 1405, jMonth: 7, globalSettings: DEFAULT_GLOBAL_SETTINGS,
    attendanceSummaries: [{
      employeeId: 'a', presentDays: 1, absentDays: 1, leaveDays: 0, incompleteDays: 0,
      totalWorkedMinutes: 370, totalLateMinutes: 10, totalOvertimeMinutes: 10,
    }],
  });
  assert.equal(records[0]!.actualWorkedHours, 6.2);
  assert.equal(records[0]!.absentDays, 1);
  assert.equal(records[0]!.lateMinutes, 10);
});
