// ─────────────────────────────────────────────────────────────────────────────
// گزارش‌ساز اعتباربخشی (P1 نسخهٔ خصوصی) — سنجه‌های محور «مدیریت خدمات
// پرستاری» از داده‌هایی که حجله همین حالا تولید می‌کند: صلاحیت و
// مهارت‌سنجی، برنامه‌ریزی نیروی انسانی، مستندسازی و ثبت خدمات، آموزش.
// هر سنجه وضعیت دارد: مطلوب / نیازمند توجه / پرریسک / دادهٔ ناکافی — بدون
// ساختن عدد از هیچ؛ جایی که داده نیست صریح می‌گوید.
// ─────────────────────────────────────────────────────────────────────────────
import { summarizeCompliance, credentialGate, type Credential } from '../credentials/credentialService';
import type { WardRecordingHealth } from '../nursingServices/nursingService';

export type MetricStatus = 'ok' | 'warn' | 'risk' | 'nodata';
export interface AccreditationMetric { label: string; value: string; status: MetricStatus; note?: string }
export interface AccreditationSection { id: string; title: string; metrics: AccreditationMetric[] }
export interface AccreditationReport { sections: AccreditationSection[]; overall: { ok: number; warn: number; risk: number; nodata: number } }

export interface AccreditationInput {
  personnelIds: string[];
  personnelCount: number;
  credentials: Credential[];
  nameOf: (employeeId: string) => string;
  todayISO: string;
  schedulePublished: boolean;
  hardRuleViolations: number;
  recording: WardRecordingHealth | null;
  approvedWorkRecords: number;
  totalWorkRecords: number;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function buildAccreditationReport(inp: AccreditationInput): AccreditationReport {
  const comp = summarizeCompliance(inp.credentials, inp.nameOf, inp.todayISO);
  const gate = credentialGate(inp.personnelIds, inp.credentials, inp.todayISO);
  const withLicense = inp.personnelIds.length - gate.warnings.filter(w => w.reasons.some(r => r.includes('ثبت نشده'))).length;
  const licenseCoverage = pct(withLicense, inp.personnelIds.length);
  const trainings = inp.credentials.filter(c => c.kind === 'training');
  const trainingsValid = trainings.filter(c => !c.expiresOnISO || c.expiresOnISO >= inp.todayISO).length;
  const trainingPct = pct(trainingsValid, trainings.length);

  const sections: AccreditationSection[] = [
    {
      id: 'competency', title: 'صلاحیت و مهارت‌سنجی کارکنان پرستاری',
      metrics: [
        {
          label: 'پوشش پروانهٔ اشتغال ثبت‌شده', value: licenseCoverage == null ? '—' : `${licenseCoverage.toLocaleString('fa-IR')}٪`,
          status: licenseCoverage == null ? 'nodata' : licenseCoverage >= 95 ? 'ok' : licenseCoverage >= 80 ? 'warn' : 'risk',
          note: 'سنجهٔ صریح محور مدیریت خدمات پرستاری در استانداردهای اعتباربخشی',
        },
        {
          label: 'افراد دارای پروانهٔ منقضی (قفل صلاحیت فعال)', value: gate.blocked.length.toLocaleString('fa-IR'),
          status: gate.blocked.length === 0 ? 'ok' : 'risk',
          note: gate.blocked.map(b => inp.nameOf(b.employeeId)).join('، ') || undefined,
        },
        {
          label: 'مدارک منقضی / در آستانهٔ انقضا', value: `${comp.expired.toLocaleString('fa-IR')} / ${comp.expiring.toLocaleString('fa-IR')}`,
          status: comp.expired > 0 ? 'risk' : comp.expiring > 0 ? 'warn' : 'ok',
        },
      ],
    },
    {
      id: 'planning', title: 'برنامه‌ریزی و تخصیص نیروی انسانی',
      metrics: [
        {
          label: 'وضعیت برنامهٔ شیفت ماه', value: inp.schedulePublished ? 'منتشرشده' : 'پیش‌نویس',
          status: inp.schedulePublished ? 'ok' : 'warn',
        },
        {
          label: 'نقض سخت قواعد قانون بهره‌وری در برنامه', value: inp.hardRuleViolations.toLocaleString('fa-IR'),
          status: inp.hardRuleViolations === 0 ? 'ok' : 'risk',
          note: 'سقف ۱۲ ساعت متوالی، سقف اضافه‌کار و استراحت بین شیفت‌ها از موتور قواعد حجله',
        },
        {
          label: 'کارکردهای تأییدشدهٔ ماه', value: `${inp.approvedWorkRecords.toLocaleString('fa-IR')} از ${inp.totalWorkRecords.toLocaleString('fa-IR')}`,
          status: inp.totalWorkRecords === 0 ? 'nodata' : inp.approvedWorkRecords === inp.totalWorkRecords ? 'ok' : 'warn',
        },
      ],
    },
    {
      id: 'documentation', title: 'مستندسازی و ثبت خدمات پرستاری',
      metrics: inp.recording ? [
        {
          label: 'پوشش ثبت خدمات نسبت به شیفت‌های برنامه', value: inp.recording.coveragePercent == null ? '—' : `${inp.recording.coveragePercent.toLocaleString('fa-IR')}٪`,
          status: inp.recording.coveragePercent == null ? 'nodata' : inp.recording.coveragePercent >= 95 ? 'ok' : inp.recording.coveragePercent >= 80 ? 'warn' : 'risk',
          note: 'ثبت ناقص خدمت، علت اول کسورات بیمه‌ای اسناد پرستاری است',
        },
        {
          label: 'ثبت‌های معوقِ در انتظار تأیید سرپرستار', value: inp.recording.pendingOverdue.toLocaleString('fa-IR'),
          status: inp.recording.pendingOverdue === 0 ? 'ok' : 'warn',
        },
      ] : [{ label: 'دادهٔ ثبت خدمات', value: 'موجود نیست', status: 'nodata' as MetricStatus }],
    },
    {
      id: 'training', title: 'آموزش و توسعهٔ حرفه‌ای',
      metrics: [
        {
          label: 'دوره‌های آموزشی معتبر (از کل دوره‌های ثبت‌شده)', value: trainingPct == null ? '—' : `${trainingPct.toLocaleString('fa-IR')}٪`,
          status: trainingPct == null ? 'nodata' : trainingPct >= 90 ? 'ok' : trainingPct >= 70 ? 'warn' : 'risk',
          note: trainings.length ? `${trainingsValid.toLocaleString('fa-IR')} دورهٔ معتبر از ${trainings.length.toLocaleString('fa-IR')}` : 'دوره‌ای ثبت نشده است',
        },
      ],
    },
  ];

  const overall = { ok: 0, warn: 0, risk: 0, nodata: 0 };
  for (const s of sections) for (const m of s.metrics) overall[m.status]++;
  return { sections, overall };
}

export function reportToMarkdown(report: AccreditationReport, heading: string): string {
  const icon: Record<MetricStatus, string> = { ok: 'مطلوب', warn: 'نیازمند توجه', risk: 'پرریسک', nodata: 'دادهٔ ناکافی' };
  const lines = [`# ${heading}`, ''];
  for (const s of report.sections) {
    lines.push(`## ${s.title}`);
    for (const m of s.metrics) lines.push(`- ${m.label}: **${m.value}** (${icon[m.status]})${m.note ? ` — ${m.note}` : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}
