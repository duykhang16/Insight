import React, { createContext, useState, useContext, useEffect } from 'react';

const SiteContext = createContext();

export const SiteProvider = ({ children }) => {
    const [selectedSiteId, setSelectedSiteId] = useState(sessionStorage.getItem('selectedSiteId') || '');
    const [sites, setSites] = useState([]);
    const [loadingSites, setLoadingSites] = useState(false);

    useEffect(() => {
        if (selectedSiteId) {
            sessionStorage.setItem('selectedSiteId', selectedSiteId);
        }
    }, [selectedSiteId]);

    const fetchSites = async () => {
        setLoadingSites(true);
        try {
            const { default: apiClient } = await import('../api/apiClient');
            const res = await apiClient.get('/overview/sites');
            const fetchedSites = Array.isArray(res.data) ? res.data : (res.data.sites || []);
            setSites(fetchedSites);
            if (fetchedSites.length > 0 && !selectedSiteId) {
                const firstSite = fetchedSites[0];
                const id = firstSite.siteId || firstSite._id || firstSite.id;
                if (id) setSelectedSiteId(id);
            }
        } catch (err) {
            console.error("Failed to fetch sites:", err);
        } finally {
            setLoadingSites(false);
        }
    };

    return (
        <SiteContext.Provider value={{
            selectedSiteId,
            setSelectedSiteId,
            sites,
            loadingSites,
            fetchSites
        }}>
            {children}
        </SiteContext.Provider>
    );
};

export const useSite = () => useContext(SiteContext);
