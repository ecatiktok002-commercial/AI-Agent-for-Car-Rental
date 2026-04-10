import { GoogleGenAI } from "@google/genai";

async function test() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.list();
    for await (const model of response) {
      console.log(model.name);
    }
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

test();
