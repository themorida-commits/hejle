import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not configured yet.');
}

export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseAnonKey || '');

export const supabaseConfig = {
  url: supabaseUrl || '',
  anonKey: supabaseAnonKey || '',
};
