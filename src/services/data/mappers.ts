// نگاشت رکوردهای دیتابیس ↔ تایپ‌های دامنهٔ صفحات/سرویس‌ها (core/types و features).
import type { Personnel, ShiftType, ScheduleEntry } from '../../core/types';
import type { LeaveRequest } from '../../features/leave/leaveService';
import type { WorkRecord } from '../../features/workRecords/workRecordService';
import type { NursingPackage, NursingServiceRecord } from '../../features/nursingServices/nursingService';
import type {
  Patient, Admission, PatientAssignment, NursingReport, NursingReportBody, Handover, SbarNote,
} from '../../features/patients/patientService';
import { emptyReportBody } from '../../features/patients/patientService';
import type {
  EmployeeRecord, ShiftTypeRecord, EntryRecord, LeaveRecord, WorkRecordRecord,
  NursingPackageRecord, NursingServiceDbRecord,
  PatientRecord, AdmissionRecord, PatientAssignmentRecord, PatientReportRecord, HandoverRecord,
} from './types';

export function nursingPackageToDomain(r: NursingPackageRecord): NursingPackage {
  return { id: r.id, code: r.code, title: r.title, kValue: r.kValue, unit: r.unit, careGroup: r.careGroup ?? undefined };
}

export function nursingRecordToDomain(r: NursingServiceDbRecord): NursingServiceRecord {
  return {
    id: r.id, wardId: r.wardId, employeeId: r.employeeId, patientRef: r.patientRef,
    packageId: r.packageId, count: r.count, dateISO: r.serviceDate, shift: r.shift,
    status: r.status, recordedAtISO: r.createdAt,
    ...(r.confirmedBy ? { confirmedBy: r.confirmedBy } : {}),
    ...(r.confirmedAt ? { confirmedAtISO: r.confirmedAt } : {}),
  };
}

export function nursingRecordToDb(r: NursingServiceRecord, hospitalId: string): Omit<NursingServiceDbRecord, 'id' | 'createdAt'> {
  return {
    hospitalId, wardId: r.wardId, employeeId: r.employeeId, patientRef: r.patientRef,
    packageId: r.packageId, count: r.count, serviceDate: r.dateISO, shift: r.shift,
    status: r.status === 'confirmed' ? 'confirmed' : 'recorded',
    confirmedBy: r.confirmedBy ?? null, confirmedAt: r.confirmedAtISO ?? null,
  };
}

export function personnelToEmployeeRecord(p: Personnel, hospitalId: string): EmployeeRecord {
  return {
    id: p.id, hospitalId, wardId: p.departmentId, profileId: null,
    fullName: p.name, personnelCode: p.personnelCode, roleTitle: p.role,
    employmentStatus: p.employmentStatus, employmentStartJalali: p.employmentDate ?? null,
    baseDutyHoursOverride: p.baseDutyHours ?? null, isActive: true,
  };
}

export function employeeToPersonnel(e: EmployeeRecord): Personnel {
  return {
    id: e.id,
    name: e.fullName,
    personnelCode: e.personnelCode,
    role: e.roleTitle ?? 'پرستار',
    departmentId: e.wardId,
    seniorityLevel: 1,
    nationalCode: '',
    contactNumber: '',
    employmentStatus: e.employmentStatus,
    employmentDate: e.employmentStartJalali ?? undefined,
    baseDutyHours: e.baseDutyHoursOverride ?? undefined,
  };
}

export function shiftTypeToDomain(s: ShiftTypeRecord): ShiftType {
  return {
    id: s.id,
    name: s.name,
    symbol: s.symbol,
    displayColor: s.color ?? '',
    realDuration: s.realDurationHours,
    calculatedValue: s.calculatedValue,
    fridayCalculatedValue: s.fridayValue,
    holidayCalculatedValue: s.holidayValue,
    departmentIds: [],
  };
}

export function entryToDomain(e: EntryRecord): ScheduleEntry {
  return { personnelId: e.employeeId, shiftTypeId: e.shiftTypeId, date: e.entryDate, isManualEntry: e.isManual };
}

export function leaveToDomain(l: LeaveRecord): LeaveRequest {
  return {
    id: l.id,
    employeeId: l.employeeId,
    leaveTypeCode: l.leaveTypeCode,
    startISO: l.startDate,
    endISO: l.endDate,
    isHourly: l.isHourly,
    hours: l.hours,
    attachmentPath: l.attachmentPath ?? undefined,
    approvalStep: l.approvalStep ?? 0,
    approvals: l.approvals ?? [],
    reason: l.reason ?? undefined,
    status: l.status,
    reviewedBy: l.reviewedBy ?? undefined,
  };
}

/** درخواست دامنه → رکورد لایهٔ داده برای ساخت در دیتابیس (بدون id و وضعیت و بازبین). */
export function leaveRequestToDb(
  req: LeaveRequest, hospitalId: string, wardId: string,
): Omit<LeaveRecord, 'id' | 'status' | 'reviewedBy' | 'approvalStep' | 'approvals'> {
  return {
    hospitalId, wardId, employeeId: req.employeeId, leaveTypeCode: req.leaveTypeCode,
    startDate: req.startISO, endDate: req.endISO,
    isHourly: req.isHourly ?? false, hours: req.hours ?? null,
    reason: req.reason ?? null, attachmentPath: req.attachmentPath ?? null,
  };
}

export function workRecordToDomain(w: WorkRecordRecord, nameOf: (id: string) => { name: string; code: string }): WorkRecord {
  const t = w.totals;
  const { name, code } = nameOf(w.employeeId);
  return {
    employeeId: w.employeeId,
    employeeName: name,
    personnelCode: code,
    dutyHours: t.dutyHours ?? 0,
    workedHours: t.workedHours ?? 0,
    morningHours: t.morningHours ?? 0,
    eveningHours: t.eveningHours ?? 0,
    nightHours: t.nightHours ?? 0,
    holidayHours: t.holidayHours ?? 0,
    leaveDays: t.leaveDays ?? 0,
    overtimeHours: t.overtimeHours ?? 0,
    nightPaid: t.nightPaid ?? 0,
    eveningPaid: t.eveningPaid ?? 0,
    totalPaidHours: t.totalPaidHours ?? 0,
    status: w.status,
    actualWorkedHours: t.actualWorkedHours,
    actualOvertimeHours: t.actualOvertimeHours,
    absentDays: t.absentDays,
    lateMinutes: t.lateMinutes,
  };
}

export function workRecordToRecord(w: WorkRecord, ctx: { id: string; hospitalId: string; wardId: string; jYear: number; jMonth: number }): WorkRecordRecord {
  return {
    id: ctx.id,
    hospitalId: ctx.hospitalId,
    wardId: ctx.wardId,
    employeeId: w.employeeId,
    jYear: ctx.jYear,
    jMonth: ctx.jMonth,
    totals: {
      dutyHours: w.dutyHours, workedHours: w.workedHours, morningHours: w.morningHours,
      eveningHours: w.eveningHours, nightHours: w.nightHours, holidayHours: w.holidayHours,
      leaveDays: w.leaveDays, overtimeHours: w.overtimeHours, nightPaid: w.nightPaid,
      eveningPaid: w.eveningPaid, totalPaidHours: w.totalPaidHours,
      ...(w.actualWorkedHours != null ? { actualWorkedHours: w.actualWorkedHours } : {}),
      ...(w.actualOvertimeHours != null ? { actualOvertimeHours: w.actualOvertimeHours } : {}),
      ...(w.absentDays != null ? { absentDays: w.absentDays } : {}),
      ...(w.lateMinutes != null ? { lateMinutes: w.lateMinutes } : {}),
    },
    status: w.status,
  };
}

// ── پروندهٔ بیمار (مایگریشن ۰۰۱۳): رکورد دیتابیس ↔ دامنه ─────────────────────
export function patientToDomain(r: PatientRecord): Patient {
  return {
    id: r.id, fullName: r.fullName, fileNo: r.fileNo,
    ...(r.nationalCode ? { nationalCode: r.nationalCode } : {}),
    ...(r.birthDate ? { birthDateISO: r.birthDate } : {}),
    ...(r.gender ? { gender: r.gender } : {}),
  };
}
export function patientToDb(p: Patient, hospitalId: string): Omit<PatientRecord, 'id'> {
  return {
    hospitalId, fullName: p.fullName, fileNo: p.fileNo,
    nationalCode: p.nationalCode ?? null, birthDate: p.birthDateISO ?? null, gender: p.gender ?? null,
  };
}
export function admissionToDomain(r: AdmissionRecord): Admission {
  return {
    id: r.id, wardId: r.wardId, patientId: r.patientId, admittedAtISO: r.admittedAt,
    admissionType: r.admissionType, admissionReason: r.admissionReason, attendingName: r.attendingName,
    status: r.status,
    ...(r.admissionSource ? { admissionSource: r.admissionSource } : {}),
    ...(r.chiefComplaint ? { chiefComplaint: r.chiefComplaint } : {}),
    ...(r.diagnosisText ? { diagnosisText: r.diagnosisText } : {}),
    ...(r.diagnosisIcd10 ? { diagnosisIcd10: r.diagnosisIcd10 } : {}),
    ...(r.attendingCouncilNo ? { attendingCouncilNo: r.attendingCouncilNo } : {}),
    ...(r.attendingService ? { attendingService: r.attendingService } : {}),
    ...(r.bedLabel ? { bedLabel: r.bedLabel } : {}),
    ...(r.insuranceType ? { insuranceType: r.insuranceType } : {}),
    ...(r.insuranceNo ? { insuranceNo: r.insuranceNo } : {}),
    ...(r.allergySummary ? { allergySummary: r.allergySummary } : {}),
    ...(r.dischargedAt ? { dischargedAtISO: r.dischargedAt } : {}),
    ...(r.dischargeNote ? { dischargeNote: r.dischargeNote } : {}),
  };
}
export function admissionToDb(a: Admission, hospitalId: string, createdBy: string | null): Omit<AdmissionRecord, 'id'> {
  return {
    hospitalId, wardId: a.wardId, patientId: a.patientId, admittedAt: a.admittedAtISO,
    admissionType: a.admissionType, admissionSource: a.admissionSource ?? null,
    chiefComplaint: a.chiefComplaint ?? null, admissionReason: a.admissionReason,
    diagnosisText: a.diagnosisText ?? null, diagnosisIcd10: a.diagnosisIcd10 ?? null,
    attendingName: a.attendingName, attendingCouncilNo: a.attendingCouncilNo ?? null,
    attendingService: a.attendingService ?? null, bedLabel: a.bedLabel ?? null,
    insuranceType: a.insuranceType ?? null, insuranceNo: a.insuranceNo ?? null,
    allergySummary: a.allergySummary ?? null, status: a.status,
    dischargedAt: a.dischargedAtISO ?? null, dischargeNote: a.dischargeNote ?? null, createdBy,
  };
}
export function assignmentToDomain(r: PatientAssignmentRecord): PatientAssignment {
  return {
    id: r.id, admissionId: r.admissionId, employeeId: r.employeeId, role: r.role,
    shift: r.shift, dateISO: r.serviceDate, source: r.source,
    ...(r.assignedBy ? { assignedBy: r.assignedBy } : {}),
  };
}
export function assignmentToDb(a: PatientAssignment, hospitalId: string, wardId: string): Omit<PatientAssignmentRecord, 'id'> {
  return {
    hospitalId, wardId, admissionId: a.admissionId, employeeId: a.employeeId, role: a.role,
    shift: a.shift, serviceDate: a.dateISO, assignedBy: a.assignedBy ?? null, source: a.source,
  };
}
export function reportBodyFromJson(json: Record<string, unknown>): NursingReportBody {
  const base = emptyReportBody();
  const str = (k: keyof NursingReportBody) => (typeof json[k] === 'string' ? (json[k] as string) : base[k] as string);
  const num = (k: 'braden' | 'morse') => (typeof json[k] === 'number' ? (json[k] as number) : undefined);
  return {
    assessment: str('assessment'), diagnoses: str('diagnoses'), actions: str('actions'),
    response: str('response'), vitals: str('vitals'), followups: str('followups'), incidents: str('incidents'),
    ...(num('braden') !== undefined ? { braden: num('braden') } : {}),
    ...(num('morse') !== undefined ? { morse: num('morse') } : {}),
  };
}
export function reportToDomain(r: PatientReportRecord): NursingReport {
  return {
    id: r.id, admissionId: r.admissionId, authorEmployeeId: r.authorEmployeeId,
    shift: r.shift, dateISO: r.reportDate, body: reportBodyFromJson(r.body), status: r.status,
    ...(r.assignmentId ? { assignmentId: r.assignmentId } : {}),
    ...(r.signedAt ? { signedAtISO: r.signedAt } : {}),
  };
}
export function reportToDb(r: NursingReport, hospitalId: string, wardId: string): Omit<PatientReportRecord, 'id'> {
  return {
    hospitalId, wardId, admissionId: r.admissionId, assignmentId: r.assignmentId ?? null,
    authorEmployeeId: r.authorEmployeeId, shift: r.shift, reportDate: r.dateISO,
    body: { ...r.body }, status: r.status, signedAt: r.signedAtISO ?? null,
  };
}
export function handoverToDomain(r: HandoverRecord): Handover {
  const s = r.sbar ?? {};
  const str = (k: keyof SbarNote) => (typeof s[k] === 'string' ? (s[k] as string) : '');
  return {
    id: r.id, admissionId: r.admissionId, giverEmployeeId: r.giverEmployeeId,
    receiverEmployeeId: r.receiverEmployeeId, atISO: r.handoverAt,
    sbar: { situation: str('situation'), background: str('background'), assessment: str('assessment'), recommendation: str('recommendation') },
    ...(r.fromAssignmentId ? { fromAssignmentId: r.fromAssignmentId } : {}),
    ...(r.toAssignmentId ? { toAssignmentId: r.toAssignmentId } : {}),
    ...(r.stateSummary ? { stateSummary: r.stateSummary } : {}),
    ...(r.acceptedAt ? { acceptedAtISO: r.acceptedAt } : {}),
  };
}
export function handoverToDb(h: Handover, hospitalId: string, wardId: string): Omit<HandoverRecord, 'id'> {
  return {
    hospitalId, wardId, admissionId: h.admissionId,
    fromAssignmentId: h.fromAssignmentId ?? null, toAssignmentId: h.toAssignmentId ?? null,
    giverEmployeeId: h.giverEmployeeId, receiverEmployeeId: h.receiverEmployeeId,
    handoverAt: h.atISO, sbar: { ...h.sbar }, stateSummary: h.stateSummary ?? null,
    acceptedAt: h.acceptedAtISO ?? null,
  };
}
