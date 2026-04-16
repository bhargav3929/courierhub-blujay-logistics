// Protected Route Component
import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[]; // Array of allowed roles (e.g., ['admin'], ['franchise', 'shopify', 'white_label'])
    /** If true, the onboarding gate is not enforced for this route (e.g. the onboarding page itself). */
    skipOnboardingGate?: boolean;
}

const ONBOARDING_PATH = '/white-label-onboarding';

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, skipOnboardingGate }) => {
    const { isAuthenticated, loading, currentUser, needsWhiteLabelOnboarding } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (loading) return;

        if (!isAuthenticated) {
            router.push('/');
            return;
        }

        if (allowedRoles && currentUser && !allowedRoles.includes(currentUser.role)) {
            if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
                router.push('/admin-dashboard');
            } else {
                router.push('/client-dashboard');
            }
            return;
        }

        // White-label onboarding gate: any authenticated white-label primary user
        // who hasn't finished onboarding is redirected to the onboarding form.
        if (!skipOnboardingGate && needsWhiteLabelOnboarding && pathname !== ONBOARDING_PATH) {
            router.push(ONBOARDING_PATH);
        }
    }, [isAuthenticated, loading, currentUser, allowedRoles, router, skipOnboardingGate, needsWhiteLabelOnboarding, pathname]);

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

    if (!isAuthenticated) return null;

    if (allowedRoles && currentUser && !allowedRoles.includes(currentUser.role)) return null;

    // Block children while the onboarding redirect is in-flight
    if (!skipOnboardingGate && needsWhiteLabelOnboarding && pathname !== ONBOARDING_PATH) return null;

    return <>{children}</>;
};

export default ProtectedRoute;
