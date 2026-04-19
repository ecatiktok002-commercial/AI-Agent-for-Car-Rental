const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://czurhanyrjgeicnbrnev.supabase.co"; // wait this is ext?
const EXT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";

async function run() {
  const res = await fetch("https://czurhanyrjgeicnbrnev.supabase.co/rest/v1/rpc/get_all_car_models", {
    method: "POST",
    headers: {
      "apikey": EXT_KEY,
      "Authorization": `Bearer ${EXT_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ p_subscriber_id: 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd' })
  });

  const text = await res.text();
  console.log("RPC get_all_car_models:", res.status, text);

  const res2 = await fetch("https://czurhanyrjgeicnbrnev.supabase.co/rest/v1/rpc/check_car_availability", {
    method: "POST",
    headers: {
      "apikey": EXT_KEY,
      "Authorization": `Bearer ${EXT_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ p_subscriber_id: 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd', p_model: 'Axia', p_date: '2026-04-20' })
  });

  const text2 = await res2.text();
  console.log("RPC check_car_availability:", res2.status, text2);
}

run();
