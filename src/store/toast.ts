import { create } from 'zustand';

// ── اعلان‌های گذرا (دور ۲۳ — موج ۱ UI) ────────────────────────────────────────
// جایگزین alert مرورگر: پیام کوتاه + قدم بعدی، و برای اکشن‌های برگشت‌پذیر دکمهٔ
// «بازگردانی» (undo) به‌جای modal تأیید. حداکثر ۴ اعلان هم‌زمان نگه داشته می‌شود.

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'> & { durationMs?: number }) => number;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    const { durationMs = 6000, ...item } = t;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...item, id }] }));
    if (durationMs > 0) setTimeout(() => get().dismiss(id), durationMs);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (text: string, opts?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) =>
    useToastStore.getState().push({ kind: 'success', text, ...opts }),
  error: (text: string, opts?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) =>
    useToastStore.getState().push({ kind: 'error', text, durationMs: 9000, ...opts }),
  info: (text: string, opts?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) =>
    useToastStore.getState().push({ kind: 'info', text, ...opts }),
};
