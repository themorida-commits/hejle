// ─────────────────────────────────────────────────────────────────────────────
// اعتبارنامه‌ها (فاز ۳) — وضعیت اعتبار از روی تاریخ انقضا، قطعی و شفاف:
// منقضی < امروز ≤ در آستانهٔ انقضا (≤ ۶۰ روز) < معتبر. خلاصهٔ انطباق بخش برای
// داشبورد سرپرستار و منابع انسانی.
// ─────────────────────────────────────────────────────────────────────────────

export type CredentialKind = 'license' | 'certificate' | 'training' | 'other';
export type CredentialStatus = 'valid' | 'expiring' | 'expired' | 'no_expiry';

export interface Credential {
  id: string;
  employeeId: string;
  kind: CredentialKind;
  title: string;
  issuer?: string;
  issuedOnISO?: string;
  expiresOnISO?: string;
}

export const KIND_FA: Record<CredentialKind, string> = {
  license: 'پروانهٔ اشتغال', certificate: 'گواهینامه', training: 'دورهٔ آموزشی', other: 'سایر',
};
export const STATUS_FA: Record<CredentialStatus, string> = {
  valid: 'معتبر', expiring: 'در آستانهٔ انقضا', expired: 'منقضی', no_expiry: 'بدون انقضا',
};

export const EXPIRY_WARN_DAYS = 60;

export function credentialStatus(c: Credential, todayISO: string): CredentialStatus {
  if (!c.expiresOnISO) return 'no_expiry';
  if (c.expiresOnISO < todayISO) return 'expired';
  const days = Math.floor((Date.parse(c.expiresOnISO) - Date.parse(todayISO)) / 86400000);
  return days <= EXPIRY_WARN_DAYS ? 'expiring' : 'valid';
}

export interface ComplianceSummary {
  total: number;
  valid: number;
  expiring: number;
  expired: number;
  /** مدارک مسئله‌دار با نام کارمند — آمادهٔ نمایش و پیگیری. */
  attention: { credential: Credential; employeeName: string; status: CredentialStatus }[];
}

export function summarizeCompliance(
  credentials: Credential[],
  nameOf: (employeeId: string) => string,
  todayISO: string,
): ComplianceSummary {
  const s: ComplianceSummary = { total: credentials.length, valid: 0, expiring: 0, expired: 0, attention: [] };
  for (const c of credentials) {
    const status = credentialStatus(c, todayISO);
    if (status === 'valid' || status === 'no_expiry') s.valid++;
    if (status === 'expiring') { s.expiring++; s.attention.push({ credential: c, employeeName: nameOf(c.employeeId), status }); }
    if (status === 'expired') { s.expired++; s.attention.push({ credential: c, employeeName: nameOf(c.employeeId), status }); }
  }
  s.attention.sort((a, b) => (a.credential.expiresOnISO ?? '').localeCompare(b.credential.expiresOnISO ?? ''));
  return s;
}

// ── قفل صلاحیت در روس‌تر (P1 نسخهٔ خصوصی) ───────────────────────────────────
// قاعده: پروانهٔ اشتغال منقضی (بدون پروانهٔ معتبرِ جایگزین) = منع قانونیِ کار
// بالینی → فرد از تولید برنامه کنار گذاشته می‌شود. نزدیک‌انقضا و مدارک دیگرِ
// منقضی فقط هشدارند؛ نبودِ هیچ سابقه‌ای هم هشدار است، نه منع (داده ممکن است
// هنوز کامل وارد نشده باشد) — تصمیم نهایی همیشه با سرپرستار است.
export interface CredentialGateEntry { employeeId: string; reasons: string[] }
export interface CredentialGate {
  eligibleIds: string[];
  blocked: CredentialGateEntry[];
  warnings: CredentialGateEntry[];
}

export function credentialGate(employeeIds: string[], credentials: Credential[], todayISO: string): CredentialGate {
  const blocked: CredentialGateEntry[] = [];
  const warnings: CredentialGateEntry[] = [];
  const eligibleIds: string[] = [];
  for (const id of employeeIds) {
    const mine = credentials.filter(c => c.employeeId === id);
    const licenses = mine.filter(c => c.kind === 'license');
    const reasons: string[] = [];
    const warn: string[] = [];
    const hasLiveLicense = licenses.some(c => credentialStatus(c, todayISO) !== 'expired');
    if (licenses.length > 0 && !hasLiveLicense) {
      reasons.push('پروانهٔ اشتغال منقضی است و پروانهٔ معتبر جایگزین ثبت نشده');
    }
    if (licenses.length === 0) warn.push('پروانهٔ اشتغالی در پرونده ثبت نشده است');
    for (const c of licenses) {
      if (credentialStatus(c, todayISO) === 'expiring') warn.push(`پروانهٔ اشتغال تا ${c.expiresOnISO} منقضی می‌شود`);
    }
    for (const c of mine) {
      if (c.kind !== 'license' && credentialStatus(c, todayISO) === 'expired') warn.push(`مدرک منقضی: ${c.title}`);
      if (c.kind !== 'license' && credentialStatus(c, todayISO) === 'expiring') warn.push(`مدرک در آستانهٔ انقضا: ${c.title}`);
    }
    if (reasons.length) blocked.push({ employeeId: id, reasons });
    else eligibleIds.push(id);
    if (warn.length) warnings.push({ employeeId: id, reasons: warn });
  }
  return { eligibleIds, blocked, warnings };
}

/** سید دمو مدارک برای پرسنل بخش داخلی — شامل یک منقضی و یک در آستانهٔ انقضا. */
export function seedDemoCredentials(employeeIds: string[], todayISO: string): Credential[] {
  const out: Credential[] = [];
  let seq = 0;
  const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);
  employeeIds.forEach((emp, i) => {
    out.push({
      id: `cred-${++seq}`, employeeId: emp, kind: 'license',
      title: 'پروانهٔ اشتغال به حرفهٔ پرستاری', issuer: 'سازمان نظام پرستاری',
      issuedOnISO: addDays(todayISO, -700), expiresOnISO: addDays(todayISO, i === 2 ? -15 : 300 + i * 10), // نفر سوم: پروانهٔ منقضی نمایشی برای قفل صلاحیت
    });
    out.push({
      id: `cred-${++seq}`, employeeId: emp, kind: 'training',
      title: 'دورهٔ احیای قلبی ریوی (BLS)', issuer: 'معاونت آموزش بیمارستان',
      issuedOnISO: addDays(todayISO, -300), expiresOnISO: addDays(todayISO, 200),
    });
  });
  if (employeeIds[2]) {
    out.push({
      id: `cred-${++seq}`, employeeId: employeeIds[2], kind: 'certificate',
      title: 'گواهی کنترل عفونت', issuer: 'واحد کنترل عفونت',
      issuedOnISO: addDays(todayISO, -800), expiresOnISO: addDays(todayISO, -15), // منقضی نمایشی
    });
  }
  if (employeeIds[3]) {
    out.push({
      id: `cred-${++seq}`, employeeId: employeeIds[3], kind: 'certificate',
      title: 'گواهی مراقبت ویژه (ICU)', issuer: 'دانشگاه علوم پزشکی',
      issuedOnISO: addDays(todayISO, -330), expiresOnISO: addDays(todayISO, 30), // در آستانهٔ انقضا
    });
  }
  return out;
}
