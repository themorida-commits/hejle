import { useToastStore, type ToastKind } from '../store/toast';

const KIND_STYLE: Record<ToastKind, { border: string; bg: string; icon: string }> = {
  success: { border: '#16a34a', bg: '#f0fdf4', icon: '✓' },
  error: { border: '#e11d48', bg: '#fff1f2', icon: '!' },
  info: { border: '#004E72', bg: '#DCE9F0', icon: 'i' },
};

/** اعلان‌های گذرا — پایینِ سمت چپ (انتهای دید در RTL)، روی همهٔ صفحات از Layout نصب می‌شود. */
export default function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', bottom: 18, left: 18, zIndex: 120, display: 'flex',
        flexDirection: 'column', gap: 8, maxWidth: 420,
      }}
    >
      {toasts.map((t) => {
        const k = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            className="toast-in"
            role="status"
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff',
              border: '1px solid #e2e8f0', borderInlineStart: `3px solid ${k.border}`,
              borderRadius: 12, boxShadow: '0 8px 20px -6px rgb(15 23 42 / 0.18)',
              padding: '10px 12px', fontSize: 13, lineHeight: 1.8, color: '#0A2735',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%', background: k.bg, color: k.border,
                fontWeight: 800, fontSize: 12, flexShrink: 0, marginTop: 2,
              }}
            >
              {k.icon}
            </span>
            <span style={{ flex: 1 }}>{t.text}</span>
            {t.actionLabel && t.onAction && (
              <button
                onClick={() => { t.onAction?.(); dismiss(t.id); }}
                style={{
                  background: 'transparent', border: 'none', boxShadow: 'none', color: '#004E72',
                  fontWeight: 800, fontSize: 12.5, padding: '2px 6px', cursor: 'pointer', flexShrink: 0,
                }}
              >
                {t.actionLabel}
              </button>
            )}
            <button
              aria-label="بستن اعلان"
              onClick={() => dismiss(t.id)}
              style={{
                background: 'transparent', border: 'none', boxShadow: 'none', color: '#94a3b8',
                fontSize: 14, padding: '0 2px', cursor: 'pointer', flexShrink: 0, lineHeight: 1.4,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
