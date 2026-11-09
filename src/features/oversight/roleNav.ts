/**
 * ناوبری نقش‌محور — هر نقش فقط میز کار خودش را می‌بیند.
 * مترون و اداری (hr_admin) نقش‌های سطح بیمارستان‌اند: صف کل بیمارستان، نظارت و
 * ثبت، نه ویرایش برنامهٔ یک بخش. این نگاشت خالص است تا تست‌پذیر بماند.
 */
export interface NavItem { to: string; label: string }

export const ALL_NAV: NavItem[] = [
  { to: '/', label: 'داشبورد' },
  { to: '/scheduler', label: 'برنامهٔ شیفت' },
  { to: '/leave', label: 'مرخصی‌ها' },
  { to: '/work-records', label: 'کارکرد ماهانه' },
  { to: '/attendance', label: 'حضور و غیاب' },
  { to: '/personnel', label: 'پرونده پرسنلی' },
  { to: '/karaneh', label: 'کارانه' },
  { to: '/nursing-services', label: 'خدمات پرستاری' },
  { to: '/patients', label: 'بیماران بخش' },
  { to: '/accreditation', label: 'اعتباربخشی' },
  { to: '/ai', label: 'دستیار AI' },
  { to: '/settings', label: 'تنظیمات بیمارستان' },
  { to: '/self-service', label: 'سلف‌سرویس پرستار' },
];

const ROLE_PATHS: Record<string, string[]> = {
  hospital_admin: ALL_NAV.map(n => n.to),
  // مترون: نظارت پرستاری کل بیمارستان + صف تأیید + فرم‌های چاپی از راه برنامهٔ شیفت
  matron: ['/', '/scheduler', '/leave', '/work-records', '/nursing-services', '/patients', '/accreditation'],
  // اداری/منابع انسانی: پرونده و ثبت و خروجی — قلب تپندهٔ کارگزینی
  hr_admin: ['/', '/leave', '/personnel', '/work-records', '/attendance', '/karaneh', '/nursing-services'],
  ward_manager: ['/', '/scheduler', '/leave', '/work-records', '/attendance', '/personnel', '/nursing-services', '/patients', '/self-service'],
  staff: ['/leave', '/self-service', '/patients'],
};

/** آیا نقش در سطح کل بیمارستان کار می‌کند (نه یک بخش)؟ */
export function isHospitalLevelRole(role: string): boolean {
  return role === 'hospital_admin' || role === 'matron' || role === 'hr_admin';
}

const STAFF_PATHS = ['/leave', '/self-service'];

export function navForRole(role: string): NavItem[] {
  const paths = ROLE_PATHS[role] ?? STAFF_PATHS;
  return ALL_NAV.filter(n => paths.includes(n.to));
}
