import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../services/supabaseClient';
import { currentDataSource } from '../services/data';
import { fetchHospitalNames, fetchMyEmployeeId, fetchMyMemberships, pickHospitalContexts, pickSessionContext, signOut } from '../services/auth';
import { useSessionStore } from '../store/session';
import { useAppStore } from '../store/appStore';
import LoginPage from '../pages/LoginPage';

type GateState = 'checking' | 'signed_out' | 'ready' | 'no_membership' | 'error';

// دروازهٔ ورود: در حالت demo اصلاً دخالت نمی‌کند. در حالت supabase تا وقتی
// نشست + عضویت فعال نباشد، اپ بالا نمی‌آید؛ زمینهٔ سازمانی از عضویت کاربر
// می‌آید (نه از حدس کلاینت) و RLS سمت سرور داور نهایی دسترسی است.
export default function AuthGate({ children }: { children: ReactNode }) {
  const isSupabase = currentDataSource() === 'supabase';
  const [gate, setGate] = useState<GateState>(isSupabase ? 'checking' : 'ready');
  const setContext = useSessionStore(s => s.setContext);
  const setEmail = useSessionStore(s => s.setEmail);
  const clearSession = useSessionStore(s => s.clear);

  useEffect(() => {
    if (!isSupabase) return;
    let cancelled = false;

    const bootstrap = async (userId: string, email: string | null) => {
      try {
        const memberships = await fetchMyMemberships(userId);
        const preferredWard = (import.meta.env.VITE_WARD_ID as string | undefined) ?? null;
        const ctx = pickSessionContext(memberships, preferredWard);
        if (cancelled) return;
        if (!ctx) { setGate('no_membership'); return; }
        // سوییچر چندبیمارستانی: زمینهٔ هر بیمارستان + نام نمایشی‌اش
        const contexts = pickHospitalContexts(memberships, preferredWard);
        const names = await fetchHospitalNames(contexts.map(c => c.hospitalId));
        if (cancelled) return;
        setContext({
          userId, hospitalId: ctx.hospitalId, wardId: ctx.wardId, role: ctx.role,
          hospitals: contexts.map(c => ({
            hospitalId: c.hospitalId,
            hospitalName: names.get(c.hospitalId) ?? 'بیمارستان',
            wardId: c.wardId, role: c.role,
          })),
        });
        setEmail(email);
        const employeeId = await fetchMyEmployeeId(userId);
        if (employeeId && !cancelled) useAppStore.getState().setCurrentEmployee(employeeId);
        if (!cancelled) setGate('ready');
      } catch {
        if (!cancelled) setGate('error');
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const user = data.session?.user;
      if (!user) { setGate('signed_out'); return; }
      void bootstrap(user.id, user.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session?.user) { clearSession(); setGate('signed_out'); return; }
      void bootstrap(session.user.id, session.user.email ?? null);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [isSupabase, setContext, setEmail, clearSession]);

  if (!isSupabase || gate === 'ready') return <>{children}</>;
  if (gate === 'signed_out') return <LoginPage />;
  if (gate === 'no_membership') {
    return (
      <div dir="rtl" style={{ fontFamily: 'Vazirmatn, system-ui', padding: 40, maxWidth: 520, margin: '0 auto' }}>
        <h2 style={{ color: '#0f172a' }}>حساب شما هنوز فعال نشده است</h2>
        <p>برای این حساب، عضویت فعالی در هیچ بیمارستانی ثبت نشده است. با مدیر سیستم تماس بگیرید تا حساب‌تان به بخش درست وصل شود.</p>
        <button onClick={() => void signOut()} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>خروج</button>
      </div>
    );
  }
  if (gate === 'error') {
    return <div dir="rtl" style={{ fontFamily: 'Vazirmatn, system-ui', padding: 40 }}>خطا در بررسی نشست؛ اتصال را بررسی و صفحه را تازه کنید.</div>;
  }
  return <div dir="rtl" style={{ fontFamily: 'Vazirmatn, system-ui', padding: 40 }}>در حال بررسی نشست…</div>;
}
