// دور ۱۶: پروندهٔ بیمار — قراردادهای لایهٔ پاسخگویی اپیزود:
// (۱) برگ پذیرش بدون علت پذیرش/پزشک معالج یا با کد ملی بدفرم رد می‌شود؛
// (۲) «پرستار مسئول این شیفت» از تخصیص حل می‌شود، نه از حدس؛ (۳) گزارش به
// تخصیص گره می‌خورد و امضایش کامل‌بودن حداقل‌ها را می‌خواهد؛ (۴) خط زمانی از
// پذیرش تا بستن مرتب است؛ (۵) نامزدهای تخصیص از روی برنامهٔ همان روز می‌آیند؛
// (۶) دادهٔ دمو این قراردادها را روی روس‌تر واقعی نقض نمی‌کند.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAdmissionInput, resolveResponsibleAt, reportForAssignment, reportCompleteness,
  buildEpisodeTimeline, rosterCandidatesByShift, emptyReportBody,
  type Admission, type PatientAssignment, type NursingReport, type Handover,
} from '../../src/features/patients/patientService';
import { buildDemoSnapshot } from '../../src/services/data/demoRepositories';
import { isoFromJalali } from '../../src/features/leave/leaveService';
import { MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import type { ScheduleEntry } from '../../src/core/types';

const adm: Admission = {
  id: 'adm-1', wardId: 'dep1', patientId: 'pat-1', admittedAtISO: '2026-09-23T03:40:00.000Z',
  admissionType: 'emergency', admissionReason: 'درد قفسهٔ سینه', attendingName: 'دکتر کریمی', status: 'admitted',
};
const asg = (patch: Partial<PatientAssignment>): PatientAssignment => ({
  id: 'a1', admissionId: 'adm-1', employeeId: 'n1', role: 'responsible',
  shift: 'morning', dateISO: '2026-09-24', source: 'roster', ...patch,
});

test('PF-1 برگ پذیرش: علت پذیرش و پزشک معالج الزامی، کد ملی ۱۰ رقمی', () => {
  const base = { fullName: 'بیمار الف', fileNo: 'P-1', admissionReason: 'علت', attendingName: 'دکتر' };
  assert.deepEqual(validateAdmissionInput(base), []);
  assert.ok(validateAdmissionInput({ ...base, admissionReason: ' ' }).some(e => e.includes('علت پذیرش')));
  assert.ok(validateAdmissionInput({ ...base, attendingName: '' }).some(e => e.includes('پزشک')));
  assert.ok(validateAdmissionInput({ ...base, nationalCode: '123' }).some(e => e.includes('کد ملی')));
  assert.deepEqual(validateAdmissionInput({ ...base, nationalCode: '0012345678' }), []);
});

test('PF-2 حل پرستار مسئول: مسئول بیمار بر همکار مقدم است؛ مسئول شیفت fallback', () => {
  const list = [
    asg({ id: 'a-assoc', employeeId: 'n2', role: 'associate' }),
    asg({ id: 'a-resp', employeeId: 'n1', role: 'responsible' }),
  ];
  assert.equal(resolveResponsibleAt(list, 'adm-1', '2026-09-24', 'morning')?.employeeId, 'n1');
  assert.equal(resolveResponsibleAt([asg({ role: 'charge', employeeId: 'n3' })], 'adm-1', '2026-09-24', 'morning')?.employeeId, 'n3');
  assert.equal(resolveResponsibleAt(list, 'adm-1', '2026-09-24', 'night'), undefined);
  assert.equal(resolveResponsibleAt(list, 'adm-1', '2026-09-25', 'morning'), undefined);
});

test('PF-3 گزارش به تخصیص گره می‌خورد و امضا کامل‌بودن حداقل‌ها را می‌خواهد', () => {
  const rep: NursingReport = {
    id: 'r1', admissionId: 'adm-1', assignmentId: 'a-resp', authorEmployeeId: 'n1',
    shift: 'morning', dateISO: '2026-09-24', body: emptyReportBody(), status: 'draft',
  };
  assert.equal(reportForAssignment([rep], 'a-resp')?.id, 'r1');
  assert.equal(reportForAssignment([rep], 'a-other'), undefined);
  assert.equal(reportCompleteness(rep.body).length, 4);
  const full = { ...rep.body, assessment: 'الف', diagnoses: 'ب', actions: 'ج', response: 'د' };
  assert.deepEqual(reportCompleteness(full), []);
});

test('PF-4 خط زمانی: پذیرش اول، رویدادها مرتب، بستن آخر', () => {
  const closed: Admission = { ...adm, status: 'discharged', dischargedAtISO: '2026-09-26T07:30:00.000Z', dischargeNote: 'ترخیص' };
  const hov: Handover = {
    id: 'h1', admissionId: 'adm-1', giverEmployeeId: 'n1', receiverEmployeeId: 'n2',
    atISO: '2026-09-24T10:45:00.000Z',
    sbar: { situation: '', background: '', assessment: '', recommendation: '' },
  };
  const events = buildEpisodeTimeline({
    admission: closed, assignments: [asg({})], reports: [], handovers: [hov],
    employeeName: id => id,
  });
  assert.equal(events[0]?.kind, 'admission');
  assert.equal(events[events.length - 1]?.kind, 'discharge');
  const ats = events.map(e => e.atISO);
  assert.deepEqual(ats, [...ats].sort());
  assert.ok(events.some(e => e.kind === 'handover' && (e.detail ?? '').includes('پذیرش')));
});

test('PF-5 نامزدهای تخصیص از روی برنامه: صبح/شب از روی نوع شیفت، آف کنار می‌رود', () => {
  const date = '2026-09-24';
  const entries: ScheduleEntry[] = [
    { personnelId: 'n1', shiftTypeId: 's-m', date, isManualEntry: false },
    { personnelId: 'n2', shiftTypeId: 's-n', date, isManualEntry: false },
    { personnelId: 'n3', shiftTypeId: 's-off', date, isManualEntry: false },
    { personnelId: 'n4', shiftTypeId: 's-m', date: '2026-09-25', isManualEntry: false },
  ];
  const out = rosterCandidatesByShift(entries, MOCK_SHIFT_TYPES, date);
  assert.deepEqual(out.morning, ['n1']);
  assert.deepEqual(out.night, ['n2']);
  assert.deepEqual(out.evening, []);
});

test('PF-6 دمو: هر اپیزود باز تخصیص دارد؛ گزارش امضاشده و تحویل به تخصیص‌های همان اپیزود گره خورده‌اند', () => {
  const snap = buildDemoSnapshot(1405, 7);
  const open = snap.admissions.filter(a => a.status === 'admitted');
  assert.ok(open.length >= 2, 'حداقل دو اپیزود باز در دمو');
  const asgIds = new Set(snap.patientAssignments.map(a => a.id));
  for (const a of open) {
    assert.ok(snap.patientAssignments.some(x => x.admissionId === a.id && x.role === 'responsible'),
      `اپیزود ${a.id} تخصیص مسئول ندارد`);
    assert.ok(a.admissionReason.length > 0 && a.attendingName.length > 0);
  }
  const signed = snap.patientReports.filter(r => r.status === 'signed');
  assert.ok(signed.length >= 1);
  for (const r of signed) assert.ok(r.assignmentId && asgIds.has(r.assignmentId), 'گزارش امضاشده بدون تخصیص معتبر');
  for (const h of snap.handovers) {
    assert.ok(h.fromAssignmentId && asgIds.has(h.fromAssignmentId));
    assert.ok(h.toAssignmentId && asgIds.has(h.toAssignmentId));
    assert.ok(h.acceptedAt, 'تحویل دمو باید پذیرفته‌شده باشد');
  }
  const day13 = isoFromJalali(1405, 7, 13);
  assert.ok(snap.patientAssignments.some(a => a.serviceDate === day13), 'روز جاری دمو (۱۳) تخصیص دارد');
});
