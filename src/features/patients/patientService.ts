// ─────────────────────────────────────────────────────────────────────────────
// پروندهٔ بیمار — لایهٔ پاسخگویی اپیزود (دور ۱۶).
// مرز با HIS: این ماژول دستورات پزشک، کاردکس، نتایج آزمایش/تصویر و سیر بیماری
// را نگه نمی‌دارد؛ فقط پاسخ این چهار سؤال را: چرا پذیرش شد؟ پزشک معالج کیست؟
// هر شیفت پرستار مسئول کیست؟ گزارش امضاشدهٔ آن شیفت و تحویل به چه کسی چیست؟
// مبنای طراحی: hejleh-patient-episode-design-fa.md (پژوهش استانداردها).
// ─────────────────────────────────────────────────────────────────────────────

import type { ScheduleEntry, ShiftType } from '../../core/types';
import { categorizeShift } from '../../core/rules/engine';

export type CareShift = 'morning' | 'evening' | 'night';
export type AdmissionType = 'emergency' | 'elective' | 'transfer';
export type AdmissionStatus = 'admitted' | 'discharged' | 'transferred' | 'deceased' | 'lama';
export type AssignmentRole = 'responsible' | 'associate' | 'charge';
export type AssignmentSource = 'roster' | 'manual' | 'handover';

export interface Patient {
  id: string;
  fullName: string;
  nationalCode?: string;
  fileNo: string;
  birthDateISO?: string;
  gender?: 'female' | 'male';
}

export interface Admission {
  id: string;
  wardId: string;
  patientId: string;
  admittedAtISO: string;
  admissionType: AdmissionType;
  admissionSource?: string;
  chiefComplaint?: string;
  /** علت پذیرش — قلب پرونده: چرا این بیمار بستری شد. */
  admissionReason: string;
  diagnosisText?: string;
  diagnosisIcd10?: string;
  /** پزشک معالج (نام‌دار؛ در صورت تغییر، پذیرش تازه ثبت نمی‌شود — فیلد snapshot همین اپیزود است). */
  attendingName: string;
  attendingCouncilNo?: string;
  attendingService?: string;
  bedLabel?: string;
  insuranceType?: string;
  insuranceNo?: string;
  allergySummary?: string;
  status: AdmissionStatus;
  dischargedAtISO?: string;
  dischargeNote?: string;
}

export interface PatientAssignment {
  id: string;
  admissionId: string;
  employeeId: string;
  role: AssignmentRole;
  shift: CareShift;
  dateISO: string; // تاریخ خدمت (میلادی ISO) — هم‌تراز با مدخل‌های برنامه
  assignedBy?: string;
  source: AssignmentSource;
}

/** بدنهٔ ساخت‌یافتهٔ گزارش پرستاری یک شیفت — حداقل‌های دستورالعمل مستندسازی ایران. */
export interface NursingReportBody {
  /** ارزیابی سیستماتیک / وضعیت بیمار در این شیفت. */
  assessment: string;
  /** تشخیص(های) پرستاری. */
  diagnoses: string;
  /** اقدامات انجام‌شده. */
  actions: string;
  /** پاسخ بیمار / اثربخشی اقدامات. */
  response: string;
  /** خلاصهٔ علائم حیاتی شیفت (متن ساخت‌یافتهٔ آزاد؛ flowsheet رکورد در HIS است). */
  vitals: string;
  braden?: number;
  morse?: number;
  /** پیگیری‌های ضروری شیفت بعد. */
  followups: string;
  /** حوادث و اطلاع به پزشک؛ خالی یعنی بدون حادثه. */
  incidents: string;
}

export interface NursingReport {
  id: string;
  admissionId: string;
  assignmentId?: string;
  authorEmployeeId: string;
  shift: CareShift;
  dateISO: string;
  body: NursingReportBody;
  status: 'draft' | 'signed';
  signedAtISO?: string;
}

export interface SbarNote {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
}

export interface Handover {
  id: string;
  admissionId: string;
  fromAssignmentId?: string;
  toAssignmentId?: string;
  giverEmployeeId: string;
  receiverEmployeeId: string;
  atISO: string;
  sbar: SbarNote;
  stateSummary?: string;
  acceptedAtISO?: string;
}

export const SHIFT_LABELS: Record<CareShift, string> = { morning: 'صبح', evening: 'عصر', night: 'شب' };
export const ADMISSION_TYPE_LABELS: Record<AdmissionType, string> = { emergency: 'اورژانسی', elective: 'عادی', transfer: 'انتقالی' };
export const ADMISSION_STATUS_LABELS: Record<AdmissionStatus, string> = {
  admitted: 'بستری', discharged: 'ترخیص‌شده', transferred: 'انتقال‌یافته', deceased: 'فوت‌شده', lama: 'ترک با مسئولیت شخصی',
};
export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  responsible: 'پرستار مسئول بیمار', associate: 'پرستار همکار', charge: 'مسئول شیفت',
};

export function emptyReportBody(): NursingReportBody {
  return { assessment: '', diagnoses: '', actions: '', response: '', vitals: '', followups: '', incidents: '' };
}

/** پرستار پاسخگوی یک بیمار در یک تاریخ و شیفت: اول «مسئول بیمار»، بعد «مسئول شیفت». */
export function resolveResponsibleAt(
  assignments: PatientAssignment[], admissionId: string, dateISO: string, shift: CareShift,
): PatientAssignment | undefined {
  const slot = assignments.filter(a => a.admissionId === admissionId && a.dateISO === dateISO && a.shift === shift);
  return slot.find(a => a.role === 'responsible') ?? slot.find(a => a.role === 'charge');
}

/** گزارشی که به یک تخصیص مشخص گره خورده — سند پاسخگویی همان پرستار در همان شیفت. */
export function reportForAssignment(reports: NursingReport[], assignmentId: string): NursingReport | undefined {
  return reports.find(r => r.assignmentId === assignmentId);
}

export type TimelineKind = 'admission' | 'assignment' | 'report' | 'handover' | 'discharge';
export interface TimelineEvent {
  kind: TimelineKind;
  atISO: string;
  title: string;
  detail?: string;
  refId: string;
}

/** خط زمانی اپیزود: از پذیرش تا ترخیص، هر رویداد با زمان و صاحب مشخص. */
export function buildEpisodeTimeline(args: {
  admission: Admission;
  assignments: PatientAssignment[];
  reports: NursingReport[];
  handovers: Handover[];
  employeeName: (id: string) => string;
}): TimelineEvent[] {
  const { admission, assignments, reports, handovers, employeeName } = args;
  const events: TimelineEvent[] = [{
    kind: 'admission', atISO: admission.admittedAtISO, refId: admission.id,
    title: `پذیرش — ${ADMISSION_TYPE_LABELS[admission.admissionType]}`,
    detail: admission.admissionReason,
  }];
  // لنگر زمانی تخصیص = شروع تقریبی آن شیفت به وقت تهران (UTC) تا ترتیب خط زمانی
  // با پذیرش همان روز درست بنشیند: صبح ۰۷:۳۰، عصر ۱۴:۰۰، شب ۱۹:۰۰ تهران.
  const shiftAnchorZ: Record<CareShift, string> = { morning: '04:00', evening: '10:30', night: '15:30' };
  for (const a of assignments.filter(x => x.admissionId === admission.id)) {
    events.push({
      kind: 'assignment', atISO: `${a.dateISO}T${shiftAnchorZ[a.shift]}:00.000Z`, refId: a.id,
      title: `${ASSIGNMENT_ROLE_LABELS[a.role]} — شیفت ${SHIFT_LABELS[a.shift]}`,
      detail: employeeName(a.employeeId),
    });
  }
  for (const r of reports.filter(x => x.admissionId === admission.id)) {
    events.push({
      kind: 'report', atISO: r.signedAtISO ?? `${r.dateISO}T00:00:00.000Z`, refId: r.id,
      title: `گزارش پرستاری شیفت ${SHIFT_LABELS[r.shift]}${r.status === 'signed' ? ' (امضاشده)' : ' (پیش‌نویس)'}`,
      detail: employeeName(r.authorEmployeeId),
    });
  }
  for (const h of handovers.filter(x => x.admissionId === admission.id)) {
    events.push({
      kind: 'handover', atISO: h.atISO, refId: h.id,
      title: 'تحویل شیفت',
      detail: `${employeeName(h.giverEmployeeId)} ← ${employeeName(h.receiverEmployeeId)}${h.acceptedAtISO ? ' (پذیرفته‌شده)' : ' (در انتظار پذیرش گیرنده)'}`,
    });
  }
  if (admission.status !== 'admitted' && admission.dischargedAtISO) {
    events.push({
      kind: 'discharge', atISO: admission.dischargedAtISO, refId: admission.id,
      title: ADMISSION_STATUS_LABELS[admission.status],
      detail: admission.dischargeNote,
    });
  }
  return events.sort((x, y) => x.atISO.localeCompare(y.atISO));
}

/**
 * پیشنهاد تخصیص از روی برنامهٔ همان روز: چه کسانی در این تاریخ در هر دستهٔ
 * شیفت سر کارند. شیفت‌های ترکیبی با همان categorizeShift موتور نگاشت می‌شوند؛
 * انتخاب نهایی بیمار برای هر پرستار با سرپرستار است.
 */
export function rosterCandidatesByShift(
  entries: ScheduleEntry[], shiftTypes: ShiftType[], dateISO: string,
): Record<CareShift, string[]> {
  const byId = new Map(shiftTypes.map(s => [s.id, s]));
  const out: Record<CareShift, string[]> = { morning: [], evening: [], night: [] };
  for (const e of entries) {
    if (e.date !== dateISO) continue;
    const st = byId.get(e.shiftTypeId);
    if (!st) continue;
    const cat = categorizeShift(st);
    if (cat === 'morning' || cat === 'evening' || cat === 'night') {
      if (!out[cat].includes(e.personnelId)) out[cat].push(e.personnelId);
    }
  }
  return out;
}

export interface AdmissionInput {
  fullName: string;
  fileNo: string;
  nationalCode?: string;
  admissionReason: string;
  attendingName: string;
}

/** اعتبارسنجی حداقل‌های برگ پذیرش؛ خطاها فارسی و قابل نمایش مستقیم‌اند. */
export function validateAdmissionInput(input: AdmissionInput): string[] {
  const errors: string[] = [];
  if (!input.fullName.trim()) errors.push('نام بیمار الزامی است.');
  if (!input.fileNo.trim()) errors.push('شماره پرونده الزامی است.');
  if (!input.admissionReason.trim()) errors.push('علت پذیرش الزامی است — پرونده بدون آن دقیق نیست.');
  if (!input.attendingName.trim()) errors.push('نام پزشک معالج الزامی است.');
  const nc = (input.nationalCode ?? '').trim();
  if (nc && !/^\d{10}$/.test(nc)) errors.push('کد ملی باید ۱۰ رقم باشد.');
  return errors;
}

/** آیا گزارش برای امضا کامل است؟ حداقل دستورالعمل: ارزیابی + یک تشخیص + اقدام + اثربخشی. */
export function reportCompleteness(body: NursingReportBody): string[] {
  const missing: string[] = [];
  if (!body.assessment.trim()) missing.push('ارزیابی');
  if (!body.diagnoses.trim()) missing.push('تشخیص پرستاری');
  if (!body.actions.trim()) missing.push('اقدامات');
  if (!body.response.trim()) missing.push('پاسخ/اثربخشی');
  return missing;
}
