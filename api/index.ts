import express from "express";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { connectToMongoDB, isConnected, Profile, Meal, WaterLog, Medication } from "./lib/db";
import { analyzeMeal, getPersonalizedRecommendations, chatWithNutritionist } from "./services/groqService";
import type { UserProfile } from "./services/groqService";

dotenv.config();
console.log("🔐 Loaded environment variables");
console.log("🚀 Starting NutriGuard Server...");

// Remove local models, use imported ones
console.log("📋 Database models initialized from shared library");

const app = express();

// Database connection middleware for serverless
app.use(async (req, res, next) => {
  if (!isConnected && req.path.startsWith('/api')) {
    await connectToMongoDB();
  }
  next();
});

// ObjectId validation middleware
function validateObjectId(paramName: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const id = req.params[paramName];
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: `${paramName} is required and must be a non-empty string` });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: `${paramName} must be a valid MongoDB ObjectId (24-character hex string)` });
    }
    next();
  };
}

async function setupApp(app: express.Express) {
  // Ensure DB is connected before proceeding
  await connectToMongoDB();

  const PORT = Number(process.env.PORT) || 3000;

  console.log("-----------------------------------------");
  console.log("🛡️  NutriGuard Server: Security Fixes Active");
  console.log("📊 Enhanced Error Diagnostics: Enabled");
  console.log("-----------------------------------------");

  console.log("📝 Configuring middleware...");
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  console.log("✅ Middleware configured: JSON parsing and URL-encoded parsing with 50MB limit");

  console.log("🔗 Registering API routes...");

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      env: {
        has_mongodb_uri: !!process.env.MONGODB_URI,
        has_groq_key: !!process.env.GROQ_API_KEY,
        node_env: process.env.NODE_ENV,
        is_netlify: !!process.env.NETLIFY
      }
    });
  });

  app.get("/api/profile", async (req, res) => {
    try {
      const profile = await Profile.findOne().sort({ _id: -1 });
      res.json(profile || null);
    } catch (error: any) {
      console.error("❌ Error fetching profile:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.post("/api/profile", async (req, res) => {
    try {
      const { name, age, weight, height, bmi, conditions, goals } = req.body;
      const profile = new Profile({ name, age, weight, height, bmi, conditions, goals });
      await profile.save();
      res.json({ id: profile._id });
    } catch (error: any) {
      console.error("❌ Error saving profile:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.get("/api/meals", async (req, res) => {
    try {
      const meals = await Meal.find().sort({ timestamp: -1 });
      res.json(meals);
    } catch (error: any) {
      console.error("❌ Error fetching meals:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.post("/api/meals", async (req, res) => {
    try {
      const { meal_items, calories, proteins, carbs, fats, alerts, insights, expense, timestamp } = req.body;
      const mealLog = new Meal({
        meal_items,
        calories,
        proteins,
        carbs,
        fats,
        alerts,
        insights,
        expense: expense || 0,
        timestamp: timestamp ? new Date(timestamp) : undefined
      });
      await mealLog.save();
      res.json({ id: mealLog._id });
    } catch (error: any) {
      console.error("Error saving meal:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.put("/api/meals/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      const { meal_items, calories, proteins, carbs, fats, alerts, insights, expense } = req.body;
      await Meal.findByIdAndUpdate(id, {
        meal_items,
        calories,
        proteins,
        carbs,
        fats,
        alerts,
        insights,
        expense: expense || 0
      }, {});
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating meal:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.delete("/api/meals/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      await Meal.findByIdAndDelete(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting meal:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.get("/api/water", async (req, res) => {
    try {
      const logs = await WaterLog.find().sort({ timestamp: -1 });
      res.json(logs);
    } catch (error: any) {
      console.error("Error fetching water logs:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.post("/api/water", async (req, res) => {
    try {
      const { amount_ml, timestamp } = req.body;
      const waterLog = new WaterLog({
        amount_ml,
        timestamp: timestamp ? new Date(timestamp) : undefined
      });
      await waterLog.save();
      res.json({ id: waterLog._id });
    } catch (error: any) {
      console.error("Error saving water log:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.delete("/api/water/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      await WaterLog.findByIdAndDelete(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting water log:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.get("/api/medications", async (req, res) => {
    try {
      const meds = await Medication.find();
      res.json(meds);
    } catch (error: any) {
      console.error("Error fetching medications:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.post("/api/medications", async (req, res) => {
    try {
      const { name, dosage, time } = req.body;
      const medication = new Medication({ name, dosage, time });
      await medication.save();
      res.json({ id: medication._id });
    } catch (error: any) {
      console.error("Error saving medication:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.put("/api/medications/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      const { taken, last_taken_date } = req.body;
      await Medication.findByIdAndUpdate(id, { taken, last_taken_date }, {});
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating medication:", error);
      if (error instanceof mongoose.Error.CastError) {
        return res.status(400).json({ error: "Invalid medication ID format" });
      }
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.delete("/api/medications/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      await Medication.findByIdAndDelete(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting medication:", error);
      res.status(500).json({ 
        error: "Database operation failed", 
        message: error.message 
      });
    }
  });

  app.post("/api/analyze-meal", async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[${new Date().toISOString()}] [${requestId}] 🥗 Processing /api/analyze-meal request`, req.body);
    
    try {
      const { profile, text, imageBase64, mimeType, expense } = req.body;

      // 1. Input Validation
      if (!profile || typeof profile !== 'object') {
        console.warn(`[${requestId}] ⚠️ Validation failed: Missing profile`);
        return res.status(400).json({ 
          error: "Profile information is required for AI analysis.",
          code: "MISSING_PROFILE"
        });
      }

      // Validate expense if provided
      let userExpense: number | undefined = undefined;
      if (expense !== undefined && expense !== null && expense !== '') {
        userExpense = parseFloat(expense);
        if (isNaN(userExpense) || userExpense < 0) {
          console.warn(`[${requestId}] ⚠️ Validation failed: Invalid expense value`);
          return res.status(400).json({
            error: "Expense must be a non-negative number.",
            code: "INVALID_EXPENSE"
          });
        }
      }

      if (!profile.name || !profile.conditions) {
        console.warn(`[${requestId}] ⚠️ Validation failed: Incomplete profile`);
        return res.status(400).json({ 
          error: "Profile must include name and health conditions.",
          code: "INCOMPLETE_PROFILE"
        });
      }

      if (!text && !imageBase64) {
        console.warn(`[${requestId}] ⚠️ Validation failed: No meal data`);
        return res.status(400).json({ 
          error: "Please provide meal description or an image for analysis.",
          code: "NO_MEAL_DATA"
        });
      }

      console.log(`[${requestId}] 🤖 Calling Groq API...`);
      
      // 2. AI Analysis
      const analysis = await analyzeMeal(profile as UserProfile, {
        text,
        imageBase64,
        mimeType,
      });

      // Override AI expense if user provided one
      if (userExpense !== undefined) {
        console.log(`[${requestId}] 💰 Using user-provided expense: ₹${userExpense}`);
        analysis.estimated_expense = userExpense;
      }

      console.log(`[${requestId}] ✅ Analysis successful`);
      res.json(analysis);

    } catch (error: any) {
      console.error(`[${requestId}] ❌ Error analyzing meal:`, error);
      
      // 3. Structured Error Response
      const statusCode = error.status || 500;
      let errorMessage = "Failed to analyze meal with Groq";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = JSON.stringify(error);
      }
      
      // Handle specific AI error codes
      if (errorMessage.includes("quota") || errorMessage.includes("limit")) {
        return res.status(503).json({ 
          error: "AI Service temporarily unavailable (Quota Exceeded). Please try again later.",
          code: "QUOTA_EXCEEDED"
        });
      }

      res.status(statusCode).json({ 
        error: errorMessage,
        code: error.code || "INTERNAL_SERVER_ERROR",
        details: error.stack || JSON.stringify(error, null, 2)
      });
    }
  });

  app.get("/api/recommendations", async (req, res) => {
    try {
      const profile = await Profile.findOne().sort({ _id: -1 });
      const meals = await Meal.find().sort({ timestamp: -1 }).limit(10);
      
      if (!profile) {
        return res.status(400).json({ error: "Profile required for recommendations" });
      }

      const recs = await getPersonalizedRecommendations(profile as UserProfile, meals);
      res.json(recs);
    } catch (error: any) {
      console.error("Error fetching recommendations:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch recommendations";
      res.status(500).json({ 
        error: "Database operation failed", 
        message: message 
      });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { profile, history, message } = req.body;
      if (!profile) {
        return res.status(400).json({ error: "Profile required for chat" });
      }

      const response = await chatWithNutritionist(profile as UserProfile, history, message);
      res.json({ response });
    } catch (error: any) {
      console.error("Error in chat:", error);
      const message = error instanceof Error ? error.message : "Failed to process chat message";
      res.status(500).json({ 
        error: "AI operation failed", 
        message: message 
      });
    }
  });

  console.log("✅ API routes registered successfully");
  console.log("   📋 Profile: GET/POST /api/profile");
  console.log("   🍽️  Meals: GET/POST/PUT/DELETE /api/meals");
  console.log("   💧 Water: GET/POST/DELETE /api/water");
  console.log("   💊 Medications: GET/POST/PUT/DELETE /api/medications");
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    console.log("🔧 Setting up Vite development server...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("✅ Vite development server configured with HMR");
  } else {
    console.log("📦 Serving production build...");
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
    console.log("✅ Production static files configured");
  }

  console.log(`🚀 Starting server on port ${PORT}...`);
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL && !process.env.NETLIFY) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🎉 NutriGuard server is running!`);
      console.log(`🌐 Access your app at: http://localhost:${PORT}`);
      console.log(`📱 Mobile access: http://192.168.1.x:${PORT} (replace with your IP)`);
      console.log(`🔄 Hot reload: Enabled in development mode`);
      console.log(`📊 API endpoints: /api/*`);
      console.log(`💾 Database: MongoDB Atlas (NutriGuard cluster)`);
    });
  }
}

// Initial setup
setupApp(app);

// Export the app for Vercel
export default app;
