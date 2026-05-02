import { Handler } from "@netlify/functions";
import { connectToMongoDB } from "../../api/lib/db";
import mongoose from "mongoose";

export const handler: Handler = async (event, context) => {
  console.log("METHOD:", event.httpMethod);

  try {
    await connectToMongoDB();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        status: "ok", 
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        env: {
          has_mongodb_uri: !!process.env.MONGODB_URI,
          has_gemini_key: !!process.env.GEMINI_API_KEY,
          node_env: process.env.NODE_ENV
        }
      }),
    };
  } catch (error: any) {
    console.error("Health error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
