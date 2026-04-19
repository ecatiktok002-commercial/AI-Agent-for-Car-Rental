import fs from 'fs';

const url = "https://czurhanyrjgeicnbrnev.supabase.co/rest/v1/rpc/check_car_availability";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";

async function test(model, date) {
  const res = await fetch(url + "?select=*", {
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
  console.log(`Params: ${date} =>`, data);
}

async function run() {
  await test("Saga", 1776600000000);
  await test("Saga", "19-04-2026");
}
run();
