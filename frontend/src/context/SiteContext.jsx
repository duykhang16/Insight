import React, { createContext, useState, useContext, useEffect } from 'react';

const SiteContext = createContext();

export const SiteProvider = ({ children }) => {
    const [selectedSiteId, setSelectedSiteId] = useState(sessionStorage.getItem('selectedSiteId') || '');
    const [sites, setSites] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [loadingSites, setLoadingSites] = useState(false);

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

    const fetchSites = async (silent = false) => {
        if (!silent) setLoadingSites(true);
        try {
            const { default: apiClient } = await import('../api/apiClient');
            const res = await apiClient.get('/overview/sites');
            const fetchedSites = Array.isArray(res.data) ? res.data : (res.data.sites || []);
            setSites(fetchedSites);
            setLastUpdated(new Date());
            if (fetchedSites.length > 0 && !selectedSiteId) {
                const firstSite = fetchedSites[0];
                const id = firstSite.siteId || firstSite._id || firstSite.id;
                if (id) setSelectedSiteId(id);
            }
        } catch (err) {
            console.error("Failed to fetch sites:", err);
        } finally {
            if (!silent) setLoadingSites(false);
        }
    };

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
