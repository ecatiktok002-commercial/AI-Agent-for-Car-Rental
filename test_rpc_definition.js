import fs from 'fs';

const url = "https://czurhanyrjgeicnbrnev.supabase.co/rest/v1/";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";

async function run() {
  const res = await fetch(url, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Accept': 'application/openapi+json'
    }
  });
  const data = await res.json();
  const paths = data.paths;
  if (!paths) {
     console.log("No paths:", data);
     return;
  }
  if (paths['/rpc/check_car_availability']) {
    console.log("Found check_car_availability method params:", paths['/rpc/check_car_availability'].post.parameters);
  } else {
    console.log("RPC not found.");
  }
}
run();
