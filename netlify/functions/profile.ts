import { Handler } from "@netlify/functions";
import { connectToMongoDB, Profile } from "../../api/lib/db";

export const handler: Handler = async (event) => {
  console.log("METHOD:", event.httpMethod);
  console.log("BODY:", event.body);

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
      const data = event.body ? JSON.parse(event.body) : {};
      if (!data || Object.keys(data).length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid profile data" })
        };
      }

      const profile = await (Profile as any).findOneAndUpdate(
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

    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: "Method not allowed" }) 
    };
  } catch (error: any) {
    console.error("Profile error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
