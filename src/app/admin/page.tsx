'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Truck, Plane, Package, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db, initializationError } from "@/lib/firebaseConfig";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import Link from "next/link";

const AdminLogin = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("admin");
    const [password, setPassword] = useState("admin123");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { login } = useAuth();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error("Please enter both email and password");
            return;
        }

        setLoading(true);

        try {
            if (initializationError) {
                toast.error("Firebase not initialized. Cannot login.");
                return;
            }
            await processAdminLogin();
        } catch (error: any) {
            console.error("Login error:", error);
            if (error.code === 'auth/invalid-credential' || error.message.includes('invalid-credential')) {
                toast.error("Invalid credentials. Please check your email and password.");
            } else if (error.code === 'auth/user-not-found') {
                toast.error("No user found with these details.");
            } else {
                toast.error(error.message || "Failed to login. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    const processAdminLogin = async () => {
        let loginEmail = email;
        const isAdminAlias = email === "admin";

        if (isAdminAlias) {
            loginEmail = "admin@courierhub.com";
        }

        try {
            await login(loginEmail, password);
            toast.success("Welcome back, Super Admin!");
            router.push("/admin-dashboard");
        } catch (error: any) {
            const isAuthError = error.code === 'auth/invalid-credential' ||
                error.code === 'auth/user-not-found' ||
                error.message.includes('invalid-credential');

            const isProfileMissing = error.code === 'auth/profile-not-found' ||
                error.message.includes('profile not found');

            if (isAdminAlias && password === "admin123" && (isAuthError || isProfileMissing)) {
                try {
                    toast.loading("Initializing Admin Account...");
                    await createInitialAdmin(loginEmail, password);
                    await login(loginEmail, password);
                    toast.dismiss();
                    toast.success("Admin Account Initialized & Logged In!");
                    router.push("/admin-dashboard");
                } catch (createError: any) {
                    toast.dismiss();
                    console.error("Initialization failed:", createError);
                    toast.error("Failed to initialize admin: " + createError.message);
                }
            } else {
                throw error;
            }
        }
    };

    const createInitialAdmin = async (email: string, pass: string) => {
        let uid = "";

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            uid = userCredential.user.uid;
        } catch (error: any) {
            if (error.code === 'auth/email-already-in-use') {
                try {
                    const userCredential = await import("firebase/auth").then(m => m.signInWithEmailAndPassword(auth, email, pass));
                    uid = userCredential.user.uid;
                } catch (signInError: any) {
                    throw new Error("Could not sign in to existing account: " + signInError.message);
                }
            } else {
                throw error;
            }
        }

        if (!uid) throw new Error("Failed to get User UID");

        await setDoc(doc(db, "users", uid), {
            email: email,
            name: "Super Admin",
            role: "admin",
            isActive: true,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            lastLogin: Timestamp.now()
        });
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blujay-dark via-primary to-blujay-light relative overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 opacity-10">
                <Truck className="absolute top-20 left-20 h-32 w-32 text-white animate-pulse" />
                <Plane className="absolute bottom-32 right-32 h-40 w-40 text-white animate-pulse" style={{ animationDelay: "1s" }} />
                <Package className="absolute top-1/2 left-1/4 h-24 w-24 text-white animate-pulse" style={{ animationDelay: "2s" }} />
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md mx-4">
                <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <div className="p-8 pb-6 bg-gradient-to-b from-white to-gray-50">
                        <div className="text-center mb-6">
                            <div className="flex justify-center mb-4">
                                <Logo variant="dark" showTagline={false} />
                            </div>
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-bold text-sm mb-3">
                                <ShieldCheck className="h-4 w-4" />
                                Admin Portal
                            </div>
                            <h2 className="text-2xl font-bold text-foreground">Super Admin Login</h2>
                            <p className="text-muted-foreground text-sm mt-1">Access the admin dashboard</p>
                        </div>
                    </div>

                    <div className="p-8 pt-2">
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="email">Username / Email</Label>
                                <div className="relative">
                                    <Input
                                        id="email"
                                        type="text"
                                        placeholder="admin"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="focus-visible:ring-primary pl-10"
                                        disabled={loading}
                                        required
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <ShieldCheck className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="admin123"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pr-10 pl-10 focus-visible:ring-primary"
                                        disabled={loading}
                                        required
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <Truck className="h-4 w-4" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        disabled={loading}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-blujay-dark to-blujay-light text-white shadow-lg hover:opacity-90"
                                size="lg"
                                disabled={loading}
                            >
                                {loading ? "Authenticating..." : "Access Admin Dashboard"}
                            </Button>
                        </form>

                        <div className="mt-6 text-center space-y-3">
                            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> Secure Super Admin Area
                            </p>
                            <Link href="/client" className="text-sm text-primary hover:underline">
                                Are you a client? Login here →
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
