"""
Task API Routes — Endpoints for managing background tasks.

Provides:
    GET  /api/v1/tasks/{task_id}    — Poll task status, progress, and logs
    POST /api/v1/tasks/{task_id}/cancel — Cancel a running task
    GET  /api/v1/tasks              — List recent tasks
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from app.core.task_manager import task_manager, TaskStatus

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])


@router.get("/{task_id}")
async def get_task_status(task_id: str):
    """
    Poll the status of a background task.

    Returns: task_id, status, progress (0-100), logs, result, error.
    Client should poll this endpoint until status is 'completed' or 'failed'.
    Recommended polling interval: 1-2 seconds.
    """
    task = task_manager.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task.to_dict()


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str):
    """
    Cancel a running task.
    The worker will check task.is_cancelled on each iteration and stop.
    """
    success = task_manager.cancel(task_id)
    if not success:
        task = task_manager.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel task in state '{task.status.value}'"
        )
    return {"status": "cancelled", "task_id": task_id}


@router.get("")
async def list_tasks(task_type: str = None, limit: int = 20):
    """
    List recent tasks, optionally filtered by type.
    """
    return {"tasks": task_manager.list_tasks(task_type=task_type, limit=limit)}
