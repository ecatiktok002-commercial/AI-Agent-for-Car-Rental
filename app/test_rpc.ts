import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXT_URL = "https://czurhanyrjgeicnbrnev.supabase.co";
const EXT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";
const extSupabase = createClient(EXT_URL, EXT_KEY);

async function test() {
  const subscriberId = 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd';
  
  console.log("Testing check_car_availability...");
  const res1 = await extSupabase.rpc('check_car_availability', {
    p_model: 'Axia',
    p_date: '2026-04-20',
    p_subscriber_id: subscriberId
  });
  console.log("check_car_availability result:", res1);
  
  console.log("Testing get_all_car_models...");
  const res2 = await extSupabase.rpc('get_all_car_models', {
    p_subscriber_id: subscriberId
  });
  console.log("get_all_car_models result:", res2);
}

test();
