import React, { useEffect } from 'react';
import { useSite } from '../../context/SiteContext';
import SiteGrid from '../../components/SiteCard/SiteGrid';

const Overview = () => {
    const { sites, loadingSites, fetchSites } = useSite();

    useEffect(() => {
        if (sites.length === 0) {
            fetchSites();
        }
    }, []);

    return (
        <div className="p-8 pb-32">
            <SiteGrid sites={sites} loading={loadingSites} />
        </div>
    );
};

export default Overview;
