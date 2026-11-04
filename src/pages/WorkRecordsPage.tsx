import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { computeWorkRecords, workRecordsToCsv } from '../features/workRecords/workRecordService';
import { DEFAULT_GLOBAL_SETTINGS } from '../core/defaults';
import { useMemo } from 'react';

export default function WorkRecordsPage() {
  const st = useAppStore();
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const deptEntries = st.entries.filter(e => deptIds.has(e.personnelId));
  const records = st.workRecords.filter(r => deptIds.has(r.employeeId));
  const fa = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });

  const compute = () => {
    const leaveMap = new Map<string, Set<string>>();
    for (const l of st.leaves) {
      if (l.status !== 'approved') continue;
      const set = leaveMap.get(l.employeeId) ?? new Set<string>();
      const cur = new Date(l.startISO + 'T00:00:00');
      const end = new Date(l.endISO + 'T00:00:00');
      while (cur <= end) { set.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
      leaveMap.set(l.employeeId, set);
    }
    st.setWorkRecords([
      ...st.workRecords.filter(r => !deptIds.has(r.employeeId)),
      ...computeWorkRecords({
        personnel: deptPeople, entries: deptEntries, shiftTypes: st.shiftTypes,
        jYear: J_YEAR, jMonth: J_MONTH, globalSettings: DEFAULT_GLOBAL_SETTINGS,
        leaveDatesByEmployee: leaveMap,
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

  return (
    <div>
      <h1>کارکرد ماهانه — مهر ۱۴۰۵</h1>
      <p style={{ color: '#68707a', fontSize: 13 }}>خروجی این صفحه «ورودی واحد حقوق» است (نه حقوق کامل): ساعت‌ها با ضرایب قانون بهره‌وری — شب ×۱٫۵ و عصر ×۱٫۲.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={compute}>محاسبهٔ کارکرد از برنامه</button>
        <button onClick={() => setStatus('approved')} disabled={records.length === 0}>تأیید همه</button>
        <button onClick={downloadCsv} disabled={records.length === 0}>خروجی CSV برای واحد حقوق</button>
      </div>
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
          <thead><tr style={{ background: '#f3efe7' }}>
            {['نام', 'موظفی', 'کارکرد', 'صبح', 'عصر', 'شب', 'تعطیل', 'مرخصی (روز)', 'اضافه‌کار', 'جمع پرداختی', 'وضعیت'].map(h => <th key={h} style={{ padding: 8 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.employeeId} style={{ borderTop: '1px solid #eee', textAlign: 'center' }}>
                <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{r.employeeName}</td>
                <td>{fa(r.dutyHours)}</td><td>{fa(r.workedHours)}</td><td>{fa(r.morningHours)}</td>
                <td>{fa(r.eveningHours)}</td><td>{fa(r.nightHours)}</td><td>{fa(r.holidayHours)}</td>
                <td>{fa(r.leaveDays)}</td><td>{fa(r.overtimeHours)}</td><td><strong>{fa(r.totalPaidHours)}</strong></td>
                <td>{r.status === 'draft' ? 'پیش‌نویس' : r.status === 'approved' ? 'تأییدشده' : 'صادرشده'}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={11} style={{ padding: 12 }}>هنوز محاسبه نشده است.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
