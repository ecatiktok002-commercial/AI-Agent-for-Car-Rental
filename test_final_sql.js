import fs from 'fs';

const url_check = "https://czurhanyrjgeicnbrnev.supabase.co/rest/v1/rpc/check_car_availability";
const url_find = "https://czurhanyrjgeicnbrnev.supabase.co/rest/v1/rpc/find_nearest_available_time";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";

async function run() {
  console.log("Testing check_car_availability...");
  const res1 = await fetch(url_check, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ p_model: 'Axia', p_date: '2026-04-19', p_subscriber_id: 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd' })
  });
  console.log("check_car_availability:", res1.status, await res1.text());

  console.log("Testing find_nearest_available_time...");
  const res2 = await fetch(url_find, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ p_model: 'Axia', p_target_datetime: '2026-04-19 22:00:00', p_subscriber_id: 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd' })
  });
  console.log("find_nearest_available_time:", res2.status, await res2.text());
}
run();
