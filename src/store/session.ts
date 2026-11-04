import { create } from 'zustand';

// وضعیت نشست و زمینهٔ سازمانی (بیمارستان/بخش فعال). در حالت supabase مقدارها
// از AuthGate می‌آیند (نشست واقعی + عضویت‌های کاربر)؛ در حالت demo خالی می‌ماند.
export type SessionRole = 'hospital_admin' | 'hr_admin' | 'ward_manager' | 'staff';

interface SessionState {
  userId: string | null;
  email: string | null;
  hospitalId: string | null;
  wardId: string | null;
  role: SessionRole | null;
  setContext: (ctx: Partial<Omit<SessionState, 'setContext' | 'setEmail' | 'clear'>>) => void;
  setEmail: (email: string | null) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userId: null,
  email: null,
  hospitalId: null,
  wardId: null,
  role: null,
  setContext: (ctx) => set(ctx),
  setEmail: (email) => set({ email }),
  clear: () => set({ userId: null, email: null, hospitalId: null, wardId: null, role: null }),
}));
