import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Manages toast-style notifications with auto-dismiss.
 * Reusable across SiteConfig, MultiConfig, or any page.
 */
const useNotification = ({ dismissAfterMs = 7000, fadeBeforeMs = 500 } = {}) => {
    const [notification, setNotification] = useState(null);
    const [visible, setVisible] = useState(false);
    const fadeTimerRef = useRef(null);
    const clearTimerRef = useRef(null);

    const clear = useCallback(() => {
        setNotification(null);
        setVisible(false);
    }, []);

    const show = useCallback((type, message) => {
        setNotification({ type, message });
    }, []);

    useEffect(() => {
        if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
        if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);

        if (!notification?.message) {
            setVisible(false);
            return undefined;
        }

        setVisible(true);

        fadeTimerRef.current = window.setTimeout(() => {
            setVisible(false);
        }, dismissAfterMs - fadeBeforeMs);

        clearTimerRef.current = window.setTimeout(() => {
            clear();
        }, dismissAfterMs);

        return () => {
            window.clearTimeout(fadeTimerRef.current);
            window.clearTimeout(clearTimerRef.current);
        };
    }, [notification, dismissAfterMs, fadeBeforeMs, clear]);

    return { notification, visible, show, clear };
};

export default useNotification;
