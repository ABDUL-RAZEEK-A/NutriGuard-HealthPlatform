import { Handler } from "@netlify/functions";
import { connectToMongoDB, Meal } from "../../api/lib/db";

export const handler: Handler = async (event) => {
  console.log("METHOD:", event.httpMethod);
  console.log("BODY:", event.body);

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
      const data = event.body ? JSON.parse(event.body) : {};
      if (!data || Object.keys(data).length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid meal data" })
        };
      }

      const meal = new Meal(data);
      await meal.save();
      
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: "Meal saved successfully",
          meal 
        }),
      };
    }

    if (event.httpMethod === "DELETE") {
      const id = event.path.split("/").pop();
      if (!id || id === "meals") {
        return { statusCode: 400, body: JSON.stringify({ error: "ID required" }) };
      }
      
      await (Meal as any).deleteOne({ _id: id });
      return { 
        statusCode: 200, 
        body: JSON.stringify({ message: "Meal deleted successfully" }) 
      };
    }

    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: "Method not allowed" }) 
    };
  } catch (error: any) {
    console.error("Meals error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
