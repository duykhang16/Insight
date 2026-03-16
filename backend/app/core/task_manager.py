"""
Task Manager — In-memory async task queue for bulk operations.

Architecture:
    1. Client POST → FastAPI creates task, returns HTTP 202 + task_id
    2. Background worker processes items sequentially with real progress
    3. Client polls GET /tasks/{task_id} for progress, logs, and final result

Usage:
    task = task_manager.create_task("bulk_clone", total_items=5, meta={...})
    asyncio.create_task(my_worker(task.task_id, ...))
    return {"task_id": task.task_id}  # HTTP 202

Worker pattern:
    async def my_worker(task_id, ...):
        task = task_manager.get(task_id)
        for i, item in enumerate(items):
            task.add_log("Processing", item_name, "running")
            result = await do_work(item)
            task.update_log(i, status=result.status, detail=result.detail)
            task.advance_progress()
        task.complete()
"""

import asyncio
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskLogEntry:
    """A single log entry within a task."""
    item_name: str
    status: str  # SUCCESS, ERROR, SKIPPED, RUNNING, etc.
    detail: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "item_name": self.item_name,
            "status": self.status,
            "detail": self.detail,
            "timestamp": self.timestamp,
        }


@dataclass
class Task:
    """Represents a background task with progress tracking."""
    task_id: str
    task_type: str
    status: TaskStatus = TaskStatus.PENDING
    total_items: int = 0
    completed_items: int = 0
    progress: int = 0  # 0-100
    logs: List[TaskLogEntry] = field(default_factory=list)
    result: Any = None
    error: Optional[str] = None
    meta: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    _cancelled: bool = field(default=False, repr=False)

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled

    def start(self):
        """Mark task as running."""
        self.status = TaskStatus.RUNNING
        self._touch()

    def add_log(self, item_name: str, status: str = "RUNNING", detail: str = "") -> int:
        """Add a log entry and return its index."""
        entry = TaskLogEntry(item_name=item_name, status=status, detail=detail)
        self.logs.append(entry)
        self._touch()
        return len(self.logs) - 1

    def update_log(self, index: int, status: str, detail: str = ""):
        """Update an existing log entry."""
        if 0 <= index < len(self.logs):
            self.logs[index].status = status
            self.logs[index].detail = detail
            self.logs[index].timestamp = datetime.now(timezone.utc).isoformat()
            self._touch()

    def advance_progress(self, count: int = 1):
        """Advance completed items and recalculate progress."""
        self.completed_items = min(self.completed_items + count, self.total_items)
        self.progress = round((self.completed_items / max(self.total_items, 1)) * 100)
        self._touch()

    def complete(self, result: Any = None):
        """Mark task as completed."""
        self.status = TaskStatus.COMPLETED
        self.progress = 100
        self.result = result
        self._touch()

    def fail(self, error: str):
        """Mark task as failed."""
        self.status = TaskStatus.FAILED
        self.error = error
        self._touch()

    def cancel(self):
        """Cancel the task."""
        self._cancelled = True
        self.status = TaskStatus.CANCELLED
        self.add_log("SYSTEM", "CANCELLED", "Task cancelled by user.")
        self._touch()

    def _touch(self):
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status.value,
            "total_items": self.total_items,
            "completed_items": self.completed_items,
            "progress": self.progress,
            "logs": [log.to_dict() for log in self.logs],
            "result": self.result,
            "error": self.error,
            "meta": self.meta,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class TaskManager:
    """
    In-memory task manager for background jobs.

    Thread-safe via asyncio (single event loop).
    For production scaling, swap with Redis/Celery.
    """

    def __init__(self, max_tasks: int = 200):
        self._tasks: Dict[str, Task] = {}
        self._max_tasks = max_tasks

    def create_task(self, task_type: str, total_items: int = 0, meta: Dict[str, Any] = None) -> Task:
        """Create a new task and register it."""
        # Cleanup old completed tasks if over limit
        self._cleanup_if_needed()

        task_id = str(uuid.uuid4())
        task = Task(
            task_id=task_id,
            task_type=task_type,
            total_items=total_items,
            meta=meta or {},
        )
        self._tasks[task_id] = task
        print(f"[TASK_MANAGER] Created task {task_id} (type={task_type}, items={total_items})")
        return task

    def get(self, task_id: str) -> Optional[Task]:
        """Get a task by ID."""
        return self._tasks.get(task_id)

    def cancel(self, task_id: str) -> bool:
        """Cancel a running task."""
        task = self._tasks.get(task_id)
        if task and task.status in [TaskStatus.PENDING, TaskStatus.RUNNING]:
            task.cancel()
            print(f"[TASK_MANAGER] Cancelled task {task_id}")
            return True
        return False

    def list_tasks(self, task_type: str = None, limit: int = 20) -> List[dict]:
        """List recent tasks, optionally filtered by type."""
        tasks = list(self._tasks.values())
        if task_type:
            tasks = [t for t in tasks if t.task_type == task_type]
        # Sort by created_at desc
        tasks.sort(key=lambda t: t.created_at, reverse=True)
        return [t.to_dict() for t in tasks[:limit]]

    def _cleanup_if_needed(self):
        """Remove oldest completed tasks if over limit."""
        if len(self._tasks) < self._max_tasks:
            return
        # Sort by created_at, remove oldest completed
        completed = [
            (tid, t) for tid, t in self._tasks.items()
            if t.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]
        ]
        completed.sort(key=lambda x: x[1].created_at)
        # Remove oldest half
        to_remove = completed[:len(completed) // 2]
        for tid, _ in to_remove:
            del self._tasks[tid]
        if to_remove:
            print(f"[TASK_MANAGER] Cleaned up {len(to_remove)} old tasks")


# Singleton
task_manager = TaskManager()
