import type { CustomRule, AiGenerationSettings, GlobalDutySettings } from './types';

/**
 * تعطیلات رسمی: ورودی بدون year یعنی ثابتِ خورشیدی و همه‌ساله؛ ورودی با year یعنی
 * تعطیل قمریِ همان سال مشخص (جابه‌جا می‌شود و برای سال‌های دیگر معتبر نیست).
 */
export interface NationalHoliday { month: number; day: number; name: string; year?: number }

export const NATIONAL_HOLIDAYS: NationalHoliday[] = [
    { month: 1, day: 1, name: 'نوروز' },
    { month: 1, day: 2, name: 'نوروز' },
    { month: 1, day: 3, name: 'نوروز' },
    { month: 1, day: 4, name: 'نوروز' },
    { month: 1, day: 12, name: 'روز جمهوری اسلامی' },
    { month: 1, day: 13, name: 'روز طبیعت' },
    { month: 3, day: 14, name: 'رحلت امام خمینی' },
    { month: 3, day: 15, name: 'قیام ۱۵ خرداد' },
    { month: 11, day: 22, name: 'پیروزی انقلاب' },
    { month: 12, day: 29, name: 'ملی شدن صنعت نفت' },
    // تعطیلات قمریِ سال ۱۴۰۵ — از تقویم رسمی کشور ۱۴۰۵ (مرکز تقویم مؤسسهٔ ژئوفیزیک دانشگاه
    // تهران؛ صورت‌جلسهٔ شورای فرهنگ عمومی) با دو منبع مقابله‌ای (باحساب و calendar.rooy.dad).
    // در ۱۴۰۵ فروردین ۱ و ۲ با عید فطر و خرداد ۱۴ با عید غدیر هم‌زمان‌اند و همان روزهای ثابت
    // پوشششان می‌دهند؛ مجموع روزهای تعطیل متمایز ۱۴۰۵ = ۲۶ روز.
    { year: 1405, month: 1, day: 25, name: 'شهادت امام جعفر صادق (ع)' },
    { year: 1405, month: 3, day: 6, name: 'عید سعید قربان' },
    { year: 1405, month: 4, day: 3, name: 'تاسوعای حسینی' },
    { year: 1405, month: 4, day: 4, name: 'عاشورای حسینی' },
    { year: 1405, month: 5, day: 13, name: 'اربعین حسینی' },
    { year: 1405, month: 5, day: 21, name: 'رحلت حضرت رسول اکرم (ص) و شهادت امام حسن مجتبی (ع)' },
    { year: 1405, month: 5, day: 22, name: 'شهادت امام رضا (ع)' },
    { year: 1405, month: 5, day: 30, name: 'شهادت امام حسن عسکری (ع)' },
    { year: 1405, month: 6, day: 8, name: 'ولادت حضرت رسول اکرم (ص) و ولادت امام جعفر صادق (ع)' },
    { year: 1405, month: 8, day: 22, name: 'شهادت حضرت فاطمه زهرا (س)' },
    { year: 1405, month: 10, day: 2, name: 'ولادت امام علی (ع)' },
    { year: 1405, month: 10, day: 16, name: 'مبعث حضرت رسول اکرم (ص)' },
    { year: 1405, month: 11, day: 4, name: 'ولادت حضرت قائم (عج)' },
    { year: 1405, month: 12, day: 9, name: 'شهادت حضرت علی (ع)' },
    { year: 1405, month: 12, day: 19, name: 'عید سعید فطر' },
    { year: 1405, month: 12, day: 20, name: 'تعطیل به مناسبت عید سعید فطر' },
];

/** تعطیلات یک ماه مشخص از یک سال مشخص — تنها راه خواندن فهرست (مصرف‌کننده‌ها مستقیم فیلتر نکنند). */
export function holidaysFor(jYear: number, jMonth: number): NationalHoliday[] {
    return NATIONAL_HOLIDAYS.filter(h => h.month === jMonth && (h.year === undefined || h.year === jYear));
}

export const MONTHS = [
    { value: 1, name: 'فروردین' }, { value: 2, name: 'اردیبهشت' }, { value: 3, name: 'خرداد' },
    { value: 4, name: 'تیر' }, { value: 5, name: 'مرداد' }, { value: 6, name: 'شهریور' },
    { value: 7, name: 'مهر' }, { value: 8, name: 'آبان' }, { value: 9, name: 'آذر' },
    { value: 10, name: 'دی' }, { value: 11, name: 'بهمن' }, { value: 12, name: 'اسفند' },
];

export const DEFAULT_RULES: CustomRule[] = [
  {
    id: 'rule-max-nights',
    type: 'max_consecutive_nights',
    value: 2,
    description: 'یک فرد نمی‌تواند بیش از ۲ شیفت شب متوالی کار کند.',
    isEnabled: true,
    priority: 'IMPORTANT',
    category: 'PATIENT_SAFETY',
  },
  {
    id: 'rule-head-nurse',
    type: 'head_nurse_morning',
    description: 'سرپرستار همیشه شیفت صبح می‌باشد مگر با تغییر دستی.',
    isEnabled: true,
    priority: 'IMPORTANT',
    category: 'PATIENT_SAFETY',
  },
  {
    id: 'rule-holidays',
    type: 'national_holidays',
    description: "در روزهای تعطیل رسمی، برای تمام پرسنل شیفت 'تعطیل' ثبت شود.",
    isEnabled: true,
    priority: 'CRITICAL',
    category: 'LABOR_LAW',
  },
];

export const DEFAULT_AI_SETTINGS: AiGenerationSettings = {
  distributionAlgorithm: 'even',
  minRestHours: 24,
  maxConsecutiveWorkDays: 6,
  weekendDistribution: 'even',
};

export const DEFAULT_SCHEDULE_NOTES = "برنامه تنظیمی با رعایت قوانین ریکاوری و ایمنی بیمار.";

export const DEFAULT_GLOBAL_SETTINGS: GlobalDutySettings = {
  employmentStatuses: [
    { status: 'رسمی', baseHours: 176 },
    { status: 'قراردادی', baseHours: 176 },
    { status: 'طرحی', baseHours: 176 },
    { status: 'شرکتی', baseHours: 176 },
  ],
  roleDeductions: [
    { role: 'سرپرستار', deduction: 0 },
    { role: 'پرستار', deduction: 0 },
    { role: 'بهیار', deduction: 0 },
    { role: 'بی‌هوشی', deduction: 0 },
    { role: 'اتاق عمل', deduction: 0 },
  ],
  seniorityDeductions: [
    { minMonths: 120, maxMonths: 180, deduction: 5 },
    { minMonths: 180, maxMonths: 240, deduction: 10 },
    { minMonths: 240, maxMonths: 300, deduction: 15 },
    { minMonths: 300, maxMonths: 600, deduction: 20 },
  ],
  reminderLeadDays: 1,
  defaultReminderMinutes: 60
};
