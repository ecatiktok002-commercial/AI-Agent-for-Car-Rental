import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function test() {
  try {
    console.log("Testing gemini-2.0-flash...");
    const res = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hello"
    });
    console.log("Success:", res.text);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

test();
