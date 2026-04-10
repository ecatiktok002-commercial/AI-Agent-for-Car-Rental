const url = "https://tnvhriiyuzjhtdqfufmh.supabase.co/functions/v1/whatsapp-agent-core";
const payload = {
  "object": "whatsapp_business_account",
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messages": [
              {
                "from": "1234567890",
                "text": {
                  "body": "hi, ada axia kosong tak 14hb?"
                },
                "type": "text"
              }
            ],
            "contacts": [
              {
                "profile": {
                  "name": "Test User"
                },
                "wa_id": "1234567890"
              }
            ]
          }
        }
      ]
    }
  ]
};

async function test() {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  console.log(res.status);
  console.log(await res.text());
}

test();
