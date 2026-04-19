import fs from 'fs';

const url = "https://czurhanyrjgeicnbrnev.supabase.co/rest/v1/rpc/check_car_availability";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";

async function test(model, date) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      p_model: model,
      p_date: date,
      p_subscriber_id: 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd'
    })
  });
  const data = await res.json();
  console.log(`Model: ${model}, Date: ${date} =>`, data);
}

async function run() {
  for (let hour = 0; hour < 24; hour++) {
    for (const model of ["PROTON SAGA", "PERODUA AXIA", "PERODUA BEZZA"]) {
        const hStr = String(hour).padStart(2, '0');
        await test(model, `2026-04-19 ${hStr}:00:00`);
    }
  }
}
run();
