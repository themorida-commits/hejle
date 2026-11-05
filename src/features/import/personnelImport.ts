// ─────────────────────────────────────────────────────────────────────────────
// ورود لیست پرسنل از فایل بیمارستان (CSV / اکسل) — ورودی پایلوت: بیمارستان
// لیست بخش را می‌دهد، حجله بدون ورود دستی آماده می‌شود. نگاشت ستون‌ها
// انعطاف‌پذیر است (سرفصل فارسی یا انگلیسی)، اعتبارسنجی ردیف‌به‌ردیف با شمارهٔ
// ردیف گزارش می‌شود و هیچ ردیفی بی‌صدا دور ریخته نمی‌شود.
// ─────────────────────────────────────────────────────────────────────────────
import type { Personnel } from '../../core/types';

export const PERSONNEL_TEMPLATE_HEADERS = [
  'نام و نام خانوادگی', 'کد پرسنلی', 'سمت', 'مدرک تحصیلی', 'سابقه خدمت (سال)',
  'کد ملی', 'شماره تماس', 'نوع استخدام', 'ساعت موظف پایه (هفته)',
];

export function personnelTemplateCsv(): string {
  const rows = [
    PERSONNEL_TEMPLATE_HEADERS,
    ['زهرا محمدی', 'N-201', 'پرستار', 'کارشناسی', '6', '', '09120000000', 'رسمی', ''],
    ['علی کریمی', 'N-202', 'بهیار', 'دیپلم', '12', '', '09120000001', 'قراردادی', ''],
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return '﻿' + rows.map(r => r.map(esc).join(',')).join('\n');
}

const HEADER_MAP: Record<string, string> = {
  'نام و نام خانوادگی': 'name', 'نام': 'name', 'name': 'name', 'full_name': 'name',
  'کد پرسنلی': 'personnelCode', 'کدپرسنلی': 'personnelCode', 'personnel_code': 'personnelCode', 'code': 'personnelCode',
  'سمت': 'role', 'عنوان': 'role', 'role': 'role', 'title': 'role',
  'سابقه خدمت (سال)': 'seniority', 'سابقه': 'seniority', 'seniority': 'seniority',
  'کد ملی': 'nationalCode', 'کدملی': 'nationalCode', 'national_code': 'nationalCode',
  'شماره تماس': 'contactNumber', 'موبایل': 'contactNumber', 'phone': 'contactNumber',
  'نوع استخدام': 'employmentStatus', 'استخدام': 'employmentStatus', 'employment_status': 'employmentStatus',
  'ساعت موظف پایه (هفته)': 'baseDutyHours', 'ساعت موظف': 'baseDutyHours', 'base_duty_hours': 'baseDutyHours',
  'مدرک تحصیلی': 'degree', 'مدرک': 'degree', 'degree': 'degree',
};

export interface ImportError { row: number; message: string }
export interface ImportResult {
  personnel: Personnel[];
  errors: ImportError[];
  duplicateCodes: string[];
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parsePersonnelCsv(text: string, wardId: string, existingCodes: Set<string> = new Set()): ImportResult {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim().length > 0);
  const personnel: Personnel[] = [];
  const errors: ImportError[] = [];
  const duplicateCodes: string[] = [];
  if (lines.length === 0) return { personnel, errors: [{ row: 0, message: 'فایل خالی است' }], duplicateCodes };

  const headers = splitCsvLine(lines[0]!).map(h => HEADER_MAP[h.trim()] ?? h.trim());
  const colOf = (field: string) => headers.indexOf(field);
  const iName = colOf('name');
  const iCode = colOf('personnelCode');
  if (iName < 0 || iCode < 0) {
    return { personnel, errors: [{ row: 1, message: 'سرفصل‌های «نام» و «کد پرسنلی» پیدا نشد — از قالب آماده استفاده کنید' }], duplicateCodes };
  }
  const seen = new Set<string>();
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li]!);
    const get = (field: string) => {
      const idx = colOf(field);
      return idx >= 0 ? (cells[idx] ?? '') : '';
    };
    const name = get('name');
    const code = get('personnelCode');
    const rowNo = li + 1;
    if (!name && !code) continue; // ردیف کاملاً خالی
    if (!name) { errors.push({ row: rowNo, message: 'نام خالی است' }); continue; }
    if (!code) { errors.push({ row: rowNo, message: `کد پرسنلی خالی است (${name})` }); continue; }
    if (existingCodes.has(code) || seen.has(code)) { duplicateCodes.push(code); continue; }
    seen.add(code);
    const seniorityRaw = get('seniority').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    const seniority = Number.parseInt(seniorityRaw, 10);
    const dutyRaw = get('baseDutyHours').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    const duty = Number.parseFloat(dutyRaw);
    personnel.push({
      id: `imp-${code}`,
      name,
      personnelCode: code,
      role: get('role') || 'پرستار',
      departmentId: wardId,
      seniorityLevel: Number.isFinite(seniority) ? seniority : 0,
      nationalCode: get('nationalCode'),
      contactNumber: get('contactNumber'),
      employmentStatus: get('employmentStatus') || 'رسمی',
      ...(Number.isFinite(duty) && duty > 0 ? { baseDutyHours: duty } : {}),
    });
  }
  return { personnel, errors, duplicateCodes };
}
