// جابه‌جایی شیفت (P1-05): دو نفره — درخواست، پذیرش طرف مقابل، تأیید سرپرستار، اعمال اتمی روی ردیف‌ها.
import type { ScheduleEntry } from '../../core/types';

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
}): { ok: true; swap: SwapRequest } | { ok: false; error: string } {
  if (args.fromEmployeeId === args.toEmployeeId) return { ok: false, error: 'جابه‌جایی با خودتان ممکن نیست.' };
  const mine = args.entries.find(e => e.personnelId === args.fromEmployeeId && e.date === args.dateISO);
  const theirs = args.entries.find(e => e.personnelId === args.toEmployeeId && e.date === args.dateISO);
  if (!mine || !theirs) return { ok: false, error: 'برای هر دو نفر باید در آن روز شیفت ثبت شده باشد.' };
  if (mine.shiftTypeId === theirs.shiftTypeId) return { ok: false, error: 'هر دو نفر شیفت یکسان دارند؛ جابه‌جایی معنا ندارد.' };
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
): { ok: true; swap: SwapRequest; entries: ScheduleEntry[] } | { ok: false; error: string } {
  if (swap.status !== 'accepted') return { ok: false, error: 'جابه‌جایی اول باید توسط طرف مقابل پذیرفته شود.' };
  if (approverEmployeeId === swap.fromEmployeeId || approverEmployeeId === swap.toEmployeeId) {
    return { ok: false, error: 'تأیید جابه‌جایی توسط یکی از طرفین مجاز نیست.' };
  }
  const approved: SwapRequest = { ...swap, status: 'approved', reviewedBy: approverEmployeeId };
  return { ok: true, swap: approved, entries: applyApprovedSwap(entries, approved) };
}
