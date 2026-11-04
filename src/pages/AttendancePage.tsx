import { useMemo, useState } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import {
  reconcileAttendance, summarizeAttendance, parseAttendanceCsv, attendanceSummaryToCsv,
} from '../features/attendance/attendanceService';
import { isoFromJalali } from '../features/leave/leaveService';

export default function AttendancePage() {
  const st = useAppStore();
  const [empId, setEmpId] = useState('');
  const [day, setDay] = useState(15);
  const [type, setType] = useState<'in' | 'out'>('in');
  const [time, setTime] = useState('07:00');
  const [importMsg, setImportMsg] = useState('');

  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const deptEntries = st.entries.filter(e => deptIds.has(e.personnelId));
  const deptEvents = st.attendanceEvents.filter(e => deptIds.has(e.employeeId));

  const leaveMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of st.leaves) {
      if (l.status !== 'approved') continue;
      const set = m.get(l.employeeId) ?? new Set<string>();
      const cur = new Date(l.startISO + 'T00:00:00');
      const end = new Date(l.endISO + 'T00:00:00');
      while (cur <= end) { set.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
      m.set(l.employeeId, set);
    }
    return m;
  }, [st.leaves]);

  const days = useMemo(() => reconcileAttendance({
    personnel: deptPeople, entries: deptEntries, events: deptEvents,
    shiftTypes: st.shiftTypes, leaveDatesByEmployee: leaveMap,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [st.entries, st.attendanceEvents, st.departmentId, st.leaves]);
  const summary = useMemo(() => summarizeAttendance(days), [days]);
  const nameOf = (id: string) => st.personnel.find(p => p.id === id)?.name ?? id;
  const fa = (n: number) => n.toLocaleString('fa-IR');

  const addEvent = () => {
    const target = empId || st.currentEmployeeId;
    st.addAttendanceEvent({
      id: `att-${Date.now()}`, employeeId: target,
      dateISO: isoFromJalali(J_YEAR, J_MONTH, day), type, time, source: 'manual',
    });
  };

  const importFile = async (f: File) => {
    const text = await f.text();
    const byCode = new Map(st.personnel.map(p => [p.personnelCode, p.id]));
    try {
      const { events, skipped } = parseAttendanceCsv(text, byCode);
      const stamped = events.map((e, i) => ({ ...e, id: `imp-${Date.now()}-${i}` }));
      st.setAttendanceEvents([...st.attendanceEvents, ...stamped]);
      setImportMsg(`${fa(events.length)} رویداد وارد شد${skipped ? `؛ ${fa(skipped)} ردیف با کد پرسنلی ناشناخته رد شد` : ''}.`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'خطا در خواندن فایل');
    }
  };

  const exportCsv = () => {
    const csv = attendanceSummaryToCsv(summary, id => {
      const p = st.personnel.find(x => x.id === id);
      return { name: p?.name ?? id, code: p?.personnelCode ?? '' };
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `attendance-${J_YEAR}-${J_MONTH}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1>حضور و غیاب — مهر ۱۴۰۵</h1>
      <p style={{ color: '#68707a', fontSize: 13 }}>
        تطبیق رویدادهای ورود/خروج با برنامهٔ شیفت (قطعی و قابل توضیح). رویدادها: {fa(deptEvents.length)} · روزهای غیبت: {fa(days.filter(d => d.status === 'absent').length)} · ناقص: {fa(days.filter(d => d.status === 'incomplete').length)}
      </p>

      <section style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>ثبت دستی رویداد</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={empId} onChange={e => setEmpId(e.target.value)}>
            <option value="">خودم ({nameOf(st.currentEmployeeId)})</option>
            {deptPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          روز <input type="number" min={1} max={30} value={day} onChange={e => setDay(Number(e.target.value))} style={{ width: 60 }} />
          <select value={type} onChange={e => setType(e.target.value as 'in' | 'out')}>
            <option value="in">ورود</option><option value="out">خروج</option>
          </select>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} />
          <button onClick={addEvent}>ثبت</button>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13 }}>
            ایمپورت فایل دستگاه/قاصدک (CSV):{' '}
            <input type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
          </label>
          <button onClick={exportCsv} disabled={!summary.length}>خروجی خلاصهٔ ماهانه (CSV)</button>
          {importMsg && <span style={{ fontSize: 13 }}>{importMsg}</span>}
        </div>
      </section>

      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 800 }}>
          <thead><tr style={{ background: '#f3efe7' }}>
            {['نام', 'حضور', 'غیبت', 'مرخصی', 'ناقص', 'کارکرد واقعی (ساعت)', 'تأخیر (دقیقه)', 'اضافه‌کار (ساعت)'].map(h => <th key={h} style={{ padding: 8 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {summary.map(s => (
              <tr key={s.employeeId} style={{ borderTop: '1px solid #eee', textAlign: 'center' }}>
                <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{nameOf(s.employeeId)}</td>
                <td>{fa(s.presentDays)}</td><td>{fa(s.absentDays)}</td><td>{fa(s.leaveDays)}</td><td>{fa(s.incompleteDays)}</td>
                <td>{fa(Math.round(s.totalWorkedMinutes / 6) / 10)}</td><td>{fa(s.totalLateMinutes)}</td>
                <td>{fa(Math.round(s.totalOvertimeMinutes / 6) / 10)}</td>
              </tr>
            ))}
            {summary.length === 0 && <tr><td colSpan={8} style={{ padding: 12 }}>داده‌ای نیست.</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: '#68707a', marginTop: 8 }}>ساعت شروع اسمی شیفت‌ها (صبح ۷، عصر ۱۴، شب ۱۹) پارامتر است و از تنظیمات بیمارستان خوانده خواهد شد؛ قالب ستون‌های فایل دستگاه با قالب قاصدکِ بیمارستان (پرسش Q3) قطعی می‌شود — نگاشت ستون در آداپتور قابل تغییر است.</p>
    </div>
  );
}
