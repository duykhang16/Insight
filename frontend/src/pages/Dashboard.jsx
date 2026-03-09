import React, { useEffect, useState } from 'react';
import apiClient from '../api/apiClient';

function Dashboard() {
    const [health, setHealth] = useState(null);

    useEffect(() => {
        // Basic health check to verify connectivity
        apiClient.get('/health')
            .then(response => {
                setHealth(response.data);
            })
            .catch(error => {
                console.error("Health check failed:", error);
                setHealth({ status: "Error connecting to backend" });
            });
    }, []);

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Instant Insight Dashboard</h1>
            <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl mb-2">System Status</h2>
                <pre className="bg-gray-100 p-4 rounded">
                    {health ? JSON.stringify(health, null, 2) : "Loading status..."}
                </pre>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-2">Analytics Overview</h3>
                    <p className="text-gray-600">Site performance metrics will appear here.</p>
                </div>
                <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-2">Device Inventory</h3>
                    <p className="text-gray-600">Manage access points and switches.</p>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
