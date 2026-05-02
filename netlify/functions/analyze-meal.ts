import { Handler } from "@netlify/functions";
import { connectToMongoDB, Profile } from "../../api/lib/db";
import { analyzeMeal } from "../../api/services/geminiService";

export const handler: Handler = async (event) => {
  console.log("METHOD:", event.httpMethod);
  console.log("BODY:", event.body);

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    await connectToMongoDB();
    
    const data = event.body ? JSON.parse(event.body) : {};
    if (!data || Object.keys(data).length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid input" })
      };
    }

    const { text, imageBase64, mimeType } = data;
    
    const profile = await Profile.findOne().sort({ _id: -1 });
    if (!profile) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: "Please complete your profile first" }) 
      };
    }

    const analysis = await analyzeMeal(profile as any, { text, imageBase64, mimeType });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysis),
    };
  } catch (error: any) {
    console.error("Analysis error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
