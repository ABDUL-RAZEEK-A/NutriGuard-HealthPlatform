import { GoogleGenAI, Type } from "@google/genai";
const GEMINI_API_KEY= "AIzaSyAFuNpls-uNwd0nSJgQsg-e42WSBUsdquY,AIzaSyAEpbPMBvho4JKfJ1Cat3fu335zDIHZW2s,AIzaSyC-_lyQDeC-4OC_HqGvP-8a1m8ioPoxzeE";
function getApiKeys(): string[] {
  const keys = [
    ...(process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(/[,;\s]+/).map(k => k.trim()).filter(Boolean) : []),
    ...(process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY.trim()] : []),
  ].filter(Boolean);

  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) {
    throw new Error("GEMINI_API_KEY or GEMINI_API_KEYS is not set. Please add your Gemini API key(s) to the .env file.");
  }
  return uniqueKeys;
}

function getGenAI(apiKey?: string): GoogleGenAI {
  const key = apiKey ?? getApiKeys()[0];
  return new GoogleGenAI({ apiKey: key });
}

async function generateContentWithFallback(params: any) {
  const apiKeys = getApiKeys();
  let lastError: unknown;

  for (const apiKey of apiKeys) {
    try {
      const genAI = getGenAI(apiKey);
      const response = await genAI.models.generateContent(params);
      return response;
    } catch (error) {
      lastError = error;
      console.warn(`Gemini API key fallback: key failed, trying next key.`, { apiKey, error });
    }
  }

  throw new Error(`All Gemini API keys failed. Last error: ${lastError}`);
}

export interface UserProfile {
  name: string;
  age: number;
  weight: number;
  height: number;
  bmi: number;
  conditions: string;
  goals: string;
}

export interface MealAnalysis {
  recognized_meal_items: Array<{ item: string; estimated_portion: string }>;
  nutritional_breakdown: {
    total_calories: number;
    proteins_g: number;
    carbs_g: number;
    fats_g: number;
  };
  disease_rule_alerts: string[];
  progress_insights: string[];
  estimated_expense: number;
}

const SYSTEM_INSTRUCTION = `You are the core AI intelligence for a 'Disease-Aware Smart Nutrition Web Application'. Your purpose is to process user meal logs (text or images) and provide personalized, disease-specific health analysis.
Your Operational Steps:
1. Food Recognition & Parsing: Analyze the provided food image or text log to identify all food items and their estimated portion sizes.
2. Nutritional Calculation Engine: Calculate the total calories and breakdown the macronutrients (proteins, carbohydrates, fats), while estimating essential micronutrients.
3. Disease Rule Engine: Evaluate the calculated nutrients against the user's specific health conditions (specifically applying rules for Diabetes, Obesity, and Hypertension). Flag any dietary constraints or violations (e.g., excessive sugar for a diabetic profile).
4. Personalized Recommendations: Generate actionable dietary advice tailored to the user's BMI, existing health status, and fitness goals.

Output Format Expectation:
Always respond in a structured JSON format.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recognized_meal_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING },
          estimated_portion: { type: Type.STRING },
        },
        required: ["item", "estimated_portion"],
      },
    },
    nutritional_breakdown: {
      type: Type.OBJECT,
      properties: {
        total_calories: { type: Type.NUMBER },
        proteins_g: { type: Type.NUMBER },
        carbs_g: { type: Type.NUMBER },
        fats_g: { type: Type.NUMBER },
      },
      required: ["total_calories", "proteins_g", "carbs_g", "fats_g"],
    },
    disease_rule_alerts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    progress_insights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    estimated_expense: {
      type: Type.NUMBER,
      description: "Estimated cost of the meal in INR (Indian Rupee). Provide a realistic estimate for the Indian context."
    }
  },
  required: ["recognized_meal_items", "nutritional_breakdown", "disease_rule_alerts", "progress_insights", "estimated_expense"],
};

export interface Recommendation {
  title: string;
  description: string;
  type: 'food' | 'meal' | 'lifestyle';
  reason: string;
}

export async function analyzeMeal(
  profile: UserProfile,
  mealData: { text?: string; imageBase64?: string; mimeType?: string }
): Promise<MealAnalysis & { estimated_expense: number }> {
  const parts: any[] = [
    { text: `User Profile: ${JSON.stringify(profile)}` },
  ];

  if (mealData.text) {
    parts.push({ text: `Meal Description: ${mealData.text}` });
  }

  if (mealData.imageBase64 && mealData.mimeType) {
    parts.push({
      inlineData: {
        data: mealData.imageBase64,
        mimeType: mealData.mimeType,
      },
    });
  }

  const response = await generateContentWithFallback({
    model: "gemini-3-flash-preview",
    contents: [{ parts }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  return JSON.parse(response.text);
}

export async function getPersonalizedRecommendations(
  profile: UserProfile,
  pastMeals: any[]
): Promise<Recommendation[]> {
  const hasMeals = pastMeals && pastMeals.length > 0;
  const mealCount = hasMeals ? pastMeals.slice(0, 10).length : 0;
  
  console.log("📊 Recommendation request:", {
    profileName: profile.name,
    profileConditions: profile.conditions,
    totalMeals: pastMeals.length,
    mealsBeingSent: mealCount
  });

  const simplifiedMeals = hasMeals ? pastMeals.slice(0, 10).map(meal => ({
    timestamp: meal.timestamp,
    meal_items: meal.meal_items,
    calories: meal.calories,
    expense: meal.expense
  })) : [];

  const prompt = hasMeals
    ? `Based on the user's health profile and past meal history, provide 5 personalized recommendations.
  User Profile: ${JSON.stringify(profile)}
  Past Meals (last 10): ${JSON.stringify(simplifiedMeals)}

  Recommendations should be specific to their conditions (e.g., Diabetes, Hypertension) and goals.
  Return a JSON array of objects with: title, description, type (food/meal/lifestyle), and reason.`
    : `Based on the user's health profile, provide 3 general healthy eating recommendations.
  User Profile: ${JSON.stringify(profile)}
  The user has no meal logs yet.
  Return a JSON array of objects with: title, description, type (food/meal/lifestyle), and reason.`;

  try {
    const response = await generateContentWithFallback({
      model: "gemini-1.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['food', 'meal', 'lifestyle'] },
              reason: { type: Type.STRING },
            },
            required: ["title", "description", "type", "reason"],
          },
        },
      },
    });

    if (!response.text) {
      console.warn("⚠️ No response text, using fallback");
      return getFallbackRecommendations(profile);
    }

    let result;
    try {
      // Clean response - strip markdown code blocks if present
      let cleanedResponse = response.text.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      result = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.warn("⚠️ Failed to parse JSON, trying regex extraction:", parseError);
      const arrayMatch = response.text.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        try {
          result = JSON.parse(arrayMatch[0]);
        } catch {
          console.warn("Regex extraction failed, using fallback");
          return getFallbackRecommendations(profile);
        }
      } else {
        return getFallbackRecommendations(profile);
      }
    }

    if (!Array.isArray(result)) {
      console.warn("⚠️ Response is not an array, using fallback");
      return getFallbackRecommendations(profile);
    }

    const validResult = result.filter((item: any) => 
      item && typeof item.title === 'string' && 
      typeof item.description === 'string' && 
      typeof item.reason === 'string'
    );

    if (validResult.length === 0) {
      console.warn("⚠️ No valid items after filtering, using fallback");
      return getFallbackRecommendations(profile);
    }

    console.log("✅ Recommendations fetched:", validResult.length, "items");
    return validResult;
  } catch (error: any) {
    console.error("❌ Gemini API error:", error);
    return getFallbackRecommendations(profile);
  }
}

function getFallbackRecommendations(profile: UserProfile): Recommendation[] {
  const base = [
    {
      title: "Eat a Balanced Diet",
      description: "Include proteins, carbohydrates, and fats in every meal for optimal nutrition.",
      type: 'food' as const,
      reason: " Balanced meals help maintain stable blood sugar and provide sustained energy."
    },
    {
      title: "Stay Hydrated",
      description: "Drink at least 8-10 glasses of water daily for optimal metabolism.",
      type: 'lifestyle' as const,
      reason: " Proper hydration supports kidney function and overall health."
    },
    {
      title: "Regular Meal Timing",
      description: "Try to eat meals at consistent times each day for better digestion.",
      type: 'meal' as const,
      reason: " Consistent meal timing helps regulate metabolism and prevents overeating."
    }
  ];

  // Add condition-specific recommendations
  if (profile.conditions.toLowerCase().includes('diabetes')) {
    base.push({
      title: "Monitor Carbohydrate Intake",
      description: "Track your carb consumption and prefer low glycemic index foods.",
      type: 'food' as const,
      reason: " Carb control is essential for blood sugar management in diabetes."
    });
  }

  if (profile.conditions.toLowerCase().includes('hypertension')) {
    base.push({
      title: "Reduce Sodium Intake",
      description: "Limit salt to less than 2,300mg per day; avoid processed foods.",
      type: 'food' as const,
      reason: " Lower sodium helps manage blood pressure effectively."
    });
  }

  if (profile.conditions.toLowerCase().includes('obesity')) {
    base.push({
      title: "Portion Control",
      description: "Use smaller plates and be mindful of portion sizes to manage weight.",
      type: 'lifestyle' as const,
      reason: " Portion awareness helps create a sustainable calorie deficit."
    });
  }

return base.slice(0, 5);
}

export async function chatWithNutritionist(
  profile: UserProfile,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  message: string
) {
  const chat = getGenAI().chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are a helpful nutritionist chatbot for the NutriGuard app. 
      The user has the following profile: ${JSON.stringify(profile)}.
      Answer their questions about nutrition, disease management (Diabetes, Hypertension, Obesity), and meal planning.
      IMPORTANT: Keep your answers very concise, strictly under 50 words. Be practical and evidence-based.`,
    },
    history: history,
  });

  const response = await chat.sendMessage({ message });
  return response.text;
}
