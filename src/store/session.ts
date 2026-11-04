import { create } from 'zustand';

// وضعیت نشست و زمینهٔ سازمانی (بیمارستان/بخش فعال) — در فاز ۱ به احراز هویت وصل می‌شود.
export type SessionRole = 'hospital_admin' | 'hr_admin' | 'ward_manager' | 'staff';

interface SessionState {
  userId: string | null;
  hospitalId: string | null;
  wardId: string | null;
  role: SessionRole | null;
  setContext: (ctx: Partial<Omit<SessionState, 'setContext' | 'clear'>>) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userId: null,
  hospitalId: null,
  wardId: null,
  role: null,
  setContext: (ctx) => set(ctx),
  clear: () => set({ userId: null, hospitalId: null, wardId: null, role: null }),
}));
