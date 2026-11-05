// ─────────────────────────────────────────────────────────────────────────────
// پریست‌های پروفایل کارانه بر اساس نوع مرکز — نقطهٔ شروع پارامترها + راهنمای
// صادقانهٔ مبنای هرکدام. فقط قالب دولتی عدد مستند دارد؛ خصوصی و ارتش نقطهٔ
// شروع قابل‌تنظیم‌اند و UI این را صریح به کاربر می‌گوید (عدد جعلی ساخته نمی‌شود).
// ─────────────────────────────────────────────────────────────────────────────

export interface KaranehPreset {
  id: 'moh' | 'private' | 'army';
  label: string;
  nursingShare: number;
  onCallCoef: number;
  note: string;
}

export const KARANEH_PRESETS: KaranehPreset[] = [
  {
    id: 'moh',
    label: 'دولتی — قالب وزارت بهداشت ۱۴۰۴',
    nursingShare: 0.85,
    onCallCoef: 4,
    note: 'عین دستورالعمل جاری توزیع درآمد اختصاصی (سند الف): سهم گروه پرستاری ۸۵٪ درآمد بسته‌های پرستاری است و ضریب آنکالی در بازهٔ ۳ تا ۵ سند قرار می‌گیرد.',
  },
  {
    id: 'private',
    label: 'خصوصی — پایهٔ قابل تنظیم با مصوبهٔ داخلی',
    nursingShare: 0.85,
    onCallCoef: 4,
    note: 'بیمارستان خصوصی آیین‌نامهٔ داخلی خودش را دارد و نظارتی بر بازتوزیع تعرفه در آن نیست؛ این اعداد فقط نقطهٔ شروع‌اند و باید با مصوبهٔ داخلی مرکز جایگزین شوند.',
  },
  {
    id: 'army',
    label: 'ارتش — نیازمند آیین‌نامهٔ داخلی سازمان',
    nursingShare: 0.85,
    onCallCoef: 4,
    note: 'برای مراکز درمانی نیروهای مسلح آیین‌نامهٔ عمومی کارانه منتشر نشده است؛ تا رسیدن آیین‌نامهٔ داخلی از سازمان، خروجی این پروفایل جنبهٔ نمایشی و برآوردی دارد، نه مبنای پرداخت.',
  },
];

export function applyPreset<T extends { nursingShare: number; onCallCoef: number }>(
  profile: T,
  preset: KaranehPreset,
): T & { presetId: KaranehPreset['id'] } {
  return { ...profile, nursingShare: preset.nursingShare, onCallCoef: preset.onCallCoef, presetId: preset.id };
}
