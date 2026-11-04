// تست‌های فاز ۱: شبیه‌سازی پوشش مرخصی، نگهبان‌های تأیید، کارکرد و CSV، جابه‌جایی.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  simulateLeaveCoverage, approveLeave, rejectLeave, isoFromJalali, type LeaveRequest,
} from '../../src/features/leave/leaveService';
import { computeWorkRecords, workRecordsToCsv } from '../../src/features/workRecords/workRecordService';
import { createSwap, acceptSwap, approveSwap } from '../../src/features/swaps/swapService';
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

// هر سه نفر روزهای ۱۰ تا ۱۲: الف شب، ب صبح، ج عصر
const ENTRIES: ScheduleEntry[] = [];
for (const d of [10, 11, 12]) {
  ENTRIES.push(entry('a', d, 's-n'), entry('b', d, 's-m'), entry('c', d, 's-e'));
}
const DUTY = new Map(PEOPLE.map(p => [p.id, 100]));
const req = (employeeId: string): LeaveRequest => ({
  id: 'lv1', employeeId, leaveTypeCode: 'annual', startISO: iso(10), endISO: iso(12), status: 'pending',
});

test('S-1 مرخصی تنها پرستار شب: شبیه‌سازی کمبود شب را نشان می‌دهد و ok نیست', () => {
  const sim = simulateLeaveCoverage({
    request: req('a'), entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES, personnel: PEOPLE,
    jYear: 1405, jMonth: 7, dutyHoursByEmployee: DUTY, minimums: { night: 1 },
    balance: { entitled: 26, used: 4 },
  });
  assert.equal(sim.ok, false);
  assert.equal(sim.shortfalls.length, 3);
  assert.ok(sim.shortfalls.every(s => s.category === 'night'));
  assert.equal(sim.balanceOk, true);
});

test('S-2 مرخصی با ماندهٔ ناکافی: balanceOk=false', () => {
  const sim = simulateLeaveCoverage({
    request: req('b'), entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES, personnel: PEOPLE,
    jYear: 1405, jMonth: 7, dutyHoursByEmployee: DUTY, minimums: {},
    balance: { entitled: 5, used: 4 },
  });
  assert.equal(sim.balanceOk, false);
  assert.equal(sim.ok, false);
});

test('S-3 خودتأییدی ممنوع؛ تأیید مدیر برنامه را آف می‌کند', () => {
  const self = approveLeave({ request: req('a'), approverEmployeeId: 'a', entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES });
  assert.equal(self.ok, false);
  const byManager = approveLeave({ request: req('a'), approverEmployeeId: 'b', entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES });
  assert.equal(byManager.ok, true);
  if (byManager.ok) {
    const aDays = byManager.entryPatch.filter(e => e.personnelId === 'a' && [10, 11, 12].map(iso).includes(e.date));
    assert.ok(aDays.every(e => e.shiftTypeId === 's-off'));
    assert.equal(byManager.request.status, 'approved');
  }
  const rej = rejectLeave({ request: req('a'), approverEmployeeId: 'b' });
  assert.equal(rej.ok, true);
});

test('S-4 کارکرد: ضرایب شب و عصر و جمع پرداختی درست محاسبه می‌شود', () => {
  // الف: ۳ شب (۱۲ ساعته) = ۳۶ ساعت شب → پرداختی ۵۴؛ ب: ۳ صبح = ۱۸؛ ج: ۳ عصر = ۱۸ → پرداختی ۲۱٫۶
  const records = computeWorkRecords({
    personnel: PEOPLE, entries: ENTRIES, shiftTypes: MOCK_SHIFT_TYPES,
    jYear: 1405, jMonth: 7, globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });
  const a = records.find(r => r.employeeId === 'a')!;
  assert.equal(a.nightHours, 36);
  assert.equal(a.nightPaid, 54);
  assert.equal(a.totalPaidHours, 54);
  const c = records.find(r => r.employeeId === 'c')!;
  assert.ok(Math.abs(c.eveningPaid - 21.6) < 0.001, `eveningPaid=${c.eveningPaid}`);
  const csv = workRecordsToCsv(records);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('کد پرسنلی'));
  assert.ok(csv.includes('الف'));
});

test('S-5 جابه‌جایی: ساخت، پذیرش طرف مقابل، تأیید مدیر و اعمال روی ردیف‌ها', () => {
  const created = createSwap({ id: 'sw1', fromEmployeeId: 'a', toEmployeeId: 'b', dateISO: iso(10), entries: ENTRIES });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const wrongAccept = acceptSwap(created.swap, 'a');
  assert.ok('error' in wrongAccept);
  const accepted = acceptSwap(created.swap, 'b');
  assert.ok(!('error' in accepted));
  if ('error' in accepted) return;
  const applied = approveSwap(accepted, ENTRIES, 'c');
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  const aRow = applied.entries.find(e => e.personnelId === 'a' && e.date === iso(10))!;
  const bRow = applied.entries.find(e => e.personnelId === 'b' && e.date === iso(10))!;
  assert.equal(aRow.shiftTypeId, 's-m');
  assert.equal(bRow.shiftTypeId, 's-n');
  const selfApprove = approveSwap(accepted, ENTRIES, 'a');
  assert.equal(selfApprove.ok, false);
});
