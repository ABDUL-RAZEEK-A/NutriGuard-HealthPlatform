import { Handler } from "@netlify/functions";
import { connectToMongoDB, WaterLog } from "../../api/lib/db";

export const handler: Handler = async (event) => {
  console.log("METHOD:", event.httpMethod);
  console.log("BODY:", event.body);

  try {
    await connectToMongoDB();

    if (event.httpMethod === "GET") {
      const logs = await WaterLog.find().sort({ timestamp: -1 }).limit(100);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logs),
      };
    }

    if (event.httpMethod === "POST") {
      const data = event.body ? JSON.parse(event.body) : {};
      if (!data || (!data.amount && !data.amount_ml)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Amount is required" })
        };
      }

      const log = new WaterLog({ 
        amount: data.amount || data.amount_ml 
      });
      await log.save();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Water logged successfully",
          log
        }),
      };
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id || event.path.split("/").pop();
      if (!id || id === "water") {
        return { statusCode: 400, body: JSON.stringify({ error: "ID required" }) };
      }
      
      await (WaterLog as any).deleteOne({ _id: id });
      return { 
        statusCode: 200, 
        body: JSON.stringify({ message: "Water log deleted" }) 
      };
    }

    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: "Method not allowed" }) 
    };
  } catch (error: any) {
    console.error("Water error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
