import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || "";

async function listModels() {
  try {
    const genAI = new GoogleGenAI({ apiKey: API_KEY });
    const models = await genAI.models.list();
    console.log("Models:", JSON.stringify(models, null, 2));
  } catch (error) {
    console.error("List failed:", error);
  }
}

listModels();
