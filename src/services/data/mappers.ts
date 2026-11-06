// نگاشت رکوردهای دیتابیس ↔ تایپ‌های دامنهٔ صفحات/سرویس‌ها (core/types و features).
import type { Personnel, ShiftType, ScheduleEntry } from '../../core/types';
import type { LeaveRequest } from '../../features/leave/leaveService';
import type { WorkRecord } from '../../features/workRecords/workRecordService';
import type { NursingPackage, NursingServiceRecord } from '../../features/nursingServices/nursingService';
import type {
  EmployeeRecord, ShiftTypeRecord, EntryRecord, LeaveRecord, WorkRecordRecord,
  NursingPackageRecord, NursingServiceDbRecord,
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
