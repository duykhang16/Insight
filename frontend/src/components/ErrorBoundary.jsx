import React, { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full flex justify-center p-8">
                    <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl p-6 max-w-2xl w-full shadow-xl">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-white dark:bg-rose-500/20 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 shadow-sm">
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-rose-800 dark:text-rose-300">Component Crashed</h3>
                                <p className="text-sm text-rose-600 dark:text-rose-400">An unexpected error occurred in this module.</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-black/30 rounded-xl p-4 border border-rose-100 dark:border-rose-500/20 mb-4 overflow-auto max-h-48 custom-scrollbar">
                            <p className="font-mono text-xs text-rose-700 dark:text-rose-400 whitespace-pre-wrap">
                                {this.state.error && this.state.error.toString()}
                                <br />
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </p>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="bg-rose-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-rose-700 active:scale-95 transition-all w-full flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={16} /> Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
