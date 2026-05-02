import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";

async function testGemini() {
  try {
    const genAI = new GoogleGenAI({ apiKey: API_KEY });
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: "Hello, say hi back." }] }],
    });
    console.log("Response:", response.text);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testGemini();
