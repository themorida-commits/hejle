import { useMemo, useState } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { useSessionStore } from '../store/session';
import {
  LEAVE_TYPES, approveLeave, simulateLeaveCoverage,
  canActOnLeave, applyChainApproval, applyChainRejection, chainStepRole,
  isoFromJalali, leaveDurationDays, type LeaveRequest, type CoverageSimulation,
} from '../features/leave/leaveService';
import HospitalQueueSection from '../features/oversight/HospitalQueueSection';
import { buildLeaveTriage, type LeaveTriageBrief } from '../features/agents/leaveTriage';

const MINIMUMS = { morning: 3, evening: 2, night: 1 };
const STATUS_FA: Record<LeaveRequest['status'], string> = {
  pending: 'در انتظار', approved: 'تأییدشده', rejected: 'ردشده', cancelled: 'لغوشده',
};
export const ROLE_FA: Record<string, string> = {
  ward_manager: 'سرپرستار بخش', hospital_admin: 'مدیر بیمارستان', hr_admin: 'مدیر منابع انسانی', matron: 'مترون (مدیر خدمات پرستاری)', staff: 'پرستار',
};

export default function LeavePage() {
  const st = useAppStore();
  const sessionRole = useSessionStore(s => s.role);
  // نقش اقدام‌کننده: در سوپابیس از نشست واقعی؛ در دمو از نقش نمایشی
  const actorRole = st.dataSource === 'supabase' ? (sessionRole ?? 'staff') : st.viewRole;
  const actor = { employeeId: st.currentEmployeeId, role: actorRole };
  const [type, setType] = useState('annual');
  const [fromDay, setFromDay] = useState(10);
  const [toDay, setToDay] = useState(12);
  const [reason, setReason] = useState('');
  const [sim, setSim] = useState<CoverageSimulation | null>(null);
  // تریاژ ایجنت (Zone C — دور ۱۸): پیشنهاد مستدل روی پیش‌نویس می‌نشیند؛ اقدام
  // فقط از همان دکمه‌های تأیید/رد موجود و با تصمیم انسان انجام می‌شود.
  const [triage, setTriage] = useState<{ brief: LeaveTriageBrief; draftId: string } | null>(null);
  const [mode, setMode] = useState<'daily' | 'hourly'>('daily');
  const [fromTime, setFromTime] = useState('08:00');
  const [toTime, setToTime] = useState('11:00');
  const hourlyHours = (() => {
    const [fh = 0, fm = 0] = fromTime.split(':').map(Number);
    const [th = 0, tm = 0] = toTime.split(':').map(Number);
    return ((th * 60 + tm) - (fh * 60 + fm)) / 60;
  })();

  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const deptEntries = st.entries.filter(e => deptIds.has(e.personnelId));
  const nameOf = (id: string) => st.personnel.find(p => p.id === id)?.name ?? id;
  const myLeaves = st.leaves.filter(l => deptIds.has(l.employeeId));

  const [attachFile, setAttachFile] = useState<File | null>(null);

  const submit = async () => {
    if (mode === 'hourly' && !(hourlyHours > 0 && hourlyHours <= 16)) {
      alert('بازهٔ ساعتی معتبر نیست: ساعت پایان باید بعد از شروع و مجموع حداکثر ۱۶ ساعت باشد.');
      return;
    }
    // پیوست مدرک (استعلاجی): در حالت سوپابیس آپلود واقعی؛ در دمو فقط نام فایل نگه داشته می‌شود
    let attachmentPath: string | null = null;
    if (attachFile) {
      try {
        if (st.dataSource === 'supabase') {
          const { uploadLeaveAttachment } = await import('../services/attachments');
          const { useSessionStore } = await import('../store/session');
          const hospitalId = useSessionStore.getState().hospitalId;
          if (hospitalId) attachmentPath = await uploadLeaveAttachment(attachFile, hospitalId, st.currentEmployeeId);
        } else {
          attachmentPath = `demo:${attachFile.name}`;
        }
      } catch {
        alert('آپلود مدرک ناموفق بود؛ درخواست بدون پیوست ثبت می‌شود.');
      }
    }
    const req: LeaveRequest = {
      id: `lv-${Date.now()}`,
      employeeId: st.currentEmployeeId,
      leaveTypeCode: type,
      startISO: isoFromJalali(J_YEAR, J_MONTH, fromDay),
      endISO: mode === 'hourly'
        ? isoFromJalali(J_YEAR, J_MONTH, fromDay)
        : isoFromJalali(J_YEAR, J_MONTH, toDay),
      isHourly: mode === 'hourly',
      hours: mode === 'hourly' ? hourlyHours : null,
      attachmentPath,
      reason: reason || undefined,
      status: 'pending',
    };
    st.addLeave(req);
    setReason('');
    setAttachFile(null);
  };

  const viewAttachment = async (l: LeaveRequest) => {
    if (!l.attachmentPath || l.attachmentPath.startsWith('demo:')) {
      alert(`پیوست (حالت دمو — فایل واقعی ذخیره نشده): ${l.attachmentPath?.slice(5) ?? ''}`);
      return;
    }
    try {
      const { getLeaveAttachmentUrl } = await import('../services/attachments');
      window.open(await getLeaveAttachmentUrl(l.attachmentPath), '_blank');
    } catch {
      alert('باز کردن مدرک ناموفق بود.');
    }
  };

  const runSim = (req: LeaveRequest) => {
    setSim(simulateLeaveCoverage({
      request: req, entries: deptEntries, shiftTypes: st.shiftTypes, personnel: deptPeople,
      jYear: J_YEAR, jMonth: J_MONTH, dutyHoursByEmployee: st.dutyByEmployee,
      minimums: MINIMUMS, balance: st.leaveBalances[req.employeeId],
    }));
  };

  const runTriage = (req: LeaveRequest) => {
    const brief = buildLeaveTriage({
      request: req, personnel: deptPeople, entries: deptEntries, shiftTypes: st.shiftTypes,
      dailyReqs: st.dailyReqs, hasSchedule: deptEntries.length > 0,
      leaveBalances: st.leaveBalances, approvalChain: st.approvalChain,
      jYear: J_YEAR, jMonth: J_MONTH,
    });
    st.recordAgentRun('leave_triage', { requestId: req.id },
      { suggestion: brief.suggestion, reasons: brief.reasons.length }, []);
    const draft = st.createAgentDraft('leave_triage', {
      requestId: req.id, employeeId: req.employeeId, suggestion: brief.suggestion,
      reasons: brief.reasons, coverage: brief.coverage, quota: brief.quota,
    });
    setTriage({ brief, draftId: draft.id });
  };

  const approve = (req: LeaveRequest) => {
    const verdict = canActOnLeave(st.approvalChain, req, actor);
    if (!verdict.ok) { alert(verdict.reason); return; }
    const today = new Date().toISOString().slice(0, 10);
    const step = applyChainApproval(st.approvalChain, req, actor, today);
    if (!step.finalApproved) {
      // گام میانی زنجیره: فقط پیشرفت گام ثبت می‌شود؛ روس‌تر و مانده در گام نهایی دست می‌خورند
      st.updateLeave(step.request);
      return;
    }
    const res = approveLeave({ request: req, approverEmployeeId: st.currentEmployeeId, entries: st.entries, shiftTypes: st.shiftTypes });
    if (!res.ok) { alert(res.error); return; }
    st.updateLeave({ ...res.request, approvals: step.request.approvals, approvalStep: step.request.approvalStep });
    st.setEntries(res.entryPatch);
    st.adjustBalance(req.employeeId, leaveDurationDays(req));
  };

  const reject = (req: LeaveRequest) => {
    const verdict = canActOnLeave(st.approvalChain, req, actor);
    if (!verdict.ok) { alert(verdict.reason); return; }
    const today = new Date().toISOString().slice(0, 10);
    st.updateLeave(applyChainRejection(st.approvalChain, req, actor, today).request);
  };

  return (
    <div>
      <h1>مرخصی‌ها — مهر ۱۴۰۵</h1>
      <HospitalQueueSection actorRole={actorRole} variant="full" />
      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>ثبت درخواست تازه (به نام {nameOf(st.currentEmployeeId)})</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={type} onChange={e => setType(e.target.value)}>
            {LEAVE_TYPES.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
          <select value={mode} onChange={e => setMode(e.target.value as 'daily' | 'hourly')}>
            <option value="daily">روزانه</option>
            <option value="hourly">ساعتی</option>
          </select>
          از روز <input type="number" min={1} max={30} value={fromDay} onChange={e => setFromDay(Number(e.target.value))} style={{ width: 60 }} />
          {mode === 'daily' ? (
            <>تا روز <input type="number" min={1} max={30} value={toDay} onChange={e => setToDay(Number(e.target.value))} style={{ width: 60 }} /></>
          ) : (
            <>
              از ساعت <input type="time" value={fromTime} onChange={e => setFromTime(e.target.value)} />
              تا ساعت <input type="time" value={toTime} onChange={e => setToTime(e.target.value)} />
              <span style={{ fontSize: 12, color: '#64748b' }}>({hourlyHours > 0 ? hourlyHours.toLocaleString('fa-IR') : '—'} ساعت)</span>
            </>
          )}
          <input placeholder="دلیل (اختیاری)" value={reason} onChange={e => setReason(e.target.value)} style={{ minWidth: 200 }} />
          {type === 'sick' && (
            <label style={{ fontSize: 13 }}>
              مدرک پزشکی (اختیاری):{' '}
              <input type="file" accept="image/*,.pdf" onChange={e => setAttachFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
          <button onClick={submit}>ثبت درخواست</button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b' }}>
          ماندهٔ فعلی شما: {((st.leaveBalances[st.currentEmployeeId]?.entitled ?? 26) - (st.leaveBalances[st.currentEmployeeId]?.used ?? 0)).toLocaleString('fa-IR')} روز
        </p>
      </section>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e2e8f0' }}>
        <thead><tr style={{ background: '#f1f5f9' }}>
          <th style={{ padding: 8, textAlign: 'right' }}>نام</th><th>نوع</th><th>بازه</th><th>وضعیت</th><th>عملیات</th>
        </tr></thead>
        <tbody>
          {myLeaves.map(l => (
            <tr key={l.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{nameOf(l.employeeId)}</td>
              <td>{LEAVE_TYPES.find(t => t.code === l.leaveTypeCode)?.name}</td>
              <td>{l.isHourly ? `ساعتی — ${(l.hours ?? 0).toLocaleString('fa-IR')} ساعت در ${l.startISO}` : `${l.startISO} تا ${l.endISO}`}
                {l.attachmentPath && <button onClick={() => viewAttachment(l)} style={{ marginInlineStart: 8 }}>مشاهدهٔ مدرک</button>}
              </td>
              <td>{STATUS_FA[l.status]}
                {l.status === 'pending' && st.approvalChain.length > 1 && (
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    گام {((l.approvalStep ?? 0) + 1).toLocaleString('fa-IR')} از {st.approvalChain.length.toLocaleString('fa-IR')} — نوبت {ROLE_FA[chainStepRole(st.approvalChain, l) ?? ''] ?? ''}
                  </div>
                )}
                {(l.approvals?.length ?? 0) > 0 && (
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {l.approvals!.map((a, i) => (
                      <div key={i}>{ROLE_FA[a.role] ?? a.role}: {a.decision === 'approved' ? 'تأیید' : 'رد'} ({a.at})</div>
                    ))}
                  </div>
                )}
              </td>
              <td style={{ display: 'flex', gap: 6, padding: 8 }}>
                {l.status === 'pending' && <>
                  <button onClick={() => runSim(l)}>شبیه‌سازی پوشش</button>
                  <button onClick={() => runTriage(l)}>پیشنهاد ایجنت</button>
                  {canActOnLeave(st.approvalChain, l, actor).ok && <>
                    <button onClick={() => approve(l)}>تأیید</button>
                    <button onClick={() => reject(l)}>رد</button>
                  </>}
                </>}
              </td>
            </tr>
          ))}
          {myLeaves.length === 0 && <tr><td colSpan={5} style={{ padding: 12 }}>هنوز درخواستی ثبت نشده است.</td></tr>}
        </tbody>
      </table>

      {triage && (() => {
        const req = st.leaves.find(l => l.id === triage.brief.requestId);
        const b = triage.brief;
        const canAct = req ? canActOnLeave(st.approvalChain, req, actor).ok : false;
        const chip = b.suggestion === 'approve'
          ? { text: 'پیشنهاد ایجنت: تأیید', bg: '#dcfce7', color: '#15803d' }
          : b.suggestion === 'reject'
            ? { text: 'پیشنهاد ایجنت: رد', bg: '#ffe4e6', color: '#be123c' }
            : { text: 'پیشنهاد ایجنت: بررسی انسانی', bg: '#fef9c3', color: '#a16207' };
        const followSuggestion = () => {
          if (!req) return;
          if (b.suggestion === 'approve') approve(req);
          else if (b.suggestion === 'reject') reject(req);
          st.decideAgentDraft(triage.draftId, 'approved');
          setTriage(null);
        };
        const dismiss = () => { st.decideAgentDraft(triage.draftId, 'rejected'); setTriage(null); };
        return (
          <section style={{ background: '#fff', border: '1px solid #c7d2fe', borderRadius: 12, padding: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>تریاژ ایجنت — مرخصی {b.leaveTypeName} {b.employeeName}</h3>
              <span style={{ fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 12px', background: chip.bg, color: chip.color }}>{chip.text}</span>
            </div>
            <ul style={{ margin: '10px 0', paddingInlineStart: 18, fontSize: 13, lineHeight: 2 }}>
              {b.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            {b.coverage && b.coverage.some(c => c.short) && (
              <ul style={{ margin: '0 0 10px', fontSize: 13 }}>
                {b.coverage.filter(c => c.short).map((c, i) => (
                  <li key={i}>{c.dateISO}: شیفت {c.shift === 'night' ? 'شب' : c.shift === 'evening' ? 'عصر' : 'صبح'} — {c.staffAfter.toLocaleString('fa-IR')} نفر در برابر نیاز {c.required.toLocaleString('fa-IR')}</li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>
              این پیشنهاد فقط از روی سهمیه و پوشش ساخته شده و روی پیش‌نویس ایجنت ثبت است؛ تصمیم نهایی با شماست و اقدام از همان مسیر تأیید/رد زنجیره انجام می‌شود.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canAct && b.suggestion !== 'review' && (
                <button onClick={followSuggestion} style={{ padding: '7px 16px', borderRadius: 10, border: 'none', background: '#004E72', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  اقدام طبق پیشنهاد ({b.suggestion === 'approve' ? 'تأیید مرخصی' : 'رد مرخصی'})
                </button>
              )}
              <button onClick={dismiss} style={{ padding: '7px 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>
                نادیده گرفتن پیشنهاد
              </button>
            </div>
          </section>
        );
      })()}

      {sim && (
        <section style={{ background: sim.ok ? '#f0fdf4' : '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>نتیجهٔ شبیه‌سازی پوشش</h3>
          <p>{sim.summary}</p>
          <p style={{ fontSize: 13 }}>{sim.balanceMessage}</p>
          {sim.shortfalls.length > 0 && (
            <ul>{sim.shortfalls.map((s, i) => (
              <li key={i}>{s.dateISO}: شیفت {s.category === 'night' ? 'شب' : s.category === 'evening' ? 'عصر' : 'صبح'} فقط {s.count.toLocaleString('fa-IR')} نفر می‌ماند (حداقل {s.minimum.toLocaleString('fa-IR')})</li>
            ))}</ul>
          )}
        </section>
      )}
    </div>
  );
}
