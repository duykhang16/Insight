import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';

const ZoneContext = createContext();

const POLL_INTERVAL = 30_000; // 30s — ensures data < 60s stale

export const ZoneProvider = ({ initialZones, children }) => {
    const [zones, setZones] = useState(initialZones || []);
    const [loadingZones, setLoadingZones] = useState(!initialZones);
    const [lastZoneFetch, setLastZoneFetch] = useState(initialZones ? Date.now() : null);
    const pollRef = useRef(null);
    const isMounted = useRef(true);

    // Deep compare helper — only update state if data actually changed
    const zonesChanged = useCallback((oldZones, newZones) => {
        if (oldZones.length !== newZones.length) return true;
        return JSON.stringify(oldZones) !== JSON.stringify(newZones);
    }, []);

    const fetchZones = useCallback(async (silent = false) => {
        // super_admin doesn't use zone dashboard — skip all zone fetching
        const role = sessionStorage.getItem('userRole');
        if (role === 'super_admin') {
            if (isMounted.current) {
                setZones([]);
                if (!silent) setLoadingZones(false);
            }
            return [];
        }
        if (!silent) setLoadingZones(true);
        try {
            const { default: apiClient } = await import('../api/apiClient');
            const res = await apiClient.get('/zones/my');
            const zoneList = res.data || [];

            if (zoneList.length === 0) {
                if (isMounted.current) {
                    setZones([]);
                    setLastZoneFetch(Date.now());
                    if (!silent) setLoadingZones(false);
                }
                return [];
            }

            const details = await Promise.all(
                zoneList.map(z => apiClient.get(`/zones/${z.id}`).then(r => r.data).catch(() => null))
            );
            const validDetails = details.filter(Boolean);

            if (isMounted.current) {
                setZones(prev => {
                    if (zonesChanged(prev, validDetails)) {
                        return validDetails;
                    }
                    return prev;
                });
                setLastZoneFetch(Date.now());
            }

            return validDetails;
        } catch (err) {
            console.warn('ZoneContext: Failed to fetch zones', err);
            return null;
        } finally {
            if (isMounted.current && !silent) setLoadingZones(false);
        }
    }, [zonesChanged]);

    // Background polling — runs continuously when provider is mounted
    useEffect(() => {
        // Start polling
        pollRef.current = setInterval(() => {
            fetchZones(true); // silent refresh
        }, POLL_INTERVAL);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [fetchZones]);

    // Cleanup on unmount
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const getZone = useCallback((id) => {
        return zones.find(z => z.id === id || z._id === id);
    }, [zones]);

    return (
        <ZoneContext.Provider value={{
            zones,
            loadingZones,
            lastZoneFetch,
            fetchZones,
            getZone,
        }}>
            {children}
        </ZoneContext.Provider>
    );
};

export const useZone = () => useContext(ZoneContext);
