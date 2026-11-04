import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// کلاینت سوپابیس نسخهٔ ۲ — کلیدها فقط از متغیر محیطی می‌آیند، هیچ کلیدی در کد نیست.
// در محیط Node (تست‌ها) import.meta.env وجود ندارد — خواندن امن از هر دو منبع.
const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
const procEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const url = metaEnv?.VITE_SUPABASE_URL ?? procEnv.VITE_SUPABASE_URL;
const anonKey = metaEnv?.VITE_SUPABASE_ANON_KEY ?? procEnv.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
);
