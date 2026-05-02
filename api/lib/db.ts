import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// 4. Disable Silent Buffering
mongoose.set("bufferCommands", false);

// MongoDB connection - Clean and sanitize the URI (handles quotes and trailing semicolons)
const MONGODB_URI = process.env.MONGODB_URI?.trim().replace(/^["']|["']$/g, '').replace(/;$/, '');

// 2. Enforce Fail-Fast Strategy
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI missing from environment variables. Server cannot start.");
  process.exit(1);
}

let isConnected = false;

// 3. Fix MongoDB Connection Logic
export async function connectToMongoDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;
  
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err);
    // Don't exit in serverless (Netlify/Vercel) as it might recover, but for local/standalone we exit
    if (!process.env.NETLIFY && !process.env.VERCEL) {
      process.exit(1);
    }
    throw err;
  }
}

// Define interfaces
export interface IProfile {
  name: string;
  age: number;
  weight: number;
  height: number;
  bmi: number;
  conditions: string;
  goals: string;
  updatedAt: Date;
}

export interface IMeal {
  timestamp: Date;
  meal_items: Array<{ item: string; estimated_portion: string }>;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  expense: number;
  alerts: string[];
  insights: string[];
}

export interface IWaterLog {
  timestamp: Date;
  amount_ml: number;
}

export interface IMedication {
  name: string;
  dosage: string;
  time: string;
  taken: boolean;
  last_taken_date?: string;
}

// Define schemas
const profileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  weight: { type: Number, required: true }, // in kg
  height: { type: Number, required: true }, // in cm
  bmi: { type: Number, required: true },
  conditions: { type: String, default: "" },
  goals: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now },
});

const mealSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  meal_items: [{
    item: String,
    estimated_portion: String
  }],
  calories: { type: Number, required: true },
  proteins: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fats: { type: Number, required: true },
  expense: { type: Number, default: 0 },
  alerts: [String],
  insights: [String],
});

const waterLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  amount_ml: { type: Number, required: true }, // renamed from amount to match index.ts
});

const medicationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dosage: { type: String },
  time: { type: String, required: true }, // e.g., "08:00"
  taken: { type: Boolean, default: false },
  last_taken_date: { type: String },
});

// Create models
export const Profile: mongoose.Model<IProfile> = mongoose.models.Profile || mongoose.model<IProfile>("Profile", profileSchema);
export const Meal: mongoose.Model<IMeal> = mongoose.models.Meal || mongoose.model<IMeal>("Meal", mealSchema);
export const WaterLog: mongoose.Model<IWaterLog> = mongoose.models.WaterLog || mongoose.model<IWaterLog>("WaterLog", waterLogSchema);
export const Medication: mongoose.Model<IMedication> = mongoose.models.Medication || mongoose.model<IMedication>("Medication", medicationSchema);

export { isConnected };

