import { CATEGORY_DETAILS, toTitleCase } from './constants';

/**
 * Process raw dashboard data for application visualization
 * Standardizes category names, icons, and traffic sums
 */
export const processApplicationData = (dashboardData) => {
    if (!dashboardData?.applicationsOverview) return { totalUsage: 0, categories: [] };

    const { applicationsTotal } = dashboardData.applicationsOverview;

    // Total usage calculation
    const grandUpstream = applicationsTotal?.upstreamDataTransferredInBytes ||
        applicationsTotal?.upstreamDataTransferredDuringLast24HoursInBytes || 0;
    const grandDownstream = applicationsTotal?.downstreamDataTransferredInBytes ||
        applicationsTotal?.downstreamDataTransferredDuringLast24HoursInBytes || 0;
    const grandTotal = grandUpstream + grandDownstream;

    const rawCategories = applicationsTotal?.transferredDataByCategory || [];
    const groupedData = {};

    rawCategories.forEach(cat => {
        // Support both field names from different API versions
        const slug = cat.applicationCategory || cat.applicationCategoryName || 'unknown';

        const up = cat.upstreamDataTransferredInBytes ||
            cat.upstreamDataTransferredDuringLast24HoursInBytes || 0;
        const down = cat.downstreamDataTransferredInBytes ||
            cat.downstreamDataTransferredDuringLast24HoursInBytes || 0;

        if (!groupedData[slug]) {
            groupedData[slug] = { usage: 0 };
        }
        groupedData[slug].usage += (up + down);
    });

    const categories = Object.keys(groupedData).map(slug => {
        const usage = groupedData[slug].usage;
        const percentage = grandTotal > 0 ? (usage / grandTotal) * 100 : 0;

        const meta = CATEGORY_DETAILS[slug] || {
            name: toTitleCase(slug),
            icon: CATEGORY_DETAILS['unknown'].icon,
            hex: CATEGORY_DETAILS['unknown'].hex
        };

        return {
            id: slug,
            name: meta.name,
            usage,
            percentage,
            meta: meta
        };
    });

    return {
        totalUsage: grandTotal,
        categories: categories.sort((a, b) => b.usage - a.usage)
    };
};

export { CATEGORY_DETAILS, toTitleCase };
