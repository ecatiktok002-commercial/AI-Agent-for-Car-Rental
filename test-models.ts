import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function test() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hello"
    });
    console.log("gemini-2.0-flash:", response.text);
  } catch (e: any) {
    console.error("Error 2.0:", e.message);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Hello"
    });
    console.log("gemini-1.5-flash:", response.text);
  } catch (e: any) {
    console.error("Error 1.5:", e.message);
  }
}

test();
