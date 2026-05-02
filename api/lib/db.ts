import mongoose, { Types } from "mongoose";

// MongoDB connection - Clean and sanitize the URI (handles quotes and trailing semicolons)
const MONGODB_URI = process.env.MONGODB_URI?.trim().replace(/^["']|["']$/g, '').replace(/;$/, '');

let isConnected = false;

export async function connectToMongoDB() {
  if (isConnected) return;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from environment variables");
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log("📊 Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
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
  amount: number;
}

export interface IMedication {
  name: string;
  dosage: string;
  frequency: string;
  timing: string;
  taken: boolean;
  lastTakenDate?: Date;
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
  amount: { type: Number, required: true }, // in ml
});

const medicationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dosage: { type: String, required: true },
  frequency: { type: String, required: true },
  timing: { type: String, required: true }, // e.g., "Before Breakfast"
  taken: { type: Boolean, default: false },
  lastTakenDate: { type: Date },
});

// Create models
export const Profile = mongoose.models.Profile || mongoose.model<IProfile>("Profile", profileSchema);
export const Meal = mongoose.models.Meal || mongoose.model<IMeal>("Meal", mealSchema);
export const WaterLog = mongoose.models.WaterLog || mongoose.model<IWaterLog>("WaterLog", waterLogSchema);
export const Medication = mongoose.models.Medication || mongoose.model<IMedication>("Medication", medicationSchema);
