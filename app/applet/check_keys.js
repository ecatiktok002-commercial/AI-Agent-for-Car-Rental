import fs from 'fs';
for (const key in process.env) {
  if (key.toLowerCase().includes('gemini') || key.toLowerCase().includes('backup')) {
         console.log(key, "=>", process.env[key] ? "Set" : "Not Set");
  }
}
