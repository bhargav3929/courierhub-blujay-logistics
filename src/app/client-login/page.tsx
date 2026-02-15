'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Package, Users, ArrowLeft } from "lucide-react";
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
        <div className="min-h-screen w-full flex items-center justify-center bg-[#fafbfc] relative overflow-hidden">
            {/* Background accents */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#3b82f6]/[0.06] rounded-full blur-[120px]" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#06b6d4]/[0.04] rounded-full blur-[120px]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:72px_72px]" />

            <div className="relative z-10 w-full max-w-md mx-4">
                <Link href="/" className="inline-flex items-center gap-2 text-[13px] text-[#0f172a]/40 hover:text-[#0f172a]/70 transition-colors mb-8">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Home
                </Link>

                <div className="bg-white rounded-2xl shadow-xl shadow-[#0f172a]/[0.04] overflow-hidden border border-[#0f172a]/[0.06]">
                    <div className="p-8 pb-6">
                        <div className="text-center mb-6">
                            <div className="flex justify-center mb-4">
                                <Logo showTagline={false} />
                            </div>
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#3b82f6]/[0.06] border border-[#3b82f6]/[0.12] text-[#3b82f6] font-semibold text-[12px] mb-3">
                                <Users className="h-3.5 w-3.5" />
                                Client Portal
                            </div>
                            <h2 className="text-2xl font-bold text-[#0f172a]">Welcome Back</h2>
                            <p className="text-[#0f172a]/45 text-sm mt-1">Login to your shipping dashboard</p>
                        </div>
                    </div>

                    <div className="p-8 pt-2">
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Email Address</Label>
                                <div className="relative">
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="you@company.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="bg-[#0f172a]/[0.02] border-[#0f172a]/[0.08] text-[#0f172a] placeholder-[#0f172a]/25 focus-visible:ring-[#3b82f6] pl-10"
                                        disabled={loading}
                                        required
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0f172a]/30">
                                        <Users className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Password</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pr-10 pl-10 bg-[#0f172a]/[0.02] border-[#0f172a]/[0.08] text-[#0f172a] placeholder-[#0f172a]/25 focus-visible:ring-[#3b82f6]"
                                        disabled={loading}
                                        required
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0f172a]/30">
                                        <Package className="h-4 w-4" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0f172a]/30 hover:text-[#0f172a]/60 transition-colors"
                                        disabled={loading}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-[#0f172a] text-white hover:bg-[#1e293b] shadow-lg shadow-[#0f172a]/10"
                                size="lg"
                                disabled={loading}
                            >
                                {loading ? "Authenticating..." : "Login"}
                            </Button>
                        </form>

                        <div className="mt-6 text-center space-y-3">
                            <p className="text-[#0f172a]/45 text-sm">
                                Don&apos;t have an account?{' '}
                                <Link href="/get-started" className="text-[#3b82f6] hover:text-[#2563eb] font-medium">
                                    Sign Up
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientLogin;
