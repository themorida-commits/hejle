#!/usr/bin/env node
/**
 * حجله — ابزار راه‌اندازی بیمارستان تازه (Bootstrap)
 * ─────────────────────────────────────────────────────────────────────────
 * از روی یک فایل پیکربندی (JSON) + فایل پرسنل (CSV با همان قالب ایمپورتر
 * پرسنل)، یک فایل SQL ایدمپوتنت می‌سازد که روی پروژهٔ سوپابیس حجله (بعد از
 * مایگریشن‌ها) اجرا شود و بیمارستان کامل را بسازد: بخش‌ها، انواع شیفت،
 * انواع مرخصی، مجموعه‌قواعد قانون بهره‌وری، بسته‌های پرستاری، پروفایل
 * پیش‌فرض کارانه و کارمندان.
 *
 * شناسه‌ها قطعی‌اند (UUID مشتق از MD5 نام+کلید) تا اجرای دوباره بی‌اثر باشد.
 *
 * استفاده:
 *   node bootstrap-hospital.mjs --config hospital.json --personnel staff.csv --out bootstrap.sql
 *
 * قالب hospital.json:
 *   { "name": "بیمارستان نمونه", "code": "sample",
 *     "wards": [ { "name": "داخلی", "code": "int" }, { "name": "جراحی" } ] }
 *
 * قالب staff.csv (سرخط‌های فارسی یا انگلیسی مثل ایمپورتر پرسنل):
 *   نام و نام خانوادگی, کد پرسنلی, بخش, عنوان, وضعیت استخدام, موبایل
 * «بخش» باید با نام یا کد یکی از بخش‌های کانفیگ یکی باشد؛ ردیف ناشناخته
 * با هشدار رد می‌شود و در خروجی شمرده می‌شود.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// ── کاتالوگ‌های پیش‌فرض (هم‌تراز seed دمو و اسناد محصول) ──────────────────
const SHIFT_TYPES = [
  ['صبح', 'M', 6, '#34d399'], ['عصر', 'E', 6, '#fbbf24'], ['شب', 'N', 12, '#1e3a8a'],
  ['عصر و شب', 'EN', 22.5, '#6366f1'], ['تشویقی', 'HE', 6, '#ec4899'],
  ['آنکال عصر', 'EO', 0.5, '#f97316'], ['نگهبانی', 'KO', 6, '#64748b'],
  ['آنکال صبح', 'MO', 0.5, '#0ea5e9'], ['آنکال شب', 'ON', 1, '#4f46e5'],
  ['استعلاجی', 'SH', 7, '#f43f5e'], ['ماموریت', 'MI', 7, '#8b5cf6'],
  ['مرخصی استحقاقی', 'H', 0, '#10b981'], ['اف', '-', 0, '#e5e7eb'],
];
// [code, name, isPaid, annualQuotaDays|null] — سقف‌های انواع خاص عمداً null است:
// عدد نهایی با آیین‌نامهٔ داخلی هر مرکز بسته می‌شود (پرسش سیاستی Q1).
const LEAVE_TYPES = [
  ['annual', 'استحقاقی', true, 26], ['sick', 'استعلاجی', true, null],
  ['unpaid', 'بدون حقوق', false, null], ['mission', 'مأموریت', true, null],
  ['maternity', 'زایمان', true, null], ['marriage', 'ازدواج', true, null],
  ['bereavement', 'فوت بستگان', true, null], ['hajj', 'حج', true, null],
];
// پروفایل‌های سقف مرخصی بر پایهٔ رژیم استخدامی — «army» از مادهٔ ۹۴ قانون ارتش
// (استحقاقی یک ماه=۳۰ روز، استعلاجی حداکثر ۴ ماه=۱۲۰ روز) و مادهٔ ۱۷ قانون
// جوانی جمعیت (زایمان ۹ ماه=۲۷۰ روز)؛ تحقیق تکمیلی ۲۰۲۶-۱۱-۰۶. بقیهٔ سقف‌ها
// (ازدواج/حج/فوت) در آیین‌نامهٔ منتشرنشده است و عمداً null می‌ماند.
const LEAVE_PROFILES = {
  standard: {},
  army: { annual: 30, sick: 120, maternity: 270 },
};
const RULES = [
  ['max_consecutive_hours', { value: 12 }, 'hard', true],
  ['overtime_cap_monthly', { value: 80 }, 'hard', true],
  ['night_coefficient', { value: 1.5 }, 'hard', true],
  ['evening_coefficient', { value: 1.2 }, 'hard', true],
  ['weekly_hours_base', { value: 44 }, 'warn', true],
  ['weekly_reduction_max', { value: 8 }, 'warn', true],
  ['min_rest_hours', { value: 11 }, 'hard', true],
  ['max_consecutive_nights', { value: 2 }, 'hard', true],
  ['max_consecutive_work_days', { value: 6 }, 'warn', true],
  ['min_staff_per_shift', {}, 'warn', true],
  ['credential_valid', {}, 'warn', false],
];
const NURSING_PACKAGES = [
  ['NC-G1', 'گروه مراقبتی ۱ — پایه', 1.7, 1], ['NC-G2', 'گروه مراقبتی ۲', 3.4, 2],
  ['NC-G3', 'گروه مراقبتی ۳', 5.9, 3], ['NC-G4', 'گروه مراقبتی ۴', 9.2, 4],
  ['NC-G5', 'گروه مراقبتی ۵', 13.5, 5], ['NC-G6', 'گروه مراقبتی ۶', 18.5, 6],
  ['NC-G7', 'گروه مراقبتی ۷', 23.5, 7], ['NC-G8', 'گروه مراقبتی ۸ — ویژه', 28.0, 8],
  ['NC-DIA', 'بسته دیالیز', 6.0, null], ['NC-CHEMO', 'بسته شیمی‌درمانی سرپایی', 3.0, null],
  ['NC-TRI1', 'تریاژ سطح ۱', 11.0, null], ['NC-TRI2', 'تریاژ سطح ۲', 8.0, null],
];

// ── ابزارها ────────────────────────────────────────────────────────────────
/** UUID قطعی از روی یک کلید رشته‌ای (نسخهٔ ۵-نما روی MD5). */
export function detUuid(key) {
  const h = createHash('md5').update(`hejleh-bootstrap:${key}`).digest('hex');
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return v;
}
const q = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const normDigits = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).trim();

/** CSV ساده (بدون کوتیشن توکار پیچیده؛ خروجی اکسل استاندارد را پوشش می‌دهد). */
export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (line) => line.split(/[,;]/).map((c) => c.trim());
  const headers = split(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

const HEADER_ALIASES = {
  name: ['نام و نام خانوادگی', 'نام', 'full_name', 'name'],
  code: ['کد پرسنلی', 'کد', 'personnel_code', 'code'],
  ward: ['بخش', 'ward', 'department'],
  title: ['عنوان', 'سمت', 'title', 'role', 'position'],
  status: ['وضعیت استخدام', 'وضعیت', 'employment_status', 'status'],
  phone: ['موبایل', 'تلفن', 'phone', 'mobile'],
};
function pick(row, keys) {
  for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k];
  return '';
}

export function buildBootstrapSql(config, personnelCsvText) {
  const warnings = [];
  const hospitalId = detUuid(`hospital:${config.code}`);
  const wardIdByKey = new Map();
  for (const w of config.wards) {
    const id = detUuid(`ward:${config.code}:${w.code ?? w.name}`);
    wardIdByKey.set(w.name, id);
    if (w.code) wardIdByKey.set(w.code, id);
  }
  const out = [];
  out.push(`-- خروجی ابزار Bootstrap حجله برای «${config.name}» — ایدمپوتنت؛ اجرای دوباره بی‌اثر است.`);
  out.push('begin;');
  out.push(`insert into public.hospitals (id, name, code) values (${q(hospitalId)}, ${q(config.name)}, ${q(config.code)}) on conflict (id) do nothing;`);
  // تنظیمات بیمارستان بر حسب پروفایل: زنجیرهٔ تأیید + جدول کاهش ساعت (معادل ماهانهٔ جدول هفتگی قانون بهره‌وری)
  const settings = config.leaveProfile === 'army'
    ? {
        leaveApprovalChain: ['ward_manager', 'hospital_admin'],
        globalDuty: {
          employmentStatuses: [
            { status: 'رسمی', baseHours: 176 }, { status: 'قراردادی', baseHours: 176 },
            { status: 'طرحی', baseHours: 176 }, { status: 'شرکتی', baseHours: 176 },
          ],
          roleDeductions: [
            { role: 'سرپرستار', deduction: 0 }, { role: 'پرستار', deduction: 0 },
            { role: 'بهیار', deduction: 0 }, { role: 'بی‌هوشی', deduction: 0 }, { role: 'اتاق عمل', deduction: 0 },
          ],
          // جدول وزارت بهداشت: هفتگی ۱/۲/۳/۴/۵ ساعت برای سابقهٔ ۰–۴/۴–۸/۸–۱۲/۱۲–۱۶/۱۶+ سال ← معادل ماهانه (×۴٫۳۳)
          seniorityDeductions: [
            { minMonths: 0, maxMonths: 48, deduction: 4.33 }, { minMonths: 48, maxMonths: 96, deduction: 8.67 },
            { minMonths: 96, maxMonths: 144, deduction: 13 }, { minMonths: 144, maxMonths: 192, deduction: 17.33 },
            { minMonths: 192, maxMonths: 600, deduction: 21.67 },
          ],
          reminderLeadDays: 1, defaultReminderMinutes: 60,
        },
      }
    : { leaveApprovalChain: ['ward_manager'] };
  out.push(`update public.hospitals set settings = ${q(JSON.stringify(settings))}::jsonb where id = ${q(hospitalId)};`);
  for (const w of config.wards) {
    out.push(`insert into public.wards (id, hospital_id, name, code) values (${q(wardIdByKey.get(w.name))}, ${q(hospitalId)}, ${q(w.name)}, ${w.code ? q(w.code) : 'null'}) on conflict (id) do nothing;`);
  }
  for (const [name, symbol, hours, color] of SHIFT_TYPES) {
    out.push(`insert into public.shift_types (id, hospital_id, name, symbol, real_duration_hours, calculated_value, friday_value, holiday_value, color) values (${q(detUuid(`shift:${config.code}:${symbol}`))}, ${q(hospitalId)}, ${q(name)}, ${q(symbol)}, ${hours}, ${hours}, ${hours}, ${hours}, ${q(color)}) on conflict (id) do nothing;`);
  }
  const profile = LEAVE_PROFILES[config.leaveProfile ?? 'standard'] ?? {};
  if (config.leaveProfile === 'army') {
    out.push('-- پروفایل سقف مرخصی: مادهٔ ۹۴ قانون ارتش + مادهٔ ۱۷ قانون جوانی جمعیت (پروفایل army)');
  }
  for (const [code, name, paid, quota] of LEAVE_TYPES) {
    const effectiveQuota = profile[code] ?? quota;
    out.push(`insert into public.leave_types (id, hospital_id, code, name, is_paid, annual_quota_days, requires_coverage) values (${q(detUuid(`leave:${config.code}:${code}`))}, ${q(hospitalId)}, ${q(code)}, ${q(name)}, ${paid}, ${effectiveQuota ?? 'null'}, true) on conflict (id) do nothing;`);
  }
  const ruleSetId = detUuid(`ruleset:${config.code}`);
  out.push(`insert into public.rule_sets (id, hospital_id, name) values (${q(ruleSetId)}, ${q(hospitalId)}, 'پیش‌فرض قانون بهره‌وری') on conflict (id) do nothing;`);
  for (const [type, params, severity, enabled] of RULES) {
    out.push(`insert into public.rules (id, rule_set_id, hospital_id, rule_type, params, severity, is_enabled) values (${q(detUuid(`rule:${config.code}:${type}`))}, ${q(ruleSetId)}, ${q(hospitalId)}, ${q(type)}, ${q(JSON.stringify(params))}::jsonb, ${q(severity)}, ${enabled}) on conflict (id) do nothing;`);
  }
  for (const [code, title, k, group] of NURSING_PACKAGES) {
    out.push(`insert into public.nursing_packages (id, hospital_id, code, title, k_value, unit, care_group) values (${q(detUuid(`pkg:${config.code}:${code}`))}, ${q(hospitalId)}, ${q(code)}, ${q(title)}, ${k}, 'بیمار/نوبت', ${group ?? 'null'}) on conflict (id) do nothing;`);
  }
  out.push(`insert into public.karaneh_profiles (id, hospital_id, name, preset_id, nursing_share, on_call_coef, k_rial, is_default) values (${q(detUuid(`kprofile:${config.code}`))}, ${q(hospitalId)}, 'پروفایل وزارت بهداشت ۱۴۰۴', 'moh', 0.85, 4, 201000, true) on conflict (id) do nothing;`);

  // پرسنل
  const { rows } = parseCsv(personnelCsvText);
  const seenCodes = new Set();
  let staffCount = 0;
  rows.forEach((row, i) => {
    const name = pick(row, HEADER_ALIASES.name);
    const code = normDigits(pick(row, HEADER_ALIASES.code));
    const wardKey = pick(row, HEADER_ALIASES.ward);
    const title = pick(row, HEADER_ALIASES.title);
    const status = pick(row, HEADER_ALIASES.status) || 'رسمی';
    const phone = normDigits(pick(row, HEADER_ALIASES.phone));
    if (!name || !code) { warnings.push(`ردیف ${i + 2}: نام یا کد پرسنلی خالی است — رد شد`); return; }
    if (seenCodes.has(code)) { warnings.push(`ردیف ${i + 2}: کد پرسنلی تکراری «${code}» — رد شد`); return; }
    const wardId = wardIdByKey.get(wardKey);
    if (!wardId) { warnings.push(`ردیف ${i + 2}: بخش «${wardKey}» در کانفیگ نیست — رد شد`); return; }
    seenCodes.add(code);
    staffCount += 1;
    out.push(`insert into public.employees (id, hospital_id, ward_id, full_name, personnel_code, employment_status, phone) values (${q(detUuid(`emp:${config.code}:${code}`))}, ${q(hospitalId)}, ${q(wardId)}, ${q(name)}, ${q(code)}, ${q(status)}, ${phone ? q(phone) : 'null'}) on conflict (id) do nothing;`);
    if (title) out.push(`-- عنوان «${title}» برای ${code} در یادداشت راه‌اندازی نگه داشته شد (ستون عنوان در مدل فعلی از position می‌آید)`);
  });
  out.push('commit;');
  return {
    sql: out.join('\n') + '\n',
    summary: { hospitalId, wards: config.wards.length, shiftTypes: SHIFT_TYPES.length, leaveTypes: LEAVE_TYPES.length, rules: RULES.length, packages: NURSING_PACKAGES.length, staff: staffCount, warnings },
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const configPath = get('--config');
  const personnelPath = get('--personnel');
  const outPath = get('--out') ?? 'bootstrap.sql';
  if (!configPath || !personnelPath) {
    console.error('استفاده: node bootstrap-hospital.mjs --config hospital.json --personnel staff.csv [--out bootstrap.sql]');
    process.exit(2);
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!config.name || !config.code || !Array.isArray(config.wards) || !config.wards.length) {
    console.error('کانفیگ نامعتبر: name و code و دست‌کم یک بخش لازم است.');
    process.exit(2);
  }
  const { sql, summary } = buildBootstrapSql(config, readFileSync(personnelPath, 'utf8'));
  writeFileSync(outPath, sql);
  console.log(JSON.stringify({ out: outPath, ...summary }, null, 2));
}
