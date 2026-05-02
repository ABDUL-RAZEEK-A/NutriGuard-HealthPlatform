import { Handler } from "@netlify/functions";
import { connectToMongoDB, Profile } from "../../api/lib/db";
import { chatWithNutritionist } from "../../api/services/geminiService";

export const handler: Handler = async (event) => {
  try {
    await connectToMongoDB();

    if (event.httpMethod === "POST") {
      const { message, history } = JSON.parse(event.body || "{}");
      
      const profile = await Profile.findOne().sort({ _id: -1 });
      if (!profile) {
        return { statusCode: 400, body: JSON.stringify({ error: "Profile required for chat" }) };
      }

      const response = await chatWithNutritionist(profile as any, history, message);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (error: any) {
    console.error("Chat error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
