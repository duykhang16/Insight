"""MongoDB connection manager using Motor async driver.

Collections:
  - users        — identity + internal app role
  - audit_logs   — 90-day TTL audit trail
  - zones        — zone/group definitions with site assignments and members
  - tenants      — customer/company records with assigned tenant_admin
  - master_config — singleton Aruba master account config + token cache
"""
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import MONGODB_URL, DATABASE_NAME

client: AsyncIOMotorClient = None
db = None


async def connect_to_mongo():
    """Connect to MongoDB insight DB and set up required indexes."""
    global client, db
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    await client.admin.command("ping")
    node_info = client.address
    host_port = f"{node_info[0]}:{node_info[1]}" if node_info else "localhost:27017"
    print(f"INFO: Connected to MongoDB at {host_port} (Database: {DATABASE_NAME})")

    # === Core collections ===
    await db.users.create_index("email", unique=True)
    await db.audit_logs.create_index("timestamp", expireAfterSeconds=7776000)

    # === Zone management collections ===
    await db.zones.create_index("name", unique=True)
    await db.zones.create_index("members.email")
    await db.zones.create_index("site_ids")

    # === Tenants (customers/companies) ===
    await db.tenants.create_index("name", unique=True)
    await db.tenants.create_index("admin_email", sparse=True)

    # === Master account config (per-tenant) ===
    await db.master_config.create_index([("linked_by", 1), ("is_active", 1)])

    # === Alert notification read status (per user per site) ===
    await db.alert_reads.create_index([("user_email", 1), ("site_id", 1)], unique=True)


async def close_mongo_connection():
    """Close MongoDB connection."""
    global client
    if client:
        client.close()
        print("MongoDB connection closed.")


def get_database():
    """Get the database instance."""
    return db
