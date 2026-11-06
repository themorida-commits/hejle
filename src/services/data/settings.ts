// تنظیمات سطح بیمارستان (hospitals.settings jsonb): زنجیرهٔ تأیید مرخصی و
// تنظیمات موظفی (جدول کاهش ساعت Q2). نرمال‌سازی دفاعی: هر ورودی خراب یا ناقص
// به پیش‌فرض‌های امن برمی‌گردد تا بیمارستانِ بدون تنظیم دقیقاً مثل قبل کار کند.
import { DEFAULT_GLOBAL_SETTINGS } from '../../core/defaults';
import type { GlobalDutySettings } from '../../core/types';
import type { HospitalSettingsRecord } from './types';

export const DEFAULT_APPROVAL_CHAIN: string[] = ['ward_manager'];

const KNOWN_ROLES = new Set(['hospital_admin', 'hr_admin', 'ward_manager', 'staff']);

/** پیش‌فرض زنجیرهٔ تأیید بر اساس بخش — از پژوهش زنجیره‌های مرخصی (۲۰۲۶-۱۱-۰۶).
 *  دولتی و خصوصی از اسناد عمومی مستندند؛ نیروهای مسلح پیش‌فرض عمومی ندارد
 *  (حدود اختیارات، آیین‌نامهٔ داخلی است) و متنش همین هشدار را حمل می‌کند. */
export interface ChainPreset {
  id: 'government' | 'private' | 'army';
  label: string;
  chain: string[];
  note: string;
}

export const CHAIN_PRESETS: ChainPreset[] = [
  {
    id: 'government',
    label: 'دولتی (دانشگاه علوم پزشکی)',
    chain: ['ward_manager', 'hospital_admin'],
    note: 'الگوی مستند بیمارستان‌های دانشگاهی: موافقت مسئول بخش/سرپرستار، بعد تأیید نهایی مدیریت پرستاری/بیمارستان. ثبت نهایی (صدور حکم) با کارگزینی است و گام تأیید حساب نمی‌شود. استعلاجی مسیر پزشکیِ جدا دارد (پزشک معتمد و در اختلاف، کمیسیون پزشکی).',
  },
  {
    id: 'private',
    label: 'خصوصی',
    chain: ['ward_manager', 'hr_admin', 'hospital_admin'],
    note: 'قانون کار زنجیره‌ای تعیین نکرده است؛ این الگو از فرم داخلی منتشرشدهٔ بیمارستان خصوصی گرفته شده: اظهارنظر سرپرستار، بعد منابع انسانی (بررسی مانده) و تأیید ریاست/مدیریت. اگر در بیمارستان شما مترون گام جداست، یک گام «سرپرستار» دیگر پیش از منابع انسانی اضافه کنید.',
  },
  {
    id: 'army',
    label: 'نیروهای مسلح (ارتش)',
    chain: ['ward_manager', 'hospital_admin'],
    note: 'هشدار: حدود اختیارات تأیید مرخصی در نیروهای مسلح آیین‌نامهٔ داخلی است و پیش‌فرض عمومی ندارد — مادهٔ ۹۴ قانون ارتش فقط انواع و سقف‌های مرخصی را مشخص می‌کند. این ترتیب فقط نقطهٔ شروع است؛ سقف روزهای هر گام و ترتیب واقعی را از آیین‌نامهٔ داخلی بیمارستان بگیرید و همین‌جا اصلاح کنید.',
  },
];

/** اگر زنجیرهٔ فعلی دقیقاً یکی از پیش‌فرض‌ها باشد، همان را برمی‌گرداند. */
export function matchChainPreset(chain: string[]): ChainPreset | null {
  return CHAIN_PRESETS.find(
    p => p.chain.length === chain.length && p.chain.every((r, i) => r === chain[i]),
  ) ?? null;
}

export function defaultHospitalSettings(): HospitalSettingsRecord {
  return {
    approvalChain: [...DEFAULT_APPROVAL_CHAIN],
    chainPresetId: null,
    globalDuty: structuredClone(DEFAULT_GLOBAL_SETTINGS),
  };
}

export function normalizeHospitalSettings(raw: unknown): HospitalSettingsRecord {
  const out = defaultHospitalSettings();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;

  if (Array.isArray(r.leaveApprovalChain)) {
    const chain = r.leaveApprovalChain.filter(
      (x): x is string => typeof x === 'string' && KNOWN_ROLES.has(x) && x !== 'staff',
    );
    if (chain.length > 0) out.approvalChain = chain;
  }

  if (r.chainPresetId === 'government' || r.chainPresetId === 'private' || r.chainPresetId === 'army') {
    out.chainPresetId = r.chainPresetId;
  }

  const gd = r.globalDuty as Partial<GlobalDutySettings> | undefined;
  if (gd && typeof gd === 'object') {
    if (Array.isArray(gd.seniorityDeductions)) {
      const bands = gd.seniorityDeductions.filter(
        b => b && typeof b.minMonths === 'number' && typeof b.maxMonths === 'number' && typeof b.deduction === 'number',
      );
      if (bands.length > 0) out.globalDuty.seniorityDeductions = bands;
    }
    if (Array.isArray(gd.employmentStatuses) && gd.employmentStatuses.length > 0) {
      out.globalDuty.employmentStatuses = gd.employmentStatuses;
    }
    if (Array.isArray(gd.roleDeductions)) out.globalDuty.roleDeductions = gd.roleDeductions;
    if (typeof gd.reminderLeadDays === 'number') out.globalDuty.reminderLeadDays = gd.reminderLeadDays;
    if (typeof gd.defaultReminderMinutes === 'number') out.globalDuty.defaultReminderMinutes = gd.defaultReminderMinutes;
  }
  return out;
}

/** شکل ذخیره‌سازی در hospitals.settings (کلیدهای پایدار). */
export function hospitalSettingsToJson(s: HospitalSettingsRecord): Record<string, unknown> {
  return { leaveApprovalChain: s.approvalChain, chainPresetId: s.chainPresetId, globalDuty: s.globalDuty };
}
