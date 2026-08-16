import { supabase } from '../services/supabase';

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
