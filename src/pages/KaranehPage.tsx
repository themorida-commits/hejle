import { useMemo } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { buildKaranehSheet, karanehToCsv } from '../features/performance/performanceService';
import { reconcileAttendance, summarizeAttendance } from '../features/attendance/attendanceService';

export default function KaranehPage() {
  const st = useAppStore();
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const records = st.workRecords.filter(r => deptIds.has(r.employeeId));

  const rows = useMemo(() => {
    if (!records.length) return [];
    const leaveMap = new Map<string, Set<string>>();
    for (const l of st.leaves) {
      if (l.status !== 'approved') continue;
      const set = leaveMap.get(l.employeeId) ?? new Set<string>();
      const cur = new Date(l.startISO + 'T00:00:00');
      const end = new Date(l.endISO + 'T00:00:00');
      while (cur <= end) { set.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
      leaveMap.set(l.employeeId, set);
    }
    const summaries = summarizeAttendance(reconcileAttendance({
      personnel: deptPeople, entries: st.entries.filter(e => deptIds.has(e.personnelId)),
      events: st.attendanceEvents.filter(e => deptIds.has(e.employeeId)),
      shiftTypes: st.shiftTypes, leaveDatesByEmployee: leaveMap,
    }));
    return buildKaranehSheet(records, summaries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.workRecords, st.attendanceEvents, st.departmentId]);

  const fa = (n: number | null) => (n == null ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: 1 }));
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([karanehToCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `karaneh-${J_YEAR}-${J_MONTH}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1>برگهٔ کارانه — مهر ۱۴۰۵</h1>
      <p style={{ color: '#68707a', fontSize: 13 }}>
        مؤلفه‌های شفاف کارانه از کارکرد و حضور — فرمول نهایی کارانه سیاست بیمارستان است و این برگه «ورودی» آن است، نه خود فرمول.
        {records.length === 0 && ' اول از صفحهٔ کارکرد، محاسبهٔ ماه را انجام بده.'}
      </p>
      <button onClick={exportCsv} disabled={!rows.length} style={{ marginBottom: 12 }}>خروجی CSV برگهٔ کارانه</button>
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
          <thead><tr style={{ background: '#f3efe7' }}>
            {['نام', 'جمع پرداختی', 'شب', 'تعطیل', 'اضافه‌کار', 'حضور', 'غیبت', 'تأخیر (دقیقه)', 'شاخص حضور ٪', 'مرخصی'].map(h => <th key={h} style={{ padding: 8 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.employeeId} style={{ borderTop: '1px solid #eee', textAlign: 'center' }}>
                <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{r.employeeName}</td>
                <td><strong>{fa(r.totalPaidHours)}</strong></td><td>{fa(r.nightHours)}</td><td>{fa(r.holidayHours)}</td>
                <td>{fa(r.overtimeHours)}</td><td>{fa(r.presentDays)}</td><td>{fa(r.absentDays)}</td>
                <td>{fa(r.lateMinutes)}</td><td>{fa(r.attendanceRate)}</td><td>{fa(r.leaveDays)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} style={{ padding: 12 }}>هنوز کارکردی محاسبه نشده است.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
