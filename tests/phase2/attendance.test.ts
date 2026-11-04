// تست‌های فاز ۲: جفت‌سازی خط زمانی، تطبیق حضور و غیاب، آداپتور CSV.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pairEventsTimeline, reconcileAttendance,
  parseAttendanceCsv, attendanceSummaryToCsv, type AttendanceEvent,
} from '../../src/features/attendance/attendanceService';
import { mergeWardIntoState, snapshotToState } from '../../src/store/appStore';
import { buildDemoSnapshot } from '../../src/services/data/demoRepositories';
import { MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import type { Personnel, ScheduleEntry } from '../../src/core/types';

const nurse = (id: string): Personnel => ({
  id, name: id, personnelCode: `C-${id}`, role: 'پرستار', departmentId: 'd1',
  seniorityLevel: 1, nationalCode: '', contactNumber: '', employmentStatus: 'رسمی', employmentDate: '1400/01/01',
});
const ev = (employeeId: string, dateISO: string, type: 'in' | 'out', time: string): AttendanceEvent =>
  ({ id: `${employeeId}-${dateISO}-${type}-${time}`, employeeId, dateISO, type, time, source: 'device' });
const entry = (pid: string, date: string, s: string): ScheduleEntry =>
  ({ personnelId: pid, shiftTypeId: s, date, isManualEntry: false });
const NO_LEAVE = new Map<string, Set<string>>();

test('A-1 جفت‌سازی خط زمانی: خروج صبح فردای شیفت شب درست جفت می‌شود', () => {
  const paired = pairEventsTimeline([
    ev('a', '2026-09-23', 'in', '19:05'),
    ev('a', '2026-09-24', 'out', '06:50'),
  ]);
  const day = paired.get('a|2026-09-23')!;
  assert.equal(day.complete, true);
  assert.equal(day.workedMinutes, 705);
  assert.equal(day.checkIn, '19:05');
});

test('A-2 تطبیق: تأخیر صبح، غیبت بدون رویداد، و روز مرخصی', () => {
  const days = reconcileAttendance({
    personnel: [nurse('a'), nurse('b'), nurse('c')],
    entries: [
      entry('a', '2026-09-23', 's-m'),
      entry('b', '2026-09-23', 's-m'),
      entry('c', '2026-09-23', 's-m'),
    ],
    events: [ev('a', '2026-09-23', 'in', '07:20'), ev('a', '2026-09-23', 'out', '13:00')],
    shiftTypes: MOCK_SHIFT_TYPES,
    leaveDatesByEmployee: new Map([['c', new Set(['2026-09-23'])]]),
  });
  const a = days.find(d => d.employeeId === 'a')!;
  assert.equal(a.status, 'present');
  assert.equal(a.lateMinutes, 20);
  assert.equal(days.find(d => d.employeeId === 'b')!.status, 'absent');
  assert.equal(days.find(d => d.employeeId === 'c')!.status, 'leave');
});

test('A-3 رویداد ناقص (فقط ورود) → incomplete؛ حضور در روز آف → فوق‌العاده', () => {
  const days = reconcileAttendance({
    personnel: [nurse('a'), nurse('b')],
    entries: [entry('a', '2026-09-23', 's-m'), entry('b', '2026-09-23', 's-off')],
    events: [
      ev('a', '2026-09-23', 'in', '07:00'),
      ev('b', '2026-09-23', 'in', '08:00'), ev('b', '2026-09-23', 'out', '12:00'),
    ],
    shiftTypes: MOCK_SHIFT_TYPES,
    leaveDatesByEmployee: NO_LEAVE,
  });
  assert.equal(days.find(d => d.employeeId === 'a')!.status, 'incomplete');
  const b = days.find(d => d.employeeId === 'b')!;
  assert.equal(b.status, 'present');
  assert.equal(b.overtimeMinutes, 240);
});

test('A-4 آداپتور CSV: نگاشت پیش‌فرض قاصدک، کد ناشناخته رد می‌شود؛ خلاصه BOM دارد', () => {
  const csv = [
    'کد پرسنلی,تاریخ,ساعت,نوع',
    'C-a,2026-09-23,07:00,ورود',
    'C-a,2026-09-23,13:00,خروج',
    'C-zz,2026-09-23,07:00,ورود',
  ].join('\n');
  const { events, skipped } = parseAttendanceCsv(csv, new Map([['C-a', 'a']]));
  assert.equal(events.length, 2);
  assert.equal(skipped, 1);
  assert.equal(events[1]!.type, 'out');
  const summaryCsv = attendanceSummaryToCsv(
    [{ employeeId: 'a', presentDays: 1, absentDays: 0, leaveDays: 0, incompleteDays: 0, totalWorkedMinutes: 360, totalLateMinutes: 0, totalOvertimeMinutes: 0 }],
    () => ({ name: 'الف', code: 'C-a' }),
  );
  assert.ok(summaryCsv.startsWith('\uFEFF'));
  assert.ok(summaryCsv.includes('روز حضور'));
});

test('A-5 مرج تنبل بخش: بارگذاری بخش دوم پرسنل را کامل می‌کند و ردیف‌های بخش اول سالم می‌مانند', () => {
  const full = buildDemoSnapshot();
  const dep1Only = { ...full, employees: full.employees.filter(e => e.wardId === 'dep1') };
  const base = snapshotToState(dep1Only);
  const cur = {
    personnel: base.personnel, entries: base.entries, leaves: [], workRecords: [],
    dutyByEmployee: new Map<string, number>(), leaveBalances: {},
  };
  const dep2Snap = { ...full, employees: full.employees.filter(e => e.wardId === 'dep2'), entries: [], leaves: [], workRecords: [], schedule: null };
  const merged = mergeWardIntoState(cur, dep2Snap);
  assert.equal(merged.personnel.length, 42 - full.employees.filter(e => e.wardId === 'dep3').length);
  assert.equal(merged.entries.length, 420);
  assert.ok(merged.dutyByEmployee.size >= dep2Snap.employees.length);
});
