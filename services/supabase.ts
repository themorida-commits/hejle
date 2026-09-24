import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.',
  );
}

export const supabase: SupabaseClient = createBrowserClient(
  supabaseUrl,
  supabasePublishableKey,
);

export const supabaseConfig = {
  url: supabaseUrl,
  publishableKey: supabasePublishableKey,
};
