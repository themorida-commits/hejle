import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useSessionStore } from '../store/session';
import { buildApprovalQueue, type ApprovalItem } from '../features/oversight/approvalQueue';
import { isHospitalLevelRole } from '../features/oversight/roleNav';
import {
  applyChainApproval, applyChainRejection, approveLeave, canActOnLeave,
  leaveDurationDays, type LeaveRequest,
} from '../features/leave/leaveService';
import { approveSwap, type SwapRequest } from '../features/swaps/swapService';
import { toast } from '../store/toast';
import EmptyState from '../components/EmptyState';

// ── صفحهٔ تأییدها (دور ۲۴ — موج ۲ UI، الگوی Deputy) ──────────────────────────
// صف واحدِ «در انتظار اقدام من» با بافت کامل در خود آیتم؛ تصمیم در همان‌جا و
// auto-advance به آیتم بعدی. رد مرخصی دلیل چیپی می‌خواهد و دلیل در سوابق زنجیره
// می‌نشیند. تأیید گروهی فقط برای مرخصیِ کم‌ریسک (گام نهایی + پوشش کافی +
// پیشنهاد تریاژ «تأیید») فعال است و با شمارش تأیید می‌شود. میانبرها: J/K حرکت،
// A تأیید، R رد — و در tooltip دکمه‌ها هم نوشته شده‌اند تا در بافت یاد گرفته شوند.

const REJECT_REASONS = [
  'پوشش بخش با این مرخصی ناکافی می‌شود',
  'با برنامهٔ منتشرشده ناسازگار است',
  'ماندهٔ مرخصی کافی نیست',
  'هم‌زمانی با مرخصی همکاران کلیدی',
];

const KIND_BADGE: Record<ApprovalItem['kind'], { label: string; bg: string; fg: string }> = {
  leave: { label: 'مرخصی', bg: '#DCE9F0', fg: '#004E72' },
  swap: { label: 'جابه‌جایی', bg: '#fef3c7', fg: '#92400e' },
  draft: { label: 'پیش‌نویس ایجنت', bg: '#ede9fe', fg: '#5b21b6' },
};

export default function ApprovalsPage() {
  const st = useAppStore();
  const sessionRole = useSessionStore(s => s.role);
  const actorRole = st.dataSource === 'supabase' ? (sessionRole ?? 'staff') : st.viewRole;
  const actor = useMemo(
    () => ({ employeeId: st.currentEmployeeId, role: actorRole }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.currentEmployeeId, actorRole],
  );

  const deptLeaves = st.leaves.filter(l => st.personnel.find(p => p.id === l.employeeId)?.departmentId === st.departmentId);
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const deptEntries = st.entries.filter(e => deptIds.has(e.personnelId));
  const items = useMemo(() => buildApprovalQueue({
    leaves: deptLeaves, actor, approvalChain: st.approvalChain,
    swaps: st.swaps, drafts: st.agentDrafts,
    personnel: deptPeople, entries: deptEntries, shiftTypes: st.shiftTypes,
    dailyReqs: st.dailyReqs, hasSchedule: deptEntries.length > 0,
    leaveBalances: st.leaveBalances, jYear: 1405, jMonth: 7,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [st.leaves, st.swaps, st.agentDrafts, st.departmentId, st.approvalChain, actor]);

  const [selIdx, setSelIdx] = useState(0);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [bulkArmed, setBulkArmed] = useState(false);
  const sel = items[Math.min(selIdx, Math.max(0, items.length - 1))] as ApprovalItem | undefined;
  const eligibleChecked = items.filter(i => checked.has(i.id) && i.bulkEligible && i.leave);

  // ── اکشن‌های مرخصی (همان منطق صفحهٔ مرخصی، با undo) ──────────────────────
  const approveLeaveItem = (req: LeaveRequest): boolean => {
    const verdict = canActOnLeave(st.approvalChain, req, actor);
    if (!verdict.ok) { toast.error(verdict.reason ?? 'اقدام روی این درخواست در این گام ممکن نیست.'); return false; }
    const today = new Date().toISOString().slice(0, 10);
    const step = applyChainApproval(st.approvalChain, req, actor, today);
    if (!step.finalApproved) {
      const prev = req;
      st.updateLeave(step.request);
      toast.success('تأیید این گام ثبت شد و درخواست به گام بعدی زنجیره رفت.', {
        actionLabel: 'بازگردانی', onAction: () => st.updateLeave(prev),
      });
      return true;
    }
    const res = approveLeave({ request: req, approverEmployeeId: st.currentEmployeeId, entries: st.entries, shiftTypes: st.shiftTypes });
    if (!res.ok) { toast.error(res.error); return false; }
    const prevLeave = req;
    const prevEntries = st.entries;
    const days = leaveDurationDays(req);
    st.updateLeave({ ...res.request, approvals: step.request.approvals, approvalStep: step.request.approvalStep });
    st.setEntries(res.entryPatch);
    st.adjustBalance(req.employeeId, days);
    toast.success('مرخصی تأیید نهایی شد و در برنامه و ماندهٔ سهمیه اعمال شد.', {
      actionLabel: 'بازگردانی',
      onAction: () => { st.updateLeave(prevLeave); st.setEntries(prevEntries); st.adjustBalance(req.employeeId, -days); },
    });
    return true;
  };

  const rejectLeaveItem = (req: LeaveRequest, note: string) => {
    const verdict = canActOnLeave(st.approvalChain, req, actor);
    if (!verdict.ok) { toast.error(verdict.reason ?? 'اقدام روی این درخواست در این گام ممکن نیست.'); return; }
    const today = new Date().toISOString().slice(0, 10);
    const rejected = applyChainRejection(st.approvalChain, req, actor, today).request;
    const approvals = (rejected.approvals ?? []).map((a, i, arr) => (i === arr.length - 1 ? { ...a, note } : a));
    const prev = req;
    st.updateLeave({ ...rejected, approvals });
    toast.success(`درخواست رد شد — دلیل ثبت‌شده: ${note}`, {
      actionLabel: 'بازگردانی', onAction: () => st.updateLeave(prev),
    });
    setRejectId(null); setReason('');
  };

  const approveSwapItem = (sw: SwapRequest) => {
    const prevSwap = sw;
    const prevEntries = st.entries;
    const res = approveSwap(sw, st.entries, st.currentEmployeeId, { personnel: st.personnel, shiftTypes: st.shiftTypes });
    if (!res.ok) { toast.error(res.error); return; }
    st.updateSwap(res.swap);
    st.setEntries(res.entries);
    toast.success('جابه‌جایی نهایی و در برنامه اعمال شد.', {
      actionLabel: 'بازگردانی',
      onAction: () => { st.updateSwap(prevSwap); st.setEntries(prevEntries); },
    });
  };

  const actApprove = (item: ApprovalItem) => {
    if (item.kind === 'leave' && item.leave) approveLeaveItem(item.leave);
    else if (item.kind === 'swap' && item.swap) approveSwapItem(item.swap);
    else if (item.kind === 'draft' && item.draft) {
      st.decideAgentDraft(item.draft.id, 'approved');
      toast.success('پیش‌نویس ایجنت تأیید شد.');
    }
  };

  const actReject = (item: ApprovalItem) => {
    if (item.kind === 'leave' && item.leave) { setRejectId(item.id); setReason(''); }
    else if (item.kind === 'swap' && item.swap) {
      const prevSwap = item.swap;
      st.updateSwap({ ...item.swap, status: 'rejected', reviewedBy: st.currentEmployeeId });
      toast.success('جابه‌جایی رد شد.', {
        actionLabel: 'بازگردانی',
        onAction: () => st.updateSwap(prevSwap),
      });
    } else if (item.kind === 'draft' && item.draft) {
      st.decideAgentDraft(item.draft.id, 'rejected');
      toast.success('پیش‌نویس ایجنت رد شد.');
    }
  };

  // ── تأیید گروهی (فقط کم‌ریسک‌ها؛ با شمارش و گزارش نتیجه) ──────────────────
  const runBulk = () => {
    const targets = eligibleChecked.map(i => i.leave!).filter(l => {
      const step = applyChainApproval(st.approvalChain, l, actor, new Date().toISOString().slice(0, 10));
      return step.finalApproved && canActOnLeave(st.approvalChain, l, actor).ok;
    });
    if (targets.length === 0) { toast.error('هیچ‌کدام از انتخاب‌ها دیگر قابل تأیید گروهی نیستند.'); setBulkArmed(false); return; }
    const prevLeaves = targets;
    const prevEntries = st.entries;
    let entries = st.entries;
    let done = 0;
    for (const l of targets) {
      const step = applyChainApproval(st.approvalChain, l, actor, new Date().toISOString().slice(0, 10));
      const res = approveLeave({ request: l, approverEmployeeId: st.currentEmployeeId, entries, shiftTypes: st.shiftTypes });
      if (!res.ok) continue;
      entries = res.entryPatch;
      st.updateLeave({ ...res.request, approvals: step.request.approvals, approvalStep: step.request.approvalStep });
      st.adjustBalance(l.employeeId, leaveDurationDays(l));
      done++;
    }
    st.setEntries(entries);
    setChecked(new Set());
    setBulkArmed(false);
    toast.success(`${done.toLocaleString('fa-IR')} مرخصی به‌صورت گروهی تأیید نهایی شد.`, {
      actionLabel: 'بازگردانی همه',
      onAction: () => {
        prevLeaves.forEach(l => { st.updateLeave(l); st.adjustBalance(l.employeeId, -leaveDurationDays(l)); });
        st.setEntries(prevEntries);
      },
    });
  };

  // ── میانبرهای صفحه‌کلید ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (e.code === 'KeyJ') { e.preventDefault(); setSelIdx(i => Math.min(items.length - 1, i + 1)); }
      else if (e.code === 'KeyK') { e.preventDefault(); setSelIdx(i => Math.max(0, i - 1)); }
      else if (e.code === 'KeyA' && sel && rejectId === null) { e.preventDefault(); actApprove(sel); }
      else if (e.code === 'KeyR' && sel) { e.preventDefault(); actReject(sel); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sel, rejectId]);

  const toggleCheck = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div style={{ paddingBottom: eligibleChecked.length > 0 ? 84 : 0 }}>
      <h1>تأییدها — در انتظار اقدام من</h1>
      <p style={{ color: '#64748b', fontSize: 13, marginTop: -6 }}>
        هرچه منتظر تصمیم شماست این‌جاست؛ تصمیم را همین‌جا بگیرید، صف خودش جلو می‌رود.
        {isHospitalLevelRole(actorRole) && ' این صف بخش فعال است؛ نمای کل بیمارستان در داشبورد است.'}
      </p>

      {items.length === 0 ? (
        <EmptyState
          variant="empty"
          title="صف تأیید خالی است"
          hint="هر درخواست مرخصیِ در نوبت شما، جابه‌جاییِ در انتظار تأیید نهایی و پیش‌نویس ایجنت، خودکار همین‌جا می‌نشیند."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item, idx) => {
            const badge = KIND_BADGE[item.kind];
            const isSel = sel?.id === item.id;
            const rejecting = rejectId === item.id;
            return (
              <section
                key={item.id}
                onClick={() => setSelIdx(idx)}
                style={{
                  background: '#fff', border: `1px solid ${isSel ? '#004E72' : '#e2e8f0'}`,
                  borderRadius: 14, padding: '12px 16px', cursor: 'pointer',
                  boxShadow: isSel ? '0 0 0 3px #DCE9F0' : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {item.bulkEligible && (
                    <input
                      type="checkbox" checked={checked.has(item.id)}
                      onClick={e => e.stopPropagation()}
                      onChange={() => toggleCheck(item.id)}
                      aria-label="انتخاب برای تأیید گروهی"
                      title="این مرخصی کم‌ریسک است (گام نهایی، پوشش کافی) و می‌تواند گروهی تأیید شود"
                    />
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.fg, borderRadius: 999, padding: '2px 9px' }}>{badge.label}</span>
                  <strong style={{ fontSize: 14.5 }}>{item.title}</strong>
                  {item.bulkEligible && <span style={{ fontSize: 11.5, color: '#15803d', fontWeight: 700 }}>کم‌ریسک · قابل تأیید گروهی</span>}
                  <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
                    <button
                      onClick={e => { e.stopPropagation(); actApprove(item); }}
                      title="تأیید (میانبر: A)"
                      style={{ background: '#004E72', color: '#fff', border: 'none', borderRadius: 9, padding: '6px 16px', fontWeight: 700 }}
                    >
                      تأیید
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setSelIdx(idx); actReject(item); }}
                      title="رد (میانبر: R)"
                      style={{ background: '#fff', color: '#be123c', border: '1px solid #fda4af', borderRadius: 9, padding: '6px 16px', fontWeight: 700, boxShadow: 'none' }}
                    >
                      رد
                    </button>
                  </span>
                </div>
                <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {item.context.map((line, i) => (
                    <span key={i} style={{ fontSize: 12.5, color: '#475569' }}>{line}</span>
                  ))}
                </div>
                {rejecting && item.leave && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, background: '#fff7f7', border: '1px solid #fecdd3', borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9f1239', marginBottom: 8 }}>دلیل رد را انتخاب کنید — در سوابق زنجیره ثبت می‌شود:</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {REJECT_REASONS.map(r => (
                        <button
                          key={r} onClick={() => setReason(r)}
                          style={{
                            borderRadius: 999, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer',
                            background: reason === r ? '#be123c' : '#fff', color: reason === r ? '#fff' : '#9f1239',
                            border: '1px solid #fda4af', boxShadow: 'none', fontWeight: reason === r ? 700 : 400,
                          }}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        disabled={!reason}
                        onClick={() => rejectLeaveItem(item.leave!, reason)}
                        style={{ background: reason ? '#be123c' : '#fda4af', color: '#fff', border: 'none', borderRadius: 9, padding: '6px 16px', fontWeight: 700 }}
                      >
                        ثبت رد با این دلیل
                      </button>
                      <button onClick={() => { setRejectId(null); setReason(''); }} style={{ background: 'transparent', border: 'none', color: '#64748b', boxShadow: 'none' }}>
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 14 }}>
        میانبرها: <b>J</b> بعدی · <b>K</b> قبلی · <b>A</b> تأیید · <b>R</b> رد — جزئیات و ثبت دستی هم در <Link to="/leave">صفحهٔ مرخصی‌ها</Link> هست.
      </p>

      {eligibleChecked.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, insetInline: 0, zIndex: 60,
          background: '#0A2735', color: '#e2e8f0', padding: '10px 20px',
          display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
          boxShadow: '0 -6px 24px rgb(15 23 42 / 0.25)', fontSize: 13.5,
        }}>
          {bulkArmed ? (
            <>
              <span><b>{eligibleChecked.length.toLocaleString('fa-IR')}</b> مرخصی کم‌ریسک با هم تأیید نهایی شود؟ پوشش و سهمیهٔ هرکدام جداگانه چک شده است.</span>
              <button onClick={runBulk} style={{ background: '#FF6D41', color: '#0A2735', border: 'none', borderRadius: 9, padding: '7px 18px', fontWeight: 800 }}>
                بله، تأیید کن
              </button>
              <button onClick={() => setBulkArmed(false)} style={{ background: 'transparent', color: '#cbd5e1', border: '1px solid #475569', borderRadius: 9, padding: '7px 14px', boxShadow: 'none' }}>
                لغو
              </button>
            </>
          ) : (
            <>
              <span><b>{eligibleChecked.length.toLocaleString('fa-IR')}</b> مرخصی برای تأیید گروهی انتخاب شده</span>
              <button onClick={() => setBulkArmed(true)} style={{ background: '#004E72', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 18px', fontWeight: 700 }}>
                تأیید گروهی
              </button>
              <button onClick={() => setChecked(new Set())} style={{ background: 'transparent', color: '#cbd5e1', border: '1px solid #475569', borderRadius: 9, padding: '7px 14px', boxShadow: 'none' }}>
                پاک‌کردن انتخاب
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
