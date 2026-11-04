// ─────────────────────────────────────────────────────────────────────────────
// موتور کارانهٔ پارامتریک — قالب پیش‌فرض: دستورالعمل توزیع کارانهٔ وزارت
// بهداشت، ویرایش ۱۴۰۴ (لازم‌الاجرا از ۱۴۰۴/۱۰/۰۱؛ اسناد الف تا د).
// اصل طراحی (از خود اسناد): نرم‌افزار «محاسبه» می‌کند و سازمان «پارامتر» را
// تصویب می‌کند — پس هیچ عددی در منطق قفل نیست؛ همهٔ ضرایب و سهم‌ها در
// KaranehParams است و هر بیمارستان پروفایل خودش را دارد (دولتی/خصوصی/ارتش).
// اعداد پیش‌فرض عین جداول اسنادند؛ جاهایی که سند بازه داده (مثل درصدهای
// کارگروه) مقدار میانی/مصوبِ قابل ویرایش گذاشته شده است.
// ─────────────────────────────────────────────────────────────────────────────

export interface PhysicianBracket { upToMillionRials: number | null; developed: number; deprived: number }

export interface KaranehParams {
  /** سهم‌های گروهی از درآمد وصولی (سند الف) */
  shares: {
    physiciansCapOfProfessional: number;      // 0.63 (برخی تک‌تخصصی‌ها تا 0.68)
    assistantsOfProfessional: number;         // 0.04
    nonPhysicianOfProfessional: number;       // 0.105
    nonPhysicianOfNursingPackages: number;    // 0.04
    nursingOfNursingPackages: number;         // 0.85 (سرپایی تا 0.90)
    institutionOfDedicated: number;           // 0.05 + 0.01 جزء حرفه‌ای جدا نگه داشته می‌شود
    institutionOfProfessional: number;        // 0.01
  };
  /** مدرک تحصیلی (سند ج، جداول ۲ و ۶) */
  degreeCoef: Record<'phd' | 'master' | 'bachelor' | 'associate' | 'diploma' | 'belowDiploma', number>;
  seniorityPerYear: number;                   // 0.015
  qualityMin: number;                         // 0.5
  qualityMax: number;                         // 1.1
  presenceCapAdmin: number;                   // 1.5 — تشخیصی بدون سقف
  serviceTypeCoef: Record<'diagnostic' | 'finance' | 'admin' | 'other', number>;
  /** پلکان سهم پزشک از کارکرد جزء حرفه‌ای، مبالغ به میلیون ریال (سند ب جدول ۱) */
  physicianBrackets: PhysicianBracket[];
  /** امتیاز کمی گروه‌های مراقبتی به‌ازای هر بیمار در هر نوبت (سند د جدول ۲) */
  careGroupPoints: Record<number, number>;
  triagePoints: Record<number, number>;
  orPerMinute: number;                        // 0.1
  nightCoef: number;                          // 1.5
  eveningGeneralCoef: number;                 // 0.8
  nursingMedianCapMultiple: number;           // 2.5
  /** ضرایب میانه برای نقش‌های غیرمستقیم (سند د جدول ۳) */
  indirectMultiples: Record<'matron' | 'supervisor' | 'headNurse' | 'deputy' | 'unitExpert' | 'behyar' | 'sterilization' | 'aide', number>;
  nursingQualityFloor: number;                // 0.8 — «در هر صورت کمتر از ۸۰٪ نمی‌باشد»
  /** ضریب آنکالی غیرپزشکان — بازهٔ سند ۳ تا ۵، مقدار را کارگروه بیمارستان تصویب می‌کند. */
  onCallCoef: number;
}

export const MOH_KARANEH_1404: KaranehParams = {
  shares: {
    physiciansCapOfProfessional: 0.63,
    assistantsOfProfessional: 0.04,
    nonPhysicianOfProfessional: 0.105,
    nonPhysicianOfNursingPackages: 0.04,
    nursingOfNursingPackages: 0.85,
    institutionOfDedicated: 0.05,
    institutionOfProfessional: 0.01,
  },
  degreeCoef: { phd: 2, master: 1.6, bachelor: 1.45, associate: 1.3, diploma: 1.15, belowDiploma: 1 },
  seniorityPerYear: 0.015,
  qualityMin: 0.5,
  qualityMax: 1.1,
  presenceCapAdmin: 1.5,
  serviceTypeCoef: { diagnostic: 1.7, finance: 1.6, admin: 1.5, other: 1.2 },
  physicianBrackets: [
    { upToMillionRials: 500, developed: 0.7, deprived: 0.8 },
    { upToMillionRials: 1000, developed: 0.7, deprived: 0.75 },
    { upToMillionRials: 1500, developed: 0.65, deprived: 0.7 },
    { upToMillionRials: 2500, developed: 0.6, deprived: 0.65 },
    { upToMillionRials: 3500, developed: 0.55, deprived: 0.6 },
    { upToMillionRials: null, developed: 0.55, deprived: 0.45 },
  ],
  careGroupPoints: { 1: 1.7, 2: 2.3, 3: 3, 4: 3.7, 5: 6.5, 6: 13, 7: 16, 8: 28 },
  triagePoints: { 1: 11, 2: 8, 3: 3.5, 4: 1.5 },
  orPerMinute: 0.1,
  nightCoef: 1.5,
  eveningGeneralCoef: 0.8,
  nursingMedianCapMultiple: 2.5,
  indirectMultiples: { matron: 1.9, supervisor: 1.6, headNurse: 1.3, deputy: 1.1, unitExpert: 0.85, behyar: 0.65, sterilization: 0.6, aide: 0.45 },
  nursingQualityFloor: 0.8,
  onCallCoef: 4,
};

// ── استخرهای گروهی (سند الف) ────────────────────────────────────────────────
export interface GroupPools {
  physiciansCap: number;
  assistants: number;
  nonPhysician: number;
  nursing: number;
  institution: number;
}

export function computeGroupPools(
  collectedProfessionalRials: number,
  collectedNursingPackageRials: number,
  collectedDedicatedRials: number,
  p: KaranehParams = MOH_KARANEH_1404,
): GroupPools {
  return {
    physiciansCap: collectedProfessionalRials * p.shares.physiciansCapOfProfessional,
    assistants: collectedProfessionalRials * p.shares.assistantsOfProfessional,
    nonPhysician:
      collectedProfessionalRials * p.shares.nonPhysicianOfProfessional +
      collectedNursingPackageRials * p.shares.nonPhysicianOfNursingPackages,
    nursing: collectedNursingPackageRials * p.shares.nursingOfNursingPackages,
    institution:
      collectedDedicatedRials * p.shares.institutionOfDedicated +
      collectedProfessionalRials * p.shares.institutionOfProfessional,
  };
}

// ── پزشکان: P = M × Q (سند ب) ───────────────────────────────────────────────
/** سهم پلکانی M به‌صورت پلکانیِ تجمیعی (هر برش با نرخ همان پله). ورودی: میلیون ریال. */
export function physicianShareM(workedMillionRials: number, region: 'developed' | 'deprived', p: KaranehParams = MOH_KARANEH_1404): number {
  let remaining = workedMillionRials;
  let lower = 0;
  let m = 0;
  for (const b of p.physicianBrackets) {
    if (remaining <= 0) break;
    const width = b.upToMillionRials == null ? remaining : Math.min(remaining, b.upToMillionRials - lower);
    m += width * (region === 'deprived' ? b.deprived : b.developed);
    remaining -= width;
    if (b.upToMillionRials != null) lower = b.upToMillionRials;
  }
  return m; // میلیون ریال
}

/** نگاشت امتیاز کیفی به ضریب Q (سند ب جدول ۲ مادهٔ ۱۲). */
export function physicianQ(qualityScore: number): number {
  if (qualityScore <= 50) return 0.5;
  if (qualityScore <= 90) return qualityScore / 100;
  return 1;
}

export function computePhysicianKaraneh(workedMillionRials: number, region: 'developed' | 'deprived', qualityScore: number, p: KaranehParams = MOH_KARANEH_1404): number {
  return physicianShareM(workedMillionRials, region, p) * physicianQ(qualityScore);
}

// ── غیرپزشکان (سند ج): امتیاز شش‌ضربی و تسهیم تناسبی ────────────────────────
export type DegreeLevel = keyof KaranehParams['degreeCoef'];
export type ServiceKind = keyof KaranehParams['serviceTypeCoef'];

export interface NonPhysicianInput {
  employeeId: string;
  jobCoef: number;                 // جدول نوع شغل (تشخیصی ۷٫۵/۶/۵٫۵ — اداری تا ۱۵)
  degree: DegreeLevel;
  seniorityYears: number;
  quality: number;                 // 0.5 تا 1.1
  presenceRatio: number;           // حضور واقعی ÷ موظف پایه
  serviceKind: ServiceKind;
  group: 'diagnostic' | 'admin';   // سقف حضور: تشخیصی بدون سقف، اداری ۱٫۵
}

export function nonPhysicianPoints(i: NonPhysicianInput, p: KaranehParams = MOH_KARANEH_1404): number {
  const quality = Math.min(p.qualityMax, Math.max(p.qualityMin, i.quality));
  const presence = i.group === 'admin' ? Math.min(p.presenceCapAdmin, i.presenceRatio) : i.presenceRatio;
  return (
    i.jobCoef *
    p.degreeCoef[i.degree] *
    (1 + p.seniorityPerYear * i.seniorityYears) *
    quality *
    presence *
    p.serviceTypeCoef[i.serviceKind]
  );
}

export interface DistributionRow { employeeId: string; points: number; share: number; amount: number }

/** تسهیم تناسبی یک استخر بین امتیازها — قلب هر سه فرمول اسناد. */
export function distributePool(points: { employeeId: string; points: number }[], poolRials: number): DistributionRow[] {
  const total = points.reduce((s, x) => s + x.points, 0);
  return points.map(x => ({
    employeeId: x.employeeId,
    points: x.points,
    share: total > 0 ? x.points / total : 0,
    amount: total > 0 ? (x.points / total) * poolRials : 0,
  }));
}

// ── پرستاری (سند د): امتیاز کمی از ثبت خدمت، سقف میانه، کیفی و حضور ──────────
export interface NursingCareEntry {
  /** گروه مراقبتی ۱ تا ۸ (بستری) — یا به‌جای آن سطح تریاژ / دقایق اتاق عمل */
  careGroup?: number;
  triageLevel?: number;
  orMinutes?: number;
  patients: number;
  shift: 'morning' | 'evening' | 'night';
  /** گروه‌های عمومی (۳ و ۴ و…) برای ضریب عصر ۰٫۸ — ساده‌سازی: caller تعیین می‌کند */
  eveningGeneral?: boolean;
}

export function nursingEntryPoints(e: NursingCareEntry, p: KaranehParams = MOH_KARANEH_1404): number {
  let base = 0;
  if (e.careGroup != null) base = (p.careGroupPoints[e.careGroup] ?? 0) * e.patients;
  else if (e.triageLevel != null) base = (p.triagePoints[e.triageLevel] ?? 0) * e.patients;
  else if (e.orMinutes != null) base = p.orPerMinute * e.orMinutes;
  if (e.shift === 'night') return base * p.nightCoef;
  if (e.shift === 'evening' && e.eveningGeneral) return base * p.eveningGeneralCoef;
  return base;
}

/** نگاشت امتیاز کیفی پرستاری به ضریب (سند د جدول ۱): کف ۰٫۸، سقف مستقیم ۱٫۱ / غیرمستقیم ۱٫۰. */
export function nursingQualityFactor(score: number, indirect: boolean, p: KaranehParams = MOH_KARANEH_1404): number {
  const raw = score <= 0.8 ? 0.8 : score >= 1.1 ? 1.1 : score;
  return Math.max(p.nursingQualityFloor, indirect ? Math.min(1, raw) : raw);
}

export type IndirectRole = keyof KaranehParams['indirectMultiples'];

export interface NursingPersonInput {
  employeeId: string;
  /** برای مستقیم‌ها: مجموع امتیاز کمی خام از ثبت خدمات؛ برای غیرمستقیم‌ها لازم نیست */
  rawQuantitative?: number;
  indirectRole?: IndirectRole;
  qualityScore: number;            // 0.8 تا 1.1 طبق جدول پیوست
  presenceFactor?: number;         // فقط غیرمستقیم: ۰ تا ۱٫۲۵
}

export interface NursingDistributionRow extends DistributionRow {
  cappedQuantitative: number;
  qualityFactor: number;
  presenceFactor: number;
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function computeNursingKaraneh(
  people: NursingPersonInput[],
  poolRials: number,
  p: KaranehParams = MOH_KARANEH_1404,
): NursingDistributionRow[] {
  const directRaw = people.filter(x => x.indirectRole == null).map(x => x.rawQuantitative ?? 0);
  const med = median(directRaw);
  const cap = med * p.nursingMedianCapMultiple;
  const staged = people.map(x => {
    const indirect = x.indirectRole != null;
    const quant = indirect
      ? med * p.indirectMultiples[x.indirectRole!]
      : Math.min(x.rawQuantitative ?? 0, cap);
    const qf = nursingQualityFactor(x.qualityScore, indirect, p);
    const pf = indirect ? Math.min(1.25, Math.max(0, x.presenceFactor ?? 1)) : 1;
    return { employeeId: x.employeeId, points: quant * qf * pf, cappedQuantitative: quant, qualityFactor: qf, presenceFactor: pf };
  });
  const dist = distributePool(staged, poolRials);
  return dist.map((d, idx) => ({ ...d, cappedQuantitative: staged[idx]!.cappedQuantitative, qualityFactor: staged[idx]!.qualityFactor, presenceFactor: staged[idx]!.presenceFactor }));
}

// ── فیش کارانهٔ فردی (شفافیت — الزام اسناد: کارنامهٔ امتیاز همراه پرداخت) ────
export interface KaranehSlip {
  employeeId: string;
  group: 'nursing' | 'nonPhysician' | 'physician';
  points: number;
  sharePercent: number;
  amountRials: number;
  components: { label: string; value: string }[];
  /** اضافه‌کار عمداً جدا از کارانه است (سند د مادهٔ ۹) — در فیش سطر جدا دارد. */
  overtimeNote: string;
}

export function nursingSlips(rows: NursingDistributionRow[], names: Map<string, string>): KaranehSlip[] {
  return rows.map(r => ({
    employeeId: r.employeeId,
    group: 'nursing' as const,
    points: Math.round(r.points * 100) / 100,
    sharePercent: Math.round(r.share * 10000) / 100,
    amountRials: Math.round(r.amount),
    components: [
      { label: 'امتیاز کمی (پس از سقف میانه)', value: String(Math.round(r.cappedQuantitative * 100) / 100) },
      { label: 'ضریب کیفی', value: String(r.qualityFactor) },
      { label: 'ضریب حضور', value: String(r.presenceFactor) },
      { label: 'نام', value: names.get(r.employeeId) ?? r.employeeId },
    ],
    overtimeNote: 'اضافه‌کار جدا از کارانه و بر اساس حضور غیرموظف واقعی پرداخت می‌شود.',
  }));
}

export function slipsToCsv(slips: KaranehSlip[]): string {
  const header = ['شناسه', 'نام', 'گروه', 'امتیاز', 'سهم (٪)', 'مبلغ کارانه (ریال)'];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const body = slips.map(s => [
    s.employeeId,
    s.components.find(c => c.label === 'نام')?.value ?? '',
    s.group === 'nursing' ? 'پرستاری' : s.group === 'nonPhysician' ? 'غیرپزشک' : 'پزشک',
    s.points, s.sharePercent, s.amountRials,
  ].map(esc).join(','));
  return '﻿' + [header.map(esc).join(','), ...body].join('\n');
}
