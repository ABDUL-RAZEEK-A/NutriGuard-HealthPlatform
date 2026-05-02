import { Handler } from "@netlify/functions";
import { connectToMongoDB, WaterLog } from "../../api/lib/db";

export const handler: Handler = async (event) => {
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
      const { amount } = JSON.parse(event.body || "{}");
      const log = new WaterLog({ amount });
      await log.save();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(log),
      };
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) return { statusCode: 400, body: "ID required" };
      await WaterLog.findByIdAndDelete(id);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (error: any) {
    console.error("Water error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
