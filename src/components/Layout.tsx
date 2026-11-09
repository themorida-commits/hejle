import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore, type ViewRole } from '../store/appStore';
import { useSessionStore } from '../store/session';
import { signOut } from '../services/auth';
import { navForRole } from '../features/oversight/roleNav';

export default function Layout() {
  const { viewRole, setViewRole, currentEmployeeId, setCurrentEmployee, personnel, departmentId, hydrated, hydrateFromSupabase, dataSource } = useAppStore();
  const sessionEmail = useSessionStore(s => s.email);
  const sessionRole = useSessionStore(s => s.role);
  const sessionHospitals = useSessionStore(s => s.hospitals);
  const activeHospitalId = useSessionStore(s => s.hospitalId);
  const setSessionContext = useSessionStore(s => s.setContext);
  const switchHospital = (hospitalId: string) => {
    const target = sessionHospitals.find(h => h.hospitalId === hospitalId);
    if (!target) return;
    setSessionContext({ hospitalId: target.hospitalId, wardId: target.wardId, role: target.role });
    useAppStore.setState({ hydrated: false });
    void useAppStore.getState().hydrateFromSupabase();
  };
  useEffect(() => { void hydrateFromSupabase(); }, [hydrateFromSupabase]);
  if (!hydrated) {
    return <div dir="rtl" style={{ fontFamily: 'Vazirmatn, system-ui', padding: 40 }}>در حال بارگذاری داده‌ها…</div>;
  }
  const deptPeople = personnel.filter(p => p.departmentId === departmentId);
  // هر نقش فقط میز کار خودش را می‌بیند (مترون و اداری هم میز جدا دارند)
  const links = navForRole(dataSource === 'supabase' ? (sessionRole ?? 'staff') : viewRole);
  return (
    <div dir="rtl" style={{ fontFamily: 'Vazirmatn, system-ui, sans-serif', minHeight: '100vh', background: '#f8fafc', color: '#0f172a' }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '10px 20px', background: '#0f172a', color: '#fff', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 18 }}>حجله — لایهٔ نیروی انسانی بیمارستان</strong>
        <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {links.map(l => (
            <NavLink key={l.to} to={l.to} style={({ isActive }) => ({ color: isActive ? '#93c5fd' : '#cbd5e1', textDecoration: 'none', fontWeight: isActive ? 700 : 400 })}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        {dataSource === 'supabase' ? (
          <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
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
            <span style={{ direction: 'ltr' }}>{sessionEmail ?? ''}</span>
            <button onClick={() => void signOut()} style={{ background: 'transparent', color: '#93c5fd', border: '1px solid #93c5fd', borderRadius: 6, padding: '3px 12px', cursor: 'pointer', fontSize: 13 }}>خروج</button>
          </span>
        ) : (
          <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            نقش نمایشی:
            <select value={viewRole} onChange={e => setViewRole(e.target.value as ViewRole)}>
              <option value="ward_manager">سرپرستار</option>
              <option value="matron">مترون</option>
              <option value="hr_admin">اداری (منابع انسانی)</option>
              <option value="staff">پرستار</option>
            </select>
            هویت:
            <select value={currentEmployeeId} onChange={e => setCurrentEmployee(e.target.value)}>
              {deptPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </span>
        )}
      </header>
      <main style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
