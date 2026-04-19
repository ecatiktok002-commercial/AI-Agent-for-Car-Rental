import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6';

const supabaseUrl = process.env.EXTERNAL_SUPABASE_URL || 'https://xxx.supabase.co';
const supabaseKey = process.env.EXTERNAL_SUPABASE_ANON_KEY || 'xxx';
const extSupabase = createClient(supabaseUrl, supabaseKey);

const subscriberId = 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd';

async function testRPC(dateStr) {
  const { data, error } = await extSupabase.rpc('check_car_availability', {
    p_model: 'Saga',
    p_date: dateStr,
    p_subscriber_id: subscriberId
  });
  console.log('Tested with:', dateStr);
  console.log('Result:', data);
  if (error) console.error('Error:', error);
}

async function run() {
  await testRPC('2026-04-19');
  await testRPC('2026-04-19 19:00:00');
  await testRPC('2026-04-19T19:00:00+08:00');
  await testRPC('2026-04-19T11:00:00Z');
  await testRPC('2026-04-19 11:00:00'); 
}
run();
