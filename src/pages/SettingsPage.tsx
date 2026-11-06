import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useSessionStore } from '../store/session';
import { ROLE_FA } from './LeavePage';
import { CHAIN_PRESETS, matchChainPreset } from '../services/data/settings';
import type { HospitalSettingsRecord } from '../services/data/types';

// تنظیمات بیمارستان: زنجیرهٔ تأیید مرخصی + جدول کاهش ساعت موظفی (Q2).
// منبع: hospitals.settings — نوشتن در حالت واقعی فقط برای مدیر بیمارستان (RLS).
const CHAIN_ROLES = ['ward_manager', 'hospital_admin', 'hr_admin'];
const fa = (n: number) => n.toLocaleString('fa-IR');

interface BandDraft { minYears: number; maxYears: number; deduction: number }

export default function SettingsPage() {
  const st = useAppStore();
  const sessionRole = useSessionStore(s => s.role);
  const canEdit = st.dataSource === 'demo' || sessionRole === 'hospital_admin';

  const [chain, setChain] = useState<string[]>(st.approvalChain);
  const [presetId, setPresetId] = useState<'government' | 'private' | 'army' | null>(st.chainPresetId);
  // هر ویرایش دستی روی گام‌ها، پیش‌فرض را به «سفارشی» برمی‌گرداند.
  const editChain = (next: string[]) => { setChain(next); setPresetId(null); };
  const [bands, setBands] = useState<BandDraft[]>(
    st.globalDutySettings.seniorityDeductions.map(b => ({
      minYears: b.minMonths / 12, maxYears: b.maxMonths >= 600 ? 99 : b.maxMonths / 12, deduction: b.deduction,
    })),
  );
  const [baseHours, setBaseHours] = useState(
    Object.fromEntries(st.globalDutySettings.employmentStatuses.map(s => [s.status, s.baseHours])),
  );
  const [msg, setMsg] = useState('');

  const save = async () => {
    const settings: HospitalSettingsRecord = {
      approvalChain: chain.length > 0 ? chain : ['ward_manager'],
      chainPresetId: presetId,
      globalDuty: {
        ...st.globalDutySettings,
        seniorityDeductions: bands
          .filter(b => b.deduction >= 0)
          .map(b => ({
            minMonths: Math.round(b.minYears * 12),
            maxMonths: b.maxYears >= 99 ? 600 : Math.round(b.maxYears * 12),
            deduction: b.deduction,
          })),
        employmentStatuses: st.globalDutySettings.employmentStatuses.map(s => ({
          status: s.status, baseHours: baseHours[s.status] ?? s.baseHours,
        })),
      },
    };
    const ok = await st.saveHospitalSettings(settings);
    setMsg(ok
      ? 'ذخیره شد. زنجیره و جدول تازه از همین لحظه روی درخواست‌ها و محاسبهٔ موظفی اعمال می‌شود.'
      : 'ذخیره ناموفق بود — در حالت واقعی، ویرایش تنظیمات فقط برای «مدیر بیمارستان» مجاز است.');
  };

  const input = { width: 90, padding: 6 } as const;

  return (
    <div>
      <h1>تنظیمات بیمارستان</h1>
      {!canEdit && (
        <p style={{ background: '#fdf3e7', border: '1px solid #e3ddd2', borderRadius: 10, padding: 12 }}>
          شما فقط مشاهده می‌کنید؛ ویرایش این تنظیمات با «مدیر بیمارستان» است.
        </p>
      )}

      <section style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>زنجیرهٔ تأیید مرخصی</h2>
        <p style={{ color: '#68707a', fontSize: 13 }}>
          درخواست مرخصی به‌ترتیب از این نقش‌ها رد می‌شود و فقط با تأیید گام آخر نهایی می‌شود؛ رد در هر گام نهایی است.
          مدیر بیمارستان به‌عنوان مقام مافوق در هر گامی می‌تواند اقدام کند و تأیید مرخصی خود شخص همیشه ممنوع است.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: '#68707a' }}>شروع از پیش‌فرض بخشی:</span>
          {CHAIN_PRESETS.map(p => (
            <button key={p.id} disabled={!canEdit} onClick={() => { setChain([...p.chain]); setPresetId(p.id); }}>
              {p.label}
            </button>
          ))}
        </div>
        {(() => {
          const matched = presetId
            ? CHAIN_PRESETS.find(p => p.id === presetId) ?? null
            : matchChainPreset(chain);
          return (
            <p style={{ background: '#f6f8f7', border: '1px solid #e3ddd2', borderRadius: 10, padding: 10, fontSize: 13 }}>
              {matched
                ? <>پیش‌فرض «{matched.label}»: {matched.note}</>
                : 'زنجیرهٔ سفارشی — با هیچ‌یک از پیش‌فرض‌های بخشی یکسان نیست. برای نیروهای مسلح، سقف روزهای هر گام را حتماً از آیین‌نامهٔ داخلی بیمارستان بگیرید؛ پیش‌فرض عمومی وجود ندارد.'}
            </p>
          );
        })()}
        {chain.map((role, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span>گام {fa(i + 1)}:</span>
            <select value={role} disabled={!canEdit}
              onChange={e => editChain(chain.map((r, j) => (j === i ? e.target.value : r)))}>
              {CHAIN_ROLES.map(r => <option key={r} value={r}>{ROLE_FA[r]}</option>)}
            </select>
            {canEdit && chain.length > 1 && (
              <button onClick={() => editChain(chain.filter((_, j) => j !== i))}>حذف گام</button>
            )}
          </div>
        ))}
        {canEdit && chain.length < 4 && (
          <button onClick={() => editChain([...chain, 'hospital_admin'])}>+ افزودن گام</button>
        )}
      </section>

      <section style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>جدول کاهش ساعت موظفی — سابقه (قانون بهره‌وری)</h2>
        <p style={{ color: '#68707a', fontSize: 13 }}>
          در قانون، کاهش به‌صورت «ساعت در هفته» است (سابقهٔ ۰ تا ۴ سال: ۱ ساعت، تا سقف ۵ ساعت برای ۱۶ سال به بالا)
          و این‌جا معادل ماهانه‌اش از ساعت موظفی ماه کم می‌شود. سقف مجموع کاهش هفتگی طبق قانون ۸ ساعت است.
          جدول هر بیمارستان جداست تا آیین‌نامهٔ داخلی همان مرکز (مثلاً نسخهٔ لشکری) عیناً وارد شود.
        </p>
        {bands.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <span>سابقه از</span>
            <input type="number" style={input} disabled={!canEdit} value={b.minYears}
              onChange={e => setBands(bands.map((x, j) => (j === i ? { ...x, minYears: Number(e.target.value) } : x)))} />
            <span>تا</span>
            <input type="number" style={input} disabled={!canEdit} value={b.maxYears}
              onChange={e => setBands(bands.map((x, j) => (j === i ? { ...x, maxYears: Number(e.target.value) } : x)))} />
            <span>سال ← کاهش</span>
            <input type="number" style={input} disabled={!canEdit} value={b.deduction}
              onChange={e => setBands(bands.map((x, j) => (j === i ? { ...x, deduction: Number(e.target.value) } : x)))} />
            <span>ساعت در ماه</span>
            {canEdit && <button onClick={() => setBands(bands.filter((_, j) => j !== i))}>حذف</button>}
          </div>
        ))}
        {canEdit && (
          <button onClick={() => setBands([...bands, { minYears: 0, maxYears: 99, deduction: 0 }])}>+ افزودن بازه</button>
        )}
        <h3 style={{ fontSize: 14 }}>ساعت پایهٔ ماهانه بر حسب وضعیت استخدامی</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {Object.entries(baseHours).map(([status, hours]) => (
            <label key={status} style={{ fontSize: 13 }}>
              {status}:{' '}
              <input type="number" style={input} disabled={!canEdit} value={hours}
                onChange={e => setBaseHours({ ...baseHours, [status]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
      </section>

      {canEdit && <button onClick={save} style={{ padding: '8px 22px' }}>ذخیرهٔ تنظیمات</button>}
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
