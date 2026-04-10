import { createClient } from "@supabase/supabase-js";

const EXT_URL = "https://czurhanyrjgeicnbrnev.supabase.co";
const EXT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";
const extSupabase = createClient(EXT_URL, EXT_KEY);

async function test() {
  console.log("Testing get_all_car_models...");
  const res1 = await extSupabase.rpc('get_all_car_models', {
    p_subscriber_id: 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd'
  });
  console.log("Res1:", res1);
}

test();
