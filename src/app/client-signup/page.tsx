'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Package, Users, Mail, Building2, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const ClientSignup = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [form, setForm] = useState({ name: '', company: '', email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!form.name || !form.email || !form.password) {
            toast.error("Please fill in all required fields");
            return;
        }

        setLoading(true);

        try {
            toast.success("Account created! Redirecting to login...");
            router.push("/client-login");
        } catch (error: any) {
            toast.error(error.message || "Failed to create account.");
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
                            <h2 className="text-2xl font-bold text-[#0f172a]">Create Your Account</h2>
                            <p className="text-[#0f172a]/45 text-sm mt-1">Start shipping smarter today</p>
                        </div>
                    </div>

                    <div className="p-8 pt-2">
                        <form onSubmit={handleSignup} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Full Name</Label>
                                <div className="relative">
                                    <Input
                                        id="name"
                                        type="text"
                                        placeholder="John Doe"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                                <Label htmlFor="company" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Company Name <span className="text-[#0f172a]/30">(optional)</span></Label>
                                <div className="relative">
                                    <Input
                                        id="company"
                                        type="text"
                                        placeholder="Your Company"
                                        value={form.company}
                                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                                        className="bg-[#0f172a]/[0.02] border-[#0f172a]/[0.08] text-[#0f172a] placeholder-[#0f172a]/25 focus-visible:ring-[#3b82f6] pl-10"
                                        disabled={loading}
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0f172a]/30">
                                        <Building2 className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Email Address</Label>
                                <div className="relative">
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="you@company.com"
                                        value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        className="bg-[#0f172a]/[0.02] border-[#0f172a]/[0.08] text-[#0f172a] placeholder-[#0f172a]/25 focus-visible:ring-[#3b82f6] pl-10"
                                        disabled={loading}
                                        required
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0f172a]/30">
                                        <Mail className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Password</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Create a strong password"
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
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
                                {loading ? "Creating Account..." : "Get Started Free"}
                            </Button>

                            <p className="text-[10px] text-[#0f172a]/30 text-center leading-relaxed">
                                By signing up, you agree to our{' '}
                                <Link href="/terms" className="text-[#3b82f6] hover:underline">Terms & Conditions</Link>
                                {' '}and{' '}
                                <Link href="/privacy" className="text-[#3b82f6] hover:underline">Privacy Policy</Link>.
                            </p>
                        </form>

                        <div className="mt-6 text-center space-y-3">
                            <p className="text-[#0f172a]/45 text-sm">
                                Already have an account?{' '}
                                <Link href="/client-login" className="text-[#3b82f6] hover:text-[#2563eb] font-medium">
                                    Login
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientSignup;
