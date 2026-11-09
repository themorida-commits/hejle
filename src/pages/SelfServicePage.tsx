import { useMemo, useState } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { buildMonthGrid, shiftSymbol } from '../features/roster/rosterModel';
import { createSwap, acceptSwap } from '../features/swaps/swapService';
import { isoFromJalali } from '../features/leave/leaveService';

// سلف‌سرویس پرستار (P1-04) — موبایل‌اول: برنامهٔ خودم، ماندهٔ مرخصی، جابه‌جایی.
// ورود OTP در اتصال واقعی Supabase Auth انجام می‌شود؛ اینجا هویت از هدر دمو می‌آید.
export default function SelfServicePage() {
  const st = useAppStore();
  const me = st.personnel.find(p => p.id === st.currentEmployeeId);
  const [swapDay, setSwapDay] = useState(15);
  const [swapWith, setSwapWith] = useState('');
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const myEntries = st.entries.filter(e => e.personnelId === st.currentEmployeeId);
  const grid = useMemo(
    () => buildMonthGrid({ personnel: me ? [me] : [], entries: myEntries, jYear: J_YEAR, jMonth: J_MONTH }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.entries, st.currentEmployeeId],
  );
  const row = me ? grid.get(me.id) ?? [] : [];
  const balance = st.leaveBalances[st.currentEmployeeId] ?? { entitled: 26, used: 0 };
  const mySwaps = st.swaps.filter(s => s.fromEmployeeId === st.currentEmployeeId || s.toEmployeeId === st.currentEmployeeId);
  const nameOf = (id: string) => st.personnel.find(p => p.id === id)?.name ?? id;
  const fa = (n: number) => n.toLocaleString('fa-IR');

  const requestSwap = () => {
    if (!swapWith) return;
    const res = createSwap({
      id: `sw-${Date.now()}`, fromEmployeeId: st.currentEmployeeId, toEmployeeId: swapWith,
      dateISO: isoFromJalali(J_YEAR, J_MONTH, swapDay), entries: st.entries,
      personnel: st.personnel, shiftTypes: st.shiftTypes,
    });
    if (!res.ok) { alert(res.error); return; }
    st.addSwap(res.swap);
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1>سلف‌سرویس — {me?.name}</h1>
      <section style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>ماندهٔ مرخصی استحقاقی</h2>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{fa(balance.entitled - balance.used)} روز</div>
        <div style={{ fontSize: 12, color: '#68707a' }}>از {fa(balance.entitled)} روز سالانه · مصرف‌شده: {fa(balance.used)} روز</div>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>برنامهٔ من — مهر ۱۴۰۵</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {row.map(cell => (
            <div key={cell.jDay} style={{ border: '1px solid #eee', borderRadius: 8, padding: 6, textAlign: 'center', background: cell.isFriday ? '#fff5f5' : '#fff' }}>
              <div style={{ fontSize: 11, color: '#68707a' }}>{fa(cell.jDay)}</div>
              <div style={{ fontWeight: 700, color: cell.entry?.shiftTypeId === 's-n' ? '#7c3aed' : undefined }}>{shiftSymbol(st.shiftTypes, cell.entry?.shiftTypeId)}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>جابه‌جایی شیفت</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          روز <input type="number" min={1} max={30} value={swapDay} onChange={e => setSwapDay(Number(e.target.value))} style={{ width: 60 }} />
          با
          <select value={swapWith} onChange={e => setSwapWith(e.target.value)}>
            <option value="">انتخاب همکار…</option>
            {deptPeople.filter(p => p.id !== st.currentEmployeeId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={requestSwap}>درخواست جابه‌جایی</button>
        </div>
        <ul style={{ marginTop: 12 }}>
          {mySwaps.map(s => (
            <li key={s.id} style={{ marginBottom: 6 }}>
              {nameOf(s.fromEmployeeId)} ↔ {nameOf(s.toEmployeeId)} · {s.dateISO} · وضعیت: {s.status}
              {s.status === 'pending' && s.toEmployeeId === st.currentEmployeeId && (
                <button style={{ marginInlineStart: 8 }} onClick={() => {
                  const r = acceptSwap(s, st.currentEmployeeId);
                  if ('error' in r) alert(r.error); else st.updateSwap(r);
                }}>پذیرفتن</button>
              )}
            </li>
          ))}
          {mySwaps.length === 0 && <li>درخواستی ندارید.</li>}
        </ul>
        <p style={{ fontSize: 12, color: '#68707a' }}>بعد از پذیرش طرف مقابل، تأیید نهایی با سرپرستار است و از صفحهٔ برنامه اعمال می‌شود.</p>
      </section>
    </div>
  );
}
