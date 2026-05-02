import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def check_mongodb_connection():
    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("Error: MONGODB_URI not found in environment variables.")
        return

    print(f"Attempting to connect to MongoDB...")
    
    try:
        # Initialize the client
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        
        # The 'ping' command is cheap and does not require auth
        client.admin.command('ping')
        
        print("SUCCESS: MongoDB is connected successfully!")
        
        # Optional: Print database names
        # dbs = client.list_database_names()
        # print(f"Databases: {dbs}")
        
    except Exception as e:
        print(f"FAILED: Could not connect to MongoDB.")
        print(f"Error Details: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    check_mongodb_connection()
