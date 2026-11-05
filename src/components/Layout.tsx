import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useSessionStore } from '../store/session';
import { signOut } from '../services/auth';

const links = [
  { to: '/', label: 'داشبورد سرپرستار' },
  { to: '/scheduler', label: 'برنامهٔ شیفت' },
  { to: '/leave', label: 'مرخصی‌ها' },
  { to: '/work-records', label: 'کارکرد ماهانه' },
  { to: '/attendance', label: 'حضور و غیاب' },
  { to: '/personnel', label: 'پرونده پرسنلی' },
  { to: '/karaneh', label: 'کارانه' },
  { to: '/nursing-services', label: 'خدمات پرستاری' },
  { to: '/accreditation', label: 'اعتباربخشی' },
  { to: '/ai', label: 'دستیار AI' },
  { to: '/self-service', label: 'سلف‌سرویس پرستار' },
];

export default function Layout() {
  const { viewRole, setViewRole, currentEmployeeId, setCurrentEmployee, personnel, departmentId, hydrated, hydrateFromSupabase, dataSource } = useAppStore();
  const sessionEmail = useSessionStore(s => s.email);
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
  return (
    <div dir="rtl" style={{ fontFamily: 'Vazirmatn, system-ui, sans-serif', minHeight: '100vh', background: '#faf7f2', color: '#1d2733' }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '10px 20px', background: '#0f4c4c', color: '#fff', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 18 }}>حجله — لایهٔ نیروی انسانی بیمارستان</strong>
        <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {links.map(l => (
            <NavLink key={l.to} to={l.to} style={({ isActive }) => ({ color: isActive ? '#ffd9a0' : '#e8f0ee', textDecoration: 'none', fontWeight: isActive ? 700 : 400 })}>
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
            <button onClick={() => void signOut()} style={{ background: 'transparent', color: '#ffd9a0', border: '1px solid #ffd9a0', borderRadius: 6, padding: '3px 12px', cursor: 'pointer', fontSize: 13 }}>خروج</button>
          </span>
        ) : (
          <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            نقش نمایشی:
            <select value={viewRole} onChange={e => setViewRole(e.target.value as 'ward_manager' | 'staff')}>
              <option value="ward_manager">سرپرستار</option>
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
