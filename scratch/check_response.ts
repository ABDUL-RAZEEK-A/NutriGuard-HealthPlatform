import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || "";

async function testResponse() {
  try {
    const genAI = new GoogleGenAI({ apiKey: API_KEY });
    const response = await genAI.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ parts: [{ text: "Hi" }] }],
    });
    console.log("Response Keys:", Object.keys(response));
    console.log("Response Type of text:", typeof (response as any).text);
    if (typeof (response as any).text === 'function') {
      console.log("Text (method):", (response as any).text());
    } else {
      console.log("Text (property):", (response as any).text);
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testResponse();
