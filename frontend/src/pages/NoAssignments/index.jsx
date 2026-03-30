import React from 'react';
import { ShieldAlert, ArrowUpRight } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const NoAssignments = () => {
    const { t } = useLanguage();
    const userRole = sessionStorage.getItem('userRole') || 'viewer';
    const parentAdminId = sessionStorage.getItem('parentAdminId') || '';
    const brandAdminEmail = sessionStorage.getItem('brandAdminEmail') || '';

    const directHigherAuthority = userRole === 'admin'
        ? (parentAdminId || brandAdminEmail)
        : parentAdminId;

    return (
        <div className="mx-auto w-full max-w-3xl px-6 py-12">
            <div className="rounded-2xl border th-border th-bg-surface p-8 shadow-lg">
                <div className="mb-5 inline-flex rounded-xl bg-amber-500/10 p-3 text-amber-300">
                    <ShieldAlert className="h-7 w-7" />
                </div>
                <h1 className="text-2xl font-semibold th-text-primary">
                    {t('no_assignments.title')}
                </h1>
                <p className="mt-3 text-sm th-text-secondary">
                    {t('no_assignments.message')}
                </p>

                <div className="mt-6 rounded-xl border th-border th-bg-elevated px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium th-text-primary">
                        <ArrowUpRight className="h-4 w-4 text-blue-300" />
                        {t('no_assignments.direct_higher_authority')}
                    </div>
                    <p className="mt-2 text-sm th-text-secondary">
                        {directHigherAuthority || t('no_assignments.contact_fallback')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default NoAssignments;
