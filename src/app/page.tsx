'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Truck, Plane, Package, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { initializationError } from "@/lib/firebaseConfig";

const ClientLogin = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
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

            await login(email, password);
            toast.success("Welcome back to your dashboard!");
            router.push("/client-dashboard");
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

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-orange-500 via-secondary to-orange-400 relative overflow-hidden">
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
                            <h2 className="text-2xl font-bold text-foreground">Welcome Back</h2>
                            <p className="text-muted-foreground text-sm mt-1">Login to your shipping dashboard</p>
                        </div>
                    </div>

                    <div className="p-8 pt-2">
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <div className="relative">
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="you@company.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="focus-visible:ring-secondary pl-10"
                                        disabled={loading}
                                        required
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <Users className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pr-10 pl-10 focus-visible:ring-secondary"
                                        disabled={loading}
                                        required
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <Package className="h-4 w-4" />
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
                                className="w-full bg-gradient-to-r from-secondary to-secondary/80 text-white shadow-lg hover:opacity-90"
                                size="lg"
                                disabled={loading}
                            >
                                {loading ? "Authenticating..." : "Login"}
                            </Button>
                        </form>

                        <div className="mt-6 text-center">
                            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                                <Package className="h-3 w-3" /> Blujay Logistics Partner Portal
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientLogin;
