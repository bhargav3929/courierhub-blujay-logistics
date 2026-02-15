'use client';

import { useState } from "react";
import Link from "next/link";
import {
    Users, Mail, Building2, ArrowLeft,
    Phone, Store, Truck, MessageSquare,
    CheckCircle2, ArrowRight, Clock
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { submitClientRequest } from "@/services/clientRequestService";

type ClientType = 'franchise' | 'shopify';

const GetStarted = () => {
    const [clientType, setClientType] = useState<ClientType | null>(null);
    const [form, setForm] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        message: '',
    });
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!clientType) {
            toast.error("Please select your business type");
            return;
        }

        if (!form.name || !form.company || !form.email || !form.phone) {
            toast.error("Please fill in all required fields");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(form.email)) {
            toast.error("Please enter a valid email address");
            return;
        }

        if (form.phone.replace(/\D/g, '').length < 10) {
            toast.error("Please enter a valid phone number");
            return;
        }

        setLoading(true);

        try {
            await submitClientRequest({
                name: form.name,
                email: form.email,
                phone: form.phone,
                companyName: form.company,
                type: clientType,
                ...(form.message.trim() && { message: form.message.trim() }),
            });
            setSubmitted(true);
        } catch (error: any) {
            toast.error(error.message || "Failed to submit. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Success state
    if (submitted) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#fafbfc] relative overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#3b82f6]/[0.06] rounded-full blur-[120px]" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#06b6d4]/[0.04] rounded-full blur-[120px]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:72px_72px]" />

                <div className="relative z-10 w-full max-w-md mx-4">
                    <div className="bg-white rounded-2xl shadow-xl shadow-[#0f172a]/[0.04] overflow-hidden border border-[#0f172a]/[0.06]">
                        <div className="p-10 text-center">
                            <div className="relative mx-auto mb-8 w-20 h-20">
                                <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping" style={{ animationDuration: '2s' }} />
                                <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/60">
                                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                                </div>
                            </div>

                            <h2 className="text-[22px] font-bold text-[#0f172a] leading-tight">
                                Request Received
                            </h2>
                            <p className="text-[#0f172a]/50 text-[14px] mt-3 max-w-xs mx-auto leading-relaxed">
                                Your details have been shared with the team. We'll get back to you shortly.
                            </p>

                            <div className="mt-8 flex items-center justify-center gap-3 py-3 px-5 rounded-xl bg-amber-50 border border-amber-200/50">
                                <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                                <span className="text-[13px] text-amber-800 font-medium">
                                    Our team typically responds within 24 hours
                                </span>
                            </div>

                            <div className="mt-8 text-left space-y-3">
                                <p className="text-[11px] uppercase tracking-wide text-[#0f172a]/40 font-medium">What happens next</p>
                                <div className="space-y-2.5">
                                    {[
                                        "Our team reviews your business requirements",
                                        "We'll reach out to discuss pricing and setup",
                                        "Get onboarded and start shipping",
                                    ].map((step, i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#0f172a]/[0.06] flex items-center justify-center text-[10px] font-bold text-[#0f172a]/50 mt-0.5">
                                                {i + 1}
                                            </span>
                                            <span className="text-[13px] text-[#0f172a]/60 leading-snug">{step}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-10">
                                <Link href="/">
                                    <Button
                                        variant="outline"
                                        className="w-full border-[#0f172a]/[0.08] text-[#0f172a]/70 hover:bg-[#0f172a]/[0.03] hover:text-[#0f172a]"
                                        size="lg"
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-2" />
                                        Back to Home
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#fafbfc] relative overflow-hidden py-12">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#3b82f6]/[0.06] rounded-full blur-[120px]" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#06b6d4]/[0.04] rounded-full blur-[120px]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:72px_72px]" />

            <div className="relative z-10 w-full max-w-lg mx-4">
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
                            <h2 className="text-2xl font-bold text-[#0f172a]">Get Started with Blujay</h2>
                            <p className="text-[#0f172a]/45 text-sm mt-1.5 max-w-sm mx-auto">
                                Tell us about your business and we'll set you up with the right shipping solution.
                            </p>
                        </div>
                    </div>

                    <div className="px-8 pb-8 pt-0">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Client Type Selection */}
                            <div className="space-y-3">
                                <Label className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Business Type</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setClientType('franchise')}
                                        className={`relative group text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                                            clientType === 'franchise'
                                                ? 'border-[#0f172a] bg-[#0f172a]/[0.02] shadow-sm'
                                                : 'border-[#0f172a]/[0.08] hover:border-[#0f172a]/20 hover:bg-[#0f172a]/[0.01]'
                                        }`}
                                    >
                                        {clientType === 'franchise' && (
                                            <div className="absolute top-2.5 right-2.5">
                                                <CheckCircle2 className="h-4 w-4 text-[#0f172a]" />
                                            </div>
                                        )}
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-colors ${
                                            clientType === 'franchise'
                                                ? 'bg-[#0f172a] text-white'
                                                : 'bg-[#0f172a]/[0.06] text-[#0f172a]/50 group-hover:text-[#0f172a]/70'
                                        }`}>
                                            <Truck className="h-[18px] w-[18px]" />
                                        </div>
                                        <p className={`text-[13px] font-semibold leading-tight ${
                                            clientType === 'franchise' ? 'text-[#0f172a]' : 'text-[#0f172a]/70'
                                        }`}>
                                            Franchisee
                                        </p>
                                        <p className="text-[11px] text-[#0f172a]/40 mt-1 leading-snug">
                                            B2B bulk shipments
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setClientType('shopify')}
                                        className={`relative group text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                                            clientType === 'shopify'
                                                ? 'border-[#0f172a] bg-[#0f172a]/[0.02] shadow-sm'
                                                : 'border-[#0f172a]/[0.08] hover:border-[#0f172a]/20 hover:bg-[#0f172a]/[0.01]'
                                        }`}
                                    >
                                        {clientType === 'shopify' && (
                                            <div className="absolute top-2.5 right-2.5">
                                                <CheckCircle2 className="h-4 w-4 text-[#0f172a]" />
                                            </div>
                                        )}
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-colors ${
                                            clientType === 'shopify'
                                                ? 'bg-[#0f172a] text-white'
                                                : 'bg-[#0f172a]/[0.06] text-[#0f172a]/50 group-hover:text-[#0f172a]/70'
                                        }`}>
                                            <Store className="h-[18px] w-[18px]" />
                                        </div>
                                        <p className={`text-[13px] font-semibold leading-tight ${
                                            clientType === 'shopify' ? 'text-[#0f172a]' : 'text-[#0f172a]/70'
                                        }`}>
                                            Ecommerce Seller
                                        </p>
                                        <p className="text-[11px] text-[#0f172a]/40 mt-1 leading-snug">
                                            B2C / Shopify orders
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {/* Name & Company */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Full Name</Label>
                                    <div className="relative">
                                        <Input
                                            id="name"
                                            type="text"
                                            placeholder="John Doe"
                                            value={form.name}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                            className="bg-[#0f172a]/[0.02] border-[#0f172a]/[0.08] text-[#0f172a] placeholder-[#0f172a]/25 focus-visible:ring-[#3b82f6] pl-9 text-[13px]"
                                            disabled={loading}
                                            required
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0f172a]/30">
                                            <Users className="h-3.5 w-3.5" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="company" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Company Name</Label>
                                    <div className="relative">
                                        <Input
                                            id="company"
                                            type="text"
                                            placeholder="Acme Inc."
                                            value={form.company}
                                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                                            className="bg-[#0f172a]/[0.02] border-[#0f172a]/[0.08] text-[#0f172a] placeholder-[#0f172a]/25 focus-visible:ring-[#3b82f6] pl-9 text-[13px]"
                                            disabled={loading}
                                            required
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0f172a]/30">
                                            <Building2 className="h-3.5 w-3.5" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Email & Phone */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Email Address</Label>
                                    <div className="relative">
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="you@company.com"
                                            value={form.email}
                                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                                            className="bg-[#0f172a]/[0.02] border-[#0f172a]/[0.08] text-[#0f172a] placeholder-[#0f172a]/25 focus-visible:ring-[#3b82f6] pl-9 text-[13px]"
                                            disabled={loading}
                                            required
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0f172a]/30">
                                            <Mail className="h-3.5 w-3.5" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">Phone Number</Label>
                                    <div className="relative">
                                        <Input
                                            id="phone"
                                            type="tel"
                                            placeholder="+91 98765 43210"
                                            value={form.phone}
                                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                            className="bg-[#0f172a]/[0.02] border-[#0f172a]/[0.08] text-[#0f172a] placeholder-[#0f172a]/25 focus-visible:ring-[#3b82f6] pl-9 text-[13px]"
                                            disabled={loading}
                                            required
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0f172a]/30">
                                            <Phone className="h-3.5 w-3.5" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Message / Notes */}
                            <div className="space-y-2">
                                <Label htmlFor="message" className="text-[#0f172a]/60 text-[12px] uppercase tracking-wide">
                                    Message <span className="text-[#0f172a]/25 normal-case">(optional)</span>
                                </Label>
                                <div className="relative">
                                    <textarea
                                        id="message"
                                        rows={3}
                                        placeholder="Tell us about your shipping needs, expected volumes, or any questions..."
                                        value={form.message}
                                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                                        className="flex w-full rounded-md border bg-[#0f172a]/[0.02] border-[#0f172a]/[0.08] text-[#0f172a] placeholder-[#0f172a]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 pl-9 pr-3 py-2.5 text-[13px] leading-relaxed resize-none disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={loading}
                                    />
                                    <div className="absolute left-3 top-3 text-[#0f172a]/30">
                                        <MessageSquare className="h-3.5 w-3.5" />
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-[#0f172a] text-white hover:bg-[#1e293b] shadow-lg shadow-[#0f172a]/10"
                                size="lg"
                                disabled={loading || !clientType}
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Submitting...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        Submit Inquiry
                                        <ArrowRight className="h-4 w-4" />
                                    </span>
                                )}
                            </Button>

                            <p className="text-[10px] text-[#0f172a]/30 text-center leading-relaxed">
                                By submitting, you agree to our{' '}
                                <Link href="/terms" className="text-[#3b82f6] hover:underline">Terms & Conditions</Link>
                                {' '}and{' '}
                                <Link href="/privacy" className="text-[#3b82f6] hover:underline">Privacy Policy</Link>.
                            </p>
                        </form>

                        <div className="mt-6 text-center">
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

export default GetStarted;
