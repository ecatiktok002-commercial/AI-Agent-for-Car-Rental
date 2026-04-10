import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function test() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: "Hello"
    });
    console.log("gemini-2.0-flash-exp:", response.text);
  } catch (e: any) {
    console.error("Error 2.0-exp:", e.message);
  }
}

test();
