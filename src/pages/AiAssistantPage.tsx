import { useMemo, useState } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { chatWithAi } from '../services/aiClient';
import { buildEmployeeFacts, evaluateRules, DEFAULT_RULE_CONFIGS } from '../core/rules/engine';

// دستیار AI — مرز DR-002: فقط توضیح و تفسیر خروجی موتور قطعی؛ هیچ تصمیم
// برگشت‌ناپذیری (تأیید مرخصی، عدد کارکرد، برنامهٔ نهایی) با مدل زبانی نیست.
export default function AiAssistantPage() {
  const st = useAppStore();
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const context = useMemo(() => {
    const facts = buildEmployeeFacts({
      personnel: deptPeople, entries: st.entries.filter(e => deptIds.has(e.personnelId)),
      shiftTypes: st.shiftTypes, jYear: J_YEAR, jMonth: J_MONTH, dutyHoursByEmployee: st.dutyByEmployee,
    });
    const violations = evaluateRules({ facts, configs: DEFAULT_RULE_CONFIGS });
    const hard = violations.filter(v => v.severity === 'hard');
    return [
      `بخش: ${st.departments.find(d => d.id === st.departmentId)?.name ?? ''}، ماه مهر ۱۴۰۵، پرسنل: ${deptPeople.length} نفر.`,
      `نقض‌های سخت قواعد: ${hard.length}، هشدارها: ${violations.length - hard.length}.`,
      ...violations.slice(0, 12).map(v => `- ${v.message}`),
    ].join('\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.entries, st.departmentId]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setMessages(m => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const answer = await chatWithAi(
        q,
        `تو دستیار توضیح‌دهندهٔ سیستم مدیریت نیروی انسانی بیمارستانی «حجله» هستی. فقط بر اساس دادهٔ زیر به فارسی پاسخ بده؛ اگر داده کافی نیست صریح بگو. هرگز عدد یا تصمیم تازه نساز.\n\n${context}`,
      );
      setMessages(m => [...m, { role: 'ai', text: answer }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'سرویس AI در دسترس نیست (در دیپلوی واقعی، کلید روی سرور Netlify تنظیم می‌شود و کلید هرگز به مرورگر نمی‌رسد).' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1>دستیار توضیح‌دهندهٔ AI</h1>
      <p style={{ color: '#68707a', fontSize: 13 }}>توضیح نقض‌های قواعد و منطق برنامه به زبان ساده — تصمیم‌ها با موتور قطعی و تأیید انسان است، نه مدل.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => void ask('نقض‌های سخت این ماه را به زبان ساده توضیح بده و بگو کدام مهم‌تر است.')}>توضیح نقض‌های این ماه</button>
        <button onClick={() => void ask('قانون ارتقای بهره‌وری چه محدودیت‌هایی روی برنامه می‌گذارد؟ بر اساس دادهٔ همین بخش خلاصه کن.')}>محدودیت‌های قانون بهره‌وری در این بخش</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16, minHeight: 240, marginBottom: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, textAlign: m.role === 'user' ? 'left' : 'right' }}>
            <span style={{ display: 'inline-block', background: m.role === 'user' ? '#eef4f3' : '#faf3e3', borderRadius: 10, padding: '8px 12px', maxWidth: '85%', whiteSpace: 'pre-wrap', textAlign: 'right' }}>{m.text}</span>
          </div>
        ))}
        {messages.length === 0 && <p style={{ color: '#68707a' }}>سؤالت را بپرس یا یکی از دکمه‌های بالا را بزن.</p>}
        {busy && <p>در حال فکر کردن…</p>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="سؤال دربارهٔ برنامه و قواعد این بخش…"
          style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') void ask(input); }} />
        <button onClick={() => void ask(input)} disabled={busy}>بفرست</button>
      </div>
    </div>
  );
}
