import asyncio
import os
import sys
from datetime import datetime, timezone

# Add backend to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database.connection import connect_to_mongo, close_mongo_connection, get_database
from app.database.auth_crud import hash_password

async def reset_admin():
    print("--- Insight Admin Reset Tool ---")
    await connect_to_mongo()
    
    try:
        db = get_database()
        target_email = "admin@insight"
        default_pass = "insight@2026"
        
        user = await db.users.find_one({"email": target_email})
        
        if not user:
            print(f"User {target_email} not found. Creating...")
            doc = {
                "email": target_email,
                "role": "super_admin",
                "isApproved": True,
                "password_hash": hash_password(default_pass),
                "created_at": datetime.now(timezone.utc)
            }
            await db.users.insert_one(doc)
            print("Successfully created super_admin: admin@insight / insight@2026")
        else:
            print(f"User {target_email} found. Resetting password...")
            await db.users.update_one(
                {"email": target_email},
                {"$set": {
                    "password_hash": hash_password(default_pass),
                    "role": "super_admin",
                    "isApproved": True
                }}
            )
            print(f"Successfully reset password for {target_email} to '{default_pass}'")
            
        # Check all users
        print("\nExisting users in system:")
        cursor = db.users.find({})
        async for u in cursor:
            status = "Approved" if u.get("isApproved") else "NOT Approved"
            print(f" - {u['email']} (Role: {u.get('role', 'viewer')}, Status: {status})")
            
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(reset_admin())
