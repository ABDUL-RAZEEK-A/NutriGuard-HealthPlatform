import google.generativeai as genai
import os
from dotenv import load_dotenv

# Use absolute path for safety
dotenv_path = r"e:\NutriGuard\.env"
load_dotenv(dotenv_path=dotenv_path)

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print(f"Error: GEMINI_API_KEY not found at {dotenv_path}")
    # Print current environment variables for debugging (obscuring the key)
    print("Available env vars:", [k for k in os.environ.keys() if "GEMINI" in k])
else:
    try:
        genai.configure(api_key=api_key)
        print("Fetching available models...")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"- {m.name} ({m.display_name})")
    except Exception as e:
        print(f"Error: {e}")
