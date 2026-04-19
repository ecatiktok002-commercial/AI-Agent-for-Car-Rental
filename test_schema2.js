import fs from 'fs';

const url = "https://czurhanyrjgeicnbrnev.supabase.co/rest/v1/";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXJoYW55cmpnZWljbmJybmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTExMDEsImV4cCI6MjA4NzQyNzEwMX0.LV4hsQEazpbv8AcLDrEASg8s3uGKmvMJ0FrvMOX6AWQ";

async function run() {
  const res = await fetch(url + '?apikey=' + key);
  const data = await res.json();
  if (data.paths) {
     const paths = Object.keys(data.paths).filter(p => p.includes('rpc'));
     console.log('RPC Routes:', paths);
  } else {
     console.log("No paths found, got:", Object.keys(data));
  }
}
run();
