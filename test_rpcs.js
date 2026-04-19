import fs from 'fs';

const url = "https://czurhanyrjgeicnbrnev.supabase.co/rest/v1/rpc/";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";

async function test(rpc) {
  const res = await fetch(url + rpc, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      p_model: "Saga",
      p_date: "2026-04-19 19:00",
      p_subscriber_id: 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd'
    })
  });
  if (res.status === 200) {
     console.log(`RPC Exists! ${rpc} =>`, await res.json());
  } else {
     // console.log(`RPC ${rpc} failed`);
  }
}

async function run() {
  await test("check_car_availability_with_time");
  await test("check_availability_with_time");
  await test("check_car_availability_time");
  await test("check_availability");
  await test("get_availability");
  await test("get_car_availability");
}
run();
