import { useCallback, useEffect, useState } from 'react';
import { useBeforeUnload } from 'react-router-dom';
import {
    CONFIG_DIRTY_STATE_KEY,
    CONFIG_DIRTY_EVENT,
    CONFIG_DISCARD_EVENT,
} from '../constants';

/**
 * Tracks unsaved-changes state and syncs it to sessionStorage + custom events
 * so the sidebar / navigation guards can react accordingly.
 */
const useDirtyState = ({ isOnPage, onDiscard }) => {
    const [isDirty, setIsDirty] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);

    // Broadcast dirty state
    useEffect(() => {
        const nextDirtyState = Boolean(isDirty && isOnPage);
        sessionStorage.setItem(CONFIG_DIRTY_STATE_KEY, nextDirtyState ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent(CONFIG_DIRTY_EVENT, {
            detail: { isDirty: nextDirtyState },
        }));
    }, [isDirty, isOnPage]);

    // Cleanup on unmount
    useEffect(() => () => {
        sessionStorage.setItem(CONFIG_DIRTY_STATE_KEY, 'false');
        window.dispatchEvent(new CustomEvent(CONFIG_DIRTY_EVENT, {
            detail: { isDirty: false },
        }));
    }, []);

    // Listen for external discard requests
    useEffect(() => {
        const handleDiscardChanges = () => {
            if (typeof onDiscard === 'function') {
                onDiscard();
            }
        };
        window.addEventListener(CONFIG_DISCARD_EVENT, handleDiscardChanges);
        return () => window.removeEventListener(CONFIG_DISCARD_EVENT, handleDiscardChanges);
    }, [onDiscard]);

    // Browser native unload guard
    useBeforeUnload((event) => {
        if (isDirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    }, { capture: true });

    const handleStayOnPage = useCallback(() => setShowLeaveModal(false), []);
    const handleLeavePage = useCallback(() => {
        setIsDirty(false);
        setShowLeaveModal(false);
    }, []);

    return {
        isDirty,
        setIsDirty,
        showLeaveModal,
        setShowLeaveModal,
        handleStayOnPage,
        handleLeavePage,
    };
};

export default useDirtyState;
