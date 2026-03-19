import { useState, useRef, useEffect, useCallback } from 'react';
import apiClient from '../../../api/apiClient';
import { loadZonesFromApi, loadSitesFromApi, loadAdminSitesFromApi } from '../utils';

/**
 * Reusable hook for loading zones + sites data with selection state.
 *
 * Handles: loading states, mountedRef safety, selection reset on reload,
 * zone/site tab state, search, and zone filter.
 *
 * @param {Object} options
 * @param {boolean} [options.adminOnly=false] - If true, load only admin-role sites (for Delete, AccountAccess)
 * @param {boolean} [options.autoLoad=true]   - Auto-load on mount
 * @param {boolean} [options.withSiteTab=true] - Enable sites tab (zone-only mode if false)
 *
 * @returns {Object} All state + handlers needed by ZoneSiteSelector and orchestrators
 */
const useZoneSiteLoader = ({ adminOnly = false, autoLoad = true, withSiteTab = true } = {}) => {
    // Zone state
    const [zones, setZones] = useState([]);
    const [selectedZones, setSelectedZones] = useState(new Set());
    const [isLoadingZones, setIsLoadingZones] = useState(false);

    // Site state
    const [sites, setSites] = useState([]);
    const [selectedSites, setSelectedSites] = useState([]);
    const [isLoadingSites, setIsLoadingSites] = useState(false);

    // UI state
    const [activeTab, setActiveTab] = useState('zones');
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [selectedZoneFilter, setSelectedZoneFilter] = useState('all');

    const mountedRef = useRef(true);

    // ── Load zones ──
    const scanZones = useCallback(async () => {
        setIsLoadingZones(true);
        setSelectedZones(new Set());
        try {
            const list = await loadZonesFromApi(apiClient);
            if (mountedRef.current) setZones(list.sort((a, b) => a.name.localeCompare(b.name)));
        } catch {
            if (mountedRef.current) setZones([]);
        } finally {
            if (mountedRef.current) setIsLoadingZones(false);
        }
    }, []);

    // ── Load sites ──
    const scanSites = useCallback(async () => {
        if (!withSiteTab) return;
        setIsLoadingSites(true);
        setSelectedSites([]);
        try {
            const list = adminOnly
                ? await loadAdminSitesFromApi(apiClient)
                : await loadSitesFromApi(apiClient);
            if (mountedRef.current) setSites(list);
        } catch {
            if (mountedRef.current) setSites([]);
        } finally {
            if (mountedRef.current) setIsLoadingSites(false);
        }
    }, [adminOnly, withSiteTab]);

    // ── Refresh all ──
    const refresh = useCallback(() => {
        scanZones();
        scanSites();
    }, [scanZones, scanSites]);

    // ── Auto-load on mount ──
    useEffect(() => {
        mountedRef.current = true;
        if (autoLoad) {
            scanZones();
            scanSites();
        }
        return () => { mountedRef.current = false; };
    }, [autoLoad, scanZones, scanSites]);

    // ── Derived values ──
    const targetZones = zones.filter(z => selectedZones.has(z.id));
    const totalZoneSites = targetZones.reduce((sum, z) => sum + (z.site_count || 0), 0);
    const totalExecutionSites = totalZoneSites + selectedSites.length;

    return {
        // Zone state
        zones, setZones,
        selectedZones, setSelectedZones,
        isLoadingZones,

        // Site state
        sites, setSites,
        selectedSites, setSelectedSites,
        isLoadingSites,

        // UI state
        activeTab, setActiveTab,
        searchTargetTerm, setSearchTargetTerm,
        selectedZoneFilter, setSelectedZoneFilter,

        // Actions
        scanZones,
        scanSites,
        refresh,

        // Derived
        targetZones,
        totalZoneSites,
        totalExecutionSites,
        mountedRef,
    };
};

export default useZoneSiteLoader;
