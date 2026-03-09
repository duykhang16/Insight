import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Moon, Sun, Languages } from 'lucide-react';

const ThemeLanguageToggle = () => {
    const { theme, toggleTheme } = useTheme();
    const { language, toggleLanguage } = useLanguage();

    return (
        <div className="flex items-center gap-3">
            <button
                onClick={toggleLanguage}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-blue-500/50 hover:bg-slate-800 transition-all text-xs font-bold text-slate-400 hover:text-white"
                title="Toggle Language"
            >
                <Languages size={14} />
                <span className="uppercase">{language}</span>
            </button>

            <button
                onClick={toggleTheme}
                className="flex items-center justify-center p-1.5 rounded-lg border border-slate-700 hover:border-blue-500/50 hover:bg-slate-800 transition-all text-slate-400 hover:text-amber-400 dark:hover:text-blue-400"
                title="Toggle Theme"
            >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
        </div>
    );
};

export default ThemeLanguageToggle;
