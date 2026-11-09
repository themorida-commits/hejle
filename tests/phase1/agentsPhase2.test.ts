// دور ۱۸: لایهٔ ایجنت فاز ۲ (Zone C — پیش‌نویس + تأیید انسان) — قراردادها:
// (۱) تریاژ مرخصی: مازاد سهمیه «رد»، افت پوشش «بررسی»، تمیز «تأیید» — و هرگز
// تصمیم خودکار نیست، فقط پیشنهاد است؛ (۲) توضیح برنامه عددهایش را از روی
// مدخل‌ها می‌شمارد و نقض قانون سرپرستار را جدا می‌کند؛ (۳) سازندهٔ روایت
// گزارش بخش خالی را رد می‌کند و سطر نمره‌ها را می‌آورد؛ (۴) چک بستهٔ ماه
// دقیقاً خلأهای کاشته‌شده را پیدا می‌کند و روی دادهٔ سالم خالی است؛
// (۵) خط مبنای census روی سری معلوم میانگین درست می‌دهد و با دادهٔ کم
// صادقانه «ناکافی» است؛ (۶) ابزارهای فاز ۲ Zone C و census ‏Zone A است و
// قفل Zone D سر جایش است.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENT_TOOLS, ZONE_D_ACTIONS, zoneOf } from '../../src/features/agents/agentCore';
import { buildLeaveTriage } from '../../src/features/agents/leaveTriage';
import { explainRoster } from '../../src/features/agents/rosterExplain';
import { composeReportDraft } from '../../src/features/agents/reportDraft';
import { checkMonthPack } from '../../src/features/agents/packCheck';
import { forecastCensus } from '../../src/features/agents/censusBaseline';
import { isoFromJalali, type LeaveRequest } from '../../src/features/leave/leaveService';
import { buildDailyReqs } from '../../src/features/roster/rosterModel';
import type { Personnel, ScheduleEntry, ShiftType } from '../../src/core/types';
import type { Admission, Handover, NursingReport } from '../../src/features/patients/patientService';

const JY = 1405, JM = 7;
const day = (d: number) => isoFromJalali(JY, JM, d);

const SHIFT_TYPES: ShiftType[] = [
  { id: 's-m', name: 'صبح', symbol: 'M', displayColor: '#fff', realDuration: 7, calculatedValue: 7, fridayCalculatedValue: 7, holidayCalculatedValue: 7, departmentIds: [] },
  { id: 's-e', name: 'عصر', symbol: 'E', displayColor: '#fff', realDuration: 7, calculatedValue: 7, fridayCalculatedValue: 7, holidayCalculatedValue: 7, departmentIds: [] },
  { id: 's-n', name: 'شب', symbol: 'N', displayColor: '#fff', realDuration: 12, calculatedValue: 12, fridayCalculatedValue: 12, holidayCalculatedValue: 12, departmentIds: [] },
  { id: 's-off', name: 'تعطیل', symbol: '-', displayColor: '#fff', realDuration: 0, calculatedValue: 0, fridayCalculatedValue: 0, holidayCalculatedValue: 0, departmentIds: [] },
];

const person = (id: string, name: string, role = 'پرستار'): Personnel => ({
  id, name, personnelCode: id.toUpperCase(), role, departmentId: 'dep1',
  seniorityLevel: 1, nationalCode: '0010000000', contactNumber: '09120000000', employmentStatus: 'رسمی',
});
const PEOPLE = [person('e1', 'نفر یک'), person('e2', 'نفر دو'), person('e3', 'نفر سه'), person('e4', 'نفر چهار')];
const entry = (personnelId: string, shiftTypeId: string, date: string, isManualEntry = false): ScheduleEntry =>
  ({ personnelId, shiftTypeId, date, isManualEntry });

const annualReq = (id: string, from: number, to: number): LeaveRequest => ({
  id, employeeId: 'e1', leaveTypeCode: 'annual', startISO: day(from), endISO: day(to), status: 'pending',
});

// ── P2-1 تریاژ مرخصی ─────────────────────────────────────────────────────────
test('P2-1 تریاژ: مازاد سهمیه → رد با عدد؛ افت پوشش → بررسی؛ تمیز → تأیید', () => {
  const zeroReqs = buildDailyReqs({ morning: 0, evening: 0, night: 0 }, 30);

  const over = buildLeaveTriage({
    request: annualReq('lv-over', 10, 14), personnel: PEOPLE,
    entries: [entry('e2', 's-m', day(10))], shiftTypes: SHIFT_TYPES,
    dailyReqs: zeroReqs, hasSchedule: true,
    leaveBalances: { e1: { entitled: 30, used: 28 } },
    approvalChain: ['ward_manager'], jYear: JY, jMonth: JM,
  });
  assert.equal(over.suggestion, 'reject');
  assert.equal(over.quota?.remaining, 2);
  assert.equal(over.quota?.requestedDays, 5);
  assert.ok(over.reasons.some(r => r.includes('کافی نیست')));

  const reqs = buildDailyReqs({ morning: 0, evening: 0, night: 0 }, 30);
  reqs.morning[9] = 2; // روز ۱۰: نیاز صبح ۲ نفر
  const drop = buildLeaveTriage({
    request: annualReq('lv-drop', 10, 10), personnel: PEOPLE,
    entries: [entry('e1', 's-m', day(10)), entry('e2', 's-m', day(10))], shiftTypes: SHIFT_TYPES,
    dailyReqs: reqs, hasSchedule: true,
    leaveBalances: { e1: { entitled: 30, used: 0 } },
    approvalChain: ['ward_manager'], jYear: JY, jMonth: JM,
  });
  assert.equal(drop.suggestion, 'review');
  assert.ok(drop.coverage?.some(c => c.short && c.shift === 'morning' && c.staffAfter === 1));

  const reqs2 = buildDailyReqs({ morning: 0, evening: 0, night: 0 }, 30);
  reqs2.morning[11] = 2; // روز ۱۲
  const clean = buildLeaveTriage({
    request: annualReq('lv-ok', 12, 12), personnel: PEOPLE,
    entries: [entry('e2', 's-m', day(12)), entry('e3', 's-m', day(12)), entry('e4', 's-m', day(12))],
    shiftTypes: SHIFT_TYPES, dailyReqs: reqs2, hasSchedule: true,
    leaveBalances: { e1: { entitled: 30, used: 5 } },
    approvalChain: ['ward_manager'], jYear: JY, jMonth: JM,
  });
  assert.equal(clean.suggestion, 'approve');
  assert.equal(clean.quota?.remaining, 25);
});

// ── P2-2 توضیح برنامه ────────────────────────────────────────────────────────
test('P2-2 توضیح برنامه: شمارش شیفت/شب، خانهٔ خالی نیاز، قفل دستی و قانون سرپرستار', () => {
  const head = person('hn', 'سرپرستار بخش', 'سرپرستار');
  const reqs = buildDailyReqs({ morning: 0, evening: 0, night: 0 }, 30);
  reqs.morning[0] = 2; // روز ۱ صبح: نیاز ۲ — فقط یک نفر چیده می‌شود
  const lawful = explainRoster({
    personnel: [head, ...PEOPLE.slice(0, 2)], shiftTypes: SHIFT_TYPES,
    entries: [
      entry('hn', 's-m', day(1)), entry('hn', 's-m', day(2)),
      entry('e1', 's-n', day(1)), entry('e1', 's-n', day(2)),
      entry('e2', 's-e', day(1), true),
    ],
    dailyReqs: reqs, jYear: JY, jMonth: JM,
  });
  assert.equal(lawful.headNurseViolations, 0);
  assert.equal(lawful.manualLocks, 1);
  assert.equal(lawful.unfilled.length, 1);
  assert.equal(lawful.unfilled[0].shift, 'morning');
  assert.equal(lawful.nightsSpread.max, 2);
  assert.equal(lawful.nightsSpread.min, 0);
  const e1 = lawful.perEmployee.find(s => s.employeeId === 'e1');
  assert.equal(e1?.nights, 2);
  assert.equal(e1?.total, 2);
  assert.ok(lawful.lines.some(l => l.includes('قانون ثابت سرپرستار سالم است')));

  const violating = explainRoster({
    personnel: [head], shiftTypes: SHIFT_TYPES,
    entries: [entry('hn', 's-n', day(3))],
    dailyReqs: buildDailyReqs({ morning: 0, evening: 0, night: 0 }, 30), jYear: JY, jMonth: JM,
  });
  assert.equal(violating.headNurseViolations, 1);
});

// ── P2-3 سازندهٔ روایت گزارش ─────────────────────────────────────────────────
test('P2-3 پیش‌نویس روایی: بخش‌های پر با برچسب، خالی‌ها رد، سطر نمره‌ها در انتها', () => {
  const text = composeReportDraft({
    assessment: 'بیمار هوشیار است', diagnoses: 'درد حاد', actions: 'مسکن داده شد',
    response: 'درد کاهش یافت', vitals: 'فشار ۱۲۰/۸۰', followups: 'کنترل درد ساعت بعد',
    incidents: '', braden: 18, morse: 30,
  });
  for (const part of ['بیمار هوشیار است', 'درد حاد', 'مسکن داده شد', 'درد کاهش یافت', 'فشار ۱۲۰/۸۰', 'کنترل درد ساعت بعد']) {
    assert.ok(text.includes(part), `متن باید شامل «${part}» باشد`);
  }
  assert.ok(!text.includes('حوادث:'), 'بخش خالی نباید در متن بیاید');
  assert.ok(text.includes('Braden') && text.includes('Morse'), 'سطر نمره‌ها باید باشد');

  const partial = composeReportDraft({
    assessment: 'فقط ارزیابی', diagnoses: '', actions: '', response: '', vitals: '', followups: '', incidents: '',
  });
  assert.equal(partial, 'ارزیابی: فقط ارزیابی');
  const empty = composeReportDraft({
    assessment: '', diagnoses: '', actions: '', response: '', vitals: '', followups: '', incidents: '',
  });
  assert.equal(empty, '');
});

// ── P2-4 چک بستهٔ ماه ────────────────────────────────────────────────────────
const PATIENTS = [{ id: 'p1', fullName: 'بیمار یک', fileNo: 'F-1' }];
const PACKAGES = [{ id: 'pkg-g3', code: 'NC-G3', title: 'گروه ۳', kValue: 3, unit: 'بیمار/نوبت' }];
const nameOf = (id: string) => PEOPLE.find(p => p.id === id)?.name ?? id;

test('P2-4 چک بسته: دقیقاً سه خلأ کاشته‌شده؛ دادهٔ سالم خالی', () => {
  const admission: Admission = {
    id: 'a1', wardId: 'dep1', patientId: 'p1', admittedAtISO: `${day(5)}T08:00:00.000Z`,
    admissionType: 'emergency', admissionReason: 'درد قفسه سینه', attendingName: '', status: 'admitted',
  };
  const report: NursingReport = {
    id: 'r1', admissionId: 'a1', authorEmployeeId: 'e1', shift: 'morning', dateISO: day(10),
    body: { assessment: 'x', diagnoses: 'x', actions: 'x', response: 'x', vitals: '', followups: '', incidents: '' },
    status: 'draft',
  };
  const handover: Handover = {
    id: 'h1', admissionId: 'a1', giverEmployeeId: 'e1', receiverEmployeeId: 'e2',
    atISO: `${day(10)}T14:00:00.000Z`, sbar: { situation: 's', background: 'b', assessment: 'a', recommendation: 'r' },
  };
  const findings = checkMonthPack({
    nursingRecords: [], nursingPackages: PACKAGES, patientReports: [report], handovers: [handover],
    admissions: [admission], assignments: [], patients: PATIENTS, employeeName: nameOf, jYear: JY, jMonth: JM,
  });
  assert.deepEqual(findings.map(f => f.kind).sort(), [
    'admission_no_attending', 'unaccepted_handover', 'unsigned_report',
  ]);

  const cleanAdmission: Admission = { ...admission, id: 'a2', attendingName: 'دکتر رضایی', dischargedAtISO: `${day(6)}T10:00:00.000Z`, status: 'discharged' };
  const clean = checkMonthPack({
    nursingRecords: [{
      id: 'ns1', wardId: 'dep1', employeeId: 'e1', patientRef: 'F-1', packageId: 'pkg-g3', count: 1,
      dateISO: day(5), shift: 'morning', status: 'confirmed', recordedAtISO: `${day(5)}T09:00:00.000Z`,
    }],
    nursingPackages: PACKAGES,
    patientReports: [{ ...report, id: 'r2', admissionId: 'a2', status: 'signed', dateISO: day(5) }],
    handovers: [{ ...handover, id: 'h2', admissionId: 'a2', acceptedAtISO: `${day(10)}T15:00:00.000Z` }],
    admissions: [cleanAdmission],
    assignments: [
      { id: 'as1', admissionId: 'a2', employeeId: 'e1', role: 'responsible', shift: 'morning', dateISO: day(5), source: 'roster' },
      { id: 'as2', admissionId: 'a2', employeeId: 'e2', role: 'responsible', shift: 'morning', dateISO: day(6), source: 'roster' },
    ],
    patients: PATIENTS, employeeName: nameOf, jYear: JY, jMonth: JM,
  });
  assert.deepEqual(clean, []);
});

// ── P2-5 خط مبنای census ─────────────────────────────────────────────────────
test('P2-5 census: سری ثابت ۲۰ نفره → میانگین ۲۰؛ سابقهٔ کم → ناکافی', () => {
  const admissions = Array.from({ length: 20 }, () => ({ admittedAtISO: '2026-01-31T08:00:00.000Z' }));
  const fc = forecastCensus(admissions, 7, '2026-02-20');
  assert.equal(fc.insufficient, false);
  if (!fc.insufficient) {
    assert.equal(fc.sampleDays, 20);
    assert.ok(fc.series.every(p => p.count === 20));
    assert.equal(fc.forecast.length, 7);
    assert.ok(Math.abs(fc.forecast[0].mean - 20) < 0.001);
    assert.ok(Math.abs(fc.forecast[0].low - 20) < 0.001);
    assert.ok(Math.abs(fc.forecast[0].high - 20) < 0.001);
  }
  const few = forecastCensus([{ admittedAtISO: '2026-02-18T08:00:00.000Z' }], 7, '2026-02-20');
  assert.equal(few.insufficient, true);
});

// ── P2-6 رجیستری zone فاز ۲ ──────────────────────────────────────────────────
test('P2-6 ابزارهای فاز ۲ Zone C، ‏census ‏Zone A و قفل Zone D پابرجا', () => {
  for (const key of ['leave_triage', 'roster_explain', 'report_draft', 'pack_check']) {
    assert.equal(zoneOf(key), 'C', `${key} باید Zone C باشد`);
  }
  assert.equal(zoneOf('census_baseline'), 'A');
  const toolKeys = new Set(AGENT_TOOLS.map(t => t.key));
  for (const d of ZONE_D_ACTIONS) assert.ok(!toolKeys.has(d), `Zone D نباید ابزار باشد: ${d}`);
});
