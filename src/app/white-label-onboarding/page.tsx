'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Building2, Image as ImageIcon, MapPin, Phone, Mail, Loader2, Check, ArrowRight, LogOut, Upload, Link as LinkIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

import { useAuth } from '@/contexts/AuthContext';
import { saveWhiteLabelConfig } from '@/services/clientService';
import { WhiteLabelConfig } from '@/types/types';
import { storage } from '@/lib/firebaseConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

// --- Validation schema -----------------------------------------------------
// Every field is required — white-label tenants cannot operate the platform
// without complete branding + return address + support contact information.
const phoneRegex = /^\d{10}$/;
const pincodeRegex = /^\d{6}$/;

const onboardingSchema = z.object({
    brandName: z.string().trim().min(2, 'Brand name must be at least 2 characters').max(60, 'Brand name is too long'),
    logoUrl: z.string().trim().url('Enter a valid logo URL (https://...)'),
    addressLine1: z.string().trim().min(5, 'Address must be at least 5 characters').max(200, 'Address is too long'),
    city: z.string().trim().min(2, 'City is required').max(60),
    state: z.string().trim().min(2, 'State is required').max(60),
    pincode: z.string().trim().regex(pincodeRegex, 'Pincode must be exactly 6 digits'),
    senderMobile: z.string().trim().regex(phoneRegex, 'Mobile must be exactly 10 digits'),
    supportEmail: z.string().trim().email('Enter a valid support email'),
    supportPhone: z.string().trim().regex(phoneRegex, 'Support phone must be exactly 10 digits'),
});

type FormState = z.infer<typeof onboardingSchema>;

const blankForm: FormState = {
    brandName: '',
    logoUrl: '',
    addressLine1: '',
    city: '',
    state: '',
    pincode: '',
    senderMobile: '',
    supportEmail: '',
    supportPhone: '',
};

// --- Page ------------------------------------------------------------------
export default function WhiteLabelOnboardingPage() {
    const router = useRouter();
    const {
        loading,
        isAuthenticated,
        currentUser,
        currentClient,
        needsWhiteLabelOnboarding,
        refreshClient,
        logout,
    } = useAuth();

    const [form, setForm] = useState<FormState>(blankForm);
    const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
    const [submitting, setSubmitting] = useState(false);
    const [logoPreviewBroken, setLogoPreviewBroken] = useState(false);
    const [logoMode, setLogoMode] = useState<'url' | 'upload'>('url');
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const logoFileInputRef = useRef<HTMLInputElement>(null);

    // Access control — route guard specific to this page
    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            router.replace('/');
            return;
        }
        // Not a white-label primary user? Send them to their normal dashboard.
        if (currentUser && (currentUser.role !== 'white_label' || currentUser.userType === 'sub_user')) {
            if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
                router.replace('/admin-dashboard');
            } else {
                router.replace('/client-dashboard');
            }
            return;
        }
        // Already onboarded? Go straight to dashboard.
        if (currentUser?.role === 'white_label' && !needsWhiteLabelOnboarding) {
            router.replace('/client-dashboard');
        }
    }, [loading, isAuthenticated, currentUser, needsWhiteLabelOnboarding, router]);

    // Prefill brand name with the client's account name if empty — reasonable default.
    useEffect(() => {
        if (currentClient && !form.brandName && currentClient.name) {
            setForm((f) => ({ ...f, brandName: currentClient.name }));
        }
        // Prefill support email with account email if empty
        if (currentClient && !form.supportEmail && currentClient.email) {
            setForm((f) => ({ ...f, supportEmail: currentClient.email }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentClient?.id]);

    const progress = useMemo(() => {
        const total = Object.keys(blankForm).length;
        const filled = Object.values(form).filter((v) => v.trim().length > 0).length;
        return Math.round((filled / total) * 100);
    }, [form]);

    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
        if (errors[key]) {
            setErrors((e) => {
                const next = { ...e };
                delete next[key];
                return next;
            });
        }
        if (key === 'logoUrl') setLogoPreviewBroken(false);
    };

    const handleLogoFile = async (file: File | undefined) => {
        if (!file || !currentUser) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Please upload an image file (PNG, JPG, SVG, etc.)');
            return;
        }
        if (file.size > MAX_LOGO_BYTES) {
            toast.error('Logo must be under 2 MB');
            return;
        }
        setUploadingLogo(true);
        try {
            const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
            const path = `logos/${currentUser.id}/white-label-logo-${Date.now()}.${ext}`;
            const sref = storageRef(storage, path);
            await uploadBytes(sref, file, { contentType: file.type });
            const url = await getDownloadURL(sref);
            setField('logoUrl', url);
            toast.success('Logo uploaded');
        } catch (err: any) {
            console.error('Logo upload failed:', err);
            toast.error(err?.message || 'Failed to upload logo');
        } finally {
            setUploadingLogo(false);
            if (logoFileInputRef.current) logoFileInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser || !currentClient) {
            toast.error('Session expired. Please log in again.');
            return;
        }

        const parsed = onboardingSchema.safeParse(form);
        if (!parsed.success) {
            const fieldErrors: Partial<Record<keyof FormState, string>> = {};
            for (const issue of parsed.error.issues) {
                const key = issue.path[0] as keyof FormState;
                if (!fieldErrors[key]) fieldErrors[key] = issue.message;
            }
            setErrors(fieldErrors);
            toast.error('Please fix the highlighted fields');
            return;
        }

        setSubmitting(true);
        try {
            const config: WhiteLabelConfig = {
                brandName: parsed.data.brandName,
                logoUrl: parsed.data.logoUrl,
                returnAddress: {
                    line1: parsed.data.addressLine1,
                    city: parsed.data.city,
                    state: parsed.data.state,
                    pincode: parsed.data.pincode,
                },
                senderMobile: parsed.data.senderMobile,
                supportEmail: parsed.data.supportEmail,
                supportPhone: parsed.data.supportPhone,
                onboardingComplete: true,
            };
            await saveWhiteLabelConfig(currentUser.id, config);
            await refreshClient();
            toast.success('Setup complete — welcome aboard!');
            router.replace('/client-dashboard');
        } catch (err: any) {
            console.error('White-label onboarding failed:', err);
            toast.error(err?.message || 'Failed to save configuration');
            setSubmitting(false);
        }
    };

    if (loading || !currentUser) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
        );
    }

    // Guard: only white-label primary users reach the form body.
    if (currentUser.role !== 'white_label' || currentUser.userType === 'sub_user') {
        return null;
    }

    return (
        <div className="min-h-screen w-full bg-[#0a0a0b] text-slate-100 relative overflow-hidden">
            {/* Background decor */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-blue-600/20 blur-3xl" />
                <div className="absolute -bottom-60 right-[-120px] h-[620px] w-[620px] rounded-full bg-indigo-500/15 blur-3xl" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.08),transparent_55%)]" />
            </div>

            {/* Top bar */}
            <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary grid place-items-center shadow-lg shadow-blue-900/40">
                        <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div className="leading-tight">
                        <p className="text-sm font-semibold tracking-tight">Partner Onboarding</p>
                        <p className="text-xs text-slate-400">Set up your branded portal</p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => logout().then(() => router.replace('/'))}
                    className="text-slate-400 hover:text-white hover:bg-white/5"
                >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign out
                </Button>
            </header>

            <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-10 pb-20">
                {/* Hero */}
                <section className="pt-4 pb-10 md:pb-14">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 mb-6">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Step 1 of 1 · Required to continue
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] max-w-2xl">
                        Let&rsquo;s make this dashboard <span className="text-blue-400">yours</span>.
                    </h1>
                    <p className="mt-4 text-slate-400 max-w-xl text-base leading-relaxed">
                        These details will be used on your shipping labels, support pages, and throughout the portal.
                        All fields are required so that every shipment you create is valid and every customer gets
                        accurate contact information.
                    </p>
                    <div className="mt-6 flex items-center gap-4">
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div
                                className="h-full bg-primary transition-[width] duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <span className="text-xs font-medium text-slate-400 tabular-nums w-10 text-right">{progress}%</span>
                    </div>
                </section>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Brand */}
                    <FieldGroup
                        icon={<ImageIcon className="h-4 w-4" />}
                        title="Brand identity"
                        description="Shown in the sidebar, header, and customer-facing pages."
                    >
                        <div className="space-y-5">
                            <Field label="Brand name" required error={errors.brandName} htmlFor="brandName">
                                <Input
                                    id="brandName"
                                    value={form.brandName}
                                    onChange={(e) => setField('brandName', e.target.value)}
                                    placeholder="e.g. Acme Logistics"
                                    className={inputCls(errors.brandName)}
                                    autoComplete="organization"
                                />
                            </Field>

                            {/* Logo — upload OR URL */}
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                                    Logo
                                    <span className="text-blue-400">*</span>
                                </Label>
                                <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1 text-xs font-medium">
                                    <button
                                        type="button"
                                        onClick={() => setLogoMode('upload')}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                                            logoMode === 'upload'
                                                ? 'bg-blue-500/20 text-blue-200 ring-1 ring-inset ring-blue-500/40'
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        <Upload className="h-3.5 w-3.5" />
                                        Upload file
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLogoMode('url')}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                                            logoMode === 'url'
                                                ? 'bg-blue-500/20 text-blue-200 ring-1 ring-inset ring-blue-500/40'
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        <LinkIcon className="h-3.5 w-3.5" />
                                        Paste URL
                                    </button>
                                </div>

                                {logoMode === 'upload' ? (
                                    <div>
                                        <input
                                            ref={logoFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => handleLogoFile(e.target.files?.[0])}
                                            disabled={uploadingLogo || submitting}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => logoFileInputRef.current?.click()}
                                            disabled={uploadingLogo || submitting}
                                            className={`w-full flex items-center justify-center gap-3 px-4 py-6 rounded-xl border-2 border-dashed transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                                                errors.logoUrl && !form.logoUrl
                                                    ? 'border-red-500/50 bg-red-500/5 hover:bg-red-500/10'
                                                    : 'border-white/15 bg-white/[0.02] hover:bg-white/[0.04]'
                                            }`}
                                        >
                                            {uploadingLogo ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                                                    <span className="text-sm text-slate-300">Uploading…</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="h-4 w-4 text-slate-400" />
                                                    <span className="text-sm text-slate-300">
                                                        {form.logoUrl ? 'Replace logo' : 'Click to upload logo'}
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                        <p className="text-xs text-slate-500 mt-1.5">
                                            PNG, JPG, or SVG · max 2 MB · recommended at least 200×200px
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <Input
                                            id="logoUrl"
                                            value={form.logoUrl}
                                            onChange={(e) => setField('logoUrl', e.target.value)}
                                            placeholder="https://cdn.example.com/logo.png"
                                            className={inputCls(errors.logoUrl)}
                                            inputMode="url"
                                            autoComplete="url"
                                        />
                                        <p className="text-xs text-slate-500 mt-1.5">
                                            Paste a publicly reachable URL — PNG or SVG, at least 200×200px.
                                        </p>
                                    </div>
                                )}

                                {errors.logoUrl && !form.logoUrl && (
                                    <p className="text-xs font-medium text-red-400">{errors.logoUrl}</p>
                                )}

                                {form.logoUrl && (
                                    <div className="mt-3 flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                                        <div className="h-14 w-14 rounded-lg bg-white grid place-items-center overflow-hidden shrink-0">
                                            {logoPreviewBroken ? (
                                                <span className="text-[10px] text-slate-500">Invalid</span>
                                            ) : (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={form.logoUrl}
                                                    alt="Logo preview"
                                                    className="max-h-12 max-w-12 object-contain"
                                                    onError={() => setLogoPreviewBroken(true)}
                                                />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-200">Preview</p>
                                            <p className="text-xs text-slate-500 break-all">{form.logoUrl}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setField('logoUrl', '')}
                                            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                            aria-label="Remove logo"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </FieldGroup>

                    {/* Return address */}
                    <FieldGroup
                        icon={<MapPin className="h-4 w-4" />}
                        title="Return &amp; pickup address"
                        description="Printed on every shipping label as the origin address. Carriers also use this for RTO."
                    >
                        <div className="space-y-5">
                            <Field label="Street address" required error={errors.addressLine1} htmlFor="addressLine1">
                                <Input
                                    id="addressLine1"
                                    value={form.addressLine1}
                                    onChange={(e) => setField('addressLine1', e.target.value)}
                                    placeholder="Unit / building / street, area"
                                    className={inputCls(errors.addressLine1)}
                                    autoComplete="street-address"
                                />
                            </Field>
                            <div className="grid md:grid-cols-3 gap-5">
                                <Field label="City" required error={errors.city} htmlFor="city">
                                    <Input
                                        id="city"
                                        value={form.city}
                                        onChange={(e) => setField('city', e.target.value)}
                                        placeholder="Hyderabad"
                                        className={inputCls(errors.city)}
                                        autoComplete="address-level2"
                                    />
                                </Field>
                                <Field label="State" required error={errors.state} htmlFor="state">
                                    <Input
                                        id="state"
                                        value={form.state}
                                        onChange={(e) => setField('state', e.target.value)}
                                        placeholder="Telangana"
                                        className={inputCls(errors.state)}
                                        autoComplete="address-level1"
                                    />
                                </Field>
                                <Field label="Pincode" required error={errors.pincode} htmlFor="pincode">
                                    <Input
                                        id="pincode"
                                        value={form.pincode}
                                        onChange={(e) => setField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="500081"
                                        className={inputCls(errors.pincode)}
                                        inputMode="numeric"
                                        autoComplete="postal-code"
                                        maxLength={6}
                                    />
                                </Field>
                            </div>
                            <Field label="Sender mobile" required error={errors.senderMobile} htmlFor="senderMobile" hint="Printed on the label as the pickup contact.">
                                <Input
                                    id="senderMobile"
                                    value={form.senderMobile}
                                    onChange={(e) => setField('senderMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                    placeholder="10-digit number"
                                    className={inputCls(errors.senderMobile)}
                                    inputMode="numeric"
                                    autoComplete="tel-national"
                                    maxLength={10}
                                />
                            </Field>
                        </div>
                    </FieldGroup>

                    {/* Support contact */}
                    <FieldGroup
                        icon={<Phone className="h-4 w-4" />}
                        title="Customer support contact"
                        description="Displayed on your portal&rsquo;s Contact / Help pages."
                    >
                        <div className="grid md:grid-cols-2 gap-5">
                            <Field label="Support email" required error={errors.supportEmail} htmlFor="supportEmail">
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                    <Input
                                        id="supportEmail"
                                        type="email"
                                        value={form.supportEmail}
                                        onChange={(e) => setField('supportEmail', e.target.value)}
                                        placeholder="support@yourbrand.com"
                                        className={inputCls(errors.supportEmail, 'pl-9')}
                                        autoComplete="email"
                                    />
                                </div>
                            </Field>
                            <Field label="Support phone" required error={errors.supportPhone} htmlFor="supportPhone">
                                <div className="relative">
                                    <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                    <Input
                                        id="supportPhone"
                                        value={form.supportPhone}
                                        onChange={(e) => setField('supportPhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                        placeholder="10-digit number"
                                        className={inputCls(errors.supportPhone, 'pl-9')}
                                        inputMode="numeric"
                                        autoComplete="tel-national"
                                        maxLength={10}
                                    />
                                </div>
                            </Field>
                        </div>
                    </FieldGroup>

                    {/* Submit */}
                    <div className="sticky bottom-4 z-20">
                        <div className="rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur-xl p-4 md:p-5 shadow-2xl shadow-black/40 flex items-center justify-between gap-4">
                            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
                                <Check className="h-4 w-4 text-emerald-400" />
                                Information is saved to your partner account and used for labels &amp; support.
                            </div>
                            <Button
                                type="submit"
                                disabled={submitting}
                                className="bg-primary hover:bg-primary/90 text-white font-semibold px-6 h-11 shadow-lg shadow-blue-900/30"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Saving…
                                    </>
                                ) : (
                                    <>
                                        Complete setup
                                        <ArrowRight className="h-4 w-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

// --- UI helpers ------------------------------------------------------------

function FieldGroup({
    icon,
    title,
    description,
    children,
}: {
    icon: React.ReactNode;
    title: React.ReactNode;
    description: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-7">
            <header className="flex items-start gap-3 mb-5">
                <div className="mt-1 h-8 w-8 rounded-lg bg-blue-500/10 text-blue-400 grid place-items-center">
                    {icon}
                </div>
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
                    <p className="text-sm text-slate-400 mt-0.5">{description}</p>
                </div>
            </header>
            {children}
        </section>
    );
}

function Field({
    label,
    htmlFor,
    required,
    error,
    hint,
    children,
}: {
    label: string;
    htmlFor: string;
    required?: boolean;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor} className="text-xs font-medium text-slate-300 flex items-center gap-1">
                {label}
                {required && <span className="text-blue-400">*</span>}
            </Label>
            {children}
            {error ? (
                <p className="text-xs font-medium text-red-400">{error}</p>
            ) : hint ? (
                <p className="text-xs text-slate-500">{hint}</p>
            ) : null}
        </div>
    );
}

function inputCls(error: string | undefined, extra = '') {
    return [
        'bg-white/[0.03] border-white/10 text-white placeholder:text-slate-500',
        'focus-visible:border-blue-500 focus-visible:ring-blue-500/30',
        error ? 'border-red-500/60 focus-visible:border-red-500 focus-visible:ring-red-500/30' : '',
        extra,
    ]
        .filter(Boolean)
        .join(' ');
}
