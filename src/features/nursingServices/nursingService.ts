// ─────────────────────────────────────────────────────────────────────────────
// ثبت بسته‌های خدمات پرستاری (P0 نسخهٔ خصوصی) — همان حلقه‌ای که سند (د)
// الزام می‌کند: تخصیص پرستار به بیمار و ثبت خدمت در سیستم، تأیید سرپرستار
// تا دو روز وگرنه تأیید خودکار؛ درآمد مرکز = Σ (K بسته × ضریب ریالی K).
// داشبورد کسورات: جاهایی که ثبت ناقص است = درآمد در معرض کسور بیمه.
// مقادیر K و ضریب ریالی «پارامتر سالانهٔ مصوبه»اند، نه ثابت کد.
// ─────────────────────────────────────────────────────────────────────────────

export interface NursingPackage {
  id: string;
  code: string;
  title: string;
  kValue: number;
  unit: string;
  careGroup?: number;
  /** منبع مقدار K: 'tariff' = از جداول تعرفه/اسناد؛ 'config' = تنظیم مرکز */
  note?: string;
}

/** کاتالوگ پایه — K گروه‌های مراقبتی از سند (د) و ارقام اعلامی معاونت پرستاری. */
export const DEFAULT_NURSING_PACKAGES: NursingPackage[] = [
  { id: 'pkg-g1', code: 'NC-G1', title: 'مراقبت پرستاری گروه ۱ (روان مزمن، نوزاد سالم)', kValue: 1.7, unit: 'بیمار/نوبت', careGroup: 1 },
  { id: 'pkg-g2', code: 'NC-G2', title: 'مراقبت پرستاری گروه ۲ (روان حاد، چشم/ENT)', kValue: 2.3, unit: 'بیمار/نوبت', careGroup: 2 },
  { id: 'pkg-g3', code: 'NC-G3', title: 'مراقبت پرستاری گروه ۳ (جراحی بزرگسال، انکولوژی)', kValue: 3, unit: 'بیمار/نوبت', careGroup: 3 },
  { id: 'pkg-g4', code: 'NC-G4', title: 'مراقبت پرستاری گروه ۴ (داخلی، کودکان، نوزادان)', kValue: 3.7, unit: 'بیمار/نوبت', careGroup: 4 },
  { id: 'pkg-g5', code: 'NC-G5', title: 'مراقبت پرستاری گروه ۵ (SCU، پست-ICU، بلوک زایمان)', kValue: 6.5, unit: 'بیمار/نوبت', careGroup: 5 },
  { id: 'pkg-g6', code: 'NC-G6', title: 'مراقبت پرستاری گروه ۶ (ویژهٔ عمومی، NICU، ایزوله)', kValue: 13, unit: 'بیمار/نوبت', careGroup: 6 },
  { id: 'pkg-g7', code: 'NC-G7', title: 'مراقبت پرستاری گروه ۷ (ویژهٔ تخصصی: قلب باز، پیوند، سوختگی، PICU)', kValue: 16, unit: 'بیمار/نوبت', careGroup: 7 },
  { id: 'pkg-g8', code: 'NC-G8', title: 'مراقبت پرستاری گروه ۸ (ویژهٔ تخصصی قلب باز اطفال/نوزادان)', kValue: 28, unit: 'بیمار/نوبت', careGroup: 8 },
  { id: 'pkg-dialysis', code: 'NC-DIA', title: 'همودیالیز — هر جلسه (وصل/قطع)', kValue: 6, unit: 'جلسه', note: 'مثال مصوبهٔ ۱۴۰۱: ۶K به‌ازای هر جلسه' },
  { id: 'pkg-chemo', code: 'NC-CHE', title: 'شیمی‌درمانی — هر جلسه/بیمار', kValue: 3, unit: 'جلسه', note: 'امتیاز کمی سند (د): ۳ به‌ازای جلسه' },
];

export type NursingRecordStatus = 'recorded' | 'confirmed' | 'auto_confirmed';

export interface NursingServiceRecord {
  id: string;
  wardId: string;
  employeeId: string;
  patientRef: string;        // شناسهٔ ناشناس بیمار (کد پذیرش)
  packageId: string;
  count: number;
  dateISO: string;           // YYYY-MM-DD
  shift: 'morning' | 'evening' | 'night';
  status: NursingRecordStatus;
  recordedAtISO: string;
  confirmedBy?: string;
  confirmedAtISO?: string;
}

/** قانون سند (د): تأیید سرپرستار تا دو روز؛ پس از آن تأیید خودکار. */
export function effectiveStatus(r: NursingServiceRecord, nowISO: string): NursingRecordStatus {
  if (r.status !== 'recorded') return r.status;
  const recorded = new Date(r.recordedAtISO).getTime();
  const now = new Date(nowISO).getTime();
  return now - recorded > 2 * 24 * 3600 * 1000 ? 'auto_confirmed' : 'recorded';
}

/** درآمد تعرفه‌ای ثبت‌شده: Σ (تعداد × K) × ضریب ریالی K — ورودی استخر کارانهٔ پرستاری. */
export function recordedTariffRevenue(
  records: NursingServiceRecord[],
  packages: NursingPackage[],
  kRialCoefficient: number,
  nowISO: string,
  statuses: NursingRecordStatus[] = ['confirmed', 'auto_confirmed'],
): { totalK: number; revenueRials: number } {
  const kOf = new Map(packages.map(p => [p.id, p.kValue]));
  let totalK = 0;
  for (const r of records) {
    if (!statuses.includes(effectiveStatus(r, nowISO))) continue;
    totalK += r.count * (kOf.get(r.packageId) ?? 0);
  }
  return { totalK, revenueRials: totalK * kRialCoefficient };
}

/** امتیاز کمی هر پرستار از روی ثبت‌ها (برای موتور کارانهٔ سند د). */
export function quantitativePointsByNurse(
  records: NursingServiceRecord[],
  packages: NursingPackage[],
  nowISO: string,
): Map<string, number> {
  const pkgOf = new Map(packages.map(p => [p.id, p]));
  const out = new Map<string, number>();
  for (const r of records) {
    if (effectiveStatus(r, nowISO) === 'recorded') continue;
    const pkg = pkgOf.get(r.packageId);
    if (!pkg) continue;
    // امتیاز کمی سند (د) برای بسته‌های گروه مراقبتی همان امتیاز گروه است؛
    // برای بقیه از K به‌عنوان وزن استفاده می‌شود. ضریب شب روی مراقبت مداوم.
    let pts = pkg.kValue * r.count;
    if (r.shift === 'night') pts *= 1.5;
    out.set(r.employeeId, (out.get(r.employeeId) ?? 0) + pts);
  }
  return out;
}

// ── داشبورد کسورات و نشت ثبت ────────────────────────────────────────────────
export interface WardRecordingHealth {
  wardId: string;
  expectedNurseShifts: number;   // از روس‌تر: تعداد شیفت‌های پرستاری برنامه‌ریزی‌شده
  recordedShifts: number;         // شیفت‌هایی که دست‌کم یک ثبت دارند
  coveragePercent: number | null;
  pendingOverdue: number;         // ثبت‌های تأییدنشدهٔ گذشته از مهلت (ریسک کسور)
  recordedK: number;
  estimatedRevenueAtRiskRials: number;
}

export function wardRecordingHealth(
  wardId: string,
  expected: { employeeId: string; dateISO: string; shift: 'morning' | 'evening' | 'night' }[],
  records: NursingServiceRecord[],
  packages: NursingPackage[],
  kRialCoefficient: number,
  averageKPerShift: number,
  nowISO: string,
): WardRecordingHealth {
  const key = (e: string, d: string, s: string) => `${e}|${d}|${s}`;
  const covered = new Set(records.filter(r => r.wardId === wardId).map(r => key(r.employeeId, r.dateISO, r.shift)));
  const mine = expected;
  const recordedShifts = mine.filter(e => covered.has(key(e.employeeId, e.dateISO, e.shift))).length;
  const kOf = new Map(packages.map(p => [p.id, p.kValue]));
  let recordedK = 0;
  let pendingOverdue = 0;
  for (const r of records) {
    if (r.wardId !== wardId) continue;
    recordedK += r.count * (kOf.get(r.packageId) ?? 0);
    const st = effectiveStatus(r, nowISO);
    if (r.status === 'recorded' && st === 'recorded' && new Date(r.dateISO).getTime() < new Date(nowISO.slice(0, 10)).getTime()) pendingOverdue++;
  }
  const missing = Math.max(0, mine.length - recordedShifts);
  return {
    wardId,
    expectedNurseShifts: mine.length,
    recordedShifts,
    coveragePercent: mine.length ? Math.round((recordedShifts / mine.length) * 1000) / 10 : null,
    pendingOverdue,
    recordedK,
    estimatedRevenueAtRiskRials: Math.round(missing * averageKPerShift * kRialCoefficient),
  };
}

export function nursingRecordsToCsv(records: NursingServiceRecord[], packages: NursingPackage[], names: Map<string, string>, nowISO: string): string {
  const header = ['تاریخ', 'پرستار', 'شناسه بیمار', 'بسته', 'تعداد', 'K', 'شیفت', 'وضعیت'];
  const pkgOf = new Map(packages.map(p => [p.id, p]));
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const shiftFa = { morning: 'صبح', evening: 'عصر', night: 'شب' } as const;
  const body = records.map(r => {
    const pkg = pkgOf.get(r.packageId);
    return [r.dateISO, names.get(r.employeeId) ?? r.employeeId, r.patientRef, pkg?.title ?? r.packageId, r.count, (pkg?.kValue ?? 0) * r.count, shiftFa[r.shift], effectiveStatus(r, nowISO)].map(esc).join(',');
  });
  return '﻿' + [header.map(esc).join(','), ...body].join('\n');
}
