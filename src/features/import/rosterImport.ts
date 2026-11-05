// ─────────────────────────────────────────────────────────────────────────────
// ورود روس‌تر تاریخی بخش (فرمت شبکه‌ای: سطر=نفر، ستون=روز ماه) — لازمِ اجرای
// موازی پایلوت: برنامهٔ ماه گذشتهٔ بخش از فایل اکسل/CSV خودش وارد می‌شود تا
// کارکرد حجله با خروجی روش فعلی بیمارستان مقایسه شود. نمادها از روی فهرست
// شیفت‌های همان بیمارستان حل می‌شوند (نماد، نام فارسی، یا نام‌های رایج).
// ─────────────────────────────────────────────────────────────────────────────
import type { Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import { isoFromJalali } from '../leave/leaveService';
import { getDaysInJalaliMonth } from '../../core/jalali';
import { splitCsvLine } from './personnelImport';

const faDigits = (s: string) => s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

export type SymbolResolver = (token: string) => string | 'OFF' | null;

export function buildSymbolResolver(shiftTypes: ShiftType[]): SymbolResolver {
  const map = new Map<string, string>();
  for (const s of shiftTypes) {
    map.set(s.symbol.toUpperCase(), s.id);
    map.set(s.name, s.id);
  }
  // نام‌های رایجِ کوتاه که در فایل‌های بیمارستانی می‌آیند
  const bySymbol = (sym: string) => shiftTypes.find(s => s.symbol === sym)?.id;
  const alias: Record<string, string | undefined> = {
    'مرخصی': bySymbol('H'),
    'استعلاجی': bySymbol('SH'),
    'ماموریت': bySymbol('MI'),
    'آنکال': bySymbol('MO'),
  };
  for (const [k, v] of Object.entries(alias)) if (v) map.set(k, v);
  const OFF_TOKENS = new Set(['', '-', 'آف', 'استراحت', 'OFF', 'off', 'تعطیل']);
  return (token: string) => {
    const t = token.trim();
    if (OFF_TOKENS.has(t)) return 'OFF';
    return map.get(t) ?? map.get(t.toUpperCase()) ?? null;
  };
}

export interface RosterImportResult {
  entries: ScheduleEntry[];
  errors: { row: number; message: string }[];
  warnings: { row: number; day: number; token: string }[];
  stats: { people: number; filledCells: number; offCells: number };
}

export function parseRosterGridCsv(
  text: string,
  ctx: { jYear: number; jMonth: number; personnel: Personnel[]; resolve: SymbolResolver },
): RosterImportResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim().length > 0);
  const entries: ScheduleEntry[] = [];
  const errors: RosterImportResult['errors'] = [];
  const warnings: RosterImportResult['warnings'] = [];
  const stats = { people: 0, filledCells: 0, offCells: 0 };
  if (lines.length === 0) return { entries, errors: [{ row: 0, message: 'فایل خالی است' }], warnings, stats };

  const header = splitCsvLine(lines[0]!);
  const codeCol = header.findIndex(h => /کد پرسنلی|personnel/i.test(h));
  if (codeCol < 0) return { entries, errors: [{ row: 1, message: 'ستون «کد پرسنلی» پیدا نشد — از قالب آماده استفاده کنید' }], warnings, stats };
  const dayCols = new Map<number, number>(); // ستون → روز ماه
  header.forEach((h, i) => {
    const d = Number.parseInt(faDigits(h), 10);
    if (Number.isFinite(d) && d >= 1 && d <= 31) dayCols.set(i, d);
  });
  if (dayCols.size === 0) return { entries, errors: [{ row: 1, message: 'ستون‌های روز ماه (۱ تا ۳۱) در سرفصل پیدا نشد' }], warnings, stats };

  const byCode = new Map(ctx.personnel.map(p => [p.personnelCode, p.id]));
  const seenPeople = new Set<string>();
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li]!);
    const code = (cells[codeCol] ?? '').trim();
    if (!code) continue;
    const personId = byCode.get(code);
    if (!personId) { errors.push({ row: li + 1, message: `کد پرسنلی ناشناخته: ${code}` }); continue; }
    if (seenPeople.has(personId)) errors.push({ row: li + 1, message: `ردیف تکراری برای کد ${code} — سلول‌ها روی ردیف قبلی می‌نشینند` });
    seenPeople.add(personId);
    stats.people++;
    for (const [col, day] of dayCols) {
      const token = (cells[col] ?? '').trim();
      if (!token) continue;
      const resolved = ctx.resolve(token);
      if (resolved === 'OFF') { stats.offCells++; continue; }
      if (resolved === null) { warnings.push({ row: li + 1, day, token }); continue; }
      entries.push({
        personnelId: personId,
        shiftTypeId: resolved,
        date: isoFromJalali(ctx.jYear, ctx.jMonth, day),
        isManualEntry: true,
      });
      stats.filledCells++;
    }
  }
  return { entries, errors, warnings, stats };
}

export function rosterGridTemplateCsv(personnel: Personnel[], jYear: number, jMonth: number): string {
  const days = getDaysInJalaliMonth(jYear, jMonth);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ['نام و نام خانوادگی', 'کد پرسنلی', ...Array.from({ length: days }, (_, i) => String(i + 1))];
  const rows = personnel.map(p => [p.name, p.personnelCode, ...Array.from({ length: days }, () => '')]);
  return '﻿' + [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
}
