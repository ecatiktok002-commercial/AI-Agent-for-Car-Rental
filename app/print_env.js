const fs = require('fs');
console.log("Env vars attached to this workspace:");
for (const key in process.env) {
  if (key.toLowerCase().includes('supabase') || key.toLowerCase().includes('url') || key.toLowerCase().includes('project')) {
         console.log(key, "=>", process.env[key]);
  }
}
