// AI Service powered by Groq
// This service handles meal analysis, recommendations, and chat using Groq's LLMs.

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

export interface Recommendation {
  title: string;
  description: string;
  type: 'food' | 'meal' | 'lifestyle';
  reason: string;
}

const SYSTEM_INSTRUCTION = `You are the core AI intelligence for a 'Disease-Aware Smart Nutrition Web Application'. Your purpose is to process user meal logs (text or images) and provide personalized, disease-specific health analysis.
Your Operational Steps:
1. Food Recognition & Parsing: Analyze the provided food image or text log to identify all food items and their estimated portion sizes.
2. Nutritional Calculation Engine: Calculate the total calories and breakdown the macronutrients (proteins, carbohydrates, fats), while estimating essential micronutrients.
3. Disease Rule Engine: Evaluate the calculated nutrients against the user's specific health conditions (specifically applying rules for Diabetes, Obesity, and Hypertension). Flag any dietary constraints or violations (e.g., excessive sugar for a diabetic profile).
4. Personalized Recommendations: Generate actionable dietary advice tailored to the user's BMI, existing health status, and fitness goals.

Output Format Expectation:
Always respond in a structured JSON format.`;

async function callGroqApi(messages: any[], useVision: boolean = false) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set in .env");
  }

  // Use llama-3.2-90b-vision-preview for images, llama-3.3-70b-versatile for text
  const model = useVision ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 1024,
        temperature: 0.5,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("Invalid Groq response: Missing content");
    }

    return text;
  } catch (error) {
    console.error(`❌ Groq API call failed (${model}):`, error);
    throw error;
  }
}

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
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
  const userPrompt = `User Profile: ${JSON.stringify(profile)}
  ${mealData.text ? `Meal Description: ${mealData.text}` : ''}
  
  Return ONLY valid JSON in this format:
  {
    "recognized_meal_items": [{"item": "string", "estimated_portion": "string"}],
    "nutritional_breakdown": {
      "total_calories": number,
      "proteins_g": number,
      "carbs_g": number,
      "fats_g": number
    },
    "disease_rule_alerts": ["string"],
    "progress_insights": ["string"],
    "estimated_expense": number
  }`;

  const messages: any[] = [
    { role: "system", content: SYSTEM_INSTRUCTION },
  ];

  if (mealData.imageBase64 && mealData.mimeType) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${mealData.mimeType};base64,${mealData.imageBase64}`
          }
        }
      ]
    });
  } else {
    messages.push({ role: "user", content: userPrompt });
  }

  const responseText = await callGroqApi(messages, !!mealData.imageBase64);
  return extractJson(responseText);
}

export async function getPersonalizedRecommendations(
  profile: UserProfile,
  pastMeals: any[]
): Promise<Recommendation[]> {
  const simplifiedMeals = pastMeals && pastMeals.length > 0 
    ? pastMeals.slice(0, 10).map(meal => ({
        timestamp: meal.timestamp,
        meal_items: meal.meal_items,
        calories: meal.calories,
        expense: meal.expense
      })) 
    : [];

  const prompt = `Based on the user's health profile and past meal history, provide ${simplifiedMeals.length > 0 ? '5' : '3'} personalized recommendations.
  User Profile: ${JSON.stringify(profile)}
  Past Meals: ${JSON.stringify(simplifiedMeals)}

  Return a JSON object with a "recommendations" array. Each item must have: title, description, type (food/meal/lifestyle), and reason.`;

  const messages = [
    { role: "system", content: "You are a personalized nutrition expert. Return ONLY JSON." },
    { role: "user", content: prompt }
  ];

  const responseText = await callGroqApi(messages);
  const data = extractJson(responseText);
  
  // Handle different potential JSON structures from Groq
  const recs = data.recommendations || data;
  return Array.isArray(recs) ? recs : [];
}

export async function chatWithNutritionist(
  profile: UserProfile,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  message: string
) {
  const systemInstruction = `You are a helpful nutritionist chatbot for the NutriGuard app. 
  The user profile: ${JSON.stringify(profile)}.
  Answer concisely (under 50 words). Be practical and evidence-based.`;

  const messages = [
    { role: "system", content: systemInstruction },
    ...history.map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.parts[0].text
    })),
    { role: "user", content: message }
  ];

  // For chat, we don't necessarily need json_object, so we'll use a simpler call if needed
  // but callGroqApi currently enforces it. Let's adjust callGroqApi to make it optional.
  
  const apiKey = process.env.GROQ_API_KEY;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq chat error: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that.";
}
