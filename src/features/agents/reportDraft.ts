// ─────────────────────────────────────────────────────────────────────────────
// سازندهٔ پیش‌نویس روایی گزارش پرستاری — فاز ۲ لایهٔ ایجنت (Zone C، دور ۱۸).
// از بخش‌های ساخت‌یافتهٔ بدنهٔ گزارش (دور ۱۶) یک متن رواییِ پیوسته می‌سازد تا
// پرستار به‌جای بازنویسی، ویرایش کند. متن پیش‌نویس است: امضا و کامل‌بودن با
// همان گیت موجود (ارزیابی + تشخیص + اقدامات + پاسخ) و دست خود پرستار است؛
// این ماژول هیچ بخشی را از خودش پر نمی‌کند — بخش خالی در متن هم نمی‌آید.
// ─────────────────────────────────────────────────────────────────────────────

import type { NursingReportBody } from '../patients/patientService';

const faNum = (n: number) => n.toLocaleString('fa-IR');

/** برچسب و ترتیب بخش‌ها در متن روایی — همان ترتیب خواندن گزارش در پرونده. */
const SECTIONS: { key: keyof NursingReportBody; label: string }[] = [
  { key: 'assessment', label: 'ارزیابی' },
  { key: 'diagnoses', label: 'تشخیص‌های پرستاری' },
  { key: 'actions', label: 'اقدامات انجام‌شده' },
  { key: 'response', label: 'پاسخ بیمار و اثربخشی' },
  { key: 'vitals', label: 'علائم حیاتی' },
  { key: 'followups', label: 'پیگیری‌های شیفت بعد' },
  { key: 'incidents', label: 'حوادث' },
];

/**
 * متن روایی از روی بدنهٔ ساخت‌یافته: هر بخشِ پر با برچسب خودش یک سطر می‌شود؛
 * بخش خالی رد می‌شود. اگر Braden یا Morse ثبت شده باشد، سطر نمره‌ها در انتها
 * می‌آید (نمره‌های پایان هر شیفت — دستورالعمل مستندسازی). بدنهٔ کاملاً خالی
 * رشتهٔ خالی برمی‌گرداند تا رابط کاربری دکمه را بی‌اثر نشان دهد.
 */
export function composeReportDraft(body: NursingReportBody): string {
  const lines: string[] = [];
  for (const { key, label } of SECTIONS) {
    const text = String(body[key] ?? '').trim();
    if (text) lines.push(`${label}: ${text}`);
  }
  const scales: string[] = [];
  if (body.braden !== undefined) scales.push(`Braden ${faNum(body.braden)}`);
  if (body.morse !== undefined) scales.push(`Morse ${faNum(body.morse)}`);
  if (scales.length > 0) lines.push(`نمره‌های پایان شیفت: ${scales.join('، ')}`);
  return lines.join('\n');
}
