import type { CustomRule, AiGenerationSettings, GlobalDutySettings } from './types';

export const NATIONAL_HOLIDAYS = [
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
];

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
