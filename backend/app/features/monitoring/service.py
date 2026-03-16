"""System Monitoring Service — collects server metrics, DB stats, and traffic analytics.

Only accessible by super_admin role.
"""
import traceback
import platform
import psutil
from datetime import datetime, timezone, timedelta
from app.database.connection import get_database


class MonitoringService:
    """Encapsulates all monitoring data collection logic."""

    # ── Server Metrics ─────────────────────────────────────────────────────

    async def get_server_metrics(self) -> dict:
        """Collect CPU, RAM, Disk usage of the host machine."""
        # CPU
        cpu_percent = psutil.cpu_percent(interval=0.5)
        cpu_count_logical = psutil.cpu_count(logical=True)
        cpu_count_physical = psutil.cpu_count(logical=False)
        cpu_freq = psutil.cpu_freq()

        # Memory
        mem = psutil.virtual_memory()

        # Disk — auto-detect: '/' for Linux/Docker, 'C:\' for Windows
        disk_path = "/" if platform.system() != "Windows" else "C:\\"
        try:
            disk = psutil.disk_usage(disk_path)
        except Exception:
            disk = None

        # Uptime
        boot_time = datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc)
        uptime_seconds = (datetime.now(timezone.utc) - boot_time).total_seconds()

        # Network I/O
        net_io = psutil.net_io_counters()

        disk_data = {
            "total_bytes": disk.total if disk else 0,
            "used_bytes": disk.used if disk else 0,
            "free_bytes": disk.free if disk else 0,
            "percent": disk.percent if disk else 0,
        }

        return {
            "cpu": {
                "percent": cpu_percent,
                "cores_physical": cpu_count_physical,
                "cores_logical": cpu_count_logical,
                "freq_mhz": round(cpu_freq.current, 0) if cpu_freq else None,
            },
            "memory": {
                "total_bytes": mem.total,
                "used_bytes": mem.used,
                "available_bytes": mem.available,
                "percent": mem.percent,
            },
            "disk": disk_data,
            "network": {
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv,
                "packets_sent": net_io.packets_sent,
                "packets_recv": net_io.packets_recv,
            },
            "system": {
                "platform": platform.system(),
                "platform_release": platform.release(),
                "architecture": platform.machine(),
                "hostname": platform.node(),
                "python_version": platform.python_version(),
                "boot_time": boot_time.isoformat(),
                "uptime_seconds": int(uptime_seconds),
            },
        }

    # ── Database Stats ─────────────────────────────────────────────────────

    async def get_db_stats(self) -> dict:
        """Collect MongoDB database statistics."""
        db = get_database()
        if db is None:
            return {"error": "Database not connected"}

        # Database stats
        try:
            db_stats = await db.command("dbStats")
        except Exception as e:
            print(f"[Monitoring] dbStats failed: {e}")
            db_stats = {}

        # Collection info — use count_documents + estimated sizes
        collection_names = await db.list_collection_names()
        collections = []
        for col_name in sorted(collection_names):
            try:
                # Try collStats first (works on most MongoDB versions)
                col_stats = await db.command("collStats", col_name)
                collections.append({
                    "name": col_name,
                    "count": col_stats.get("count", 0),
                    "size_bytes": col_stats.get("size", 0),
                    "avg_obj_size": col_stats.get("avgObjSize", 0),
                    "storage_size": col_stats.get("storageSize", 0),
                    "indexes": col_stats.get("nindexes", 0),
                })
            except Exception:
                # Fallback: just count documents
                try:
                    count = await db[col_name].estimated_document_count()
                except Exception:
                    count = 0
                collections.append({
                    "name": col_name,
                    "count": count,
                    "size_bytes": 0,
                    "avg_obj_size": 0,
                    "storage_size": 0,
                    "indexes": 0,
                })

        # Server status (connection info)
        connections = {}
        try:
            server_status = await db.client.admin.command("serverStatus")
            connections = server_status.get("connections", {})
        except Exception as e:
            print(f"[Monitoring] serverStatus failed: {e}")

        return {
            "database_name": db_stats.get("db", ""),
            "total_size_bytes": db_stats.get("dataSize", 0),
            "storage_size_bytes": db_stats.get("storageSize", 0),
            "index_size_bytes": db_stats.get("indexSize", 0),
            "total_collections": db_stats.get("collections", len(collection_names)),
            "total_documents": db_stats.get("objects", 0),
            "connections": {
                "current": connections.get("current", 0),
                "available": connections.get("available", 0),
                "total_created": connections.get("totalCreated", 0),
            },
            "collections": collections,
        }

    # ── User Stats ─────────────────────────────────────────────────────────

    async def get_user_stats(self) -> dict:
        """Collect user statistics from the database."""
        db = get_database()
        if db is None:
            return {"error": "Database not connected"}

        # Total users
        total_users = await db.users.count_documents({})

        # Users by role
        role_pipeline = [
            {"$group": {"_id": "$role", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        role_cursor = db.users.aggregate(role_pipeline)
        roles = {}
        async for doc in role_cursor:
            roles[doc["_id"] or "unknown"] = doc["count"]

        # Approved vs pending
        approved_count = await db.users.count_documents({"isApproved": True})
        pending_count = await db.users.count_documents({"isApproved": {"$ne": True}})

        # Recent signups (last 7 days)
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent_signups = await db.users.count_documents({
            "created_at": {"$gte": seven_days_ago}
        })

        return {
            "total_users": total_users,
            "by_role": roles,
            "approved": approved_count,
            "pending": pending_count,
            "recent_signups_7d": recent_signups,
        }

    # ── Traffic Analytics ──────────────────────────────────────────────────

    async def get_traffic_analytics(self, days: int = 7) -> dict:
        """Analyze traffic from audit_logs collection."""
        db = get_database()
        if db is None:
            return {"error": "Database not connected"}

        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Total requests in period
        total_requests = await db.audit_logs.count_documents({
            "timestamp": {"$gte": since}
        })

        # Requests by action (top features used) — skip nulls
        action_pipeline = [
            {"$match": {"timestamp": {"$gte": since}, "action": {"$ne": None}}},
            {"$group": {"_id": "$action", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 15},
        ]
        action_cursor = db.audit_logs.aggregate(action_pipeline)
        top_actions = []
        async for doc in action_cursor:
            top_actions.append({"action": doc["_id"] or "Unknown", "count": doc["count"]})

        # Requests by endpoint (API usage) — skip nulls
        endpoint_pipeline = [
            {"$match": {"timestamp": {"$gte": since}, "endpoint": {"$ne": None}}},
            {"$group": {"_id": "$endpoint", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 15},
        ]
        endpoint_cursor = db.audit_logs.aggregate(endpoint_pipeline)
        top_endpoints = []
        async for doc in endpoint_cursor:
            top_endpoints.append({"endpoint": doc["_id"] or "Unknown", "count": doc["count"]})

        # Top active users — skip null/anonymous, fallback to insight_user_id
        user_pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$addFields": {
                "resolved_email": {
                    "$ifNull": ["$actor_email", {"$ifNull": ["$insight_user_id", "system"]}]
                }
            }},
            {"$match": {"resolved_email": {"$nin": [None, "anonymous", ""]}}},
            {"$group": {"_id": "$resolved_email", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        user_cursor = db.audit_logs.aggregate(user_pipeline)
        top_users = []
        async for doc in user_cursor:
            email = doc["_id"]
            if email and email not in ("system", "anonymous"):
                top_users.append({"email": email, "count": doc["count"]})

        # Traffic over time (daily breakdown)
        daily_pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}
                    },
                    "count": {"$sum": 1},
                    "success": {
                        "$sum": {"$cond": [{"$eq": ["$status", "SUCCESS"]}, 1, 0]}
                    },
                    "error": {
                        "$sum": {"$cond": [{"$eq": ["$status", "ERROR"]}, 1, 0]}
                    },
                }
            },
            {"$sort": {"_id": 1}},
        ]
        daily_cursor = db.audit_logs.aggregate(daily_pipeline)
        daily_traffic = []
        async for doc in daily_cursor:
            daily_traffic.append({
                "date": doc["_id"],
                "total": doc["count"],
                "success": doc["success"],
                "error": doc["error"],
            })

        # Success vs Error rate
        success_count = await db.audit_logs.count_documents({
            "timestamp": {"$gte": since},
            "status": "SUCCESS",
        })
        error_count = await db.audit_logs.count_documents({
            "timestamp": {"$gte": since},
            "status": "ERROR",
        })

        # Requests by HTTP method — skip nulls
        method_pipeline = [
            {"$match": {"timestamp": {"$gte": since}, "method": {"$ne": None}}},
            {"$group": {"_id": "$method", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        method_cursor = db.audit_logs.aggregate(method_pipeline)
        by_method = {}
        async for doc in method_cursor:
            by_method[doc["_id"] or "OTHER"] = doc["count"]

        # Unique IPs
        unique_ips = 0
        try:
            ip_pipeline = [
                {"$match": {"timestamp": {"$gte": since}, "ip_address": {"$ne": None}}},
                {"$group": {"_id": "$ip_address"}},
                {"$count": "total"},
            ]
            ip_cursor = db.audit_logs.aggregate(ip_pipeline)
            async for doc in ip_cursor:
                unique_ips = doc["total"]
        except Exception:
            pass

        return {
            "period_days": days,
            "total_requests": total_requests,
            "success_count": success_count,
            "error_count": error_count,
            "success_rate": round(
                (success_count / total_requests * 100) if total_requests > 0 else 0, 1
            ),
            "unique_ips": unique_ips,
            "by_method": by_method,
            "top_actions": top_actions,
            "top_endpoints": top_endpoints,
            "top_users": top_users,
            "daily_traffic": daily_traffic,
        }

    # ── Combined Dashboard ─────────────────────────────────────────────────

    async def get_full_dashboard(self, traffic_days: int = 7) -> dict:
        """Get all monitoring data in a single call."""
        errors = []

        try:
            server = await self.get_server_metrics()
        except Exception as e:
            print(f"[Monitoring] get_server_metrics failed: {traceback.format_exc()}")
            errors.append(f"server: {str(e)}")
            server = {}

        try:
            db_stats = await self.get_db_stats()
        except Exception as e:
            print(f"[Monitoring] get_db_stats failed: {traceback.format_exc()}")
            errors.append(f"database: {str(e)}")
            db_stats = {}

        try:
            user_stats = await self.get_user_stats()
        except Exception as e:
            print(f"[Monitoring] get_user_stats failed: {traceback.format_exc()}")
            errors.append(f"users: {str(e)}")
            user_stats = {}

        try:
            traffic = await self.get_traffic_analytics(days=traffic_days)
        except Exception as e:
            print(f"[Monitoring] get_traffic_analytics failed: {traceback.format_exc()}")
            errors.append(f"traffic: {str(e)}")
            traffic = {}

        result = {
            "server": server,
            "database": db_stats,
            "users": user_stats,
            "traffic": traffic,
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }
        if errors:
            result["errors"] = errors
        return result


monitoring_service = MonitoringService()
