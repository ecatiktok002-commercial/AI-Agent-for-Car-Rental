const https = require('https');

https.get('https://deno.land/x/postgresjs/mod.js', (res) => {
  console.log('Status:', res.statusCode);
  if (res.statusCode >= 300 && res.statusCode < 400) {
    console.log('Redirect:', res.headers.location);
  }
}).on('error', (e) => {
  console.error(e);
});
