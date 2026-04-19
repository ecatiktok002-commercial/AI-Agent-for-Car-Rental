import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6';

const EXT_URL = "https://czurhanyrjgeicnbrnev.supabase.co";
const EXT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";
const extSupabase = createClient(EXT_URL, EXT_KEY);

const subscriberId = 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd';

async function testRPC(model, dateStr) {
  console.log(`\nTesting Model: ${model}, Date: ${dateStr}`);
  const { data, error } = await extSupabase.rpc('check_car_availability', {
    p_model: model,
    p_date: dateStr,
    p_subscriber_id: subscriberId
  });
  console.log('Result:', data);
  if (error) console.error('Error:', error);
}

async function run() {
  await testRPC('Saga', '2026-04-19 19:00:00'); // the LLM raw
  await testRPC('Saga', '2026-04-19 11:00:00'); // our converted UTC
  await testRPC('Saga', '2026-04-19 12:30:00'); // 8.30pm converted
  await testRPC('Proton Saga', '2026-04-19 12:30:00'); // 8.30pm converted, precise name (from get_all_cars)
  
  // also what cars does get_all_cars return?
  const { data } = await extSupabase.rpc('get_all_car_models', { p_subscriber_id: subscriberId });
  console.log("All cars:", data);
}

run();
