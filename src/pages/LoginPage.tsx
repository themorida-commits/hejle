import { useState } from 'react';
import { signInWithPassword } from '../services/auth';

// صفحهٔ ورود (حالت supabase): ایمیل + رمز عبورِ Supabase Auth.
// ساخت حساب از اینجا انجام نمی‌شود؛ کاربرها را مدیر سیستم در داشبورد
// سوپابیس می‌سازد و با اسکریپت onboarding به بخش وصل می‌کند.
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email.trim(), password);
      // ادامهٔ کار با AuthGate است: با نشستن نشست، عضویت‌ها خوانده می‌شوند.
    } catch {
      setError('ورود ناموفق بود؛ ایمیل یا رمز عبور را بررسی کنید.');
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" style={{ fontFamily: 'Vazirmatn, system-ui, sans-serif', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#faf7f2', color: '#1d2733' }}>
      <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #e4ddd2', borderRadius: 12, padding: 28, width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <strong style={{ fontSize: 20, color: '#0f4c4c' }}>حجله</strong>
        <span style={{ fontSize: 13, color: '#5a6a72' }}>لایهٔ نیروی انسانی بیمارستان — ورود کاربران</span>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          ایمیل
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cfc8ba', direction: 'ltr', textAlign: 'left' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          رمز عبور
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cfc8ba', direction: 'ltr', textAlign: 'left' }} />
        </label>
        {error && <div style={{ color: '#b3261e', fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={busy} style={{ background: '#0f4c4c', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'در حال ورود…' : 'ورود'}
        </button>
      </form>
    </div>
  );
}
