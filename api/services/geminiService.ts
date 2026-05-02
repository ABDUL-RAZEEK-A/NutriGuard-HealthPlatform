import { GoogleGenAI, Type } from "@google/genai";

// API keys should be provided via environment variables (.env)
function getApiKeys(): string[] {
  // First try to get from environment variables
  const sanitize = (k: string) => k.trim().replace(/^["']|["']$/g, '').replace(/;$/, '');
  
  const envKeys = process.env.GEMINI_API_KEYS 
    ? process.env.GEMINI_API_KEYS.split(/[,;\s]+/).map(sanitize).filter(Boolean)
    : [];
  
  const singleEnvKey = process.env.GEMINI_API_KEY 
    ? [sanitize(process.env.GEMINI_API_KEY)] 
    : [];

  const uniqueKeys = Array.from(new Set([...envKeys, ...singleEnvKey]));
  
  if (uniqueKeys.length === 0) {
    throw new Error("GEMINI_API_KEY or GEMINI_API_KEYS is not set in .env. Please add a valid Gemini API key.");
  }
  
  return uniqueKeys;
}

function getGenAI(apiKey?: string): GoogleGenAI {
  const key = apiKey ?? getApiKeys()[0];
  return new GoogleGenAI({ apiKey: key });
}

// Check if error is a rate limit error (429)
function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as any).status === 429;
  }
  const errorStr = String(error);
  return errorStr.includes('429') || 
         errorStr.includes('rate limit') || 
         errorStr.includes('RESOURCE_EXHAUSTED') ||
         errorStr.includes('quota');
}

// Simple cache for failed models to avoid repeated attempts
const failedModelsCache = new Map<string, { timestamp: number; error: string }>();
const FAIL_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function isModelFailed(model: string): boolean {
  const failed = failedModelsCache.get(model);
  if (!failed) return false;
  if (Date.now() - failed.timestamp > FAIL_CACHE_DURATION) {
    failedModelsCache.delete(model);
    return false;
  }
  return true;
}

async function generateContentWithFallback(params: any) {
  const apiKeys = getApiKeys();
  let lastError: unknown;
  let rateLimitedKeys: string[] = [];

  for (const apiKey of apiKeys) {
    if (rateLimitedKeys.includes(apiKey)) continue;
    
    try {
      const genAI = getGenAI(apiKey);
      const requestedModel = params.model;
      let modelToUse = requestedModel;
      
      // Map futuristic model names to current ones
      if (requestedModel.includes('gemini-3') || requestedModel.includes('2.0')) {
        modelToUse = 'gemini-2.0-flash';
      } else if (requestedModel.includes('flash')) {
        modelToUse = 'gemini-1.5-flash';
      }
      
      const tryModels = [modelToUse, 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      
      for (let i = 0; i < tryModels.length; i++) {
        const currentModel = tryModels[i];
        
        if (isModelFailed(currentModel) && i < tryModels.length - 1) {
          console.log(`ℹ️ Skipping known failed model ${currentModel}, trying next...`);
          continue;
        }

        try {
          const response = await genAI.models.generateContent({ ...params, model: currentModel });
          return response;
        } catch (e: any) {
          const errorMessage = e.message || String(e);
          console.warn(`⚠️ Model ${currentModel} failed: ${errorMessage.substring(0, 100)}...`);
          
          // Cache failure if it's a quota or rate limit issue
          if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('limit')) {
            failedModelsCache.set(currentModel, { timestamp: Date.now(), error: errorMessage });
          }

          if (i === tryModels.length - 1) {
            throw e; // Last model failed
          }
          console.log(`🔄 Attempting fallback to ${tryModels[i+1]}...`);
        }
      }
    } catch (error) {
      lastError = error;
      if (isRateLimitError(error)) {
        rateLimitedKeys.push(apiKey);
        continue;
      }
      console.warn(`❌ Gemini API key failed, trying next key.`, { error });
    }
  }

  if (rateLimitedKeys.length === apiKeys.length && apiKeys.length > 0) {
    throw new Error(`API quota exceeded or rate limit reached on all available keys. Please check your Google AI Studio plan.`);
  }
  
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
    throw new Error(`Gemini API Quota Exceeded. Please provide a fresh API key in .env.`);
  }

  throw new Error(`Gemini API error: ${errorMessage}`);
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

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  // Remove markdown code blocks if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned;
}

function extractJson(text: string): any {
  const cleaned = cleanJsonResponse(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("⚠️ Initial JSON parse failed, trying regex extraction");
    // Try to find anything between { } or [ ]
    const match = cleaned.match(/[\{\[]\s*[\s\S]*[\}\]]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        console.error("❌ Regex JSON extraction failed");
      }
    }
    throw new Error(`Failed to parse AI response as JSON. Raw response: ${text.substring(0, 200)}...`);
  }
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
    model: "gemini-2.0-flash",
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

  try {
    return extractJson(response.text);
  } catch (error) {
    console.error("Failed to parse meal analysis:", error);
    throw error;
  }
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
      model: "gemini-2.0-flash",
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
  // Build conversation history in the format expected by generateContent
  const systemInstruction = `You are a helpful nutritionist chatbot for the NutriGuard app. 
  The user has the following profile: ${JSON.stringify(profile)}.
  Answer their questions about nutrition, disease management (Diabetes, Hypertension, Obesity), and meal planning.
  IMPORTANT: Keep your answers very concise, strictly under 50 words. Be practical and evidence-based.`;

  try {
    // Convert history to contents format for generateContent
    const contents = [...history.map(h => ({
      role: h.role,
      parts: h.parts
    })), {
      role: 'user' as const,
      parts: [{ text: message }]
    }];

    // Use fallback mechanism instead of direct chat
    const response = await generateContentWithFallback({
      model: "gemini-2.0-flash",
      contents,
      config: {
        systemInstruction,
      },
    });

    if (!response.text) {
      throw new Error("Empty response from AI");
    }

    return response.text;
  } catch (error) {
    console.error("❌ Chat error:", error);
    throw error;
  }
}
