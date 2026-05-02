import { Handler } from "@netlify/functions";
import { connectToMongoDB, Medication } from "../../api/lib/db";

export const handler: Handler = async (event) => {
  console.log("METHOD:", event.httpMethod);
  console.log("BODY:", event.body);

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
      const data = event.body ? JSON.parse(event.body) : {};
      if (!data || !data.name) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Medication name is required" })
        };
      }

      // Handle frontend field naming mapping
      const medData = {
        name: data.name,
        dosage: data.dosage,
        timing: data.time || data.timing,
        frequency: data.frequency || "Daily",
        taken: data.taken === 1 || data.taken === true,
        lastTakenDate: data.last_taken_date || data.lastTakenDate
      };

      const med = new Medication(medData);
      await med.save();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Medication added successfully",
          med
        }),
      };
    }

    if (event.httpMethod === "PUT") {
      const id = event.queryStringParameters?.id || event.path.split("/").pop();
      if (!id || id === "medications") {
        return { statusCode: 400, body: JSON.stringify({ error: "ID required" }) };
      }

      const data = event.body ? JSON.parse(event.body) : {};
      
      // Handle frontend field naming mapping
      const updateData: any = {};
      if (data.name) updateData.name = data.name;
      if (data.dosage) updateData.dosage = data.dosage;
      if (data.time || data.timing) updateData.timing = data.time || data.timing;
      if (data.frequency) updateData.frequency = data.frequency;
      if (data.taken !== undefined) updateData.taken = data.taken === 1 || data.taken === true;
      if (data.last_taken_date || data.lastTakenDate) updateData.lastTakenDate = data.last_taken_date || data.lastTakenDate;

      const med = await (Medication as any).findOneAndUpdate({ _id: id }, updateData, { new: true });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Medication updated successfully",
          med
        }),
      };
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id || event.path.split("/").pop();
      if (!id || id === "medications") {
        return { statusCode: 400, body: JSON.stringify({ error: "ID required" }) };
      }
      
      await (Medication as any).deleteOne({ _id: id });
      return { 
        statusCode: 200, 
        body: JSON.stringify({ message: "Medication deleted successfully" }) 
      };
    }

    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: "Method not allowed" }) 
    };
  } catch (error: any) {
    console.error("Medication error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
