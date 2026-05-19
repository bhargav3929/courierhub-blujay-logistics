'use client';

import { useEffect, useState, useTransition } from 'react';
import { AlertTriangle, Check, Copy, Loader2, Plus, ShieldCheck } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    createB2BApiKeyAction,
    type CreateResult,
} from '@/app/(admin)/b2b/api-keys/actions';
import {
    ALL_B2B_API_KEY_ENVIRONMENTS,
    type B2BApiKeyEnvironment,
} from '@/types/b2b/api-key';

// Two-stage dialog:
//   1. form     → operator fills partner, label, environment, optional expiry
//   2. revealed → raw key shown ONCE with copy + acknowledgement
//
// Security UX rules enforced here:
//   - In `revealed`, ESC and outside-click are intercepted unless the
//     operator has ticked "I've saved this securely"
//   - Window beforeunload listener warns on tab/browser close while
//     the raw key is on screen
//   - Local state is wiped on every close

type Stage = 'form' | 'revealed';

export function CreateKeyDialog() {
    const [open, setOpen] = useState(false);
    const [stage, setStage] = useState<Stage>('form');

    // form state
    const [partnerId, setPartnerId] = useState('');
    const [label, setLabel] = useState('');
    const [environment, setEnvironment] = useState<B2BApiKeyEnvironment>('production');
    const [setExpiry, setSetExpiry] = useState(false);
    const [expiryDate, setExpiryDate] = useState('');

    // reveal state
    const [minted, setMinted] = useState<CreateResult | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    // ─── beforeunload guard while raw key visible ──────────────────
    useEffect(() => {
        if (stage !== 'revealed' || confirmed) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [stage, confirmed]);

    function reset() {
        setStage('form');
        setPartnerId('');
        setLabel('');
        setEnvironment('production');
        setSetExpiry(false);
        setExpiryDate('');
        setMinted(null);
        setConfirmed(false);
        setCopied(false);
        setError(null);
    }

    function handleOpenChange(next: boolean) {
        if (!next && stage === 'revealed' && !confirmed) {
            // Operator hasn't acknowledged saving the secret.
            const proceed = window.confirm(
                'You have NOT confirmed that you saved this secret. It cannot be viewed again. Close anyway?',
            );
            if (!proceed) return;
        }
        setOpen(next);
        if (!next) {
            // Defer reset until dialog animation completes.
            setTimeout(reset, 200);
        }
    }

    function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!partnerId.trim()) { setError('Partner ID required'); return; }
        startTransition(async () => {
            const r = await createB2BApiKeyAction({
                partnerId: partnerId.trim(),
                label: label.trim(),
                environment,
                expiresAtIso: setExpiry && expiryDate
                    ? new Date(expiryDate).toISOString()
                    : undefined,
            });
            if (r.ok) {
                setMinted(r);
                setStage('revealed');
            } else {
                setError(r.message);
            }
        });
    }

    async function onCopy() {
        if (!minted || !minted.ok) return;
        try {
            await navigator.clipboard.writeText(minted.rawKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Could not write to clipboard — copy manually');
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button size="sm" className="h-9">
                    <Plus className="size-4" /> New API key
                </Button>
            </DialogTrigger>
            <DialogContent
                className="sm:max-w-md"
                onPointerDownOutside={(e) => {
                    if (stage === 'revealed' && !confirmed) e.preventDefault();
                }}
                onEscapeKeyDown={(e) => {
                    if (stage === 'revealed' && !confirmed) e.preventDefault();
                }}
            >
                {stage === 'form' && (
                    <FormStage
                        partnerId={partnerId} setPartnerId={setPartnerId}
                        label={label} setLabel={setLabel}
                        environment={environment} setEnvironment={setEnvironment}
                        setExpiry={setExpiry} toggleSetExpiry={setSetExpiry}
                        expiryDate={expiryDate} setExpiryDate={setExpiryDate}
                        error={error} pending={pending}
                        onSubmit={onSubmit}
                        onCancel={() => handleOpenChange(false)}
                    />
                )}
                {stage === 'revealed' && minted && minted.ok && (
                    <RevealStage
                        minted={minted}
                        copied={copied}
                        confirmed={confirmed}
                        onCopy={onCopy}
                        onToggleConfirmed={() => setConfirmed((v) => !v)}
                        onDone={() => handleOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

// ─── form stage ────────────────────────────────────────────────────────

function FormStage(p: {
    partnerId: string; setPartnerId: (v: string) => void;
    label: string; setLabel: (v: string) => void;
    environment: B2BApiKeyEnvironment; setEnvironment: (v: B2BApiKeyEnvironment) => void;
    setExpiry: boolean; toggleSetExpiry: (v: boolean) => void;
    expiryDate: string; setExpiryDate: (v: string) => void;
    error: string | null; pending: boolean;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
}) {
    return (
        <form onSubmit={p.onSubmit}>
            <DialogHeader>
                <DialogTitle>Create B2B API key</DialogTitle>
                <DialogDescription>
                    The raw secret is shown <strong>once</strong> on the next screen.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
                <div>
                    <Label className="text-xs text-slate-600">Partner ID</Label>
                    <Input
                        autoFocus
                        value={p.partnerId}
                        onChange={(e) => p.setPartnerId(e.target.value)}
                        placeholder="p_acme"
                        className="mt-1 h-10"
                        required
                    />
                    <p className="mt-1 text-xs text-slate-500">
                        Must match an existing partner. Auth resolves this key to this partnerId.
                    </p>
                </div>

                <div>
                    <Label className="text-xs text-slate-600">Label (audit)</Label>
                    <Input
                        value={p.label}
                        onChange={(e) => p.setLabel(e.target.value)}
                        placeholder="Acme Logistics — production"
                        className="mt-1 h-10"
                    />
                </div>

                <div>
                    <Label className="text-xs text-slate-600">Environment</Label>
                    <Select value={p.environment} onValueChange={(v) => p.setEnvironment(v as B2BApiKeyEnvironment)}>
                        <SelectTrigger className="mt-1 h-10">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {ALL_B2B_API_KEY_ENVIRONMENTS.map((env) => (
                                <SelectItem key={env} value={env}>
                                    {env}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={p.setExpiry}
                            onChange={(e) => p.toggleSetExpiry(e.target.checked)}
                            className="size-4"
                        />
                        <span>Set expiration</span>
                    </label>
                    {p.setExpiry && (
                        <Input
                            type="date"
                            value={p.expiryDate}
                            onChange={(e) => p.setExpiryDate(e.target.value)}
                            className="mt-2 h-10"
                            required
                        />
                    )}
                </div>

                {p.error && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {p.error}
                    </div>
                )}
            </div>

            <DialogFooter>
                <Button type="button" variant="ghost" onClick={p.onCancel} disabled={p.pending}>
                    Cancel
                </Button>
                <Button type="submit" disabled={p.pending}>
                    {p.pending && <Loader2 className="size-4 animate-spin" />}
                    Create key
                </Button>
            </DialogFooter>
        </form>
    );
}

// ─── reveal stage ──────────────────────────────────────────────────────

function RevealStage(p: {
    minted: Extract<CreateResult, { ok: true }>;
    copied: boolean;
    confirmed: boolean;
    onCopy: () => void;
    onToggleConfirmed: () => void;
    onDone: () => void;
}) {
    return (
        <div>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-700">
                    <ShieldCheck className="size-5" /> API key created
                </DialogTitle>
                <DialogDescription>
                    Save this secret now. It cannot be viewed again — even by Blujay ops.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>
                            <strong>This is the only time you can view this secret.</strong>{' '}
                            Store it in your partner's secret manager before closing this dialog.
                        </span>
                    </p>
                </div>

                <div>
                    <Label className="text-xs text-slate-600">Partner</Label>
                    <p className="mt-0.5 font-mono text-sm text-slate-900">{p.minted.partnerId}</p>
                </div>

                <div>
                    <Label className="text-xs text-slate-600">Raw API key</Label>
                    <div className="mt-1 flex items-center gap-2">
                        <code
                            className="block flex-1 break-all rounded border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900"
                            aria-label="API key secret"
                        >
                            {p.minted.rawKey}
                        </code>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={p.onCopy}
                            className="h-10 shrink-0"
                        >
                            {p.copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                            <span aria-live="polite" className="ml-1">
                                {p.copied ? 'Copied' : 'Copy'}
                            </span>
                        </Button>
                    </div>
                </div>

                <div className="text-xs text-slate-500">
                    <p>
                        Prefix:&nbsp;<code className="font-mono text-slate-700">{p.minted.keyPrefix}</code>
                    </p>
                    <p>Environment: {p.minted.environment}</p>
                    {p.minted.expiresAt && (
                        <p>
                            Expires:&nbsp;
                            {new Date(p.minted.expiresAt).toISOString().slice(0, 10)}
                        </p>
                    )}
                </div>

                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white p-3 hover:bg-slate-50">
                    <input
                        type="checkbox"
                        checked={p.confirmed}
                        onChange={p.onToggleConfirmed}
                        className="mt-0.5 size-4 shrink-0"
                    />
                    <span className="text-sm text-slate-800">
                        I've copied this secret to a secure location.
                    </span>
                </label>
            </div>

            <DialogFooter>
                <Button onClick={p.onDone} disabled={!p.confirmed}>
                    Done
                </Button>
            </DialogFooter>
        </div>
    );
}
