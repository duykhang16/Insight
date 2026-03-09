import React from 'react';

const createPlaceholder = (name) => {
    return function PlaceholderComponent() {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-6 text-white">{name}</h1>
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <p className="text-gray-400">Content for {name} will be displayed here.</p>
                </div>
            </div>
        );
    };
};

export const Health = createPlaceholder('Health');
export const Alerts = createPlaceholder('Alerts');
export const Clients = createPlaceholder('Clients');
export const Networks = createPlaceholder('Networks');
export const Devices = createPlaceholder('Devices');
export const Applications = createPlaceholder('Applications');
