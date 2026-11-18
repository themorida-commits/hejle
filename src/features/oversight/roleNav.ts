/**
 * ناوبری نقش‌محور — هر نقش فقط میز کار خودش را می‌بیند.
 * مترون و اداری (hr_admin) نقش‌های سطح بیمارستان‌اند: صف کل بیمارستان، نظارت و
 * ثبت، نه ویرایش برنامهٔ یک بخش. این نگاشت خالص است تا تست‌پذیر بماند.
 */
export interface NavItem { to: string; label: string }

export const ALL_NAV: NavItem[] = [
  { to: '/', label: 'داشبورد' },
  { to: '/scheduler', label: 'برنامهٔ شیفت' },
  { to: '/approvals', label: 'تأییدها' },
  { to: '/leave', label: 'مرخصی‌ها' },
  { to: '/work-records', label: 'کارکرد ماهانه' },
  { to: '/attendance', label: 'حضور و غیاب' },
  { to: '/personnel', label: 'پرونده پرسنلی' },
  { to: '/karaneh', label: 'کارانه' },
  { to: '/nursing-services', label: 'خدمات پرستاری' },
  { to: '/patients', label: 'بیماران بخش' },
  { to: '/agents', label: 'مرکز ایجنت‌ها' },
  { to: '/accreditation', label: 'اعتباربخشی' },
  { to: '/ai', label: 'دستیار AI' },
  { to: '/settings', label: 'تنظیمات بیمارستان' },
  { to: '/self-service', label: 'سلف‌سرویس پرستار' },
];

const ROLE_PATHS: Record<string, string[]> = {
  hospital_admin: ALL_NAV.map(n => n.to),
  // مترون: نظارت پرستاری کل بیمارستان + صف تأیید + فرم‌های چاپی از راه برنامهٔ شیفت
  matron: ['/', '/scheduler', '/approvals', '/leave', '/work-records', '/nursing-services', '/patients', '/accreditation', '/agents'],
  // اداری/منابع انسانی: پرونده و ثبت و خروجی — قلب تپندهٔ کارگزینی
  hr_admin: ['/', '/approvals', '/leave', '/personnel', '/work-records', '/attendance', '/karaneh', '/nursing-services'],
  ward_manager: ['/', '/scheduler', '/approvals', '/leave', '/work-records', '/attendance', '/personnel', '/nursing-services', '/patients', '/agents', '/self-service'],
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

// ── گروه‌بندی بر اساس کار (دور ۲۴ — موج ۲ UI) ────────────────────────────────
// ناوبری کناری با اسم کارها گروه‌بندی می‌شود، نه با مدل داده؛ مرئی‌بودن هر آیتم
// دقیقاً همان نگاشت نقش بالاست — گروه فقط ارائه است و حقی تازه نمی‌سازد.
export interface NavGroup { id: string; label: string; items: NavItem[] }

const NAV_GROUP_DEFS: { id: string; label: string; paths: string[] }[] = [
  { id: 'home', label: '', paths: ['/'] },
  { id: 'planning', label: 'برنامه‌ریزی', paths: ['/scheduler', '/self-service'] },
  { id: 'approvals', label: 'تأییدها و مرخصی', paths: ['/approvals', '/leave'] },
  { id: 'money', label: 'پول و کارکرد', paths: ['/karaneh', '/nursing-services', '/work-records', '/attendance'] },
  { id: 'people', label: 'آدم‌ها و مدارک', paths: ['/personnel', '/patients'] },
  { id: 'oversight', label: 'نظارت', paths: ['/agents', '/accreditation', '/ai'] },
  { id: 'admin', label: '', paths: ['/settings'] },
];

export function navGroupsForRole(role: string): NavGroup[] {
  const visible = navForRole(role);
  const byPath = new Map(visible.map(n => [n.to, n]));
  return NAV_GROUP_DEFS
    .map(g => ({ id: g.id, label: g.label, items: g.paths.map(p => byPath.get(p)).filter((x): x is NavItem => !!x) }))
    .filter(g => g.items.length > 0);
}
