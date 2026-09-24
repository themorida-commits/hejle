import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before running this check.');
}

const supabase = createClient(supabaseUrl, supabasePublishableKey);

async function main() {
  const { data, error } = await supabase.from('app_data').select('id').limit(1);

  if (error) {
    console.error('Supabase connection check failed:');
    console.error(error.message);
    process.exit(1);
  }

  console.log('Supabase connection is working.');
  console.log(JSON.stringify(data, null, 2));
}

main();
