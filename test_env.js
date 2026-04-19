import fs from 'fs';

for (const key in process.env) {
  if (key.includes('SUB') || key.includes('SUBSCRIBER')) {
     console.log(key, "=>", process.env[key]);
  }
}
