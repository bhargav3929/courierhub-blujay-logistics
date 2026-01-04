import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                    <div className="bg-white rounded-lg shadow-xl p-8 max-w-lg w-full">
                        <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
                        <p className="text-gray-600 mb-6">The application encountered a critical error.</p>
                        <div className="bg-gray-100 p-4 rounded-md overflow-auto mb-6">
                            <pre className="text-xs text-red-800 font-mono whitespace-pre-wrap">
                                {this.state.error?.toString()}
                            </pre>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                        >
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
