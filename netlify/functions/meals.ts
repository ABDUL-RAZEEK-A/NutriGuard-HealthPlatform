import { Handler } from "@netlify/functions";
import { connectToMongoDB, Meal, Profile } from "../../api/lib/db";
import { analyzeMeal } from "../../api/services/geminiService";

export const handler: Handler = async (event) => {
  try {
    await connectToMongoDB();

    if (event.httpMethod === "GET") {
      const meals = await Meal.find().sort({ timestamp: -1 }).limit(50);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meals),
      };
    }

    if (event.httpMethod === "POST") {
      const { text, image, mimeType } = JSON.parse(event.body || "{}");
      
      const profile = await Profile.findOne().sort({ _id: -1 });
      if (!profile) {
        return { statusCode: 400, body: JSON.stringify({ error: "Please complete your profile first" }) };
      }

      const analysis = await analyzeMeal(profile as any, { text, imageBase64: image, mimeType });

      const meal = new Meal({
        meal_items: analysis.recognized_meal_items,
        calories: analysis.nutritional_breakdown.total_calories,
        proteins: analysis.nutritional_breakdown.proteins_g,
        carbs: analysis.nutritional_breakdown.carbs_g,
        fats: analysis.nutritional_breakdown.fats_g,
        expense: analysis.estimated_expense || 0,
        alerts: analysis.disease_rule_alerts,
        insights: analysis.progress_insights,
      });

      await meal.save();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meal),
      };
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) return { statusCode: 400, body: "ID required" };
      await Meal.findByIdAndDelete(id);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (error: any) {
    console.error("Meals error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
