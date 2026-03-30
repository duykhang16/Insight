import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';

const SiteContext = createContext();

const POLL_INTERVAL = 30_000; // 30s — ensures data < 60s stale

export const SiteProvider = ({ initialSites, children }) => {
    const [selectedSiteId, setSelectedSiteId] = useState(sessionStorage.getItem('selectedSiteId') || '');
    const [sites, setSites] = useState(initialSites || []);
    const [lastUpdated, setLastUpdated] = useState(initialSites ? new Date() : null);
    const [loadingSites, setLoadingSites] = useState(!initialSites);
    const pollRef = useRef(null);
    const isMounted = useRef(true);

    const [siteCache, setSiteCache] = useState({});

    useEffect(() => {
        if (selectedSiteId) {
            sessionStorage.setItem('selectedSiteId', selectedSiteId);
        }
    }, [selectedSiteId]);

    const updateSiteCache = (siteId, data) => {
        setSiteCache(prev => ({
            ...prev,
            [siteId]: {
                ...prev[siteId],
                ...data,
                timestamp: Date.now()
            }
        }));
    };

    const prefetchSite = async (siteId) => {
        if (!siteId || siteCache[siteId]?.timestamp > Date.now() - 60000) return;
        
        try {
            const { default: apiClient } = await import('../api/apiClient');
            const [infoRes, dashRes] = await Promise.all([
                apiClient.get(`/overview/sites/${siteId}`).catch(() => null),
                apiClient.get(`/overview/sites/${siteId}/dashboard`).catch(() => null)
            ]);
            
            if (infoRes || dashRes) {
                updateSiteCache(siteId, {
                    info: infoRes?.data,
                    dashboard: dashRes?.data
                });
            }
        } catch (err) {
            console.warn(`Prefetch failed for site ${siteId}`, err);
        }
    };

    const fetchSites = useCallback(async (silent = false) => {
        if (!silent) setLoadingSites(true);
        try {
            const { default: apiClient } = await import('../api/apiClient');
            const res = await apiClient.get('/overview/sites');
            const fetchedSites = Array.isArray(res.data) ? res.data : (res.data.sites || []);
            if (isMounted.current) {
                const normalizedFetchedSiteIds = new Set(
                    fetchedSites.map((site) => String(site.siteId || site._id || site.id || ''))
                );
                setSites(prev => {
                    // Deep compare — only update if data actually changed
                    if (JSON.stringify(prev) !== JSON.stringify(fetchedSites)) {
                        return fetchedSites;
                    }
                    return prev;
                });
                setLastUpdated(new Date());
                if (fetchedSites.length > 0 && !selectedSiteId) {
                    const firstSite = fetchedSites[0];
                    const id = firstSite.siteId || firstSite._id || firstSite.id;
                    if (id) setSelectedSiteId(id);
                } else if (
                    selectedSiteId &&
                    !normalizedFetchedSiteIds.has(String(selectedSiteId))
                ) {
                    const fallbackSite = fetchedSites[0];
                    const fallbackSiteId = fallbackSite?.siteId || fallbackSite?._id || fallbackSite?.id || '';
                    setSelectedSiteId(fallbackSiteId);
                    if (fallbackSiteId) {
                        sessionStorage.setItem('selectedSiteId', fallbackSiteId);
                    } else {
                        sessionStorage.removeItem('selectedSiteId');
                    }
                }
            }
        } catch (err) {
            console.warn('SiteContext: Failed to fetch sites', err);
        } finally {
            if (isMounted.current && !silent) setLoadingSites(false);
        }
    }, [selectedSiteId]);

    // Background polling — 30s interval for real-time freshness
    useEffect(() => {
        pollRef.current = setInterval(() => {
            fetchSites(true); // silent refresh
        }, POLL_INTERVAL);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [fetchSites]);

    // Cleanup on unmount
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    return (
        <SiteContext.Provider value={{
            selectedSiteId,
            setSelectedSiteId,
            sites,
            loadingSites,
            fetchSites,
            lastUpdated,
            siteCache,
            updateSiteCache,
            prefetchSite
        }}>
            {children}
        </SiteContext.Provider>
    );
};

export const useSite = () => useContext(SiteContext);
