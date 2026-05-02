import { Handler } from "@netlify/functions";
import { connectToMongoDB, Medication } from "../../api/lib/db";

export const handler: Handler = async (event) => {
  try {
    await connectToMongoDB();

    if (event.httpMethod === "GET") {
      const meds = await Medication.find();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meds),
      };
    }

    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");
      const med = new Medication(data);
      await med.save();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(med),
      };
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) return { statusCode: 400, body: "ID required" };
      const data = JSON.parse(event.body || "{}");
      const med = await (Medication as any).findOneAndUpdate({ _id: id }, data, { new: true });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(med),
      };
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) return { statusCode: 400, body: "ID required" };
      await (Medication as any).deleteOne({ _id: id });
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (error: any) {
    console.error("Medication error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
