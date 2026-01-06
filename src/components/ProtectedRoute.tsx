// Protected Route Component
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[]; // Array of allowed roles (e.g., ['admin'], ['franchise', 'shopify'])
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { isAuthenticated, loading, currentUser } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push('/');
        } else if (!loading && isAuthenticated && allowedRoles && currentUser && !allowedRoles.includes(currentUser.role)) {
            if (currentUser.role === 'admin') {
                router.push('/admin-dashboard');
            } else {
                router.push('/client-dashboard');
            }
        }
    }, [isAuthenticated, loading, currentUser, allowedRoles, router]);

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

    if (!isAuthenticated) return null; // Logic handled in useEffect

    if (allowedRoles && currentUser && !allowedRoles.includes(currentUser.role)) return null;

    return <>{children}</>;
};

export default ProtectedRoute;
