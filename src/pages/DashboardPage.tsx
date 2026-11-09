import { useMemo } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { useSessionStore } from '../store/session';
import { buildEmployeeFacts, buildWardFacts, evaluateRules, DEFAULT_RULE_CONFIGS } from '../core/rules/engine';
import HospitalQueueSection from '../features/oversight/HospitalQueueSection';

function Card({ title, value, hint, alert }: { title: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <div className="stat-card" style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, minWidth: 180,
      borderTop: alert ? '3px solid #e11d48' : undefined,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{title}</div>
      <div className="num" style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: alert ? '#e11d48' : '#0A2735' }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { personnel, entries, shiftTypes, leaves, swaps, departmentId, scheduleStatus, dutyByEmployee } = useAppStore();
  const dataSource = useAppStore(s => s.dataSource);
  const viewRole = useAppStore(s => s.viewRole);
  const sessionRole = useSessionStore(s => s.role);
  const actorRole = dataSource === 'supabase' ? (sessionRole ?? 'staff') : viewRole;
  const deptPeople = personnel.filter(p => p.departmentId === departmentId);
  const deptIds = new Set(deptPeople.map(p => p.id));
  const deptEntries = entries.filter(e => deptIds.has(e.personnelId));

  const stats = useMemo(() => {
    const facts = buildEmployeeFacts({
      personnel: deptPeople, entries: deptEntries, shiftTypes, jYear: J_YEAR, jMonth: J_MONTH,
      dutyHoursByEmployee: dutyByEmployee,
    });
    const violations = evaluateRules({ facts, configs: DEFAULT_RULE_CONFIGS });
    const ward = buildWardFacts({ entries: deptEntries, shiftTypes, jYear: J_YEAR, jMonth: J_MONTH });
    const mid = ward[14];
    return {
      hard: violations.filter(v => v.severity === 'hard').length,
      warn: violations.filter(v => v.severity === 'warn').length,
      midCounts: mid?.counts,
      violations: violations.slice(0, 6),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, departmentId]);

  const fa = (n: number) => n.toLocaleString('fa-IR');
  return (
    <div>
      <h1>داشبورد — مهر ۱۴۰۵</h1>
      <HospitalQueueSection actorRole={actorRole} variant="panel" />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Card title="پرسنل بخش" value={fa(deptPeople.length)} />
        <Card title="وضعیت برنامه" value={scheduleStatus === 'published' ? 'منتشرشده' : 'پیش‌نویس'} />
        <Card title="مرخصی در انتظار" value={fa(leaves.filter(l => l.status === 'pending').length)} />
        <Card title="جابه‌جایی در انتظار" value={fa(swaps.filter(s => s.status === 'pending' || s.status === 'accepted').length)} />
        <Card title="نقض سخت قواعد" value={fa(stats.hard)} hint={`هشدار: ${fa(stats.warn)}`} alert={stats.hard > 0} />
        <Card title="نیروی روز ۱۵ ماه" value={stats.midCounts ? `${fa(stats.midCounts.morning)} صبح · ${fa(stats.midCounts.evening)} عصر · ${fa(stats.midCounts.night)} شب` : '—'} />
      </div>
      <h2 style={{ marginTop: 28 }}>مهم‌ترین هشدارهای قواعد</h2>
      {stats.violations.length === 0 && (
        <p style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
          موردی نیست؛ برنامه با قواعد قانون بهره‌وری سازگار است.
        </p>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {stats.violations.map((v, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, borderRadius: 10, padding: '10px 14px',
            background: v.severity === 'hard' ? '#fff1f2' : '#fffbeb',
            border: `1px solid ${v.severity === 'hard' ? '#fecdd3' : '#fde68a'}`,
            color: v.severity === 'hard' ? '#881337' : '#78350f',
          }}>
            <span aria-hidden style={{ fontWeight: 800 }}>{v.severity === 'hard' ? '⛔' : '⚠'}</span>
            <span>{v.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
