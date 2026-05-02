import { Handler } from "@netlify/functions";
import { connectToMongoDB, Profile } from "../../api/lib/db";

export const handler: Handler = async (event) => {
  try {
    await connectToMongoDB();

    if (event.httpMethod === "GET") {
      const profile = await Profile.findOne().sort({ _id: -1 });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile || {}),
      };
    }

    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");
      const profile = await Profile.findOneAndUpdate(
        {},
        { ...data, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (error: any) {
    console.error("Profile error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
