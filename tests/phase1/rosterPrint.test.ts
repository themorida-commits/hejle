// تست مدل فرم چاپی چینش شیفت (دور ۷): وضعیت سلول، جمع روزانه، ضمیمه‌ها.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  weekdayLetters, holidayDayNumbers, buildLeaveCellStates, dayCountsByCategory,
  buildAnnex, employmentShort, LEAVE_CELL,
} from '../../src/features/roster/rosterPrintModel';
import { holidaysFor } from '../../src/core/defaults';
import { isoFromJalali, type LeaveRequest } from '../../src/features/leave/leaveService';
import type { Personnel, ScheduleEntry, ShiftType } from '../../src/core/types';

const person = (id: string, name: string): Personnel => ({
  id, name, personnelCode: id, role: 'پرستار', departmentId: 'dep',
  seniorityLevel: 1, nationalCode: '', contactNumber: '', employmentStatus: 'قراردادی',
});
const leave = (p: Partial<LeaveRequest> & { id: string }): LeaveRequest => ({
  employeeId: 'p1', leaveTypeCode: 'annual',
  startISO: isoFromJalali(1405, 7, 3), endISO: isoFromJalali(1405, 7, 5),
  status: 'approved', ...p,
} as LeaveRequest);

test('R1: حروف هفتهٔ مهر ۱۴۰۵ — روز ۱ چهارشنبه و روز ۳ جمعه است', () => {
  const letters = weekdayLetters(1405, 7);
  assert.equal(letters.length, 30);
  assert.equal(letters[0], 'چ'); // ۱ مهر ۱۴۰۵ = ۲۳ سپتامبر ۲۰۲۶، چهارشنبه
  assert.equal(letters[2], 'ج'); // ۳ مهر = جمعه
});

test('R2: تعطیلات رسمی از همان فهرست موتور می‌آید و سال‌محور است', () => {
  // فروردین ۱۴۰۵: ۶ روز ثابت + شهادت امام صادق (۲۵)؛ فروردین ۱۴۰۶: فقط ثابت‌ها
  assert.deepEqual([...holidayDayNumbers(1405, 1)].sort((a, b) => a - b), [1, 2, 3, 4, 12, 13, 25]);
  assert.deepEqual([...holidayDayNumbers(1406, 1)].sort((a, b) => a - b), [1, 2, 3, 4, 12, 13]);
  assert.equal(holidayDayNumbers(1405, 7).size, 0); // مهر ۱۴۰۵ تعطیل رسمی ندارد
});

test('R3: وضعیت سلول مرخصی — فقط تأییدشده و غیرساعتی، در بازهٔ خودش', () => {
  const states = buildLeaveCellStates([
    leave({ id: 'a' }),
    leave({ id: 'b', status: 'pending' }),
    leave({ id: 'c', isHourly: true, hours: 4, startISO: isoFromJalali(1405, 7, 10), endISO: isoFromJalali(1405, 7, 10) }),
    leave({ id: 'd', employeeId: 'p2', leaveTypeCode: 'sick', startISO: isoFromJalali(1405, 7, 3), endISO: isoFromJalali(1405, 7, 3) }),
  ]);
  assert.equal(states.get(`p1|${isoFromJalali(1405, 7, 4)}`), 'annual');
  assert.equal(states.get(`p1|${isoFromJalali(1405, 7, 6)}`), undefined);
  assert.equal(states.get(`p1|${isoFromJalali(1405, 7, 10)}`), undefined, 'مرخصی ساعتی سلول را نمی‌بندد');
  assert.equal(states.get(`p2|${isoFromJalali(1405, 7, 3)}`), 'sick');
  assert.equal(LEAVE_CELL['annual']!.label, 'مر');
});

test('R4: جمع روزانه بر حسب دسته — همان معنای موتور (EN در دستهٔ شب) و آف شمرده نمی‌شود', () => {
  const shifts: ShiftType[] = [
    { id: 's-m', name: 'صبح', symbol: 'M' },
    { id: 's-e', name: 'عصر', symbol: 'E' },
    { id: 's-n', name: 'شب', symbol: 'N' },
    { id: 's-en', name: 'عصر و شب', symbol: 'EN' },
    { id: 's-off', name: 'تعطیل', symbol: '-' },
  ] as ShiftType[];
  const d1 = isoFromJalali(1405, 7, 1);
  const entries: ScheduleEntry[] = [
    { personnelId: 'p1', shiftTypeId: 's-m', date: d1 },
    { personnelId: 'p2', shiftTypeId: 's-m', date: d1 },
    { personnelId: 'p1', shiftTypeId: 's-en', date: isoFromJalali(1405, 7, 2) },
    { personnelId: 'p2', shiftTypeId: 's-n', date: isoFromJalali(1405, 7, 2) },
    { personnelId: 'p1', shiftTypeId: 's-off', date: isoFromJalali(1405, 7, 2) },
    { personnelId: 'pX', shiftTypeId: 's-m', date: d1 }, // خارج از بخش — نباید شمرده شود
  ] as ScheduleEntry[];
  const counts = dayCountsByCategory(entries, shifts, new Set(['p1', 'p2']), 1405, 7);
  assert.equal(counts.morning[0], 2);
  // معنای categorizeShift موتور: نام «عصر و شب» به‌خاطر «شب» در دستهٔ شب می‌نشیند —
  // فرم چاپی هم دقیقاً همان دسته‌بندی موتور را نشان می‌دهد (EN + N = ۲ شب).
  assert.equal(counts.evening[1], 0);
  assert.equal(counts.night[1], 2);
  assert.equal(counts.morning[1], 0);
});

test('R5: ضمیمه‌ها — هم‌پوشانی با ماه بریده می‌شود؛ استحقاقی و درانتظار وارد نمی‌شوند', () => {
  const people = [person('p1', 'الف'), person('p2', 'ب')];
  const annex = buildAnnex([
    leave({ id: 'i1', leaveTypeCode: 'incentive', reason: 'نمره ارزیابی', startISO: isoFromJalali(1405, 6, 30), endISO: isoFromJalali(1405, 7, 2) }),
    leave({ id: 's1', employeeId: 'p2', leaveTypeCode: 'sick', startISO: isoFromJalali(1405, 7, 10), endISO: isoFromJalali(1405, 7, 12) }),
    leave({ id: 'a1', leaveTypeCode: 'annual' }),
    leave({ id: 'm1', leaveTypeCode: 'mission', status: 'pending' }),
    leave({ id: 'e1', leaveTypeCode: 'enroute', reason: 'مشهد', startISO: isoFromJalali(1405, 7, 20), endISO: isoFromJalali(1405, 7, 20) }),
  ], people, 1405, 7);
  assert.equal(annex.incentive.length, 1);
  assert.ok(annex.incentive[0]!.detail.startsWith('۲ روز'), 'فقط ۲ روز از تشویقی داخل مهر است');
  assert.ok(annex.incentive[0]!.detail.includes('نمره ارزیابی'));
  assert.equal(annex.sick[0]!.name, 'ب');
  assert.equal(annex.mission.length, 0);
  assert.equal(annex.enroute.length, 1);
});

test('R7: فهرست ۱۴۰۵ کامل است — ۲۶ روز متمایز از تقویم رسمی؛ سال‌های دیگر فقط ثابت‌ها', () => {
  const all1405 = new Set<string>();
  for (let m = 1; m <= 12; m++) {
    for (const h of holidaysFor(1405, m)) all1405.add(`${h.month}-${h.day}`);
  }
  assert.equal(all1405.size, 26);
  // لکه‌چک‌های قمری: عاشورا ۴ تیر، قربان ۶ خرداد، فطرِ اسفند ۱۹ و ۲۰
  assert.ok(holidaysFor(1405, 4).some(h => h.day === 4 && h.name.includes('عاشورا')));
  assert.ok(holidaysFor(1405, 3).some(h => h.day === 6 && h.name.includes('قربان')));
  assert.deepEqual(holidaysFor(1405, 12).map(h => h.day).sort((a, b) => a - b), [9, 19, 20, 29]);
  const all1404 = new Set<string>();
  for (let m = 1; m <= 12; m++) {
    for (const h of holidaysFor(1404, m)) all1404.add(`${h.month}-${h.day}`);
  }
  assert.equal(all1404.size, 10, 'برای ۱۴۰۴ هنوز ورودی قمری ثبت نشده — فقط ۱۰ روز ثابت');
});

test('R6: کد تک‌حرفی وضعیت استخدامی فرم', () => {
  assert.equal(employmentShort('قراردادی'), 'ک');
  assert.equal(employmentShort('وظیفه'), 'وظ');
  assert.equal(employmentShort('رسمی'), 'ر');
  assert.equal(employmentShort('پیمانی'), 'پ');
});
