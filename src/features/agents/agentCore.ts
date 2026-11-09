// ─────────────────────────────────────────────────────────────────────────────
// هستهٔ لایهٔ ایجنت — فاز ۱ (NUR-DR-2026-003، دور ۱۷).
// اصول قفل: هستهٔ قطعی (solver + rules engine) تنها تصمیم‌گیرنده است؛ این
// ماژول فقط می‌خواند، توضیح می‌دهد و پیش‌نویس می‌سازد (Zone A در فاز ۱).
// هیچ LLMای در مسیر نیست: پاسخ آیین‌نامه از پیکرهٔ دست‌چین با citation می‌آید،
// رادار و اسکن ناهنجاری قطعی‌اند و توضیح‌ها templateای از روی factها ساخته
// می‌شوند. برای اکشن‌های Zone D اصلاً ابزار وجود ندارد (پایین، ثابت مستند).
// ─────────────────────────────────────────────────────────────────────────────

import type { Credential } from '../credentials/credentialService';
import { KIND_FA } from '../credentials/credentialService';
import type { PolicyEntry } from './policyCorpus';

// ── رجیستری zone/ابزار ───────────────────────────────────────────────────────
export type AgentZone = 'A' | 'B' | 'C';

export interface AgentTool {
  key: string;
  zone: AgentZone;
  description: string;
}

/** ابزارهای فاز ۱ — فقط خواندن و توضیح (Zone A). ابزار نوشتنی/تصمیمی وجود ندارد. */
export const AGENT_TOOLS: AgentTool[] = [
  { key: 'policy_lookup', zone: 'A', description: 'پاسخ به سؤال آیین‌نامه/قانون از پیکرهٔ مستند حجله، با citation' },
  { key: 'credential_radar', zone: 'A', description: 'رادار انقضای مدارک و پروانه‌ها در بازه‌های ۳۰/۶۰/۹۰ روزه' },
  { key: 'anomaly_scan', zone: 'A', description: 'اسکن ناهنجاری کارکرد ماهانه (سقف اضافه‌کار، سهمیه، رکورد نهایی‌نشده/جاافتاده)' },
  { key: 'explain_output', zone: 'A', description: 'توضیح templateای خروجی موتور قوانین/اسکن از روی factها' },
];

export function zoneOf(toolKey: string): AgentZone | null {
  return AGENT_TOOLS.find(t => t.key === toolKey)?.zone ?? null;
}

/**
 * اکشن‌های Zone D — «هرگز»های DR-003. این‌ها فقط نامِ مستندند تا در بازبینی
 * کد و تست دیده شوند؛ عمداً در AGENT_TOOLS نیستند و هیچ تابعی برایشان وجود
 * ندارد: مبلغ نهایی کارانه را انسان تعیین می‌کند، اعتبار مدرک با سرپرستار
 * است، رد discretionary مرخصی و override قید سخت اصلاً ابزار ندارند.
 */
export const ZONE_D_ACTIONS = [
  'karaneh_amount_finalize',
  'credential_validity_decide',
  'leave_discretionary_deny',
  'hard_constraint_override',
] as const;

// ── نرمال‌سازی فارسی برای تطبیق سؤال (در کدبیس نرمال‌ساز مشترکی نبود) ──────
export function normalizeFa(s: string): string {
  return s
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ') // ZWNJ → فاصله (تطبیق واژه‌ای؛ متن ذخیره‌شده دست نمی‌خورد)
    .replace(/[؟?.,;:!«»()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── copilot آیین‌نامه: بازیابی قطعی از پیکره ─────────────────────────────────
export interface PolicyMatch { entry: PolicyEntry; score: number }
export type PolicyAnswer =
  | { kind: 'answer'; entry: PolicyEntry; score: number }
  | { kind: 'none' };

/** حداقل امتیاز برای این‌که پاسخ «مستند» شمرده شود؛ پایین‌تر از آن: بدون citation. */
export const POLICY_MIN_SCORE = 2;

export function answerPolicyQuestion(
  corpus: PolicyEntry[],
  question: string,
): PolicyMatch | null {
  const q = normalizeFa(question);
  if (!q) return null;
  const qTokens = new Set(q.split(' '));
  let best: PolicyMatch | null = null;
  for (const entry of corpus) {
    let score = 0;
    for (const kw of entry.keywords) {
      const k = normalizeFa(kw);
      if (!k) continue;
      if (k.includes(' ')) {
        if (q.includes(k)) score += 3; // عبارت چندواژه‌ای = سیگنال قوی
      } else if (qTokens.has(k)) {
        score += 2;
      }
    }
    for (const pat of entry.questionPatterns ?? []) {
      if (q.includes(normalizeFa(pat))) score += 4;
    }
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= POLICY_MIN_SCORE ? best : null;
}

/** پاسخ کامل copilot برای استور/UI: match یا «پاسخ مستند ندارم» (بدون citation). */
export function askPolicy(corpus: PolicyEntry[], question: string): PolicyAnswer {
  const m = answerPolicyQuestion(corpus, question);
  return m ? { kind: 'answer', entry: m.entry, score: m.score } : { kind: 'none' };
}

export const NO_GROUNDED_ANSWER_FA =
  'برای این سؤال در پیکرهٔ مستند حجله پاسخ آماده‌ای نیست. این copilot فقط از روی آیین‌نامه‌ها و پارامترهای قفل‌شدهٔ خود سیستم جواب می‌دهد و بداهه‌سازی نمی‌کند؛ سؤال را می‌توانید از سرپرستار/مترون بپرسید یا در قالب سؤال‌های پیشنهادی همین صفحه دوباره مطرح کنید.';

// ── رادار مدارک ──────────────────────────────────────────────────────────────
export type RadarBucket = 'expired' | 'd30' | 'd60' | 'd90';

export interface RadarRow {
  credentialId: string;
  employeeId: string;
  employeeName: string;
  title: string;
  kindLabel: string;
  expiresAt: string;
  daysLeft: number;
  bucket: RadarBucket;
}

export interface CredentialRadar {
  rows: RadarRow[];
  counts: Record<RadarBucket, number>;
  /** مدارک دارای تاریخ انقضا که در رادار پایش می‌شوند. */
  tracked: number;
}

const DAY_MS = 86400000;

export function credentialRadar(
  credentials: Credential[],
  employees: { id: string; name: string }[],
  todayISO: string,
): CredentialRadar {
  const nameOf = new Map(employees.map(e => [e.id, e.name]));
  const counts: Record<RadarBucket, number> = { expired: 0, d30: 0, d60: 0, d90: 0 };
  const rows: RadarRow[] = [];
  let tracked = 0;
  for (const c of credentials) {
    if (!c.expiresOnISO) continue;
    tracked++;
    const daysLeft = Math.floor((Date.parse(c.expiresOnISO) - Date.parse(todayISO)) / DAY_MS);
    if (daysLeft > 90) continue;
    const bucket: RadarBucket = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'd30' : daysLeft <= 60 ? 'd60' : 'd90';
    counts[bucket]++;
    rows.push({
      credentialId: c.id, employeeId: c.employeeId,
      employeeName: nameOf.get(c.employeeId) ?? c.employeeId,
      title: c.title, kindLabel: KIND_FA[c.kind],
      expiresAt: c.expiresOnISO, daysLeft, bucket,
    });
  }
  rows.sort((a, b) => a.daysLeft - b.daysLeft);
  return { rows, counts, tracked };
}

// ── اسکن ناهنجاری کارکرد ماهانه ──────────────────────────────────────────────
export type AnomalyKind = 'overtime_over_cap' | 'leave_over_quota' | 'unfinalized_record' | 'missing_record';
export type AnomalySeverity = 'high' | 'medium';

export interface WorkRecordLike {
  employeeId: string;
  employeeName: string;
  overtimeHours: number;
  status: 'draft' | 'approved' | 'exported';
}

export interface LeaveUsageLike {
  employeeId: string;
  employeeName: string;
  leaveTypeName: string;
  usedDays: number;
  quotaDays: number;
}

export interface AnomalyScanInput {
  jYear: number;
  jMonth: number;
  records: WorkRecordLike[];
  /** پرسنل فعال بخش که انتظار می‌رود برایشان کارکرد باشد. */
  expectedEmployees: { id: string; name: string }[];
  leaveUsage: LeaveUsageLike[];
  /** سقف اضافه‌کار ماهانه — پیش‌فرض همان پارامتر موتور قوانین (۸۰). */
  overtimeCap?: number;
}

export interface Anomaly {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  employeeId: string;
  employeeName: string;
  message: string;
  facts: Record<string, number | string>;
}

const faNum = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });

export function anomalyScan(input: AnomalyScanInput): Anomaly[] {
  const cap = input.overtimeCap ?? 80;
  const out: Anomaly[] = [];
  const haveRecord = new Set<string>();
  for (const r of input.records) {
    haveRecord.add(r.employeeId);
    if (r.overtimeHours > cap) {
      out.push({
        kind: 'overtime_over_cap', severity: 'high',
        employeeId: r.employeeId, employeeName: r.employeeName,
        message: `اضافه‌کار ${r.employeeName} در این ماه ${faNum(r.overtimeHours)} ساعت است؛ سقف قانونی ${faNum(cap)} ساعت.`,
        facts: { overtimeHours: r.overtimeHours, cap },
      });
    }
    if (r.status === 'draft') {
      out.push({
        kind: 'unfinalized_record', severity: 'medium',
        employeeId: r.employeeId, employeeName: r.employeeName,
        message: `کارکرد ${r.employeeName} هنوز در وضعیت «پیش‌نویس» است و نهایی نشده؛ ماه با رکورد باز بسته نمی‌شود.`,
        facts: { status: r.status },
      });
    }
  }
  for (const u of input.leaveUsage) {
    if (u.usedDays > u.quotaDays) {
      out.push({
        kind: 'leave_over_quota', severity: 'high',
        employeeId: u.employeeId, employeeName: u.employeeName,
        message: `${u.employeeName} از مرخصی «${u.leaveTypeName}» ${faNum(u.usedDays)} روز استفاده کرده؛ سهمیه ${faNum(u.quotaDays)} روز است.`,
        facts: { usedDays: u.usedDays, quotaDays: u.quotaDays, leaveTypeName: u.leaveTypeName },
      });
    }
  }
  for (const e of input.expectedEmployees) {
    if (!haveRecord.has(e.id)) {
      out.push({
        kind: 'missing_record', severity: 'medium',
        employeeId: e.id, employeeName: e.name,
        message: `برای ${e.name} در این ماه هیچ رکورد کارکردی ساخته نشده است.`,
        facts: {},
      });
    }
  }
  const sevRank = { high: 0, medium: 1 } as const;
  out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.employeeName.localeCompare(b.employeeName, 'fa'));
  return out;
}

/** توضیح templateای یک ناهنجاری — از روی factها، بدون LLM و بدون عدد تازه. */
export function explainAnomaly(a: Anomaly): string {
  switch (a.kind) {
    case 'overtime_over_cap':
      return `مبنای پرچم: سقف اضافه‌کار ماهانه در پارامترهای قانون ارتقاء بهره‌وری ${faNum(Number(a.facts.cap))} ساعت است و کارکرد ثبت‌شدهٔ ${a.employeeName} ${faNum(Number(a.facts.overtimeHours))} ساعت اضافه‌کار دارد. تصمیم اصلاح یا تأیید با سرپرستار است؛ این پرچم فقط دیده‌بانی است.`;
    case 'leave_over_quota':
      return `مبنای پرچم: سهمیهٔ «${String(a.facts.leaveTypeName)}» در تنظیمات بیمارستان ${faNum(Number(a.facts.quotaDays))} روز است و مصرف ثبت‌شده ${faNum(Number(a.facts.usedDays))} روز شده است؛ مصرف مازاد باید پیش از بستن ماه تعیین‌تکلیف شود.`;
    case 'unfinalized_record':
      return 'مبنای پرچم: چرخهٔ کارکرد ماهانه پیش‌نویس ← تأییدشده ← صادرشده است؛ رکوردی که هنوز پیش‌نویس است وارد خروجی حقوق نمی‌شود و بستن ماه را باز نگه می‌دارد.';
    case 'missing_record':
      return 'مبنای پرچم: برای هر پرسنل فعال بخش در ماه باید رکورد کارکرد ساخته شده باشد؛ نبود رکورد یعنی یا شیفتی ثبت نشده یا ساخت کارکرد ماه برای این فرد انجام نشده است.';
  }
}
