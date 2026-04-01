import { GoogleGenAI } from "@google/genai";

async function test() {
  try {
    const ai = new GoogleGenAI({ apiKey: "dummy" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      config: {
        systemInstruction: "You are a helpful assistant.",
      }
    });
    console.log(response.text);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

test();
