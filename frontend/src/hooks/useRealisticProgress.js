import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useRealisticProgress
 * --------------------
 * A progress hook that produces natural-feeling progress animations.
 *
 * Modes:
 *  1. **Milestone mode** (real backend data):
 *     Call `setMilestone(realPercent)` whenever backend reports actual progress
 *     (e.g. after each site in a loop). The displayed value eases smoothly
 *     toward each milestone.
 *
 *  2. **Indeterminate mode** (single API call, no intermediate progress):
 *     Call `start()` and the bar auto-advances with natural deceleration:
 *       - 0→50%:  fast   (~3s)
 *       - 50→75%: medium (~5s)
 *       - 75→92%: slow   (~8s)
 *       - Caps at 92%, never reaches 100% until `finish()` is called.
 *     Call `finish()` when the API responds → smoothly animates to 100%.
 *
 * API:
 *   const p = useRealisticProgress();
 *   p.progress      — displayed value (0-100), updates at 60fps-ish
 *   p.isActive       — true while progress is running
 *   p.start()        — begin indeterminate progress
 *   p.setMilestone(n)— set a real progress milestone (0-100)
 *   p.finish()       — animate to 100% and stop
 *   p.fail()         — animate to 0% and stop (error case)
 *   p.reset()        — hard reset everything to 0
 */
const TICK_MS = 50; // smooth updates every 50ms

// Speed curves for indeterminate mode (% per tick)
const getIndeterminateIncrement = (current) => {
    if (current < 30)  return 1.2;   // fast start
    if (current < 50)  return 0.8;   // moderate
    if (current < 70)  return 0.35;  // slowing
    if (current < 85)  return 0.12;  // crawl
    if (current < 92)  return 0.04;  // barely moving
    return 0;                         // hard cap at 92
};

// Easing speed toward milestone (closes 15% of the gap per tick)
const EASE_FACTOR = 0.15;

export default function useRealisticProgress() {
    const [progress, setProgress] = useState(0);
    const [isActive, setIsActive] = useState(false);

    const targetRef = useRef(0);       // where we want to be
    const displayRef = useRef(0);      // current displayed value
    const modeRef = useRef('idle');     // 'idle' | 'indeterminate' | 'milestone' | 'finishing'
    const timerRef = useRef(null);

    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const tick = useCallback(() => {
        const mode = modeRef.current;

        if (mode === 'indeterminate') {
            const increment = getIndeterminateIncrement(displayRef.current);
            displayRef.current = Math.min(92, displayRef.current + increment);
        } else if (mode === 'milestone') {
            const gap = targetRef.current - displayRef.current;
            if (Math.abs(gap) < 0.5) {
                displayRef.current = targetRef.current;
            } else {
                displayRef.current += gap * EASE_FACTOR;
            }
        } else if (mode === 'finishing') {
            const gap = targetRef.current - displayRef.current;
            if (Math.abs(gap) < 0.5) {
                displayRef.current = targetRef.current;
            } else {
                // Faster easing for the final stretch to 100%
                displayRef.current += gap * 0.35;
            }
        }

        const rounded = Math.round(displayRef.current);
        setProgress(rounded);

        // Stop when finished and reached 100
        if (mode === 'finishing' && rounded >= 100) {
            displayRef.current = 100;
            setProgress(100);
            modeRef.current = 'idle';
            setIsActive(false);
            stopTimer();
        }

        // Stop when failed and reached 0
        if (mode === 'failing' && rounded <= 0) {
            displayRef.current = 0;
            setProgress(0);
            modeRef.current = 'idle';
            setIsActive(false);
            stopTimer();
        }
    }, [stopTimer]);

    const ensureTimer = useCallback(() => {
        if (!timerRef.current) {
            timerRef.current = setInterval(tick, TICK_MS);
        }
    }, [tick]);

    // Start indeterminate progress (no backend milestone data)
    const start = useCallback(() => {
        stopTimer();
        displayRef.current = 0;
        targetRef.current = 0;
        modeRef.current = 'indeterminate';
        setProgress(0);
        setIsActive(true);
        ensureTimer();
    }, [stopTimer, ensureTimer]);

    // Set a real progress milestone from backend data (0-100)
    const setMilestone = useCallback((percent) => {
        const clamped = Math.max(0, Math.min(99, percent)); // never auto-100
        // NEVER go backwards — take the higher of current display or new target
        targetRef.current = Math.max(displayRef.current, clamped);
        if (modeRef.current === 'idle' || modeRef.current === 'indeterminate') {
            modeRef.current = 'milestone';
            setIsActive(true);
        }
        ensureTimer();
    }, [ensureTimer]);

    // Animate to 100% and complete
    const finish = useCallback(() => {
        targetRef.current = 100;
        modeRef.current = 'finishing';
        ensureTimer();
    }, [ensureTimer]);

    // Animate back to 0 on error
    const fail = useCallback(() => {
        targetRef.current = 0;
        modeRef.current = 'failing';
        ensureTimer();
    }, [ensureTimer]);

    // Hard reset
    const reset = useCallback(() => {
        stopTimer();
        displayRef.current = 0;
        targetRef.current = 0;
        modeRef.current = 'idle';
        setProgress(0);
        setIsActive(false);
    }, [stopTimer]);

    // Cleanup on unmount
    useEffect(() => () => stopTimer(), [stopTimer]);

    return { progress, isActive, start, setMilestone, finish, fail, reset };
}
