import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore, type ViewRole } from '../store/appStore';
import { useSessionStore } from '../store/session';
import { signOut } from '../services/auth';
import { navGroupsForRole } from '../features/oversight/roleNav';
import Toasts from './Toasts';
import CommandPalette from './CommandPalette';

// پوسته (دور ۲۴ — موج ۲ UI): سایدبار گروه‌بندی‌شده بر اساس کار + پالت فرمان.
// هدر تختِ ۱۴ لینکی رفت؛ هر نقش همان میز خودش را می‌بیند (navGroupsForRole همان
// نگاشت نقش قبلی است، فقط ارائه‌اش گروهی شده) و جست‌وجو/پرش با Ctrl+K انجام می‌شود.
export default function Layout() {
  const { viewRole, setViewRole, currentEmployeeId, setCurrentEmployee, personnel, departmentId, hydrated, hydrateFromSupabase, dataSource } = useAppStore();
  const sessionEmail = useSessionStore(s => s.email);
  const sessionRole = useSessionStore(s => s.role);
  const sessionHospitals = useSessionStore(s => s.hospitals);
  const activeHospitalId = useSessionStore(s => s.hospitalId);
  const setSessionContext = useSessionStore(s => s.setContext);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const switchHospital = (hospitalId: string) => {
    const target = sessionHospitals.find(h => h.hospitalId === hospitalId);
    if (!target) return;
    setSessionContext({ hospitalId: target.hospitalId, wardId: target.wardId, role: target.role });
    useAppStore.setState({ hydrated: false });
    void useAppStore.getState().hydrateFromSupabase();
  };
  useEffect(() => { void hydrateFromSupabase(); }, [hydrateFromSupabase]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!hydrated) {
    // اسکلت پوسته (دور ۲۳): چیدمان معلومِ سایدبار و محتوا تا داده برسد — نه متنِ تنها.
    return (
      <div dir="rtl" className="app-shell" aria-busy="true" aria-label="در حال بارگذاری داده‌ها">
        <aside className="app-sidebar">
          <div className="skel" style={{ width: 34, height: 34, borderRadius: 10, background: '#1e3a4a' }} />
          <div className="skel" style={{ width: '80%', height: 14, background: '#1e3a4a', marginTop: 18 }} />
          <div className="skel" style={{ width: '65%', height: 14, background: '#1e3a4a' }} />
          <div className="skel" style={{ width: '72%', height: 14, background: '#1e3a4a' }} />
        </aside>
        <div className="app-main">
          <main>
            <div className="skel" style={{ width: 240, height: 26, marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              {[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ width: 200, height: 106, borderRadius: 16 }} />)}
            </div>
            <div className="skel" style={{ width: '100%', height: 180, borderRadius: 16 }} />
          </main>
        </div>
      </div>
    );
  }
  const deptPeople = personnel.filter(p => p.departmentId === departmentId);
  const role = dataSource === 'supabase' ? (sessionRole ?? 'staff') : viewRole;
  const groups = navGroupsForRole(role);
  return (
    <div dir="rtl" className="app-shell">
      <aside className="app-sidebar">
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 6px 10px' }}>
          <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: '#FF6D41', color: '#0A2735', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>ح</span>
          <span style={{ lineHeight: 1.25 }}>
            <strong style={{ fontSize: 16, display: 'block', color: '#fff' }}>حجله</strong>
            <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>لایهٔ نیروی انسانی بیمارستان</span>
          </span>
        </span>
        <button
          onClick={() => setPaletteOpen(true)}
          title="جست‌وجو و پرش سریع (Ctrl+K): نام همکار، صفحه یا بخش"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            background: '#12303f', border: '1px solid #1e3a4a', boxShadow: 'none', color: '#cbd5e1',
            borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 500, marginBottom: 8,
          }}
        >
          <span>جست‌وجو یا رفتن به…</span>
          <kbd style={{ fontFamily: 'inherit', fontSize: 10.5, background: '#0A2735', border: '1px solid #334155', borderRadius: 5, padding: '1px 6px', direction: 'ltr' }}>Ctrl+K</kbd>
        </button>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {groups.map(g => (
            <div key={g.id} style={{ marginBottom: 8 }}>
              {g.label && (
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7d93a5', padding: '4px 10px 3px' }}>{g.label}</div>
              )}
              {g.items.map(l => (
                <NavLink key={l.to} to={l.to} end={l.to === '/'} style={({ isActive }) => ({
                  display: 'block', color: isActive ? '#fff' : '#cbd5e1', textDecoration: 'none',
                  fontWeight: isActive ? 700 : 400, background: isActive ? '#003A56' : 'transparent',
                  padding: '6px 10px', borderRadius: 8, fontSize: 13.5,
                })}>
                  {l.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', borderTop: '1px solid #1e3a4a', paddingTop: 12 }}>
          {dataSource === 'supabase' ? (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              {sessionHospitals.length > 1 && (
                <select
                  aria-label="بیمارستان فعال"
                  value={activeHospitalId ?? ''}
                  onChange={e => switchHospital(e.target.value)}
                  style={{ fontSize: 13 }}
                >
                  {sessionHospitals.map(h => <option key={h.hospitalId} value={h.hospitalId}>{h.hospitalName}</option>)}
                </select>
              )}
              <span style={{ direction: 'ltr', color: '#cbd5e1', fontSize: 12.5 }}>{sessionEmail ?? ''}</span>
              <button onClick={() => void signOut()} style={{ background: 'transparent', color: '#FF6D41', border: '1px solid #FF6D41', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, boxShadow: 'none' }}>خروج</button>
            </span>
          ) : (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: '#cbd5e1' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                نقش نمایشی:
                <select value={viewRole} onChange={e => setViewRole(e.target.value as ViewRole)}>
                  <option value="ward_manager">سرپرستار</option>
                  <option value="matron">مترون</option>
                  <option value="hr_admin">اداری (منابع انسانی)</option>
                  <option value="staff">پرستار</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                هویت:
                <select value={currentEmployeeId} onChange={e => setCurrentEmployee(e.target.value)}>
                  {deptPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </span>
          )}
        </div>
      </aside>
      <div className="app-main">
        <main>
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toasts />
    </div>
  );
}
