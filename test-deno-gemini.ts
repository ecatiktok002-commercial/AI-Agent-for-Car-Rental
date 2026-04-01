const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;

const payload = {
  contents: [{ role: 'user', parts: [{ text: "Hello" }] }]
};

const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
