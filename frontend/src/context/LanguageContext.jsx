import React, { createContext, useContext, useState, useEffect } from 'react';
import { en } from '../locales/en';
import { vi } from '../locales/vi';

const LanguageContext = createContext();

const dictionaries = { en, vi };

export const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState(() => {
        const savedLang = localStorage.getItem('language');
        return savedLang || 'en'; // default to English
    });

    useEffect(() => {
        localStorage.setItem('language', language);
    }, [language]);

    const toggleLanguage = () => {
        setLanguage(prev => (prev === 'en' ? 'vi' : 'en'));
    };

    // Helper to traverse nested objects (e.g. 'sidebar.dashboard')
    const t = (key) => {
        const keys = key.split('.');
        let value = dictionaries[language];
        for (const k of keys) {
            if (value && typeof value === 'object') {
                value = value[k];
            } else {
                return key; // fallback to key if not found
            }
        }
        return value || key;
    };

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext);
