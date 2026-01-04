// Protected Route Component
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[]; // Array of allowed roles (e.g., ['admin'], ['franchise', 'shopify'])
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { isAuthenticated, loading, currentUser } = useAuth(); // Ensure currentUser is available

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blujay-dark to-blujay-light">
                <div className="text-center">
                    <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-white border-r-transparent"></div>
                    <p className="mt-4 text-white text-lg">Loading...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    // Role-based access control
    if (allowedRoles && currentUser && !allowedRoles.includes(currentUser.role)) {
        // Redirect to appropriate dashboard based on role
        if (currentUser.role === 'admin') {
            return <Navigate to="/admin-dashboard" replace />;
        } else {
            return <Navigate to="/client-dashboard" replace />;
        }
    }

    return <>{children}</>;
};

export default ProtectedRoute;
