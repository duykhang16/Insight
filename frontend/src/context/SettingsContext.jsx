import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(() => {
        const saved = localStorage.getItem('isAutoRefreshEnabled');
        return saved !== null ? JSON.parse(saved) : true;
    });

    useEffect(() => {
        localStorage.setItem('isAutoRefreshEnabled', JSON.stringify(isAutoRefreshEnabled));
    }, [isAutoRefreshEnabled]);

    const toggleAutoRefresh = () => {
        setIsAutoRefreshEnabled(prev => !prev);
    };

    return (
        <SettingsContext.Provider value={{ isAutoRefreshEnabled, toggleAutoRefresh }}>
            {children}
        </SettingsContext.Provider>
    );
};
