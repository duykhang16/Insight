import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

/**
 * HelpTooltip — reusable tooltip/popover for help content.
 *
 * Props:
 *   content: string  — short one-liner (used for sidebar variant)
 *   steps: string[]  — numbered steps (used for in-page variant)
 *   title: string    — optional title for popover
 *   variant: 'sidebar' | 'page'  — sidebar = hover tooltip, page = click popover
 *   position: 'right' | 'bottom-left'  — popover direction
 */
const HelpTooltip = ({
    content,
    steps,
    title,
    variant = 'sidebar',
    position = 'right',
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Close on outside click (page variant only)
    useEffect(() => {
        if (variant !== 'page') return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [variant]);

    const positionClass = position === 'right'
        ? 'left-full ml-2 top-0'
        : 'right-0 top-full mt-2';

    if (variant === 'sidebar') {
        return (
            <div className="relative group flex-shrink-0">
                <Info size={12} className="text-slate-600 group-hover:text-slate-400 transition-colors cursor-help" />
                <div className={`absolute ${positionClass} z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150`}>
                    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[10px] text-slate-300 whitespace-nowrap shadow-xl max-w-[200px] leading-relaxed">
                        {content}
                    </div>
                </div>
            </div>
        );
    }

    // page variant — click to toggle
    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-slate-800 transition-colors text-[10px] font-bold uppercase tracking-widest"
                title="Hướng dẫn sử dụng"
            >
                <Info size={13} />
                <span>Hướng dẫn</span>
            </button>
            {open && (
                <div className={`absolute ${positionClass} z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 min-w-[220px] max-w-[280px]`}>
                    {title && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{title}</p>
                    )}
                    {steps && (
                        <ol className="space-y-2">
                            {steps.map((step, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600/30 text-blue-400 text-[9px] font-black flex items-center justify-center mt-0.5">
                                        {i + 1}
                                    </span>
                                    {step}
                                </li>
                            ))}
                        </ol>
                    )}
                    {content && !steps && (
                        <p className="text-[11px] text-slate-300 leading-relaxed">{content}</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default HelpTooltip;
