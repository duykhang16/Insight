import { useState, useRef, useCallback, useEffect } from 'react';
import apiClient from '../../../services/apiClient';

/**
 * useTaskPolling — React hook for polling background task progress.
 *
 * Usage:
 *   const { taskState, startPolling, stopPolling, cancelTask } = useTaskPolling();
 *
 *   // Submit bulk operation
 *   const res = await apiClient.post('/cloner/apply-async', payload);
 *   startPolling(res.data.task_id);
 *
 *   // taskState contains: status, progress, logs, result, error
 *
 * @param {Object} options
 * @param {number} options.interval - Polling interval in ms (default: 1500)
 * @param {function} options.onComplete - Callback when task completes
 * @param {function} options.onError - Callback when task fails
 * @param {function} options.onProgress - Callback on each progress update
 */
export default function useTaskPolling({
    interval = 1500,
    onComplete = null,
    onError = null,
    onProgress = null,
} = {}) {
    const [taskState, setTaskState] = useState({
        taskId: null,
        status: 'idle',       // idle | pending | running | completed | failed | cancelled
        progress: 0,
        totalItems: 0,
        completedItems: 0,
        logs: [],
        result: null,
        error: null,
        meta: {},
    });

    const intervalRef = useRef(null);
    const taskIdRef = useRef(null);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const poll = useCallback(async (taskId) => {
        try {
            const res = await apiClient.get(`/tasks/${taskId}`);
            const data = res.data;

            const newState = {
                taskId: data.task_id,
                status: data.status,
                progress: data.progress,
                totalItems: data.total_items,
                completedItems: data.completed_items,
                logs: data.logs || [],
                result: data.result,
                error: data.error,
                meta: data.meta || {},
            };

            setTaskState(newState);
            onProgress?.(newState);

            // Check for terminal states
            if (data.status === 'completed') {
                stopPolling();
                onComplete?.(newState);
            } else if (data.status === 'failed') {
                stopPolling();
                onError?.(newState);
            } else if (data.status === 'cancelled') {
                stopPolling();
            }
        } catch (err) {
            console.error('[useTaskPolling] Poll error:', err);
            // Don't stop polling on transient errors
        }
    }, [onComplete, onError, onProgress, stopPolling]);

    const startPolling = useCallback((taskId) => {
        stopPolling(); // Clear any existing
        taskIdRef.current = taskId;

        setTaskState(prev => ({
            ...prev,
            taskId,
            status: 'pending',
            progress: 0,
            logs: [],
            result: null,
            error: null,
        }));

        // Immediate first poll
        poll(taskId);

        // Then poll on interval
        intervalRef.current = setInterval(() => poll(taskId), interval);
    }, [interval, poll, stopPolling]);

    const cancelTask = useCallback(async () => {
        const taskId = taskIdRef.current;
        if (!taskId) return;

        try {
            await apiClient.post(`/tasks/${taskId}/cancel`);
            setTaskState(prev => ({ ...prev, status: 'cancelled' }));
            stopPolling();
        } catch (err) {
            console.error('[useTaskPolling] Cancel error:', err);
        }
    }, [stopPolling]);

    const reset = useCallback(() => {
        stopPolling();
        taskIdRef.current = null;
        setTaskState({
            taskId: null,
            status: 'idle',
            progress: 0,
            totalItems: 0,
            completedItems: 0,
            logs: [],
            result: null,
            error: null,
            meta: {},
        });
    }, [stopPolling]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    return {
        taskState,
        isRunning: ['pending', 'running'].includes(taskState.status),
        isComplete: taskState.status === 'completed',
        isFailed: taskState.status === 'failed',
        isCancelled: taskState.status === 'cancelled',
        startPolling,
        stopPolling,
        cancelTask,
        reset,
    };
}
