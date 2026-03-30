import { useEffect, useRef } from 'react';

/**
 * Custom hook for running a callback at a specified interval.
 * Automatically handles cleanup when component unmounts or dependencies change.
 * 
 * @param {Function} callback - The function to execute
 * @param {number} delay - Delay in milliseconds (null or 0 to pause)
 * @param {Array} dependencies - Dependencies that will trigger a reset of the interval if changed
 */
const useIntervalFetch = (callback, delay = 60000, dependencies = []) => {
    const savedCallback = useRef(callback);

    // Remember the latest callback if it changes.
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    // Set up the interval.
    useEffect(() => {
        // Don't schedule if no delay is specified.
        if (!delay) {
            return;
        }

        const tick = () => {
            savedCallback.current();
        };

        const id = setInterval(tick, delay);

        // Cleanup on unmount or dependency change
        return () => clearInterval(id);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [delay, ...dependencies]);
};

export default useIntervalFetch;
