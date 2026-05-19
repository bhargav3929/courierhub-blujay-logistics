'use client';

// API Key Manager — unified for B2C merchant keys + B2B partner keys.
//
// Controlled by the `scope` prop:
//   - 'merchant'      (default): existing B2C flow, used by storefront
//                     backends to push orders.
//   - 'b2b_partner':            : extended flow for B2B partners, mints
//                     keys that activate the full B2B platform
//                     (rates, bookings, tracking, webhooks).
//
// The raw key is shown ONCE in a modal after creation — we never store
// it in plaintext server-side, so re-displaying later is impossible.
// B2B keys additionally show a one-time webhook secret if a webhook URL
// was configured.
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';
import {
    Key,
    Loader2,
    Plus,
    Trash2,
    Copy,
    Check,
    AlertTriangle,
    Code2,
    Briefcase,
} from 'lucide-react';
import { format } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ApiKeySummary, ApiKeyScope, ApiKeyEnvironment } from '@/types/apiKey';

interface MintedKeyState {
    id: string;
    label: string;
    rawKey: string;
    scope: ApiKeyScope;
    webhookSecret?: string;
}

async function bearer() {
    const u = getAuth().currentUser;
    if (!u) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${await u.getIdToken()}` };
}

export function ApiKeyManager({
    hideDocs = false,
    scope,
}: {
    hideDocs?: boolean;
    // When `scope` is set, list filters to that scope only and create dialog
    // is locked to that type. When omitted, shows ALL keys (both B2C + B2B)
    // and the create dialog has an inline type toggle.
    scope?: ApiKeyScope;
} = {}) {
    const unified = scope === undefined;
    const isB2B = scope === 'b2b_partner';

    const [keys, setKeys] = useState<ApiKeySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create-key dialog state
    const [createOpen, setCreateOpen] = useState(false);
    // In unified mode the user picks the type inside the dialog; in scoped
    // mode it's fixed by the `scope` prop.
    const [newKeyType, setNewKeyType] = useState<ApiKeyScope>(scope ?? 'merchant');
    const [newLabel, setNewLabel] = useState('');
    const [newPartnerName, setNewPartnerName] = useState('');
    const [newEnvironment, setNewEnvironment] = useState<ApiKeyEnvironment>('sandbox');
    const [newWebhookUrl, setNewWebhookUrl] = useState('');
    const [creating, setCreating] = useState(false);
    const [mintedKey, setMintedKey] = useState<MintedKeyState | null>(null);
    const [copied, setCopied] = useState(false);
    const [copiedSecret, setCopiedSecret] = useState(false);

    // Revoke confirm state
    const [revokeTarget, setRevokeTarget] = useState<ApiKeySummary | null>(null);
    const [revoking, setRevoking] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const headers = await bearer();
            const { data } = await axios.get('/api/client/api-keys', { headers });
            const all: ApiKeySummary[] = data.keys ?? [];
            // Scoped mode → filter to that scope. Unified mode → show all keys.
            setKeys(unified ? all : all.filter((k) => k.scope === scope));
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to load keys');
        } finally {
            setLoading(false);
        }
    }, [scope, unified]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const resetCreateForm = () => {
        setNewLabel('');
        setNewPartnerName('');
        setNewEnvironment('sandbox');
        setNewWebhookUrl('');
    };

    // In unified mode the dialog's type toggle drives this; in scoped mode
    // the parent's `scope` prop drives it.
    const creatingB2B = unified ? newKeyType === 'b2b_partner' : isB2B;

    const handleCreate = async () => {
        if (!newLabel.trim()) return;
        if (creatingB2B && !newPartnerName.trim()) {
            toast.error('Partner name is required for B2B keys');
            return;
        }
        if (creatingB2B && newWebhookUrl.trim() && !/^https?:\/\//.test(newWebhookUrl.trim())) {
            toast.error('Webhook URL must start with http:// or https://');
            return;
        }
        setCreating(true);
        try {
            const headers = await bearer();
            const body = creatingB2B
                ? {
                      keyType: 'b2b',
                      label: newLabel.trim(),
                      partnerName: newPartnerName.trim(),
                      environment: newEnvironment,
                      ...(newWebhookUrl.trim() ? { webhookUrl: newWebhookUrl.trim() } : {}),
                  }
                : { keyType: 'b2c', label: newLabel.trim() };

            const { data } = await axios.post('/api/client/api-keys', body, { headers });
            setMintedKey(data.key);
            setCreateOpen(false);
            resetCreateForm();
            await refresh();
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Failed to create key';
            toast.error(msg);
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async () => {
        if (!revokeTarget) return;
        setRevoking(true);
        try {
            const headers = await bearer();
            await axios.delete(`/api/client/api-keys/${revokeTarget.id}`, { headers });
            toast.success('API key revoked');
            setRevokeTarget(null);
            await refresh();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || err?.message || 'Failed to revoke');
        } finally {
            setRevoking(false);
        }
    };

    const handleCopy = async (text: string, which: 'key' | 'secret' = 'key') => {
        try {
            await navigator.clipboard.writeText(text);
            if (which === 'key') {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } else {
                setCopiedSecret(true);
                setTimeout(() => setCopiedSecret(false), 2000);
            }
            toast.success('Copied to clipboard');
        } catch {
            toast.error('Copy failed — select and copy manually');
        }
    };

    const active = keys.filter((k) => !k.revokedAt);
    const revoked = keys.filter((k) => k.revokedAt);

    const accent = isB2B
        ? { icon: 'text-violet-600', dialogTitleSuffix: 'B2B Partner key' }
        : { icon: 'text-blue-600', dialogTitleSuffix: unified ? 'API key' : 'Merchant key' };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                            {isB2B ? (
                                <Briefcase className={`h-4 w-4 ${accent.icon}`} />
                            ) : (
                                <Key className={`h-4 w-4 ${accent.icon}`} />
                            )}
                            {unified ? 'API Keys' : isB2B ? 'B2B Partner Keys' : 'Merchant API Keys'}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {unified ? (
                                <>All your API keys — B2C merchant (storefront sync) and B2B partner (full platform). Pick a type when creating.</>
                            ) : isB2B ? (
                                <>Use these keys to access the full B2B platform: rates, bookings, tracking, webhooks, reconciliation.</>
                            ) : (
                                <>Use these keys to POST paid orders from your storefront backend to Blujay. The resulting shipments appear in your My Shipments page automatically.</>
                            )}
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setCreateOpen(true)} className="shrink-0">
                        <Plus className="h-4 w-4 mr-1.5" />
                        New Key
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {loading && (
                    <div className="flex items-center justify-center py-8 text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading keys...
                    </div>
                )}
                {!loading && error && (
                    <div className="text-sm text-rose-600 py-4">{error}</div>
                )}
                {!loading && !error && keys.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                        {isB2B ? (
                            <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        ) : (
                            <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        )}
                        <p className="text-sm font-medium">No {isB2B ? 'B2B partner' : 'merchant'} keys yet</p>
                        <p className="text-xs mt-1">
                            Click "New Key" to generate one.
                        </p>
                    </div>
                )}
                {!loading && !error && keys.length > 0 && (
                    <div className="space-y-2">
                        {active.map((k) => (
                            <KeyRow key={k.id} k={k} onRevoke={() => setRevokeTarget(k)} />
                        ))}
                        {revoked.length > 0 && (
                            <details className="pt-3">
                                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                                    Revoked keys ({revoked.length})
                                </summary>
                                <div className="mt-2 space-y-2">
                                    {revoked.map((k) => (
                                        <KeyRow key={k.id} k={k} />
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                )}

                {!hideDocs && (unified || !isB2B) && (
                    <details className="mt-5">
                        <summary className="text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-800 flex items-center gap-1.5">
                            <Code2 className="h-3.5 w-3.5" />
                            How to use merchant (B2C) keys
                        </summary>
                        <div className="mt-3 text-xs text-slate-600 space-y-2 bg-slate-50 rounded-md p-3 border border-slate-200 font-mono">
                            <div className="text-slate-500 font-sans">
                                From your storefront backend, after the customer has paid:
                            </div>
                            <pre className="overflow-x-auto whitespace-pre-wrap">{`POST https://blujaylogistic.com/api/integrations/orders/webhook
Content-Type: application/json
X-Blujay-Api-Key: bj_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{ "external_order_id": "ORDER-12345", ... }`}</pre>
                            <div className="font-sans text-slate-500">
                                All amounts in paise. Idempotent on external_order_id.
                            </div>
                        </div>
                    </details>
                )}

                {!hideDocs && (unified || isB2B) && (
                    <details className="mt-5">
                        <summary className="text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-800 flex items-center gap-1.5">
                            <Code2 className="h-3.5 w-3.5" />
                            How to use B2B partner keys
                        </summary>
                        <div className="mt-3 text-xs text-slate-600 space-y-2 bg-slate-50 rounded-md p-3 border border-slate-200 font-mono">
                            <div className="text-slate-500 font-sans">
                                Book shipments through the full B2B pipeline:
                            </div>
                            <pre className="overflow-x-auto whitespace-pre-wrap">{`POST https://blujaylogistic.com/api/v1/b2b/shipments
Authorization: Bearer bj_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Idempotency-Key: <unique-per-attempt>
Content-Type: application/json

{ "fulfillmentMode": "courier", "courier": "bluedart",
  "origin": {...}, "destination": {...}, "parcel": {...} }`}</pre>
                            <div className="font-sans text-slate-500">
                                Also supports: /rates, /shipments/&lt;id&gt;/tracking, /shipments/&lt;id&gt;/label, /shipments/&lt;id&gt;/cancel. Webhooks from carriers are routed via /api/v1/b2b/webhooks/courier/*.
                            </div>
                        </div>
                    </details>
                )}
            </CardContent>

            {/* CREATE DIALOG */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create new {accent.dialogTitleSuffix}</DialogTitle>
                        <DialogDescription>
                            {isB2B
                                ? 'B2B keys activate the full logistics platform. Sandbox keys are isolated; production keys hit live carriers.'
                                : 'Give the key a label so you can identify it later.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-3">
                        {unified && (
                            <div className="space-y-1.5">
                                <Label>Key type</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setNewKeyType('merchant')}
                                        disabled={creating}
                                        className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                                            newKeyType === 'merchant'
                                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                        }`}
                                    >
                                        B2C Merchant
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewKeyType('b2b_partner')}
                                        disabled={creating}
                                        className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                                            newKeyType === 'b2b_partner'
                                                ? 'border-violet-500 bg-violet-50 text-violet-700'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                        }`}
                                    >
                                        B2B Partner
                                    </button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    {newKeyType === 'merchant'
                                        ? 'Push paid orders from your storefront to Blujay.'
                                        : 'Full B2B platform access: rates, bookings, tracking, webhooks.'}
                                </p>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="key-label">Label</Label>
                            <Input
                                id="key-label"
                                placeholder={creatingB2B ? 'Production key 2026-05' : 'Production website'}
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                disabled={creating}
                                onKeyDown={(e) =>
                                    e.key === 'Enter' && !creatingB2B && newLabel.trim() && handleCreate()
                                }
                            />
                        </div>
                        {creatingB2B && (
                            <>
                                <div className="space-y-1.5">
                                    <Label htmlFor="partner-name">Partner Name</Label>
                                    <Input
                                        id="partner-name"
                                        placeholder="Acme Logistics"
                                        value={newPartnerName}
                                        onChange={(e) => setNewPartnerName(e.target.value)}
                                        disabled={creating}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Environment</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['sandbox', 'production'] as ApiKeyEnvironment[]).map((env) => (
                                            <button
                                                key={env}
                                                type="button"
                                                onClick={() => setNewEnvironment(env)}
                                                disabled={creating}
                                                className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                                                    newEnvironment === env
                                                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                                                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                                }`}
                                            >
                                                {env === 'sandbox' ? 'Sandbox' : 'Production'}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                        Sandbox is for development; production hits real carriers and incurs cost.
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="webhook-url">Webhook URL <span className="text-slate-400 font-normal">(optional)</span></Label>
                                    <Input
                                        id="webhook-url"
                                        placeholder="https://your-domain.com/blujay/webhooks"
                                        value={newWebhookUrl}
                                        onChange={(e) => setNewWebhookUrl(e.target.value)}
                                        disabled={creating}
                                    />
                                    <p className="text-[11px] text-slate-500">
                                        If set, we'll POST shipment events to this URL (signed with HMAC-SHA256). Secret shown once after key creation.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setCreateOpen(false);
                                resetCreateForm();
                            }}
                            disabled={creating}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={creating || !newLabel.trim() || (creatingB2B && !newPartnerName.trim())}
                        >
                            {creating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Key'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* SHOW-RAW-KEY-ONCE DIALOG */}
            <Dialog open={!!mintedKey} onOpenChange={(v) => !v && setMintedKey(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Your new {mintedKey?.scope === 'b2b_partner' ? 'B2B Partner ' : ''}API key</DialogTitle>
                        <DialogDescription>
                            Copy this key now — for security, we won't show it again.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-3">
                        <div>
                            <Label className="text-xs text-slate-500">Label</Label>
                            <p className="text-sm font-medium">{mintedKey?.label}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-slate-500">API Key</Label>
                            <div className="mt-1 flex items-center gap-2">
                                <code className="flex-1 px-3 py-2 rounded-md bg-slate-900 text-emerald-400 text-xs font-mono break-all">
                                    {mintedKey?.rawKey}
                                </code>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => mintedKey && handleCopy(mintedKey.rawKey, 'key')}
                                >
                                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                        {mintedKey?.webhookSecret && (
                            <div>
                                <Label className="text-xs text-slate-500">Webhook Secret (HMAC-SHA256)</Label>
                                <div className="mt-1 flex items-center gap-2">
                                    <code className="flex-1 px-3 py-2 rounded-md bg-slate-900 text-violet-300 text-xs font-mono break-all">
                                        {mintedKey.webhookSecret}
                                    </code>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => mintedKey?.webhookSecret && handleCopy(mintedKey.webhookSecret, 'secret')}
                                    >
                                        {copiedSecret ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Verify the <code>X-Blujay-Signature</code> header on webhook deliveries to confirm they came from us.
                                </p>
                            </div>
                        )}
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                                <strong>Save this now.</strong> Once you close this
                                dialog you can't see it again — revoke and create a new
                                one if lost.
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setMintedKey(null)}>I've saved it</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* REVOKE CONFIRM */}
            <AlertDialog
                open={!!revokeTarget}
                onOpenChange={(v) => !v && !revoking && setRevokeTarget(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Anything still using <strong>{revokeTarget?.label}</strong> will
                            immediately stop being able to authenticate. This action can't be
                            undone — create a new key if needed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revoking}>Keep key</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRevoke}
                            disabled={revoking}
                            className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
                        >
                            {revoking ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Revoking...
                                </>
                            ) : (
                                'Yes, revoke'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

function KeyRow({ k, onRevoke }: { k: ApiKeySummary; onRevoke?: () => void }) {
    const isRevoked = !!k.revokedAt;
    const isB2B = k.scope === 'b2b_partner';
    return (
        <div
            className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 ${
                isRevoked
                    ? 'border-slate-200 bg-slate-50/50 opacity-70'
                    : 'border-slate-200 bg-white hover:border-slate-300'
            } transition-colors`}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-slate-900 truncate">{k.label}</span>
                    {isB2B && (
                        <Badge
                            variant="outline"
                            className="text-[10px] bg-violet-50 text-violet-700 border-violet-200"
                        >
                            B2B · {k.environment ?? '—'}
                        </Badge>
                    )}
                    {isRevoked && (
                        <Badge
                            variant="outline"
                            className="text-xs bg-rose-50 text-rose-700 border-rose-200"
                        >
                            Revoked
                        </Badge>
                    )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-mono truncate">{k.maskedKey}</div>
                {isB2B && k.partnerName && (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                        Partner: <strong>{k.partnerName}</strong>
                        {k.webhookUrl && <> · Webhook: <code className="text-[10px]">{k.webhookUrl}</code></>}
                    </div>
                )}
                <div className="text-xs text-slate-400 mt-0.5">
                    Created {format(new Date(k.createdAt), 'dd MMM yyyy')}
                    {k.lastUsedAt && <> · Last used {format(new Date(k.lastUsedAt), 'dd MMM yyyy')}</>}
                    {!k.lastUsedAt && !isRevoked && <> · Never used</>}
                </div>
            </div>
            {onRevoke && !isRevoked && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRevoke}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
}
