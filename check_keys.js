const fs = require('fs');
for (const key in process.env) {
  if (key.toLowerCase().includes('gemini')) {
         console.log(key, "=>", process.env[key] ? "Set" : "Not Set");
  }
}
