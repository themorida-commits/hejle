// ─────────────────────────────────────────────────────────────────────────────
// سازگاری دستهٔ «شب» برای شیفت ترکیبی عصر‌وشب (EN) — دور ۲۰
//
// یافتهٔ اسپایک CP-SAT: ‏categorizeShift موتور قواعد، EN را night می‌داند، اما
// solver و conflictDetector برای ریکاوری و شب‌های متوالی فقط s-n خالص را
// می‌شناختند؛ و طول ۲۲٫۵ ساعتهٔ EN از سقف کار متوالی (۱۲ ساعت) رد می‌شود ولی
// روی سلول برنامه هیچ‌جا دیده نمی‌شد. این تست‌ها رفتار یکدستِ دسته‌محور را
// قفل می‌کنند: منبع واحد حقیقت = categorizeShift.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateScheduleDeterministic } from '../../src/core/scheduling/schedulerSolver';
import { detectConflicts } from '../../src/core/scheduling/conflictDetector';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import { DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../../src/core/defaults';
import { jalaliToGregorian } from '../../src/core/jalali';
import type { ScheduleEntry, StaffRequest } from '../../src/core/types';

function gdate(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

function shiftOn(entries: ScheduleEntry[], personnelId: string, jd: number): string | undefined {
  return entries.find(e => e.personnelId === personnelId && e.date === gdate(1405, 7, jd))?.shiftTypeId;
}

const baseParams = {
  shiftTypes: MOCK_SHIFT_TYPES,
  currentSchedule: [] as ScheduleEntry[],
  requests: [] as StaffRequest[],
  rules: DEFAULT_RULES,
  aiSettings: DEFAULT_AI_SETTINGS,
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
};

const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1'); // ۱۴ نفر — بخش داخلی

const entry = (personnelId: string, shiftTypeId: string, jd: number): ScheduleEntry => ({
  personnelId, shiftTypeId, date: gdate(1405, 7, jd), isManualEntry: true,
});

function conflictsFor(schedule: ScheduleEntry[], personnelId: string, jd: number): string[] {
  const { cellConflicts } = detectConflicts(schedule, dep1, MOCK_SHIFT_TYPES, DEFAULT_RULES, [], 1405, 7);
  return cellConflicts.get(`${personnelId}-${gdate(1405, 7, jd)}`) ?? [];
}

// ── solver ───────────────────────────────────────────────────────────────────

test('EN-1 حل‌کننده: بعد از EN قفل‌شده، روز بعد تولید نمی‌شود (ریکاوری دسته‌محور)', () => {
  const locks: ScheduleEntry[] = [entry('p2', 's-en', 10)];
  const out = generateScheduleDeterministic({ ...baseParams, personnel: dep1, currentSchedule: locks, jYear: 1405, jMonth: 7 });
  assert.equal(shiftOn(out, 'p2', 10), 's-en', 'قفل EN باید عیناً بماند');
  assert.equal(shiftOn(out, 'p2', 11), 's-off', 'روز بعد از EN باید آف باشد، مثل بعد از شب خالص');
});

test('EN-2 قفل‌ها بر ریکاوری مقدم‌اند: EN + صبحِ قفل‌شدهٔ روز بعد هر دو می‌مانند و آشکارساز هر دو نقض اجباری را گزارش می‌کند', () => {
  const locks: ScheduleEntry[] = [entry('p2', 's-en', 10), entry('p2', 's-m', 11)];
  const out = generateScheduleDeterministic({ ...baseParams, personnel: dep1, currentSchedule: locks, jYear: 1405, jMonth: 7 });
  assert.equal(shiftOn(out, 'p2', 10), 's-en');
  assert.equal(shiftOn(out, 'p2', 11), 's-m', 'قفل صبحِ روز بعد حذف نمی‌شود؛ نقض، اجباریِ قفل است');
  const day11 = conflictsFor(out, 'p2', 11);
  assert.ok(day11.some(m => m.includes('ریکاوری')), 'نقض ریکاوریِ بعد از EN باید روی خروجی حل‌کننده دیده شود');
  const day10 = conflictsFor(out, 'p2', 10);
  assert.ok(day10.some(m => m.includes('سقف کار متوالی')), 'طول ۲۲٫۵ ساعتهٔ EN باید روی سلول خودش flag شود');
});

// ── آشکارساز: ریکاوری بعد از EN ──────────────────────────────────────────────

test('EN-3 آشکارساز: صبح و عصرِ روز بعد از EN، نقض ریکاوری می‌گیرند', () => {
  const planted: ScheduleEntry[] = [
    entry('p2', 's-en', 3), entry('p2', 's-m', 4),
    entry('p5', 's-en', 3), entry('p5', 's-e', 4),
  ];
  assert.ok(conflictsFor(planted, 'p2', 4).some(m => m.includes('ریکاوری')), 'صبح بعد از EN');
  assert.ok(conflictsFor(planted, 'p5', 4).some(m => m.includes('ریکاوری')), 'عصر بعد از EN');
});

// ── آشکارساز: شب‌های متوالی با EN ────────────────────────────────────────────

test('EN-4 آشکارساز: EN در شمارش شب‌های متوالی حساب می‌شود', () => {
  const mixed: ScheduleEntry[] = [entry('p2', 's-en', 10), entry('p2', 's-n', 11), entry('p2', 's-n', 12)];
  assert.ok(
    conflictsFor(mixed, 'p2', 12).some(m => m.includes('شب‌کاری متوالی')),
    'EN + شب + شب = سه شب متوالی؛ روز سوم باید flag شود',
  );
  assert.ok(
    !conflictsFor(mixed, 'p2', 11).some(m => m.includes('شب‌کاری متوالی')),
    'دو شب متوالی هنوز مجاز است',
  );
  const allEn: ScheduleEntry[] = [entry('p5', 's-en', 10), entry('p5', 's-en', 11), entry('p5', 's-en', 12)];
  assert.ok(
    conflictsFor(allEn, 'p5', 12).some(m => m.includes('شب‌کاری متوالی')),
    'سه EN پشت سر هم هم سه شب متوالی است',
  );
});

// ── آشکارساز: سقف کار متوالی برای شیفت منفرد ─────────────────────────────────

test('EN-5 آشکارساز: EN تنها هم به‌خاطر طولش flag می‌شود؛ شب خالصِ ۱۲ ساعته نه', () => {
  const loneEn: ScheduleEntry[] = [entry('p2', 's-en', 5)];
  assert.ok(conflictsFor(loneEn, 'p2', 5).some(m => m.includes('سقف کار متوالی')));
  const loneNight: ScheduleEntry[] = [entry('p2', 's-n', 5)];
  assert.ok(!conflictsFor(loneNight, 'p2', 5).some(m => m.includes('سقف کار متوالی')), '۱۲ ساعت دقیقاً روی سقف است، نه بالای آن');
  const loneMorning: ScheduleEntry[] = [entry('p2', 's-m', 5)];
  assert.equal(conflictsFor(loneMorning, 'p2', 5).length, 0);
});
