import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useSessionStore } from '../store/session';
import { navForRole } from '../features/oversight/roleNav';
import { rankEntries } from '../features/oversight/paletteSearch';

// ── پالت فرمان (دور ۲۴ — موج ۲ UI، الگوی Linear) ─────────────────────────────
// Ctrl/Cmd+K از هر جا: صفحاتِ نقش خودت، آدم‌ها (پرش به پرونده)، بخش‌ها (سوییچ +
// برنامه) و ورودی‌های کاری. جهت‌نما + Enter؛ Esc بستنِ بی‌خطر. میانبرها در
// tooltip دکمهٔ جست‌وجوی سایدبار هم چاپ شده‌اند تا در بافت یاد گرفته شوند.

interface Entry {
  id: string;
  group: string;
  title: string;
  hint?: string;
  run: () => void;
}

const ACTIONS: { title: string; to: string; roles?: string[] }[] = [
  { title: 'ثبت درخواست مرخصی تازه', to: '/leave' },
  { title: 'پذیرش بیمار تازه', to: '/patients', roles: ['ward_manager', 'matron', 'hospital_admin'] },
  { title: 'چاپ فرم چینش این ماه', to: '/scheduler/print', roles: ['ward_manager', 'matron', 'hospital_admin'] },
];

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const st = useAppStore();
  const sessionRole = useSessionStore(s => s.role);
  const role = st.dataSource === 'supabase' ? (sessionRole ?? 'staff') : st.viewRole;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open ]);

  const entries = useMemo<Entry[]>(() => {
    if (!open) return [];
    const pages: Entry[] = navForRole(role).map(n => ({
      id: `page${n.to}`, group: 'صفحات', title: n.label,
      run: () => navigate(n.to),
    }));
    const actions: Entry[] = ACTIONS
      .filter(a => !a.roles || a.roles.includes(role))
      .map(a => ({ id: `act${a.to}`, group: 'اکشن‌ها', title: a.title, run: () => navigate(a.to) }));
    const people: Entry[] = st.personnel.map(p => ({
      id: `person${p.id}`, group: 'آدم‌ها', title: p.name,
      hint: `${p.role} · ${st.departments.find(d => d.id === p.departmentId)?.name ?? ''}`,
      run: () => {
        if (p.departmentId !== st.departmentId) st.setDepartment(p.departmentId);
        navigate(`/personnel?person=${p.id}`);
      },
    }));
    const wards: Entry[] = st.departments.map(d => ({
      id: `ward${d.id}`, group: 'بخش‌ها', title: d.name, hint: 'رفتن به برنامهٔ این بخش',
      run: () => { st.setDepartment(d.id); navigate('/scheduler'); },
    }));
    const all = [...pages, ...actions, ...people, ...wards];
    return rankEntries(query, all).slice(0, 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, role, st.personnel, st.departments, st.departmentId]);

  useEffect(() => { setActive(0); }, [query]);

  if (!open) return null;

  const runActive = () => {
    const e = entries[active];
    if (e) { e.run(); onClose(); }
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="پالت فرمان"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgb(10 39 53 / 0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '10vh 16px 16px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(620px, 100%)', background: '#fff', borderRadius: 16, boxShadow: '0 24px 48px -12px rgb(15 23 42 / 0.35)', overflow: 'hidden' }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(entries.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          }}
          placeholder="جست‌وجو: نام همکار، صفحه، بخش…"
          aria-label="جست‌وجو در پالت فرمان"
          style={{ width: '100%', border: 'none', borderBottom: '1px solid #e2e8f0', borderRadius: 0, padding: '14px 16px', fontSize: 15, background: '#fff', boxShadow: 'none' }}
        />
        <div role="listbox" style={{ maxHeight: '46vh', overflowY: 'auto', padding: 6 }}>
          {entries.length === 0 && (
            <div style={{ padding: '14px 12px', fontSize: 13, color: '#64748b' }}>
              نتیجه‌ای نیست؛ عبارت کوتاه‌تری امتحان کنید — مثلاً نام خانوادگی همکار یا «کارانه».
            </div>
          )}
          {entries.map((e, i) => (
            <button
              key={e.id}
              role="option" aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => { e.run(); onClose(); }}
              style={{
                display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'right',
                background: i === active ? '#DCE9F0' : 'transparent', border: 'none', boxShadow: 'none',
                color: '#0A2735', borderRadius: 10, padding: '9px 12px', fontSize: 13.5, cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#004E72', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '1px 8px', flexShrink: 0 }}>{e.group}</span>
              <span style={{ fontWeight: 600 }}>{e.title}</span>
              {e.hint && <span style={{ color: '#64748b', fontSize: 12 }}>{e.hint}</span>}
            </button>
          ))}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '7px 14px', fontSize: 11.5, color: '#64748b', display: 'flex', gap: 14 }}>
          <span>↑↓ حرکت</span><span>Enter رفتن</span><span>Esc بستن</span>
        </div>
      </div>
    </div>
  );
}
