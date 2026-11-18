// ── صف اقدام داشبورد (دور ۲۳ — موج ۱ UI) ─────────────────────────────────────
// داشبورد از «نمای کلی» به «چه چیزی امروز اقدام من را می‌خواهد» تبدیل می‌شود
// (الگوی Deputy «Needs attention»): هر آیتم = عنوان + بافت (چرا فوری است) +
// شمارش + مسیر مستقیم به همان فهرست/صفحه‌ای که عدد از آن آمده است.
// تابع خالص است تا ترتیب و محتوایش تست‌پذیر باشد؛ داده از همان اسلایس‌های استور
// می‌آید که بقیهٔ محصول مصرف می‌کنند.

import type { LeaveRequest } from '../leave/leaveService';
import { summarizeCompliance, type Credential } from '../credentials/credentialService';

export type QueueSeverity = 'critical' | 'warning' | 'info';

export interface ActionQueueItem {
  id: string;
  severity: QueueSeverity;
  title: string;
  context: string;
  count: number;
  href: string;
  cta: string;
}

const SEV_RANK: Record<QueueSeverity, number> = { critical: 0, warning: 1, info: 2 };

const fa = (n: number) => n.toLocaleString('fa-IR');

function faDayMonth(iso: string): string {
  return new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));
}

export function buildActionQueue(input: {
  hardViolations: number;
  warnViolations: number;
  pendingLeaves: LeaveRequest[];
  pendingFinalSwaps: number;
  scheduleStatus: 'draft' | 'published';
  entriesCount: number;
  credentials: Credential[];
  nameOf: (employeeId: string) => string;
  todayISO: string;
}): ActionQueueItem[] {
  const items: ActionQueueItem[] = [];

  if (input.hardViolations > 0) {
    items.push({
      id: 'rule-violations',
      severity: 'critical',
      title: 'نقض سخت قواعد در برنامهٔ این ماه',
      context: `${fa(input.hardViolations)} مورد سخت${input.warnViolations > 0 ? ` و ${fa(input.warnViolations)} هشدار` : ''} — پیش از انتشار باید رفع شود.`,
      count: input.hardViolations,
      href: '/scheduler',
      cta: 'رفتن به برنامه',
    });
  }

  const compliance = summarizeCompliance(input.credentials, input.nameOf, input.todayISO);
  if (compliance.expired > 0 || compliance.expiring > 0) {
    const first = compliance.attention[0];
    items.push({
      id: 'credentials',
      severity: compliance.expired > 0 ? 'critical' : 'warning',
      title: compliance.expired > 0 ? 'مدرک منقضی در بخش' : 'مدرک در آستانهٔ انقضا در بخش',
      context: first
        ? `نزدیک‌ترین مورد: ${first.employeeName} — ${first.credential.title}${compliance.expired > 0 && compliance.expiring > 0 ? ` · ${fa(compliance.expired)} منقضی و ${fa(compliance.expiring)} در آستانه` : ''}`
        : '',
      count: compliance.expired + compliance.expiring,
      href: '/personnel',
      cta: 'رفتن به پروندهٔ پرسنلی',
    });
  }

  if (input.pendingLeaves.length > 0) {
    const earliest = [...input.pendingLeaves].sort((a, b) => a.startISO.localeCompare(b.startISO))[0]!;
    items.push({
      id: 'pending-leaves',
      severity: 'warning',
      title: 'مرخصی در انتظار تصمیم',
      context: `نزدیک‌ترین شروع: ${faDayMonth(earliest.startISO)} — ${input.nameOf(earliest.employeeId)}`,
      count: input.pendingLeaves.length,
      href: '/leave',
      cta: 'رفتن به مرخصی‌ها',
    });
  }

  if (input.scheduleStatus === 'draft' && input.entriesCount > 0) {
    items.push({
      id: 'unpublished',
      severity: 'warning',
      title: 'برنامهٔ ماه منتشر نشده است',
      context: `${fa(input.entriesCount)} شیفت ثبت شده، ولی تا انتشار برنامه برای پرسنل نهایی نیست.`,
      count: input.entriesCount,
      href: '/scheduler',
      cta: 'رفتن به برنامه',
    });
  }

  if (input.pendingFinalSwaps > 0) {
    items.push({
      id: 'pending-swaps',
      severity: 'info',
      title: 'جابه‌جایی در انتظار تأیید نهایی',
      context: 'همکار پذیرفته است؛ اعمال در برنامه با تأیید نهایی سرپرستار انجام می‌شود.',
      count: input.pendingFinalSwaps,
      href: '/scheduler',
      cta: 'رفتن به برنامه',
    });
  }

  return items.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}
