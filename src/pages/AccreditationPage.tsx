import { useMemo } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { buildAccreditationReport, reportToMarkdown, type MetricStatus } from '../features/accreditation/accreditationReport';
import { buildEmployeeFacts, evaluateRules, DEFAULT_RULE_CONFIGS } from '../core/rules/engine';
import { wardRecordingHealth } from '../features/nursingServices/nursingService';

const STATUS_STYLE: Record<MetricStatus, { bg: string; color: string; label: string }> = {
  ok: { bg: '#f0fdf4', color: '#16a34a', label: 'مطلوب' },
  warn: { bg: '#fffbeb', color: '#b45309', label: 'نیازمند توجه' },
  risk: { bg: '#fff1f2', color: '#e11d48', label: 'پرریسک' },
  nodata: { bg: '#f1f5f9', color: '#64748b', label: 'دادهٔ ناکافی' },
};
const shiftMap: Record<string, 'morning' | 'evening' | 'night'> = { 's-m': 'morning', 's-e': 'evening', 's-n': 'night' };

export default function AccreditationPage() {
  const st = useAppStore();
  const nowISO = useMemo(() => new Date().toISOString(), []);
  const todayISO = nowISO.slice(0, 10);
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const nameOf = (id: string) => st.personnel.find(p => p.id === id)?.name ?? id;

  const report = useMemo(() => {
    const deptEntries = st.entries.filter(e => deptIds.has(e.personnelId));
    const facts = buildEmployeeFacts({
      personnel: deptPeople, entries: deptEntries, shiftTypes: st.shiftTypes,
      jYear: J_YEAR, jMonth: J_MONTH, dutyHoursByEmployee: st.dutyByEmployee,
    });
    const hard = evaluateRules({ facts, configs: DEFAULT_RULE_CONFIGS }).filter(v => v.severity === 'hard').length;
    const expected = st.entries
      .filter(e => deptIds.has(e.personnelId) && shiftMap[e.shiftTypeId])
      .map(e => ({ employeeId: e.personnelId, dateISO: e.date, shift: shiftMap[e.shiftTypeId]! }));
    const recording = wardRecordingHealth(st.departmentId, expected, st.nursingRecords, st.nursingPackages, 201_000, 7.4, nowISO);
    const deptRecords = st.workRecords.filter(r => deptIds.has(r.employeeId));
    return buildAccreditationReport({
      personnelIds: deptPeople.map(p => p.id),
      personnelCount: deptPeople.length,
      credentials: st.credentials.filter(c => deptIds.has(c.employeeId)),
      nameOf, todayISO,
      schedulePublished: st.scheduleStatus === 'published',
      hardRuleViolations: hard,
      recording,
      approvedWorkRecords: deptRecords.filter(r => r.status !== 'draft').length,
      totalWorkRecords: deptRecords.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.departmentId, st.entries, st.credentials, st.nursingRecords, st.workRecords, st.scheduleStatus]);

  const deptName = st.departments.find(d => d.id === st.departmentId)?.name ?? '';
  const download = () => {
    const md = reportToMarkdown(report, `گزارش آمادگی اعتباربخشی — ${deptName} — مهر ۱۴۰۵`);
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `accreditation-${J_YEAR}-${J_MONTH}.md`; a.click();
    URL.revokeObjectURL(url);
  };
  const fa = (n: number) => n.toLocaleString('fa-IR');

  return (
    <div>
      <h1>گزارش آمادگی اعتباربخشی — {deptName}</h1>
      <p style={{ color: '#64748b', fontSize: 13, maxWidth: 780 }}>
        سنجه‌های محور مدیریت خدمات پرستاری، زنده از داده‌های همین سیستم: صلاحیت و مهارت‌سنجی، برنامه‌ریزی نیرو، مستندسازی و آموزش.
        خلاصه: <strong>{fa(report.overall.ok)}</strong> مطلوب · <strong>{fa(report.overall.warn)}</strong> نیازمند توجه · <strong>{fa(report.overall.risk)}</strong> پرریسک · <strong>{fa(report.overall.nodata)}</strong> دادهٔ ناکافی
        <button onClick={download} style={{ marginInlineStart: 12 }}>دانلود گزارش (Markdown)</button>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {report.sections.map(s => (
          <section key={s.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 15, marginTop: 0 }}>{s.title}</h2>
            {s.metrics.map((m, i) => (
              <div key={i} style={{ borderTop: i ? '1px solid #e2e8f0' : 'none', padding: '9px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{m.label}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <strong style={{ fontSize: 14 }}>{m.value}</strong>
                    <span style={{ background: STATUS_STYLE[m.status].bg, color: STATUS_STYLE[m.status].color, borderRadius: 20, padding: '2px 9px', fontSize: 11 }}>
                      {STATUS_STYLE[m.status].label}
                    </span>
                  </span>
                </div>
                {m.note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{m.note}</div>}
              </div>
            ))}
          </section>
        ))}
      </div>
      <p style={{ fontSize: 12, color: '#64748b' }}>
        این گزارش «خودارزیابی آمادگی» است و جایگزین ارزیابی رسمی ارزیابان اعتباربخشی نیست؛ ارزشش در این است که پیش از بازدید، نقاط پرریسک را از روی دادهٔ واقعی نشان می‌دهد.
      </p>
    </div>
  );
}
