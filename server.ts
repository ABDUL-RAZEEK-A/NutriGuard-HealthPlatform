import express from "express";
import { createServer as createViteServer } from "vite";
import mongoose, { Types } from "mongoose";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { analyzeMeal } from "./src/services/geminiService.ts";
import type { UserProfile } from "./src/services/geminiService.ts";

dotenv.config();
console.log("🔐 Loaded environment variables");
console.log("🚀 Starting NutriGuard Server...");

// MongoDB connection
const MONGODB_URI = "mongodb+srv://NUTRIGUARD:NUTRIGUARD@ng.oaiszkn.mongodb.net/?appName=NG";

// ObjectId validation middleware
function validateObjectId(paramName: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const id = req.params[paramName];
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: `${paramName} is required and must be a non-empty string` });
    }
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: `${paramName} must be a valid MongoDB ObjectId (24-character hex string)` });
    }
    next();
  };
}

async function connectToMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("📊 Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}

// Define schemas
const profileSchema = new mongoose.Schema({
  name: String,
  age: Number,
  weight: Number,
  height: Number,
  bmi: Number,
  conditions: String,
  goals: String
});

const mealLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  meal_items: [mongoose.Schema.Types.Mixed],
  calories: Number,
  proteins: Number,
  carbs: Number,
  fats: Number,
  alerts: [mongoose.Schema.Types.Mixed],
  insights: [mongoose.Schema.Types.Mixed],
  expense: { type: Number, default: 0 }
});

const waterLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  amount_ml: Number
});

const medicationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dosage: String,
  time: { type: String, required: true },
  taken: { type: Boolean, default: false },
  last_taken_date: String
});

// Create models
const Profile = mongoose.model('Profile', profileSchema);
const MealLog = mongoose.model('MealLog', mealLogSchema);
const WaterLog = mongoose.model('WaterLog', waterLogSchema);
const Medication = mongoose.model('Medication', medicationSchema);

console.log("📋 Database models initialized");

async function startServer() {
  await connectToMongoDB();
  const app = express();
  const PORT = 3000;

  console.log("📝 Configuring middleware...");
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  console.log("✅ Middleware configured: JSON parsing and URL-encoded parsing with 50MB limit");

  console.log("🔗 Registering API routes...");

  // API Routes
  app.get("/api/profile", async (req, res) => {
    try {
      const profile = await Profile.findOne().sort({ _id: -1 });
      res.json(profile || null);
    } catch (error) {
      console.error("❌ Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.post("/api/profile", async (req, res) => {
    try {
      const { name, age, weight, height, bmi, conditions, goals } = req.body;
      const profile = new Profile({ name, age, weight, height, bmi, conditions, goals });
      await profile.save();
      res.json({ id: profile._id });
    } catch (error) {
      console.error("❌ Error saving profile:", error);
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  app.get("/api/meals", async (req, res) => {
    try {
      const meals = await MealLog.find().sort({ timestamp: -1 });
      res.json(meals);
    } catch (error) {
      console.error("❌ Error fetching meals:", error);
      res.status(500).json({ error: "Failed to fetch meals" });
    }
  });

  app.post("/api/meals", async (req, res) => {
    try {
      const { meal_items, calories, proteins, carbs, fats, alerts, insights, expense, timestamp } = req.body;
      const mealLog = new MealLog({
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
    } catch (error) {
      console.error("Error saving meal:", error);
      res.status(500).json({ error: "Failed to save meal" });
    }
  });

  app.put("/api/meals/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      const { meal_items, calories, proteins, carbs, fats, alerts, insights, expense } = req.body;
      await MealLog.findByIdAndUpdate(id, {
        meal_items,
        calories,
        proteins,
        carbs,
        fats,
        alerts,
        insights,
        expense: expense || 0
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating meal:", error);
      res.status(500).json({ error: "Failed to update meal" });
    }
  });

  app.delete("/api/meals/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      await MealLog.findByIdAndDelete(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting meal:", error);
      res.status(500).json({ error: "Failed to delete meal" });
    }
  });

  app.get("/api/water", async (req, res) => {
    try {
      const logs = await WaterLog.find().sort({ timestamp: -1 });
      res.json(logs);
    } catch (error) {
      console.error("Error fetching water logs:", error);
      res.status(500).json({ error: "Failed to fetch water logs" });
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
    } catch (error) {
      console.error("Error saving water log:", error);
      res.status(500).json({ error: "Failed to save water log" });
    }
  });

  app.delete("/api/water/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      await WaterLog.findByIdAndDelete(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting water log:", error);
      res.status(500).json({ error: "Failed to delete water log" });
    }
  });

  app.get("/api/medications", async (req, res) => {
    try {
      const meds = await Medication.find();
      res.json(meds);
    } catch (error) {
      console.error("Error fetching medications:", error);
      res.status(500).json({ error: "Failed to fetch medications" });
    }
  });

  app.post("/api/medications", async (req, res) => {
    try {
      const { name, dosage, time } = req.body;
      const medication = new Medication({ name, dosage, time });
      await medication.save();
      res.json({ id: medication._id });
    } catch (error) {
      console.error("Error saving medication:", error);
      res.status(500).json({ error: "Failed to save medication" });
    }
  });

  app.put("/api/medications/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      const { taken, last_taken_date } = req.body;
      await Medication.findByIdAndUpdate(id, { taken, last_taken_date });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating medication:", error);
      if (error instanceof mongoose.Error.CastError) {
        return res.status(400).json({ error: "Invalid medication ID format" });
      }
      res.status(500).json({ error: "Failed to update medication" });
    }
  });

  app.delete("/api/medications/:id", validateObjectId('id'), async (req, res) => {
    try {
      const { id } = req.params;
      await Medication.findByIdAndDelete(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting medication:", error);
      res.status(500).json({ error: "Failed to delete medication" });
    }
  });

  app.post("/api/analyze-meal", async (req, res) => {
    try {
      const { profile, text, imageBase64, mimeType } = req.body;
      if (!profile || !profile.name) {
        return res.status(400).json({ error: "Profile information is required for AI analysis." });
      }
      if (!text && !imageBase64) {
        return res.status(400).json({ error: "Please provide meal text or an image for analysis." });
      }

      const analysis = await analyzeMeal(profile as UserProfile, {
        text,
        imageBase64,
        mimeType,
      });

      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing meal:", error);
      res.status(500).json({ error: "Failed to analyze meal" });
    }
  });

  console.log("✅ API routes registered successfully");
  console.log("   📋 Profile: GET/POST /api/profile");
  console.log("   🍽️  Meals: GET/POST/PUT/DELETE /api/meals");
  console.log("   💧 Water: GET/POST/DELETE /api/water");
  console.log("   💊 Medications: GET/POST/PUT/DELETE /api/medications");
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("🔧 Setting up Vite development server...");
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🎉 NutriGuard server is running!`);
    console.log(`🌐 Access your app at: http://localhost:${PORT}`);
    console.log(`📱 Mobile access: http://192.168.1.x:${PORT} (replace with your IP)`);
    console.log(`🔄 Hot reload: Enabled in development mode`);
    console.log(`📊 API endpoints: /api/*`);
    console.log(`💾 Database: MongoDB Atlas (NutriGuard cluster)`);
  });
}

startServer();
