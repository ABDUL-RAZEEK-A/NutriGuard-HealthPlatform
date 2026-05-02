import { Handler } from "@netlify/functions";
import { connectToMongoDB, Profile, Meal } from "../../api/lib/db";
import { getPersonalizedRecommendations } from "../../api/services/geminiService";

export const handler: Handler = async (event) => {
  console.log("METHOD:", event.httpMethod);

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    await connectToMongoDB();

    const profile = await Profile.findOne().sort({ _id: -1 });
    if (!profile) {
      return { 
        statusCode: 200, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([]) // Return empty array if no profile
      };
    }

    const pastMeals = await Meal.find().sort({ timestamp: -1 }).limit(10);
    const recommendations = await getPersonalizedRecommendations(profile as any, pastMeals);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recommendations),
    };
  } catch (error: any) {
    console.error("Recommendations error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
