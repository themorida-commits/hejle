// ── صف تأیید واحد (دور ۲۴ — موج ۲ UI) ───────────────────────────────────────
// همهٔ چیزهایی که «منتظر اقدام همین بازیگر»‌اند در یک صف: مرخصیِ قابل‌اقدام در
// زنجیره، جابه‌جاییِ پذیرفته‌شده در انتظار تأیید نهایی سرپرستار، و پیش‌نویس‌های
// Zone C ایجنت. هر آیتم بافت کافی برای تصمیم در همان‌جا دارد (از تریاژ دور ۱۸).
// «کم‌ریسک» برای تأیید گروهی یعنی: گام نهایی زنجیره + پیشنهاد تریاژ «تأیید» +
// هیچ کمبود پوششی — بقیهٔ آیتم‌ها هرگز گروهی تأیید نمی‌شوند.
import {
  canActOnLeave, leaveDurationDays, LEAVE_TYPES,
  type LeaveRequest,
} from '../leave/leaveService';
import { buildLeaveTriage } from '../agents/leaveTriage';
import type { SwapRequest } from '../swaps/swapService';
import type { AgentDraftRecord } from '../../services/data/types';
import type { Personnel, ScheduleEntry, ShiftType } from '../../core/types';
import type { DailyReqs } from '../roster/rosterModel';

export type ApprovalKind = 'leave' | 'swap' | 'draft';

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  title: string;
  context: string[];
  bulkEligible: boolean;
  sortKey: string;
  leave?: LeaveRequest;
  swap?: SwapRequest;
  draft?: AgentDraftRecord;
}

const faNum = (n: number) => n.toLocaleString('fa-IR');
const faDay = (iso: string) => new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' }).format(new Date(iso));
const typeName = (code: string) => LEAVE_TYPES.find(t => t.code === code)?.name ?? code;

const DRAFT_KIND_FA: Record<string, string> = {
  'leave-triage': 'تریاژ مرخصی',
  'roster-explain': 'توضیح برنامهٔ ماه',
  'report-draft': 'پیش‌نویس گزارش',
  'pack-check': 'چک‌لیست بستهٔ اعتباربخشی',
  'census-baseline': 'مقایسهٔ آمار بستری',
};

export interface ApprovalQueueInput {
  leaves: LeaveRequest[];
  actor: { employeeId: string; role: string };
  approvalChain: string[];
  swaps: SwapRequest[];
  drafts: AgentDraftRecord[];
  personnel: Personnel[];
  entries: ScheduleEntry[];
  shiftTypes: ShiftType[];
  dailyReqs: DailyReqs | null;
  hasSchedule: boolean;
  leaveBalances: Record<string, { entitled: number; used: number }>;
  jYear: number;
  jMonth: number;
}

export function buildApprovalQueue(input: ApprovalQueueInput): ApprovalItem[] {
  const items: ApprovalItem[] = [];
  const nameOf = (id: string) => input.personnel.find(p => p.id === id)?.name ?? id;
  const symbolOf = (id: string) => input.shiftTypes.find(s => s.id === id)?.symbol ?? id;

  for (const l of input.leaves) {
    if (l.status !== 'pending') continue;
    if (!canActOnLeave(input.approvalChain, l, input.actor).ok) continue;
    const triage = buildLeaveTriage({
      request: l, personnel: input.personnel, entries: input.entries,
      shiftTypes: input.shiftTypes, dailyReqs: input.dailyReqs,
      hasSchedule: input.hasSchedule, leaveBalances: input.leaveBalances,
      approvalChain: input.approvalChain, jYear: input.jYear, jMonth: input.jMonth,
    });
    const days = leaveDurationDays(l);
    const step = (l.approvalStep ?? 0) + 1;
    const isFinalStep = step >= input.approvalChain.length;
    const coverageShort = (triage.coverage ?? []).some(c => c.short);
    items.push({
      id: `leave:${l.id}`,
      kind: 'leave',
      title: `مرخصی ${typeName(l.leaveTypeCode)} — ${nameOf(l.employeeId)}`,
      context: [
        `${l.startISO === l.endISO ? faDay(l.startISO) : `${faDay(l.startISO)} تا ${faDay(l.endISO)}`} · ${faNum(days)} روز · گام ${faNum(step)} از ${faNum(input.approvalChain.length)} زنجیره`,
        ...triage.reasons.slice(0, 3),
      ],
      bulkEligible: isFinalStep && triage.suggestion === 'approve' && !coverageShort,
      sortKey: l.startISO,
      leave: l,
    });
  }

  if (input.actor.role === 'ward_manager') {
    for (const sw of input.swaps) {
      if (sw.status !== 'accepted') continue;
      const fromEntry = input.entries.find(e => e.personnelId === sw.fromEmployeeId && e.date === sw.dateISO);
      items.push({
        id: `swap:${sw.id}`,
        kind: 'swap',
        title: 'تأیید نهایی جابه‌جایی شیفت',
        context: [
          `${nameOf(sw.fromEmployeeId)} ↔ ${nameOf(sw.toEmployeeId)} · ${faDay(sw.dateISO)}${fromEntry ? ` · شیفت ${symbolOf(fromEntry.shiftTypeId)}` : ''}`,
          'همکار مقصد جابه‌جایی را پذیرفته است؛ انتشار نهایی با تأیید شماست.',
        ],
        bulkEligible: false,
        sortKey: sw.dateISO,
        swap: sw,
      });
    }
  }

  for (const d of input.drafts) {
    if (d.status !== 'draft') continue;
    const summary = typeof d.payload?.summary === 'string' ? d.payload.summary
      : typeof d.payload?.title === 'string' ? d.payload.title : null;
    items.push({
      id: `draft:${d.id}`,
      kind: 'draft',
      title: `پیش‌نویس ایجنت — ${DRAFT_KIND_FA[d.kind] ?? d.kind}`,
      context: [
        `ساخته‌شده ${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(d.createdAt))} · خروجی Zone C است و بدون تصمیم شما اثری ندارد.`,
        ...(summary ? [summary] : []),
      ],
      bulkEligible: false,
      sortKey: d.createdAt,
      draft: d,
    });
  }

  const kindOrder: Record<ApprovalKind, number> = { leave: 0, swap: 1, draft: 2 };
  return items.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || (a.sortKey < b.sortKey ? -1 : 1));
}
