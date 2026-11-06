// تنظیمات سطح بیمارستان (hospitals.settings jsonb): زنجیرهٔ تأیید مرخصی و
// تنظیمات موظفی (جدول کاهش ساعت Q2). نرمال‌سازی دفاعی: هر ورودی خراب یا ناقص
// به پیش‌فرض‌های امن برمی‌گردد تا بیمارستانِ بدون تنظیم دقیقاً مثل قبل کار کند.
import { DEFAULT_GLOBAL_SETTINGS } from '../../core/defaults';
import type { GlobalDutySettings } from '../../core/types';
import type { HospitalSettingsRecord } from './types';

export const DEFAULT_APPROVAL_CHAIN: string[] = ['ward_manager'];

const KNOWN_ROLES = new Set(['hospital_admin', 'hr_admin', 'ward_manager', 'staff']);

export function defaultHospitalSettings(): HospitalSettingsRecord {
  return {
    approvalChain: [...DEFAULT_APPROVAL_CHAIN],
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
  return { leaveApprovalChain: s.approvalChain, globalDuty: s.globalDuty };
}
