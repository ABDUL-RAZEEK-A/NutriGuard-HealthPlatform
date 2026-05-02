import { useState, useEffect, useRef, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { 
  Activity, 
  User, 
  Plus, 
  History, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  Check,
  Camera, 
  ChevronRight,
  Info,
  Scale,
  Heart,
  Target,
  Calendar as CalendarIcon,
  ChevronLeft,
  MessageSquare,
  Send,
  Download,
  DollarSign,
  X,
  Droplets,
  Sparkles,
  ArrowRight,
  Trash2,
  RefreshCw,
  Lock,
  LogOut
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday,
  parseISO
} from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import type { UserProfile, MealAnalysis, Recommendation } from './services/geminiService';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Toaster, toast } from 'sonner';

// --- Error Boundary ---

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-black/5 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 mb-2">Something went wrong</h1>
            <p className="text-zinc-500 mb-6">
              {this.state.error?.message || "An unexpected error occurred. Please try refreshing the page."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={20} />
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Helper to safely parse JSON fields that may already be parsed objects
function safeArray<T>(value: T[] | string | undefined | null, fallback: T[] = []): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T[];
    } catch {
      return fallback;
    }
  }
  return fallback;
}

// --- Types ---

interface MealLog {
  id: string;
  timestamp: string;
  meal_items: Array<{ item: string; estimated_portion: string }>;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  alerts: string[];
  insights: string[];
  expense: number;
}

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface WaterLog {
  id: string;
  timestamp: string;
  amount_ml: number;
}

interface Medication {
  id: string;
  name: string;
  dosage: string;
  time: string;
  taken: number;
  last_taken_date: string;
}

// --- Components ---

const Card = ({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) => (
  <div id={id} className={cn("bg-white rounded-3xl p-6 shadow-sm border border-black/5", className)}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'warning' | 'success' | 'info' }) => {
  const variants = {
    default: 'bg-zinc-100 text-zinc-700',
    warning: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-100 text-emerald-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", variants[variant])}>
      {children}
    </span>
  );
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('isAuth') === 'true');
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'log' | 'profile' | 'history' | 'calendar' | 'recommendations'>('dashboard');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'meal' | 'water' | 'medication' | null>(null);
  const [isFetchingRecs, setIsFetchingRecs] = useState(false);
  const [dashboardRange, setDashboardRange] = useState<'last3' | 'week' | 'month'>('week');

  // Medication reminder state
  const [medicationReminders, setMedicationReminders] = useState<{med: Medication, isDue: boolean, isOverdue: boolean}[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Chatbot State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastRecsFetchRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingMeal, setEditingMeal] = useState<MealLog | null>(null);
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);

  // Profile Form State
  const [userName, setUserName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [goals, setGoals] = useState('');

  // Medication Form State
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medTime, setMedTime] = useState('');
  const [isAddingMed, setIsAddingMed] = useState(false);

  // Log Form State
  const [mealText, setMealText] = useState('');
  const [mealImage, setMealImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<MealAnalysis | null>(null);
  const [expenseInput, setExpenseInput] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProfile();
    fetchMeals();
    fetchWaterLogs();
    fetchMedications();
  }, []);

  useEffect(() => {
    if (profile && meals.length > 0) {
      fetchRecommendations();
    }
  }, [profile, meals.length]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      if (data) {
        setProfile(data);
        setUserName(data.name || '');
        setAge(data.age.toString());
        setWeight(data.weight.toString());
        setHeight(data.height.toString());
        setConditions(data.conditions.split(', '));
        setGoals(data.goals);
      }
    } catch (err) {
      console.error("Failed to fetch profile", err);
      toast.error("Could not load your profile. Please check your connection.");
    }
  };

  const fetchMeals = async () => {
    try {
      const res = await fetch('/api/meals');
      if (!res.ok) throw new Error("Failed to load meals");
      const data = await res.json();
      // Map MongoDB _id to frontend id field
      const mappedData = data.map((meal: Record<string, unknown>) => ({
        ...meal,
        id: String(meal._id)
      }));
      setMeals(mappedData);
    } catch (err) {
      console.error("Failed to fetch meals", err);
      toast.error("Could not load your meal history.");
    }
  };

  const fetchWaterLogs = async () => {
    try {
      const res = await fetch('/api/water');
      if (!res.ok) throw new Error("Failed to load water logs");
      const data = await res.json();
      // Map MongoDB _id to frontend id field
      const mappedData = data.map((log: Record<string, unknown>) => ({
        ...log,
        id: String(log._id)
      }));
      setWaterLogs(mappedData);
    } catch (err) {
      console.error("Failed to fetch water logs", err);
    }
  };

  const fetchMedications = async () => {
    try {
      const res = await fetch('/api/medications');
      if (!res.ok) throw new Error("Failed to load medications");
      const data = await res.json();
      // Map MongoDB _id to frontend id field
      const mappedData = data.map((med: Record<string, unknown>) => ({
        ...med,
        id: String(med._id)
      }));
      setMedications(mappedData);
    } catch (err) {
      console.error("Failed to fetch medications", err);
    }
  };

  const fetchRecommendations = async () => {
    if (!profile || meals.length === 0 || isFetchingRef.current) return;
    
    // Throttle requests to once every 5 seconds
    const now = Date.now();
    if (now - lastRecsFetchRef.current < 5000) return;
    
    setIsFetchingRecs(true);
    isFetchingRef.current = true;
    lastRecsFetchRef.current = now;
    
    try {
      const res = await fetch('/api/recommendations');
      if (!res.ok) throw new Error("Failed to load recommendations");
      const recs = await res.json();
      setRecommendations(recs);
    } catch (err) {
      console.error("❌ Failed to fetch recommendations:", err);
    } finally {
      setIsFetchingRecs(false);
      isFetchingRef.current = false;
    }
  };

  const handleLogWater = async (amount_ml: number) => {
    try {
      const res = await fetch('/api/water', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_ml })
      });
      if (!res.ok) throw new Error("Failed to log water");
      toast.success(`Logged ${amount_ml}ml of water!`);
      fetchWaterLogs();
    } catch (err) {
      console.error("Failed to log water", err);
      toast.error("Failed to log water. Please try again.");
    }
  };

   const handleDeleteWater = async (id: string) => {
    try {
      const res = await fetch(`/api/water/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete water log");
      fetchWaterLogs();
      toast.success("Water log deleted");
    } catch (err) {
      console.error("Failed to delete water log", err);
      toast.error("Failed to delete water log.");
    }
  };

  const handleAddMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: medName, dosage: medDosage, time: medTime })
      });
      if (!res.ok) throw new Error("Failed to add medication");
      setMedName('');
      setMedDosage('');
      setMedTime('');
      setIsAddingMed(false);
      toast.success("Medication reminder added!");
      fetchMedications();
    } catch (err) {
      console.error("Failed to add medication", err);
      toast.error("Failed to add medication reminder.");
    }
  };

  const handleToggleMedication = async (med: Medication) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const isTakenToday = med.last_taken_date === today;
    try {
      const res = await fetch(`/api/medications/${med.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          taken: isTakenToday ? 0 : 1, 
          last_taken_date: isTakenToday ? null : today 
        })
      });
      if (!res.ok) throw new Error("Failed to update medication");
      fetchMedications();
      if (!isTakenToday) toast.success(`Marked ${med.name} as taken!`);
    } catch (err) {
      console.error("Failed to toggle medication", err);
      toast.error("Failed to update medication status.");
    }
  };

   const handleDeleteMedication = async (id: string) => {
    try {
      const res = await fetch(`/api/medications/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete medication");
      toast.success("Medication reminder removed.");
      fetchMedications();
    } catch (err) {
      console.error("Failed to delete medication", err);
      toast.error("Failed to remove medication reminder.");
    }
  };

  // Medication reminder functions
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission === 'granted';
    }
    return false;
  };

  const checkMedicationReminders = () => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const today = format(now, 'yyyy-MM-dd');

    const reminders = medications.map(med => {
      const isTakenToday = med.last_taken_date === today;
      const isDue = med.time === currentTime && !isTakenToday;
      const [medHour, medMinute] = med.time.split(':').map(Number);
      const medTimeObj = new Date(now);
      medTimeObj.setHours(medHour, medMinute, 0, 0);
       const isOverdue = now > medTimeObj && !isTakenToday && !isDue;

      return { med, isDue, isOverdue };
    });

    setMedicationReminders(reminders);

    // Show notifications for due medications
    reminders.forEach(({ med, isDue, isOverdue }) => {
      if ((isDue || isOverdue) && notificationPermission === 'granted') {
        const title = isOverdue ? `Overdue: ${med.name}` : `Time for: ${med.name}`;
        const body = `${med.dosage} - ${med.time}`;

        new Notification(title, {
          body,
          icon: '/favicon.svg',
          tag: `medication-${med.id}`,
          requireInteraction: true
        });
      }
    });
  };

  // Initialize notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Check medication reminders every minute
  useEffect(() => {
    const interval = setInterval(checkMedicationReminders, 60000); // Check every minute
    checkMedicationReminders(); // Check immediately

    return () => clearInterval(interval);
  }, [medications, notificationPermission]);

  const calculateBMI = (w: number, h: number) => {
    if (!w || !h || w <= 0 || h <= 0) return 0;
    const heightInMeters = h > 3 ? h / 100 : h;
    const bmi = w / (heightInMeters * heightInMeters);
    return parseFloat(bmi.toFixed(1));
  };

  const getBMICategory = (bmi: number) => {
    if (bmi < 18.5) return { label: 'Underweight (Malnutrition Risk)', color: 'text-amber-500', bg: 'bg-amber-50' };
    if (bmi < 25) return { label: 'Healthy Weight', color: 'text-emerald-500', bg: 'bg-emerald-50' };
    if (bmi < 30) return { label: 'Overweight', color: 'text-orange-500', bg: 'bg-orange-50' };
    return { label: 'Obesity', color: 'text-rose-500', bg: 'bg-rose-50' };
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const w = parseFloat(weight);
    const h = parseFloat(height);

    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
      toast.error('Please enter a valid weight and height.');
      setIsLoading(false);
      return;
    }

    const bmi = calculateBMI(w, h);
    
    const newProfile = {
      name: userName,
      age: parseInt(age),
      weight: w,
      height: h,
      bmi,
      conditions: conditions.join(', '),
      goals
    };

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProfile)
      });
      if (!res.ok) throw new Error("Failed to save profile");
      setProfile(newProfile as any);
      toast.success("Profile updated successfully!");
      setActiveTab('dashboard');
    } catch (err) {
      console.error("Failed to save profile", err);
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMealImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeMeal = async () => {
    if (!profile) {
      toast.error("Please set up your profile first!");
      setActiveTab('profile');
      return;
    }

    if (!mealText && !mealImage) {
      toast.error("Please provide a description or an image of your meal.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const base64 = mealImage ? mealImage.split(',')[1] : undefined;
      const mimeType = mealImage ? mealImage.split(';')[0].split(':')[1] : undefined;

      const res = await fetch('/api/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          text: mealText,
          imageBase64: base64,
          mimeType,
          expense: expenseInput
        }),
      });

      const data = await res.json().catch(() => ({ error: 'Server returned an invalid response' }));

      if (!res.ok) {
        console.error("Analysis failed details:", data);
        const errorMessage = data.error || 'AI analysis failed. Please try again.';
        
        // Context-aware toast messages
        if (res.status === 400) {
          toast.error(`Invalid Request: ${errorMessage}`);
        } else if (res.status === 503) {
          toast.error("AI service is busy (Quota Exceeded). Please wait a moment and try again.");
        } else {
          toast.error(errorMessage);
        }
        return;
      }

      setAnalysisResult(data);
      setExpenseInput(data.estimated_expense?.toString() || "0");
      toast.success("Meal analyzed successfully!");
    } catch (err) {
      console.error("Network or unexpected error during analysis:", err);
      toast.error("Connection error. Please check if the server is running.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveMeal = async () => {
    if (!analysisResult) return;

    try {
      const payload = {
        meal_items: analysisResult.recognized_meal_items,
        calories: analysisResult.nutritional_breakdown.total_calories,
        proteins: analysisResult.nutritional_breakdown.proteins_g,
        carbs: analysisResult.nutritional_breakdown.carbs_g,
        fats: analysisResult.nutritional_breakdown.fats_g,
        alerts: analysisResult.disease_rule_alerts,
        insights: analysisResult.progress_insights,
        expense: parseFloat(expenseInput) || 0,
        timestamp: selectedDate.toISOString()
      };

      if (editingMeal) {
        const res = await fetch(`/api/meals/${editingMeal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to update meal");
        setEditingMeal(null);
        toast.success("Meal log updated!");
      } else {
        const res = await fetch('/api/meals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to save meal");
        toast.success("Meal log saved!");
      }

      setAnalysisResult(null);
      setMealText('');
      setMealImage(null);
      setExpenseInput('');
      fetchMeals();
      setActiveTab('dashboard');
    } catch (err) {
      console.error("Failed to save meal", err);
      toast.error("Failed to save meal. Please try again.");
    }
  };

   const handleDeleteMeal = async (id: string) => {
    try {
      const res = await fetch(`/api/meals/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete meal");
      fetchMeals();
      toast.success("Meal log deleted");
    } catch (err) {
      console.error("Failed to delete meal", err);
      toast.error("Failed to delete meal.");
    }
  };

   const handleEditMeal = (meal: MealLog) => {
     setEditingMeal(meal);
     setAnalysisResult({
       recognized_meal_items: safeArray(meal.meal_items),
       nutritional_breakdown: {
         total_calories: meal.calories,
         proteins_g: meal.proteins,
         carbs_g: meal.carbs,
         fats_g: meal.fats
       },
       disease_rule_alerts: safeArray(meal.alerts),
       progress_insights: safeArray(meal.insights),
       estimated_expense: meal.expense
     });
     setExpenseInput(meal.expense.toString());
     setActiveTab('log');
   };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !profile || isChatLoading) return;

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: chatInput }] };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          history: chatMessages,
          message: chatInput
        })
      });

      if (!res.ok) throw new Error("Chat failed");
      const data = await res.json();
      
      const modelMessage: ChatMessage = { role: 'model', parts: [{ text: data.response }] };
      setChatMessages(prev => [...prev, modelMessage]);
    } catch (err) {
      console.error("Chat failed", err);
      const errorMessage: ChatMessage = { role: 'model', parts: [{ text: "I'm sorry, I'm having trouble connecting right now. Please try again later." }] };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleClearChat = () => {
    setChatMessages([]);
    toast.success("Chat history cleared");
  };

  const generatePDFReport = () => {
    if (!profile || meals.length === 0) {
      toast.error("Please set up your profile and log some meals first!");
      return;
    }
    setIsGeneratingReport(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(22);
      doc.setTextColor(16, 185, 129); // Emerald 500
      doc.text("NutriGuard Health Report", pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text(`Generated on: ${format(new Date(), 'PPP')}`, pageWidth / 2, 28, { align: 'center' });

      // Profile Section
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text(`Health Report for ${profile.name}`, 14, 45);

      autoTable(doc, {
        startY: 50,
        head: [['Metric', 'Value']],
        body: [
          ['Age', `${profile.age} years`],
          ['Weight', `${profile.weight} kg`],
          ['Height', `${profile.height} cm`],
          ['BMI', `${profile.bmi}`],
          ['Conditions', profile.conditions || 'None specified'],
          ['Goals', profile.goals || 'None specified'],
        ],
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 10 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { cellWidth: 100 }
        }
      });

      // Summary Section
      const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0);
      const avgCalories = meals.length > 0 ? (totalCalories / meals.length).toFixed(0) : '0';
      const totalExpense = meals.reduce((sum, m) => sum + m.expense, 0).toFixed(2);

      doc.setFontSize(16);
      doc.text("Summary Statistics", 14, (doc as any).lastAutoTable.finalY + 15);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Metric', 'Value']],
        body: [
          ['Total Meals Logged', `${meals.length}`],
          ['Total Calories', `${totalCalories.toLocaleString()} kcal`],
          ['Average Calories/Meal', `${avgCalories} kcal`],
          ['Total Food Expense', `INR ${totalExpense}`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 10 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { cellWidth: 90 }
        }
      });

      // Recent Meals Table
      doc.setFontSize(16);
      doc.text("Recent Meal Logs", 14, (doc as any).lastAutoTable.finalY + 15);

       const tableData = meals.slice(0, 15).map(m => [
         format(parseISO(m.timestamp), 'MMM d, HH:mm'),
         safeArray(m.meal_items).map((i: any) => i?.item || 'Unknown').join(', '),
         `${m.calories} kcal`,
         `${m.proteins}g / ${m.carbs}g / ${m.fats}g`,
         `INR ${m.expense.toFixed(2)}`
       ]);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Date', 'Items', 'Calories', 'Macros (P/C/F)', 'Expense']],
        body: tableData,
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 40 },
          2: { cellWidth: 20 },
          3: { cellWidth: 35 },
          4: { cellWidth: 25 }
        }
      });

      // Add page numbers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - 30, doc.internal.pageSize.getHeight() - 10);
      }

      doc.save(`NutriGuard_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success("Health report generated successfully!");
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Failed to generate PDF report. Please try again.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // --- Data Prep ---

  const filteredMeals = useMemo(() => {
    const now = new Date();
    if (dashboardRange === 'last3') return meals.slice(0, 3);
    if (dashboardRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return meals.filter(m => new Date(m.timestamp) >= weekAgo);
    }
    if (dashboardRange === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return meals.filter(m => new Date(m.timestamp) >= monthAgo);
    }
    return meals;
  }, [meals, dashboardRange]);

  const chartData = useMemo(() => {
    return [...filteredMeals].reverse().map(m => ({
      date: format(new Date(m.timestamp), 'MMM d'),
      calories: m.calories,
      expense: m.expense,
      proteins: m.proteins,
      carbs: m.carbs,
      fats: m.fats
    }));
  }, [filteredMeals]);

  const totalSpending = filteredMeals.reduce((sum, m) => sum + m.expense, 0);
  const avgDailyCalories = filteredMeals.length > 0 
    ? (filteredMeals.reduce((sum, m) => sum + m.calories, 0) / filteredMeals.length).toFixed(0)
    : 0;

  const macroData = analysisResult ? [
    { name: 'Proteins', value: analysisResult.nutritional_breakdown.proteins_g, color: '#10b981' },
    { name: 'Carbs', value: analysisResult.nutritional_breakdown.carbs_g, color: '#f59e0b' },
    { name: 'Fats', value: analysisResult.nutritional_breakdown.fats_g, color: '#ef4444' },
  ] : [];

  // --- Calendar Logic ---
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const mealsByDate = useMemo(() => {
    const map: Record<string, MealLog[]> = {};
    meals.forEach(meal => {
      const dateKey = format(new Date(meal.timestamp), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(meal);
    });
    return map;
  }, [meals]);

  const selectedDateMeals = useMemo(() => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return mealsByDate[dateKey] || [];
  }, [selectedDate, mealsByDate]);

  const waterByDate = useMemo(() => {
    const map: Record<string, WaterLog[]> = {};
    waterLogs.forEach(log => {
      const dateKey = format(new Date(log.timestamp), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(log);
    });
    return map;
  }, [waterLogs]);

  const selectedDateWater = useMemo(() => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return waterByDate[dateKey] || [];
  }, [selectedDate, waterByDate]);

  const dailyWaterTotal = useMemo(() => {
    return selectedDateWater.reduce((sum, log) => sum + log.amount_ml, 0);
  }, [selectedDateWater]);

  const dailyStats = useMemo(() => {
    return selectedDateMeals.reduce((acc, meal) => ({
      calories: acc.calories + meal.calories,
      proteins: acc.proteins + meal.proteins,
      carbs: acc.carbs + meal.carbs,
      fats: acc.fats + meal.fats,
      expense: acc.expense + meal.expense,
    }), { calories: 0, proteins: 0, carbs: 0, fats: 0, expense: 0 });
  }, [selectedDateMeals]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isAuth');
    toast.info("Logged out successfully");
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6 font-sans">
        <Card className="max-w-md w-full p-8 text-center space-y-8 animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-inner">
            <Lock size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-zinc-900 tracking-tight">NutriGuard</h1>
            <p className="text-zinc-500 text-sm">Please enter your digital key to unlock your health profile.</p>
          </div>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (password === '1234') {
                setIsAuthenticated(true);
                localStorage.setItem('isAuth', 'true');
                toast.success("Welcome back!");
              } else {
                toast.error("Incorrect password. Please try again.");
                setPassword('');
              }
            }}
            className="space-y-6"
          >
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                className="w-full bg-zinc-50 border-2 border-black/5 rounded-3xl p-5 focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-center text-3xl tracking-[0.8em] transition-all font-mono"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full bg-emerald-500 text-white py-5 rounded-3xl font-bold text-xl hover:bg-emerald-600 active:scale-95 transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
            >
              Verify & Enter
            </button>
          </form>
          <div className="pt-4 border-t border-black/5">
            <p className="text-[10px] text-zinc-400 uppercase font-black tracking-widest flex items-center justify-center gap-2">
              <CheckCircle2 size={12} className="text-emerald-500" />
              Verified Identity Security
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 font-sans pb-24">
      {/* Header */}
      <header className="bg-white border-b border-black/5 px-4 md:px-6 py-3 md:py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-emerald-500 rounded-lg md:rounded-xl flex items-center justify-center text-white">
              <Activity size={20} className="md:w-6 md:h-6" />
            </div>
            <h1 className="text-lg md:text-xl font-semibold tracking-tight">NutriGuard</h1>
          </div>
          {profile && (
            <div className="flex items-center gap-2 md:gap-3 bg-zinc-50 px-2 md:px-3 py-1 md:py-1.5 rounded-full border border-black/5">
              <div className="text-right">
                <p className="text-[10px] font-medium text-zinc-500">BMI Status</p>
                <p className={cn("text-xs md:text-sm font-bold", getBMICategory(profile.bmi).color)}>
                  {getBMICategory(profile.bmi).label.split(' ')[0]}
                </p>
              </div>
              <div className="w-7 h-7 md:w-8 md:h-8 bg-zinc-200 rounded-full flex items-center justify-center">
                <User size={14} className="text-zinc-600 md:w-4 md:h-4" />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {!profile ? (
                <Card className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-4">
                    <User size={32} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Welcome to NutriGuard</h2>
                  <p className="text-zinc-500 max-w-md mb-6">
                    Set up your health profile to get personalized AI-driven nutritional analysis tailored to your conditions.
                  </p>
                  <button
                    onClick={() => setActiveTab('profile')}
                    className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-semibold hover:bg-emerald-600 transition-colors"
                  >
                    Complete Profile
                  </button>
                </Card>
              ) : (
                <>
                  <div className="mb-4">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 leading-tight">
                      {getGreeting()}, <span className="text-emerald-600">{profile.name}</span>
                    </h2>
                    <p className="text-sm text-zinc-500 mt-1">Here's your health summary for today.</p>
                  </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                      <Card className={cn("flex items-center gap-3 md:gap-4 p-4 md:p-6", getBMICategory(profile.bmi).bg)}>
                        <div className={cn("w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0", getBMICategory(profile.bmi).bg.replace('bg-', 'bg-').replace('50', '100'))}>
                          <Scale size={20} className={getBMICategory(profile.bmi).color} />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-sm text-zinc-500">BMI: {profile.bmi}</p>
                          <p className={cn("text-xs md:text-sm font-bold", getBMICategory(profile.bmi).color)}>{getBMICategory(profile.bmi).label}</p>
                        </div>
                      </Card>
                      <Card className="flex items-center gap-3 md:gap-4 p-4 md:p-6">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-rose-50 text-rose-500 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0">
                          <Heart size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[10px] md:text-sm text-zinc-500">Health</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {profile.conditions.split(', ').slice(0, 2).map(c => (
                              <Badge key={c} variant="warning">{c}</Badge>
                            ))}
                          </div>
                        </div>
                      </Card>
                      <Card className="flex items-center gap-3 md:gap-4 p-4 md:p-6">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-50 text-emerald-500 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0">
                          <DollarSign size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-sm text-zinc-500">Spent</p>
                          <p className="text-lg md:text-xl font-bold">₹{totalSpending.toFixed(0)}</p>
                        </div>
                      </Card>
                      <Card className="flex items-center gap-3 md:gap-4 p-4 md:p-6">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-50 text-amber-500 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0">
                          <Target size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-sm text-zinc-500">Avg Cal</p>
                          <p className="text-lg md:text-xl font-bold">{avgDailyCalories}</p>
                        </div>
                      </Card>
                    </div>

                    {/* Hydration Section integrated into Dashboard */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="relative overflow-hidden p-4 md:p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Droplets size={20} className="text-blue-500" />
                            <h3 className="font-bold text-sm md:text-base">Daily Hydration</h3>
                          </div>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase">Goal: 3.0L</span>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="relative w-20 h-20 md:w-24 md:h-24 flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90">
                              <circle
                                cx="50%" cy="50%" r="40%"
                                className="stroke-blue-100 fill-none"
                                strokeWidth="8"
                              />
                              <motion.circle
                                cx="50%" cy="50%" r="40%"
                                className="stroke-blue-500 fill-none"
                                strokeWidth="8"
                                strokeDasharray="100 100"
                                initial={{ strokeDashoffset: 100 }}
                                animate={{ strokeDashoffset: 100 - Math.min((waterLogs.reduce((s, l) => s + l.amount_ml, 0) / 3000) * 100, 100) }}
                                strokeLinecap="round"
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-lg md:text-xl font-bold">{(waterLogs.reduce((s, l) => s + l.amount_ml, 0) / 1000).toFixed(1)}</span>
                              <span className="text-[8px] text-zinc-400 font-bold uppercase">Liters</span>
                            </div>
                          </div>

                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <button 
                              onClick={() => handleLogWater(250)}
                              className="bg-blue-50 hover:bg-blue-100 text-blue-600 py-3 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1"
                            >
                              <Plus size={14} />
                              250ml
                            </button>
                            <button 
                              onClick={() => handleLogWater(500)}
                              className="bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1"
                            >
                              <Plus size={14} />
                              500ml
                            </button>
                          </div>
                        </div>
                      </Card>

                      {/* Medication Reminders integrated into Dashboard */}
                      <Card className="p-4 md:p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <AlertCircle size={20} className="text-rose-500" />
                            <h3 className="font-bold text-sm md:text-base">Medication Reminders</h3>
                          </div>
                          <div className="flex gap-2">
                            {notificationPermission !== 'granted' && (
                              <button 
                                onClick={requestNotificationPermission}
                                className="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-colors"
                              >
                                Enable Notifications
                              </button>
                            )}
                            <button 
                              onClick={() => setIsAddingMed(!isAddingMed)}
                              className="p-1 hover:bg-zinc-100 rounded-lg transition-colors"
                            >
                              <Plus size={20} className="text-zinc-500" />
                            </button>
                          </div>
                        </div>

                        {isAddingMed && (
                          <form onSubmit={handleAddMedication} className="mb-4 space-y-2 p-3 bg-zinc-50 rounded-2xl border border-black/5">
                            <input 
                              type="text" 
                              placeholder="Medication Name" 
                              value={medName} 
                              onChange={(e) => setMedName(e.target.value)}
                              className="w-full bg-white border border-black/5 rounded-xl px-3 py-2 text-xs outline-none"
                              required
                            />
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                placeholder="Dosage" 
                                value={medDosage} 
                                onChange={(e) => setMedDosage(e.target.value)}
                                className="flex-1 bg-white border border-black/5 rounded-xl px-3 py-2 text-xs outline-none"
                              />
                              <input 
                                type="time" 
                                value={medTime} 
                                onChange={(e) => setMedTime(e.target.value)}
                                className="flex-1 bg-white border border-black/5 rounded-xl px-3 py-2 text-xs outline-none"
                                required
                              />
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setIsAddingMed(false)} className="flex-1 py-2 text-xs font-bold text-zinc-500">Cancel</button>
                              <button type="submit" className="flex-1 bg-rose-500 text-white py-2 rounded-xl text-xs font-bold">Add</button>
                            </div>
                          </form>
                        )}

                        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                          {medications.length === 0 ? (
                            <p className="text-center py-8 text-xs text-zinc-400 italic">No medications added.</p>
                          ) : (
                            medications.map(med => {
                              const today = format(new Date(), 'yyyy-MM-dd');
                              const isTakenToday = med.last_taken_date === today;
                              const reminder = medicationReminders.find(r => r.med.id === med.id);
                              const isDue = reminder?.isDue || false;
                              const isOverdue = reminder?.isOverdue || false;

                              return (
                                <div key={med.id} className={cn(
                                  "flex items-center justify-between p-3 rounded-2xl border group transition-all",
                                  isOverdue ? "bg-red-50 border-red-200" :
                                  isDue ? "bg-amber-50 border-amber-200" :
                                  "bg-zinc-50 border-black/5"
                                )}>
                                  <div className="flex items-center gap-3">
                                    <div 
                                      className={cn(
                                        "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                        isTakenToday ? "bg-emerald-500 border-emerald-500 text-white" : 
                                        isOverdue ? "border-red-400 text-red-400" :
                                        isDue ? "border-amber-400 text-amber-400" :
                                        "border-zinc-300 text-transparent"
                                      )}
                                    >
                                      <CheckCircle2 size={14} />
                                    </div>
                                    <div>
                                      <p className={cn(
                                        "text-sm font-bold",
                                        isTakenToday && "line-through text-zinc-400",
                                        isOverdue && "text-red-700",
                                        isDue && "text-amber-700"
                                      )}>
                                        {med.name}
                                        {isOverdue && " (Overdue)"}
                                        {isDue && " (Due Now)"}
                                      </p>
                                      <p className="text-[10px] text-zinc-400">{med.dosage} • {med.time}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {(isDue || isOverdue) && !isTakenToday ? (
                                      <button
                                        onClick={() => handleToggleMedication(med)}
                                        title="Mark medication as taken"
                                        className="p-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
                                      >
                                        <Check size={14} />
                                      </button>
                                    ) : null}
                                    <button 
                                      onClick={() => {
                                        setDeleteConfirmId(med.id);
                                        setDeleteType('medication');
                                      }} 
                                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-300 hover:text-rose-500 transition-all"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </Card>
                    </div>

                  <div className="flex justify-between items-center">
                    <div className="flex bg-white rounded-xl border border-black/5 p-1">
                      {(['last3', 'week', 'month'] as const).map(range => (
                        <button
                          key={range}
                          onClick={() => setDashboardRange(range)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                            dashboardRange === range ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-50"
                          )}
                        >
                          {range === 'last3' ? 'Last 3' : range === 'week' ? 'Last Week' : 'Last Month'}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={generatePDFReport}
                      disabled={isGeneratingReport}
                      className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all disabled:opacity-50"
                    >
                      {isGeneratingReport ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Download size={16} />
                      )}
                      Export PDF Report
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="h-[350px] flex flex-col">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold flex items-center gap-2">
                          <TrendingUp size={18} className="text-emerald-500" />
                          Calorie & Expense Trends
                        </h3>
                      </div>
                      <div className="flex-1 min-h-[200px]">
                        {chartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#10b981' }} />
                              <Tooltip 
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              />
                              <Bar yAxisId="left" dataKey="calories" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Calories" />
                              <Bar yAxisId="right" dataKey="expense" fill="#10b981" radius={[4, 4, 0, 0]} name="Expense (₹)" />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
                            Log some meals to see calorie and expense trends
                          </div>
                        )}
                      </div>
                    </Card>

                    <Card className="h-[350px] flex flex-col">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold flex items-center gap-2">
                          <Activity size={18} className="text-blue-500" />
                          Macronutrient Trends
                        </h3>
                      </div>
                      <div className="flex-1 min-h-[200px]">
                        {chartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                              <Tooltip 
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              />
                              <Line type="monotone" dataKey="proteins" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Protein (g)" />
                              <Line type="monotone" dataKey="carbs" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="Carbs (g)" />
                              <Line type="monotone" dataKey="fats" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} name="Fats (g)" />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
                            Log some meals to see macronutrient trends
                          </div>
                        )}
                      </div>
                    </Card>

                    <Card className="flex flex-col">
                      <h3 className="font-bold mb-4 flex items-center gap-2">
                        <History size={18} className="text-emerald-500" />
                        Recent Logs
                      </h3>
                      <div className="space-y-4 overflow-y-auto max-h-[280px] pr-2">
                        {meals.length === 0 ? (
                          <div className="text-center py-12">
                            <p className="text-zinc-400 text-sm italic">No meals logged yet.</p>
                          </div>
                        ) : (
                           meals.slice(0, 5).map(meal => {
                             const isExpanded = expandedMealId === meal.id;
                             const mealItems = safeArray(meal.meal_items);
                             const alerts = safeArray(meal.alerts);
                             const insights = safeArray(meal.insights);

                            return (
                              <div 
                                key={meal.id} 
                                onClick={() => setExpandedMealId(isExpanded ? null : meal.id)}
                                className={cn(
                                  "flex flex-col p-3 bg-zinc-50 rounded-2xl border border-black/5 transition-all cursor-pointer",
                                  isExpanded ? "ring-2 ring-emerald-500/20 border-emerald-500/30" : "hover:border-emerald-200"
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-bold text-xs md:text-sm">
                                      {mealItems.map((i: any) => i.item).join(', ')}
                                    </p>
                                    <p className="text-[10px] md:text-xs text-zinc-400">
                                      {new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {meal.calories} kcal
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {alerts.length > 0 && (
                                      <AlertCircle size={14} className="text-amber-500" />
                                    )}
                                    <motion.div
                                      animate={{ rotate: isExpanded ? 90 : 0 }}
                                      transition={{ duration: 0.2 }}
                                    >
                                      <ChevronRight size={14} className="text-zinc-300" />
                                    </motion.div>
                                  </div>
                                </div>

                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="pt-3 mt-3 border-t border-black/5 space-y-3">
                                        <div className="grid grid-cols-3 gap-2">
                                          <div className="bg-white p-2 rounded-xl text-center border border-black/5">
                                            <p className="text-xs font-bold text-emerald-600">{meal.proteins}g</p>
                                            <p className="text-[8px] text-zinc-400 uppercase font-bold">Protein</p>
                                          </div>
                                          <div className="bg-white p-2 rounded-xl text-center border border-black/5">
                                            <p className="text-xs font-bold text-amber-600">{meal.carbs}g</p>
                                            <p className="text-[8px] text-zinc-400 uppercase font-bold">Carbs</p>
                                          </div>
                                          <div className="bg-white p-2 rounded-xl text-center border border-black/5">
                                            <p className="text-xs font-bold text-rose-600">{meal.fats}g</p>
                                            <p className="text-[8px] text-zinc-400 uppercase font-bold">Fats</p>
                                          </div>
                                        </div>

                                        {alerts.length > 0 && (
                                          <div className="space-y-1">
                                            <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Health Alerts</p>
                                            {alerts.map((alert: string, i: number) => (
                                              <p key={i} className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded-lg border border-amber-100">
                                                • {alert}
                                              </p>
                                            ))}
                                          </div>
                                        )}

                                        {insights.length > 0 && (
                                          <div className="space-y-1">
                                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">AI Insights</p>
                                            {insights.map((insight: string, i: number) => (
                                              <p key={i} className="text-[10px] text-emerald-700 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
                                                • {insight}
                                              </p>
                                            ))}
                                          </div>
                                        )}
                                        
                                        <div className="flex justify-between items-center pt-1">
                                          <p className="text-[10px] font-bold text-zinc-400 uppercase">Expense</p>
                                          <p className="text-xs font-bold text-zinc-700">₹{meal.expense.toFixed(2)}</p>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })
                        )}
                      </div>
                      {meals.length > 0 && (
                        <button 
                          onClick={() => setActiveTab('history')}
                          className="mt-4 text-xs font-semibold text-emerald-600 hover:underline text-center"
                        >
                          View Full History
                        </button>
                      )}
                    </Card>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* Log Tab */}
          {activeTab === 'log' && (
            <motion.div
              key="log"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto space-y-6"
            >
              <Card>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Log Your Meal</h2>
                    {(mealText || mealImage) && (
                      <button 
                        onClick={() => {
                          setMealText('');
                          setMealImage(null);
                          setAnalysisResult(null);
                        }}
                        className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1"
                      >
                        <Trash2 size={14} /> Clear
                      </button>
                    )}
                  </div>
                <div className="space-y-6">
                  {/* Image Upload Area */}
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "relative h-64 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden",
                      mealImage ? "border-emerald-500 bg-emerald-50/10" : "border-zinc-200 hover:border-emerald-300 hover:bg-zinc-50"
                    )}
                  >
                    {mealImage ? (
                      <>
                        <img src={mealImage} alt="Meal" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <p className="text-white font-medium flex items-center gap-2">
                            <Camera size={20} /> Change Photo
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-6">
                        <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 mx-auto mb-4">
                          <Camera size={32} />
                        </div>
                        <p className="font-bold text-zinc-700">Snap or Upload a Photo</p>
                        <p className="text-sm text-zinc-400 mt-1">AI will recognize the food items and portions</p>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700">Or Describe Your Meal</label>
                    <textarea
                      value={mealText}
                      onChange={(e) => setMealText(e.target.value)}
                      placeholder="e.g., 2 slices of whole wheat bread with avocado and a poached egg..."
                      className="w-full h-32 bg-zinc-50 border border-black/5 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700 flex items-center gap-2">
                      <DollarSign size={16} className="text-emerald-500" />
                      Expense (₹)
                    </label>
                    <input
                      type="number"
                      value={expenseInput}
                      onChange={(e) => setExpenseInput(e.target.value)}
                      placeholder="Enter actual cost of the meal"
                      className="w-full bg-zinc-50 border border-black/5 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                    <p className="text-[10px] text-zinc-400 italic">Optional: Leave blank for AI estimation.</p>
                  </div>

                  <button
                    onClick={handleAnalyzeMeal}
                    disabled={isAnalyzing}
                    className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Analyzing with AI...
                      </>
                    ) : (
                      <>
                        <Activity size={20} /> Analyze Nutrition
                      </>
                    )}
                  </button>
                </div>
              </Card>

              {/* Analysis Result */}
              {analysisResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  <Card className="border-emerald-500/20 bg-emerald-50/5">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold">AI Analysis Result</h3>
                      <CheckCircle2 className="text-emerald-500" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div>
                          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Recognized Items</p>
                          <div className="space-y-2">
                            {analysisResult.recognized_meal_items.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-xl border border-black/5">
                                <span className="font-medium">{item.item}</span>
                                <span className="text-sm text-zinc-500">{item.estimated_portion}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-white rounded-2xl border border-black/5 text-center">
                            <p className="text-2xl font-bold text-emerald-600">{analysisResult.nutritional_breakdown.total_calories}</p>
                            <p className="text-xs text-zinc-400 font-bold uppercase">Calories</p>
                          </div>
                          <div className="p-4 bg-white rounded-2xl border border-black/5 text-center">
                            <p className="text-2xl font-bold text-blue-600">{analysisResult.nutritional_breakdown.proteins_g}g</p>
                            <p className="text-xs text-zinc-400 font-bold uppercase">Protein</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center">
                        <div className="w-full h-48 min-h-[192px]">
                          {macroData.length > 0 ? (
                            <ResponsiveContainer width="100%" aspect={2}>
                              <PieChart>
                                <Pie
                                  data={macroData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                                >
                                  {macroData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
                              Analyze a meal to see macronutrient breakdown
                            </div>
                          )}
                        </div>
                        {macroData.length > 0 && (
                          <div className="flex gap-4 mt-2">
                            {macroData.map(m => (
                              <div key={m.name} className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                                <span className="text-xs font-medium text-zinc-500">{m.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-8 space-y-4">
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <label className="text-sm font-bold text-emerald-800 block mb-2">Meal Expense (₹)</label>
                        <div className="relative">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-bold">₹</div>
                          <input
                            type="number"
                            value={expenseInput}
                            onChange={(e) => setExpenseInput(e.target.value)}
                            className="w-full bg-white border border-emerald-200 rounded-xl p-3 pl-8 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-emerald-700"
                            placeholder="Enter amount"
                          />
                        </div>
                        <p className="text-[10px] text-emerald-600 mt-1 font-medium italic">
                          {parseFloat(expenseInput) > 0 ? "You specified this amount." : "AI estimated this based on your meal items."}
                        </p>
                      </div>

                      {analysisResult.disease_rule_alerts.length > 0 && (
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex gap-3">
                          <AlertCircle className="text-amber-500 shrink-0" size={20} />
                          <div>
                            <p className="text-sm font-bold text-amber-800">Health Alerts</p>
                            <ul className="text-sm text-amber-700 list-disc list-inside mt-1">
                              {analysisResult.disease_rule_alerts.map((alert, idx) => (
                                <li key={idx}>{alert}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 flex gap-3">
                        <Info className="text-blue-500 shrink-0" size={20} />
                        <div>
                          <p className="text-sm font-bold text-blue-800">Progress Insights</p>
                          <ul className="text-sm text-blue-700 list-disc list-inside mt-1">
                            {analysisResult.progress_insights.map((insight, idx) => (
                              <li key={idx}>{insight}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 flex gap-4">
                      <button
                        onClick={() => setAnalysisResult(null)}
                        className="flex-1 py-3 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-100 transition-all"
                      >
                        Discard
                      </button>
                      <button
                        onClick={handleSaveMeal}
                        className="flex-1 bg-emerald-500 text-white py-3 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                      >
                        Save to Log
                      </button>
                    </div>
                  </Card>
                </motion.div>
              )}
            </motion.div>
          )}



          {/* Recommendations Tab */}
          {activeTab === 'recommendations' && (
            <motion.div
              key="recommendations"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Personalized for You</h2>
                <button 
                  onClick={fetchRecommendations}
                  disabled={isFetchingRecs}
                  className="p-2 hover:bg-zinc-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  <Sparkles size={20} className={cn("text-emerald-500", isFetchingRecs && "animate-spin")} />
                </button>
              </div>

              {isFetchingRecs ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white h-32 rounded-3xl border border-black/5 animate-pulse" />
                  ))}
                </div>
              ) : recommendations.length === 0 ? (
                <Card className="py-20 text-center">
                  <Sparkles size={48} className="text-zinc-200 mx-auto mb-4" />
                  <p className="text-zinc-500">Log some meals to get personalized AI recommendations!</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {recommendations.map((rec, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <Card className="relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                        <div className={cn(
                          "absolute top-0 left-0 w-1 h-full",
                          rec.type === 'food' ? "bg-emerald-500" : rec.type === 'meal' ? "bg-blue-500" : "bg-amber-500"
                        )} />
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <Badge variant={rec.type === 'food' ? 'success' : rec.type === 'meal' ? 'info' : 'warning'}>
                              {rec.type.toUpperCase()}
                            </Badge>
                            <h3 className="text-base md:text-lg font-bold mt-2">{rec.title}</h3>
                            <p className="text-xs md:text-sm text-zinc-600 mt-1">{rec.description}</p>
                            <div className="mt-4 p-3 bg-zinc-50 rounded-xl border border-black/5">
                              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Why this?</p>
                              <p className="text-[10px] md:text-xs text-zinc-500 italic">{rec.reason}</p>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto"
            >
              <Card>
                <h2 className="text-2xl font-bold mb-6">Health Profile</h2>
                <form onSubmit={handleProfileSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700">Full Name</label>
                    <input
                      type="text"
                      required
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="e.g. Arjun"
                      className="w-full bg-zinc-50 border border-black/5 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-zinc-700">Age</label>
                      <input
                        type="number"
                        required
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        className="w-full bg-zinc-50 border border-black/5 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-zinc-700">Weight (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="w-full bg-zinc-50 border border-black/5 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-bold text-zinc-700">Height (cm)</label>
                      <span className="text-[10px] text-zinc-400">Supports meters (e.g. 1.7) too</span>
                    </div>
                    <input
                      type="number"
                      required
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="e.g. 170"
                      className="w-full bg-zinc-50 border border-black/5 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  {/* Live BMI Preview */}
                  {parseFloat(weight) > 0 && parseFloat(height) > 0 && (
                    <div className={cn("p-4 rounded-2xl border flex items-center justify-between", getBMICategory(calculateBMI(parseFloat(weight), parseFloat(height))).bg)}>
                      <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", getBMICategory(calculateBMI(parseFloat(weight), parseFloat(height))).bg.replace('50', '100'))}>
                          <Scale size={20} className={getBMICategory(calculateBMI(parseFloat(weight), parseFloat(height))).color} />
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-zinc-500">Calculated BMI</p>
                          <p className={cn("text-sm font-bold", getBMICategory(calculateBMI(parseFloat(weight), parseFloat(height))).color)}>
                            {calculateBMI(parseFloat(weight), parseFloat(height))}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-medium text-zinc-500">Category</p>
                        <p className={cn("text-xs font-bold", getBMICategory(calculateBMI(parseFloat(weight), parseFloat(height))).color)}>
                          {getBMICategory(calculateBMI(parseFloat(weight), parseFloat(height))).label}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-700">Health Conditions</label>
                    <div className="grid grid-cols-2 gap-3">
                      {['Diabetes', 'Hypertension', 'Obesity', 'None'].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            if (c === 'None') {
                              setConditions(['None']);
                            } else {
                              const newConditions = conditions.filter(item => item !== 'None');
                              if (newConditions.includes(c)) {
                                setConditions(newConditions.filter(item => item !== c));
                              } else {
                                setConditions([...newConditions, c]);
                              }
                            }
                          }}
                          className={cn(
                            "p-3 rounded-2xl border text-sm font-medium transition-all",
                            conditions.includes(c) 
                              ? "bg-emerald-500 border-emerald-500 text-white" 
                              : "bg-zinc-50 border-black/5 text-zinc-600 hover:border-emerald-300"
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700">Fitness Goals</label>
                    <select
                      value={goals}
                      onChange={(e) => setGoals(e.target.value)}
                      required
                      className="w-full bg-zinc-50 border border-black/5 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                    >
                      <option value="">Select a goal</option>
                      <option value="Weight Loss">Weight Loss</option>
                      <option value="Muscle Gain">Muscle Gain</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Better Blood Sugar Control">Better Blood Sugar Control</option>
                      <option value="Lower Blood Pressure">Lower Blood Pressure</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 disabled:opacity-50 transition-all mt-4"
                  >
                    {isLoading ? "Saving..." : "Save Profile"}
                  </button>
                  
                  <div className="pt-6 border-t border-black/5 mt-6">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full bg-rose-50 text-rose-500 py-4 rounded-2xl font-bold text-lg hover:bg-rose-100 transition-all flex items-center justify-center gap-2"
                    >
                      <LogOut size={20} />
                      Log Out from App
                    </button>
                  </div>
                </form>
              </Card>
            </motion.div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Meal History</h2>
                <div className="text-sm text-zinc-400 font-medium">
                  {meals.length} total logs
                </div>
              </div>

              {meals.length === 0 ? (
                <Card className="py-20 text-center">
                  <History size={48} className="text-zinc-200 mx-auto mb-4" />
                  <p className="text-zinc-500">No history found. Start by logging your first meal!</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {meals.map(meal => (
                    <Card key={meal.id} className="p-0 overflow-hidden group">
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">
                              {new Date(meal.timestamp).toLocaleDateString(undefined, { 
                                weekday: 'long', 
                                month: 'long', 
                                day: 'numeric' 
                              })}
                            </p>
                             <h3 className="text-lg font-bold">
                               {safeArray(meal.meal_items).map((i: any) => i.item).join(', ')}
                             </h3>
                          </div>
                          <div className="flex flex-col items-end">
                            <p className="text-xl font-bold text-emerald-600">{meal.calories} kcal</p>
                            <p className="text-xs text-zinc-400 font-medium">
                              {new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <div className="flex gap-2 mt-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleEditMeal(meal)}
                                className="p-2 bg-zinc-100 hover:bg-emerald-100 text-zinc-600 hover:text-emerald-600 rounded-xl transition-colors"
                                title="Edit Log"
                              >
                                <Activity size={16} />
                              </button>
                              <button 
                                onClick={() => {
                                  setDeleteConfirmId(meal.id);
                                  setDeleteType('meal');
                                }}
                                className="p-2 bg-zinc-100 hover:bg-rose-100 text-zinc-600 hover:text-rose-600 rounded-xl transition-colors"
                                title="Delete Log"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="p-2 bg-zinc-50 rounded-xl text-center">
                            <p className="text-sm font-bold">{meal.proteins}g</p>
                            <p className="text-[10px] text-zinc-400 uppercase">Protein</p>
                          </div>
                          <div className="p-2 bg-zinc-50 rounded-xl text-center">
                            <p className="text-sm font-bold">{meal.carbs}g</p>
                            <p className="text-[10px] text-zinc-400 uppercase">Carbs</p>
                          </div>
                          <div className="p-2 bg-zinc-50 rounded-xl text-center">
                            <p className="text-sm font-bold">{meal.fats}g</p>
                            <p className="text-[10px] text-zinc-400 uppercase">Fats</p>
                          </div>
                        </div>

                         {safeArray(meal.alerts).length > 0 && (
                           <div className="flex flex-wrap gap-2">
                             {safeArray(meal.alerts).map((alert: string, idx: number) => (
                               <Badge key={idx} variant="warning">{alert}</Badge>
                             ))}
                           </div>
                         )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Calendar Tab */}
          {activeTab === 'calendar' && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Daily Progress</h2>
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-black/5">
                  <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-zinc-50 rounded-lg">
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-sm font-bold min-w-[100px] text-center">
                    {format(currentMonth, 'MMMM yyyy')}
                  </span>
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-zinc-50 rounded-lg">
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

               <Card className="p-3">
                 <div className="grid grid-cols-7 gap-0.5 mb-1">
                   {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                     <div key={`${day}-${idx}`} className="text-center text-[8px] font-bold text-zinc-400 uppercase py-1">
                       {day}
                     </div>
                   ))}
                 </div>
                 <div className="grid grid-cols-7 gap-0.5">
                   {calendarDays.map((day, idx) => {
                     const dateKey = format(day, 'yyyy-MM-dd');
                     const hasMeals = mealsByDate[dateKey]?.length > 0;
                     const isSelected = isSameDay(day, selectedDate);
                     const isCurrentMonth = isSameMonth(day, currentMonth);

                     return (
                       <button
                         key={idx}
                         onClick={() => setSelectedDate(day)}
                         className={cn(
                           "rounded-xl flex flex-col items-center justify-center relative transition-all",
                           !isCurrentMonth && "opacity-20",
                           isSelected ? "bg-emerald-500 text-white shadow-md" : "hover:bg-zinc-50",
                           isToday(day) && !isSelected && "border border-emerald-500 text-emerald-600"
                         )}
                       >
                         <span className="text-xs font-medium">{format(day, 'd')}</span>
                         {hasMeals && (
                           <div className={cn(
                             "w-1 h-1 rounded-full mt-0.5",
                             isSelected ? "bg-white" : "bg-emerald-500"
                           )} />
                         )}
                       </button>
                     );
                   })}
                 </div>
               </Card>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">
                    {isToday(selectedDate) ? 'Today' : format(selectedDate, 'MMMM d')}
                  </h3>
                  {dailyStats.calories > 0 && (
                    <Badge variant="success">{dailyStats.calories} kcal total</Badge>
                  )}
                </div>

                {selectedDateMeals.length === 0 ? (
                  <Card className="py-12 text-center">
                    <p className="text-zinc-400 text-sm italic">No logs for this day.</p>
                    <button 
                      onClick={() => setActiveTab('log')}
                      className="mt-4 text-emerald-500 text-sm font-bold hover:underline"
                    >
                      Log a meal now
                    </button>
                  </Card>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-3xl border border-black/5 text-center">
                        <p className="text-lg font-bold text-emerald-600">{dailyStats.proteins}g</p>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase">Protein</p>
                      </div>
                      <div className="bg-white p-4 rounded-3xl border border-black/5 text-center">
                        <p className="text-lg font-bold text-amber-600">{dailyStats.carbs}g</p>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase">Carbs</p>
                      </div>
                      <div className="bg-white p-4 rounded-3xl border border-black/5 text-center">
                        <p className="text-lg font-bold text-rose-600">{dailyStats.fats}g</p>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase">Fats</p>
                      </div>
                    </div>

                    <div className="bg-emerald-50 p-4 rounded-3xl border border-emerald-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                          <DollarSign size={20} />
                        </div>
                        <div>
                          <p className="text-xs text-emerald-600 font-bold uppercase">Daily Spending</p>
                          <p className="text-xl font-bold text-emerald-700">₹{dailyStats.expense.toFixed(2)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setEditingMeal(null);
                          setAnalysisResult(null);
                          setMealText('');
                          setMealImage(null);
                          setExpenseInput('');
                          setActiveTab('log');
                        }}
                        className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all"
                      >
                        Add Meal
                      </button>
                    </div>

                    <div className="space-y-3">
                      {selectedDateMeals.map(meal => (
                        <div key={meal.id} className="bg-white p-4 rounded-3xl border border-black/5 flex justify-between items-center group">
                          <div>
                           <p className="font-bold text-sm">
                             {safeArray(meal.meal_items).map((i: any) => i.item).join(', ')}
                           </p>
                            <p className="text-xs text-zinc-400">
                              {new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ₹{meal.expense.toFixed(2)}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="font-bold text-emerald-600">{meal.calories} kcal</p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleEditMeal(meal)}
                                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600"
                              >
                                <Info size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteMeal(meal.id)}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-zinc-400 hover:text-rose-500"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Chatbot */}
      <div className="fixed bottom-24 right-6 z-30">
        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {deleteConfirmId && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full"
              >
                <div className="w-12 h-12 bg-rose-100 text-rose-500 rounded-2xl flex items-center justify-center mb-4">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-xl font-bold mb-2">Are you sure?</h3>
                <p className="text-zinc-500 text-sm mb-6">This action cannot be undone. This will permanently delete the selected log.</p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setDeleteConfirmId(null);
                      setDeleteType(null);
                    }}
                    className="flex-1 py-3 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (deleteType === 'meal') handleDeleteMeal(deleteConfirmId);
                      if (deleteType === 'medication') handleDeleteMedication(deleteConfirmId);
                      if (deleteType === 'water') handleDeleteWater(deleteConfirmId);
                      setDeleteConfirmId(null);
                      setDeleteType(null);
                    }}
                    className="flex-1 bg-rose-500 text-white py-3 rounded-2xl font-bold hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-[calc(100vw-3rem)] md:w-96 h-[500px] max-h-[70vh] rounded-3xl shadow-2xl border border-black/5 flex flex-col overflow-hidden mb-4"
            >
              <div className="bg-emerald-500 p-4 text-white flex justify-between items-center shadow-md">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                      <MessageSquare size={20} />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-emerald-500 rounded-full" />
                  </div>
                  <div>
                    <p className="font-bold text-sm leading-none">Nutri AI Assistant</p>
                    <p className="text-[10px] text-emerald-100 mt-1">Always active</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleClearChat} 
                    className="hover:bg-white/20 p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
                    title="Clear Chat"
                  >
                    <Trash2 size={14} />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Info size={24} />
                    </div>
                    <p className="text-sm font-bold text-zinc-700">Ask me anything!</p>
                    <p className="text-xs text-zinc-400 mt-1">"What should I eat for high protein?"</p>
                    <p className="text-xs text-zinc-400">"How to manage my diabetes?"</p>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={cn(
                    "flex flex-col gap-1",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "max-w-[85%] p-3.5 rounded-2xl text-sm shadow-sm",
                      msg.role === 'user' 
                        ? "bg-emerald-500 text-white rounded-tr-none" 
                        : "bg-white text-zinc-700 rounded-tl-none border border-black/5"
                    )}>
                      {msg.parts[0].text}
                    </div>
                    <span className="text-[10px] text-zinc-400 px-1">
                      {msg.role === 'user' ? 'You' : 'Nutri AI'}
                    </span>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="bg-white text-zinc-700 mr-auto p-3 rounded-2xl rounded-tl-none border border-black/5 flex gap-1">
                    <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 bg-white border-t border-black/5 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 bg-zinc-50 border border-black/5 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="bg-emerald-500 text-white p-2 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all"
                >
                  <Send size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all",
            isChatOpen ? "bg-zinc-900 text-white" : "bg-emerald-500 text-white hover:scale-110"
          )}
        >
          <MessageSquare size={24} className={cn("transition-transform", isChatOpen && "scale-110")} />
        </button>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-black/5 px-2 md:px-6 py-3 z-40">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all flex-1",
              activeTab === 'dashboard' ? "text-emerald-500" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            <TrendingUp size={22} className="md:w-6 md:h-6" />
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Stats</span>
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all flex-1",
              activeTab === 'calendar' ? "text-emerald-500" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            <CalendarIcon size={22} className="md:w-6 md:h-6" />
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Plan</span>
          </button>
          <div className="relative -top-6 md:-top-8 px-2">
            <button
              onClick={() => setActiveTab('log')}
              className={cn(
                "w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shadow-xl transition-all",
                activeTab === 'log' 
                  ? "bg-emerald-500 text-white scale-110 shadow-emerald-500/40" 
                  : "bg-zinc-900 text-white hover:bg-zinc-800"
              )}
            >
              <Plus size={28} className="md:w-8 md:h-8" />
            </button>
          </div>
          <button
            onClick={() => setActiveTab('recommendations')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all flex-1",
              activeTab === 'recommendations' ? "text-emerald-500" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            <Sparkles size={22} className="md:w-6 md:h-6" />
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Tips</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all flex-1",
              activeTab === 'profile' ? "text-emerald-500" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            <User size={22} className="md:w-6 md:h-6" />
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Profile</span>
          </button>
        </div>
      </nav>
    </div>
  </ErrorBoundary>
  );
}
