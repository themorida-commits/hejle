import type { ReactNode } from 'react';

// ── حالت خالیِ طراحی‌شده (دور ۲۳ — موج ۱ UI، الگوی NN/g) ──────────────────────
// سه وضعیت از هم جدا می‌شوند چون قدم بعدی هرکدام فرق دارد:
//  - not-created: هنوز چیزی ساخته نشده → مسیر مستقیم به ساخت
//  - filtered: فیلتر/جست‌وجو صفر کرده → مسیر پاک‌کردن فیلتر
//  - empty: واقعاً خالی است و کاربر کاری ندارد → فقط وضعیت را می‌گوید
export type EmptyStateVariant = 'not-created' | 'filtered' | 'empty';

export default function EmptyState({
  variant, title, hint, actionLabel, onAction, children,
}: {
  variant: EmptyStateVariant;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        border: variant === 'not-created' ? '1.5px dashed #cbd5e1' : '1px solid #e2e8f0',
        background: variant === 'empty' ? '#f0fdf4' : '#fff',
        borderRadius: 12, padding: '18px 20px', textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: '#0A2735' }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4, lineHeight: 1.9 }}>{hint}</div>}
      {children}
      {actionLabel && onAction && (
        <button onClick={onAction} style={{ marginTop: 10, padding: '7px 18px' }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
