// Authentication Context Provider
import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    User as FirebaseUser,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from 'firebase/auth';
import { auth, db } from '@/lib/firebaseConfig';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { User } from '@/types/types';
import { handleFirebaseError, isNetworkError } from '@/lib/firebaseErrorHandler';

interface AuthContextType {
    currentUser: User | null;
    firebaseUser: FirebaseUser | null;
    loading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
    retryAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const MAX_RETRIES = 3;

    // Fetch user data from Firestore with retry logic
    const fetchUserData = async (uid: string, attempt: number = 0): Promise<User | null> => {
        try {
            // Create a dedicated promise for the Firestore request with a timeout
            const fetchPromise = getDoc(doc(db, 'users', uid));
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 10000)
            );

            const userDoc = await Promise.race([fetchPromise, timeoutPromise]) as any;

            if (userDoc.exists()) {
                return { id: userDoc.id, ...userDoc.data() } as User;
            }
            return null;
        } catch (error: any) {
            // Handle timeout explicitly
            if (error.message === 'timeout') {
                error = { code: 'timeout', message: 'Database connection timed out.' };
            }

            const errorInfo = handleFirebaseError(error, 'Fetch User Data');

            // Retry on network errors
            if ((errorInfo.isNetworkError || error.message === 'timeout') && attempt < MAX_RETRIES) {
                console.log(`Retrying fetch user data (attempt ${attempt + 1}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                return fetchUserData(uid, attempt + 1);
            }

            console.error('Error fetching user data:', errorInfo.message);
            setError(errorInfo.message);
            return null;
        }
    };

    // Update last login timestamp
    const updateLastLogin = async (uid: string) => {
        try {
            await updateDoc(doc(db, 'users', uid), {
                lastLogin: Timestamp.now()
            });
        } catch (error) {
            console.error('Error updating last login:', error);
        }
    };

    // Login function with comprehensive error handling
    const login = async (email: string, password: string) => {
        try {
            setError(null);

            // Set persistence to LOCAL (session persists across browser sessions)
            await setPersistence(auth, browserLocalPersistence);

            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const userData = await fetchUserData(userCredential.user.uid);

            if (!userData) {
                await signOut(auth);
                throw new Error('User profile not found. Please contact administrator.');
            }

            if (!userData.isActive) {
                await signOut(auth);
                throw new Error('Account is inactive. Please contact administrator.');
            }

            // Successfully authenticated
            setCurrentUser(userData);
            setFirebaseUser(userCredential.user);
            setError(null);

            // Update last login (non-blocking)
            updateLastLogin(userCredential.user.uid).catch(err =>
                console.warn('Failed to update last login:', err)
            );
        } catch (error: any) {
            const errorInfo = handleFirebaseError(error, 'Login');
            setError(errorInfo.message);
            throw new Error(errorInfo.message);
        }
    };

    // Logout function
    const logout = async () => {
        try {
            await signOut(auth);
            setCurrentUser(null);
            setFirebaseUser(null);
            setError(null);
        } catch (error: any) {
            const errorInfo = handleFirebaseError(error, 'Logout');
            console.error('Logout error:', errorInfo.message);
            throw new Error(errorInfo.message);
        }
    };

    // Retry authentication after error
    const retryAuth = async () => {
        if (firebaseUser) {
            try {
                setError(null);
                const userData = await fetchUserData(firebaseUser.uid);
                if (userData) {
                    setCurrentUser(userData);
                }
            } catch (error: any) {
                const errorInfo = handleFirebaseError(error, 'Retry Auth');
                setError(errorInfo.message);
            }
        }
    };

    // Listen to auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            try {
                if (user) {
                    console.log('[AuthContext] User session detected, verifying profile...');
                    setFirebaseUser(user);
                    const userData = await fetchUserData(user.uid);

                    if (userData) {
                        console.log('[AuthContext] Profile loaded successfully');
                        setCurrentUser(userData);
                        setError(null);
                    } else {
                        // Critical: User exists in Auth but profile missing in Firestore
                        // This happens with cached sessions from failed logins
                        console.warn('[AuthContext] Cached user has no profile - signing out');
                        await signOut(auth); // Clean up the invalid session
                        setFirebaseUser(null);
                        setCurrentUser(null);
                        setError(null);
                    }
                } else {
                    console.log('[AuthContext] No user session');
                    setFirebaseUser(null);
                    setCurrentUser(null);
                    setError(null);
                }
            } catch (error: any) {
                console.error('[AuthContext] Error in auth state handler:', error);
                setError('Authentication error. Please refresh the page.');
            } finally {
                setLoading(false);
            }
        });

        return unsubscribe;
    }, []);

    const value: AuthContextType = {
        currentUser,
        firebaseUser,
        loading,
        error,
        login,
        logout,
        retryAuth,
        isAuthenticated: !!currentUser
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
                    <div className="flex items-center gap-2 mb-8 animate-in fade-in zoom-in duration-500">
                        <div className="p-3 bg-primary rounded-xl">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="w-8 h-8 text-white"
                            >
                                <path d="M10 17h4V5H2v12h3" />
                                <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5" />
                                <path d="M14 17h1" />
                                <circle cx="7.5" cy="17.5" r="2.5" />
                                <circle cx="17.5" cy="17.5" r="2.5" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-black tracking-tighter">Blujay Logistics</h1>
                    </div>
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-sm font-medium text-muted-foreground animate-pulse">Initializing Portal...</p>
                    </div>
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
};
