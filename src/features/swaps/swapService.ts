// جابه‌جایی شیفت (P1-05): دو نفره — درخواست، پذیرش طرف مقابل، تأیید سرپرستار، اعمال اتمی روی ردیف‌ها.
import type { Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import { categorizeShift } from '../../core/rules/engine';

/**
 * نگهبان قانون ثابت سرپرستار: اگر یکی از طرفین سرپرستار است، شیفتی که بعد از
 * جابه‌جایی به او می‌رسد فقط می‌تواند صبح یا آف باشد.
 */
export function headNurseSwapError(args: {
  fromEmployeeId: string;
  toEmployeeId: string;
  entries: ScheduleEntry[];
  dateISO: string;
  personnel?: Personnel[];
  shiftTypes?: ShiftType[];
}): string | null {
  if (!args.personnel || !args.shiftTypes) return null;
  const mine = args.entries.find(e => e.personnelId === args.fromEmployeeId && e.date === args.dateISO);
  const theirs = args.entries.find(e => e.personnelId === args.toEmployeeId && e.date === args.dateISO);
  if (!mine || !theirs) return null;
  const people = new Map(args.personnel.map(p => [p.id, p]));
  const shifts = new Map(args.shiftTypes.map(s => [s.id, s]));
  const parties = [
    { person: people.get(args.fromEmployeeId), incomingId: theirs.shiftTypeId },
    { person: people.get(args.toEmployeeId), incomingId: mine.shiftTypeId },
  ];
  for (const party of parties) {
    if (!party.person?.role.includes('سرپرستار')) continue;
    const incoming = shifts.get(party.incomingId);
    const category = incoming ? categorizeShift(incoming) : 'other';
    if (category !== 'morning' && category !== 'off') {
      return 'قانون ثابت: سرپرستار فقط شیفت صبح دارد؛ این جابه‌جایی ممکن نیست.';
    }
  }
  return null;
}

export type SwapStatus = 'pending' | 'accepted' | 'approved' | 'rejected' | 'cancelled';

export interface SwapRequest {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  dateISO: string;
  status: SwapStatus;
  reviewedBy?: string;
}

export function createSwap(args: {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  dateISO: string;
  entries: ScheduleEntry[];
  personnel?: Personnel[];
  shiftTypes?: ShiftType[];
}): { ok: true; swap: SwapRequest } | { ok: false; error: string } {
  if (args.fromEmployeeId === args.toEmployeeId) return { ok: false, error: 'جابه‌جایی با خودتان ممکن نیست.' };
  const mine = args.entries.find(e => e.personnelId === args.fromEmployeeId && e.date === args.dateISO);
  const theirs = args.entries.find(e => e.personnelId === args.toEmployeeId && e.date === args.dateISO);
  if (!mine || !theirs) return { ok: false, error: 'برای هر دو نفر باید در آن روز شیفت ثبت شده باشد.' };
  if (mine.shiftTypeId === theirs.shiftTypeId) return { ok: false, error: 'هر دو نفر شیفت یکسان دارند؛ جابه‌جایی معنا ندارد.' };
  const fixedRuleError = headNurseSwapError(args);
  if (fixedRuleError) return { ok: false, error: fixedRuleError };
  return {
    ok: true,
    swap: { id: args.id, fromEmployeeId: args.fromEmployeeId, toEmployeeId: args.toEmployeeId, dateISO: args.dateISO, status: 'pending' },
  };
}

export function acceptSwap(swap: SwapRequest, byEmployeeId: string): SwapRequest | { error: string } {
  if (swap.status !== 'pending') return { error: 'این درخواست قبلاً تعیین تکلیف شده است.' };
  if (byEmployeeId !== swap.toEmployeeId) return { error: 'فقط طرف مقابل می‌تواند بپذیرد.' };
  return { ...swap, status: 'accepted' };
}

/** اعمال جابه‌جایی پس از تأیید سرپرستار: نوع شیفت دو ردیف همان روز عوض می‌شود. */
export function applyApprovedSwap(entries: ScheduleEntry[], swap: SwapRequest): ScheduleEntry[] {
  const a = entries.find(e => e.personnelId === swap.fromEmployeeId && e.date === swap.dateISO);
  const b = entries.find(e => e.personnelId === swap.toEmployeeId && e.date === swap.dateISO);
  if (!a || !b) return entries;
  return entries.map(e => {
    if (e === a) return { ...e, shiftTypeId: b.shiftTypeId, isManualEntry: true };
    if (e === b) return { ...e, shiftTypeId: a.shiftTypeId, isManualEntry: true };
    return e;
  });
}

export function approveSwap(
  swap: SwapRequest,
  entries: ScheduleEntry[],
  approverEmployeeId: string,
  guard?: { personnel: Personnel[]; shiftTypes: ShiftType[] },
): { ok: true; swap: SwapRequest; entries: ScheduleEntry[] } | { ok: false; error: string } {
  if (swap.status !== 'accepted') return { ok: false, error: 'جابه‌جایی اول باید توسط طرف مقابل پذیرفته شود.' };
  if (approverEmployeeId === swap.fromEmployeeId || approverEmployeeId === swap.toEmployeeId) {
    return { ok: false, error: 'تأیید جابه‌جایی توسط یکی از طرفین مجاز نیست.' };
  }
  if (guard) {
    const fixedRuleError = headNurseSwapError({
      fromEmployeeId: swap.fromEmployeeId, toEmployeeId: swap.toEmployeeId,
      entries, dateISO: swap.dateISO, personnel: guard.personnel, shiftTypes: guard.shiftTypes,
    });
    if (fixedRuleError) return { ok: false, error: fixedRuleError };
  }
  const approved: SwapRequest = { ...swap, status: 'approved', reviewedBy: approverEmployeeId };
  return { ok: true, swap: approved, entries: applyApprovedSwap(entries, approved) };
}
