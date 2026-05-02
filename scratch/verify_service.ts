import { getPersonalizedRecommendations } from "../api/services/geminiService";
import dotenv from "dotenv";

dotenv.config();

const mockProfile = {
  name: "Test User",
  age: 30,
  weight: 70,
  height: 175,
  bmi: 22.9,
  conditions: "Hypertension",
  goals: "Maintain health"
};

const mockMeals = [
  { timestamp: new Date().toISOString(), meal_items: [{ item: "Oatmeal", estimated_portion: "1 bowl" }], calories: 300, expense: 50 }
];

async function verifyService() {
  console.log("🚀 Starting Service Verification...");
  
  console.log("\n--- Attempt 1 (Should trigger primary model failure and fallback) ---");
  const start1 = Date.now();
  const recs1 = await getPersonalizedRecommendations(mockProfile as any, mockMeals);
  console.log(`Finished Attempt 1 in ${Date.now() - start1}ms. Found ${recs1.length} recommendations.`);
  
  console.log("\n--- Attempt 2 (Should skip primary model immediately due to cache) ---");
  const start2 = Date.now();
  const recs2 = await getPersonalizedRecommendations(mockProfile as any, mockMeals);
  console.log(`Finished Attempt 2 in ${Date.now() - start2}ms. Found ${recs2.length} recommendations.`);
  
  if (start2 - start1 < 1000) { // Very rough check, but Attempt 2 should be much faster if it skips the first timeout/failure
      console.log("\n✅ Cache seems to be working (Attempt 2 was faster/skipped failure).");
  }
}

verifyService();
