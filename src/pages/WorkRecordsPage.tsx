import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { computeWorkRecords, workRecordsToCsv, summarizeWardWork, wardSummaryToCsv } from '../features/workRecords/workRecordService';
import { reconcileAttendance, summarizeAttendance } from '../features/attendance/attendanceService';
import { useMemo } from 'react';

export default function WorkRecordsPage() {
  const st = useAppStore();
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const deptEntries = st.entries.filter(e => deptIds.has(e.personnelId));
  const records = st.workRecords.filter(r => deptIds.has(r.employeeId));
  const fa = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });

  const buildLeaveMap = () => {
    const leaveMap = new Map<string, Set<string>>();
    for (const l of st.leaves) {
      if (l.status !== 'approved') continue;
      if (l.isHourly) continue; // ساعتی روز را کامل نمی‌بندد؛ کسرش جدا و ساعتی اعمال می‌شود
      const set = leaveMap.get(l.employeeId) ?? new Set<string>();
      const cur = new Date(l.startISO + 'T00:00:00');
      const end = new Date(l.endISO + 'T00:00:00');
      while (cur <= end) { set.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
      leaveMap.set(l.employeeId, set);
    }
    return leaveMap;
  };

  const compute = (withActuals = false) => {
    const leaveMap = buildLeaveMap();
    const attendanceSummaries = withActuals
      ? summarizeAttendance(reconcileAttendance({
          personnel: deptPeople, entries: deptEntries,
          events: st.attendanceEvents.filter(e => deptIds.has(e.employeeId)),
          shiftTypes: st.shiftTypes, leaveDatesByEmployee: leaveMap,
        }))
      : undefined;
    st.setWorkRecords([
      ...st.workRecords.filter(r => !deptIds.has(r.employeeId)),
      ...computeWorkRecords({
        personnel: deptPeople, entries: deptEntries, shiftTypes: st.shiftTypes,
        jYear: J_YEAR, jMonth: J_MONTH, globalSettings: st.globalDutySettings,
        leaveDatesByEmployee: leaveMap, attendanceSummaries,
        hourlyLeaves: st.leaves
          .filter(l => l.status === 'approved' && l.isHourly && deptIds.has(l.employeeId))
          .map(l => ({ employeeId: l.employeeId, dateISO: l.startISO, hours: l.hours ?? 0 })),
      }),
    ]);
  };

  const setStatus = (status: 'approved' | 'exported') =>
    st.setWorkRecords(st.workRecords.map(r => (deptIds.has(r.employeeId) ? { ...r, status } : r)));

  const downloadCsv = () => {
    const blob = new Blob([workRecordsToCsv(records)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `work-records-${J_YEAR}-${J_MONTH}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('exported');
  };

  const summary = useMemo(() => summarizeWardWork(records), [records]);
  const wardName = st.departments.find(d => d.id === st.departmentId)?.name ?? 'بخش';
  const downloadSummaryCsv = () => {
    const blob = new Blob([wardSummaryToCsv(summary, wardName)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ward-summary-${J_YEAR}-${J_MONTH}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1>کارکرد ماهانه — مهر ۱۴۰۵</h1>
      <p style={{ color: '#68707a', fontSize: 13 }}>خروجی این صفحه «ورودی واحد حقوق» است (نه حقوق کامل): ساعت‌ها با ضرایب قانون بهره‌وری — شب ×۱٫۵ و عصر ×۱٫۲.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => compute(false)}>محاسبهٔ کارکرد از برنامه</button>
        <button onClick={() => compute(true)}>محاسبه با حضور واقعی</button>
        <button onClick={() => setStatus('approved')} disabled={records.length === 0}>تأیید همه</button>
        <button onClick={downloadCsv} disabled={records.length === 0}>خروجی CSV برای واحد حقوق</button>
      </div>
      {records.length > 0 && (
        <section style={{ background: '#fff', border: '1px solid #cfe0da', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>گزارش تجمیعی بخش {wardName}</h2>
            <button onClick={downloadSummaryCsv}>خروجی CSV تجمیعی</button>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, marginTop: 12 }}>
            <span>پرسنل: <strong>{fa(summary.headcount)}</strong></span>
            <span>مجموع موظفی: <strong>{fa(summary.totalDutyHours)}</strong> ساعت</span>
            <span>مجموع کارکرد: <strong>{fa(summary.totalWorkedHours)}</strong> ساعت</span>
            <span>معادل پرداختی ماه: <strong>{fa(summary.totalPaidHours)}</strong> ساعت</span>
            <span>مجموع اضافه‌کار: <strong>{fa(summary.totalOvertimeHours)}</strong> ساعت (میانگین هر نفر {fa(summary.avgOvertimePerPerson)})</span>
            <span>سهم شب از کارکرد: <strong>{fa(summary.nightSharePct)}٪</strong></span>
            <span>مرخصی: <strong>{fa(summary.totalLeaveDays)}</strong> روز + <strong>{fa(summary.totalHourlyLeaveHours)}</strong> ساعت ساعتی</span>
          </div>
          <p style={{ fontSize: 12, color: '#68707a', marginBottom: 0 }}>
            توزیع شب‌کاری — بیشترین‌ها: {summary.topNight.map(t => `${t.employeeName} (${fa(t.nightHours)} ساعت)`).join('، ') || '—'}.
            معادل پرداختی «هزینهٔ بخش در سطح ساعت» است؛ مبلغ ریالی از واحد حقوق می‌آید، نه از این نما.
          </p>
        </section>
      )}
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
          <thead><tr style={{ background: '#f3efe7' }}>
            {['نام', 'موظفی', 'کارکرد', 'صبح', 'عصر', 'شب', 'تعطیل', 'مرخصی (روز)', 'اضافه‌کار', 'جمع پرداختی', 'واقعی', 'اختلاف', 'غیبت', 'وضعیت'].map(h => <th key={h} style={{ padding: 8 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.employeeId} style={{ borderTop: '1px solid #eee', textAlign: 'center' }}>
                <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{r.employeeName}</td>
                <td>{fa(r.dutyHours)}</td><td>{fa(r.workedHours)}</td><td>{fa(r.morningHours)}</td>
                <td>{fa(r.eveningHours)}</td><td>{fa(r.nightHours)}</td><td>{fa(r.holidayHours)}</td>
                <td>{fa(r.leaveDays)}</td><td>{fa(r.overtimeHours)}</td><td><strong>{fa(r.totalPaidHours)}</strong></td>
                <td>{r.actualWorkedHours != null ? fa(r.actualWorkedHours) : '—'}</td>
                <td>{r.actualWorkedHours != null ? fa(Math.round((r.actualWorkedHours - r.workedHours) * 10) / 10) : '—'}</td>
                <td>{r.absentDays != null ? fa(r.absentDays) : '—'}</td>
                <td>{r.status === 'draft' ? 'پیش‌نویس' : r.status === 'approved' ? 'تأییدشده' : 'صادرشده'}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={14} style={{ padding: 12 }}>هنوز محاسبه نشده است.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
