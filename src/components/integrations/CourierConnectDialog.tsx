'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, AlertTriangle, Eye, EyeOff } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CourierRegistryEntry } from '@/config/courierRegistry';
import { connectCourier } from '@/services/courierIntegrationService';

interface Props {
    courier: CourierRegistryEntry | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConnected: () => void;
}

export function CourierConnectDialog({ courier, open, onOpenChange, onConnected }: Props) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
    const [submitting, setSubmitting] = useState(false);

    // Reset when the courier changes
    useEffect(() => {
        if (courier) {
            const defaults: Record<string, string> = {};
            for (const f of courier.fields) {
                if (f.type === 'select' && f.options?.length) defaults[f.key] = f.options[0].value;
                else defaults[f.key] = '';
            }
            setValues(defaults);
            setVisibleSecrets({});
        }
    }, [courier?.id]);

    if (!courier) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Local required-field check (server re-validates)
        const missing = courier.fields
            .filter((f) => f.required && !values[f.key]?.trim())
            .map((f) => f.label);
        if (missing.length > 0) {
            toast.error(`Please fill: ${missing.join(', ')}`);
            return;
        }

        setSubmitting(true);
        try {
            const result = await connectCourier(courier.id, values);
            toast.success(`${courier.name} connected`, {
                description: result.integration?.publicMeta?.accountIdentifier,
            });
            if (result.warnings?.length) {
                result.warnings.forEach((w) => toast.warning(w));
            }
            onConnected();
            onOpenChange(false);
        } catch (err: any) {
            toast.error(err?.message || `Could not connect ${courier.name}`);
        } finally {
            setSubmitting(false);
        }
    };

    const isComingSoon = courier.status === 'coming_soon';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${courier.color} grid place-items-center shadow-md`}>
                            <span className="text-white font-extrabold text-sm">{courier.name.charAt(0)}</span>
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Connect {courier.name}</DialogTitle>
                            <DialogDescription>{courier.tagline}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="mt-2">
                    <p className="text-sm text-muted-foreground">{courier.description}</p>
                    {courier.docsUrl && (
                        <a
                            href={courier.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block mt-2 text-xs font-semibold text-primary underline underline-offset-2"
                        >
                            View {courier.name} API docs →
                        </a>
                    )}
                </div>

                {isComingSoon && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm flex gap-2 text-amber-900 dark:text-amber-100">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold">Pending verification</p>
                            <p className="text-amber-900/80 dark:text-amber-100/80 text-xs leading-relaxed">
                                This connector is scaffolded but not yet validated against a live {courier.name} account.
                                Connect is disabled until we verify it end-to-end with real sandbox credentials.
                            </p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    {courier.fields.map((field) => {
                        const id = `${courier.id}-${field.key}`;
                        const isSecret = field.type === 'password';
                        const showSecret = visibleSecrets[field.key];
                        const toggleSecret = () =>
                            setVisibleSecrets((s) => ({ ...s, [field.key]: !s[field.key] }));

                        return (
                            <div key={field.key} className="space-y-1.5">
                                <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider">
                                    {field.label}
                                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                                </Label>

                                {field.type === 'select' ? (
                                    <Select
                                        value={values[field.key] || ''}
                                        onValueChange={(v) => setValues((s) => ({ ...s, [field.key]: v }))}
                                        disabled={isComingSoon || submitting}
                                    >
                                        <SelectTrigger id={id}>
                                            <SelectValue placeholder="Choose…" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {field.options?.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="relative">
                                        <Input
                                            id={id}
                                            type={isSecret && !showSecret ? 'password' : 'text'}
                                            autoComplete="off"
                                            spellCheck={false}
                                            value={values[field.key] || ''}
                                            onChange={(e) =>
                                                setValues((s) => ({ ...s, [field.key]: e.target.value }))
                                            }
                                            placeholder={field.placeholder}
                                            disabled={isComingSoon || submitting}
                                            className={isSecret ? 'pr-10 font-mono text-sm' : ''}
                                        />
                                        {isSecret && (
                                            <button
                                                type="button"
                                                onClick={toggleSecret}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
                                                aria-label={showSecret ? 'Hide' : 'Show'}
                                                tabIndex={-1}
                                            >
                                                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {field.helpText && (
                                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                                )}
                            </div>
                        );
                    })}

                    <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs flex items-start gap-2">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                        <p className="text-muted-foreground leading-relaxed">
                            Credentials are validated against {courier.name} in real time and then stored
                            encrypted (AES-256). They're never exposed back to the frontend.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isComingSoon || submitting}
                            className="min-w-[140px]"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Validating…
                                </>
                            ) : (
                                'Connect & Validate'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
