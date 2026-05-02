import { Handler } from "@netlify/functions";
import { connectToMongoDB, Profile, Meal } from "../../api/lib/db";
import { getPersonalizedRecommendations } from "../../api/services/geminiService";

export const handler: Handler = async (event) => {
  try {
    await connectToMongoDB();

    if (event.httpMethod === "GET") {
      const profile = await Profile.findOne().sort({ _id: -1 });
      if (!profile) {
        return { statusCode: 400, body: JSON.stringify({ error: "Profile required" }) };
      }

      const pastMeals = await Meal.find().sort({ timestamp: -1 }).limit(10);
      const recommendations = await getPersonalizedRecommendations(profile, pastMeals);
      
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recommendations),
      };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (error: any) {
    console.error("Recommendations error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
