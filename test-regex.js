const fetchImageForGemini = async (url) => {
  return { inlineData: { data: "base64", mimeType: "image/jpeg" } };
};

async function test() {
  const rawContents = [
    { role: 'user', text: "Here is my receipt: [UPLOADED_IMAGE: https://example.com/receipt.jpg]" }
  ];

  const contents = [];
  for (const msg of rawContents) {
    let parts = [];
    const imageRegex = /\[(?:IMAGE_RECEIPT|UPLOADED_IMAGE):\s*(https?:\/\/[^\]]+)\]/g;
    let lastIndex = 0;
    let match;
    while ((match = imageRegex.exec(msg.text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: msg.text.substring(lastIndex, match.index) });
      }
      parts.push({ text: `[UPLOADED_IMAGE: ${match[1]}]` });
      const imageData = await fetchImageForGemini(match[1]);
      if (imageData) {
        parts.push(imageData);
      }
      lastIndex = imageRegex.lastIndex;
    }
    if (lastIndex < msg.text.length) {
      parts.push({ text: msg.text.substring(lastIndex) });
    }

    if (contents.length === 0) {
      if (msg.role === 'user') {
        contents.push({ role: msg.role, parts: parts });
      }
    } else {
      if (contents[contents.length - 1].role === msg.role) {
        contents[contents.length - 1].parts.push(...parts);
      } else {
        contents.push({ role: msg.role, parts: parts });
      }
    }
  }
  console.log(JSON.stringify(contents, null, 2));
}

test();
