import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function test() {
  try {
    console.log("Testing gemini-3.1-flash-lite-preview...");
    const res = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: "Hello"
    });
    console.log("Success:", res.text);
  } catch (e: any) {
    console.error("Error 1:", e.message);
  }

  try {
    console.log("Testing gemini-3-flash-preview...");
    const res = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Hello"
    });
    console.log("Success:", res.text);
  } catch (e: any) {
    console.error("Error 2:", e.message);
  }

  try {
    console.log("Testing gemini-2.5-flash...");
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Hello"
    });
    console.log("Success:", res.text);
  } catch (e: any) {
    console.error("Error 3:", e.message);
  }
}

test();
