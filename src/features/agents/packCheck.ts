// ─────────────────────────────────────────────────────────────────────────────
// چک بستهٔ ماه تعرفه/کارانه — فاز ۲ لایهٔ ایجنت (Zone C، دور ۱۸، DR-003).
// پیش از بستن ماه و توزیع کارانه، کامل‌بودن «بسته» با چک‌های قطعی سنجیده
// می‌شود: خدمتی که بستهٔ تعرفه/K ندارد وارد توزیع نمی‌شود، گزارش پرستاریِ
// امضانشده سند پاسخگویی نیست، تحویلِ پذیرفته‌نشده زنجیره را باز می‌گذارد و
// روزی از اپیزود که پرستار مسئول ندارد خلأ پاسخگویی است (لایهٔ دور ۱۶).
// این ماژول فقط یافته تولید می‌کند؛ بستن ماه و مبلغ‌ها کار انسان است.
// ─────────────────────────────────────────────────────────────────────────────

import { getDaysInJalaliMonth } from '../../core/jalali';
import { isoFromJalali, leaveDaysInRange } from '../leave/leaveService';
import type { NursingPackage, NursingServiceRecord } from '../nursingServices/nursingService';
import {
  resolveResponsibleAt, SHIFT_LABELS,
  type Admission, type Handover, type NursingReport, type Patient, type PatientAssignment,
} from '../patients/patientService';

export type PackFindingKind =
  | 'service_without_tariff'
  | 'unsigned_report'
  | 'unaccepted_handover'
  | 'admission_no_attending'
  | 'admission_day_no_responsible';

export interface PackFinding {
  kind: PackFindingKind;
  severity: 'high' | 'medium';
  message: string;
  refId?: string;
}

export interface PackCheckInput {
  nursingRecords: NursingServiceRecord[];
  nursingPackages: NursingPackage[];
  patientReports: NursingReport[];
  handovers: Handover[];
  admissions: Admission[];
  assignments: PatientAssignment[];
  patients: Patient[];
  employeeName: (id: string) => string;
  jYear: number;
  jMonth: number;
}

export function checkMonthPack(input: PackCheckInput): PackFinding[] {
  const daysInMonth = getDaysInJalaliMonth(input.jYear, input.jMonth);
  const startISO = isoFromJalali(input.jYear, input.jMonth, 1);
  const endISO = isoFromJalali(input.jYear, input.jMonth, daysInMonth);
  const inMonth = (dateISO: string) => dateISO >= startISO && dateISO <= endISO;
  const patientName = (id: string) => input.patients.find(p => p.id === id)?.fullName ?? id;
  const findings: PackFinding[] = [];

  // ۱) خدمت پرستاری بدون بستهٔ تعرفه/K معتبر — وارد توزیع کارانه نمی‌شود.
  const packageIds = new Set(input.nursingPackages.map(p => p.id));
  for (const r of input.nursingRecords) {
    if (!inMonth(r.dateISO)) continue;
    if (r.packageId && packageIds.has(r.packageId)) continue;
    findings.push({
      kind: 'service_without_tariff', severity: 'medium', refId: r.id,
      message: `خدمت پرستاری ${input.employeeName(r.employeeId)} در ${r.dateISO} (بیمار ${r.patientRef}) بستهٔ تعرفه/K معتبر ندارد و وارد توزیع نمی‌شود.`,
    });
  }

  // ۲) گزارش پرستاریِ این ماه که هنوز پیش‌نویس است و امضا نشده.
  for (const r of input.patientReports) {
    if (r.status !== 'draft' || !inMonth(r.dateISO)) continue;
    const adm = input.admissions.find(a => a.id === r.admissionId);
    findings.push({
      kind: 'unsigned_report', severity: 'medium', refId: r.id,
      message: `گزارش پرستاری ${input.employeeName(r.authorEmployeeId)} برای ${adm ? patientName(adm.patientId) : 'بیمار'} در ${r.dateISO} (شیفت ${SHIFT_LABELS[r.shift]}) هنوز پیش‌نویس است و امضا نشده.`,
    });
  }

  // ۳) تحویل شیفتِ این ماه که گیرنده هنوز نپذیرفته است.
  for (const h of input.handovers) {
    const dateISO = h.atISO.slice(0, 10);
    if (h.acceptedAtISO || !inMonth(dateISO)) continue;
    const adm = input.admissions.find(a => a.id === h.admissionId);
    findings.push({
      kind: 'unaccepted_handover', severity: 'medium', refId: h.id,
      message: `تحویل شیفت ${input.employeeName(h.giverEmployeeId)} به ${input.employeeName(h.receiverEmployeeId)} برای ${adm ? patientName(adm.patientId) : 'بیمار'} در ${dateISO} هنوز از سوی گیرنده پذیرفته نشده است.`,
    });
  }

  // ۴) اپیزودهای تلاقی‌دار با این ماه: پزشک معالج خالی، یا روزی بدون پرستار مسئول.
  for (const adm of input.admissions) {
    const admDate = adm.admittedAtISO.slice(0, 10);
    const disDate = adm.dischargedAtISO?.slice(0, 10) ?? null;
    if (admDate > endISO || (disDate !== null && disDate < startISO)) continue;
    if (!adm.attendingName?.trim()) {
      findings.push({
        kind: 'admission_no_attending', severity: 'high', refId: adm.id,
        message: `پذیرش ${patientName(adm.patientId)} در ${admDate} پزشک معالج ثبت‌شده ندارد؛ پروندهٔ اپیزود بدون پزشک نام‌دار کامل نیست.`,
      });
      continue; // خلأ پزشک جدا گزارش شد؛ چک روزها روی همین اپیزود تکرار نمی‌شود.
    }
    const from = admDate < startISO ? startISO : admDate;
    const to = disDate !== null && disDate < endISO ? disDate : endISO;
    const gapDays: string[] = [];
    for (const dateISO of leaveDaysInRange(from, to)) {
      const hasResponsible = (['morning', 'evening', 'night'] as const)
        .some(shift => resolveResponsibleAt(input.assignments, adm.id, dateISO, shift));
      if (!hasResponsible) gapDays.push(dateISO);
    }
    if (gapDays.length > 0) {
      findings.push({
        kind: 'admission_day_no_responsible', severity: 'high', refId: adm.id,
        message: `برای ${patientName(adm.patientId)} در ${gapDays.length.toLocaleString('fa-IR')} روز از این ماه (از جمله ${gapDays[0]}) هیچ پرستار مسئولی ثبت نشده است؛ پاسخگویی آن روزها خالی است.`,
      });
    }
  }

  const sevRank = { high: 0, medium: 1 } as const;
  findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.kind.localeCompare(b.kind));
  return findings;
}
