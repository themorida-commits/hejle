import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// کلاینت سوپابیس نسخهٔ ۲ — کلیدها فقط از متغیر محیطی می‌آیند، هیچ کلیدی در کد نیست.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
);
