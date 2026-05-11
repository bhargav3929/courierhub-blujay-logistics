'use client';

// API Key Manager — self-contained component dropped onto the
// /client-integrations page. Lets a merchant admin generate, view, and
// revoke API keys for the merchant-webhook endpoint
// (POST /api/integrations/orders/webhook).
//
// The raw key is shown ONCE in a modal after creation — we never store
// it in plaintext server-side, so re-displaying later is impossible.
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

interface ApiKeySummary {
    id: string;
    label: string;
    createdAt: number;
    lastUsedAt?: number;
    revokedAt?: number;
    maskedKey: string;
}

async function bearer() {
    const u = getAuth().currentUser;
    if (!u) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${await u.getIdToken()}` };
}

export function ApiKeyManager() {
    const [keys, setKeys] = useState<ApiKeySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create-key dialog state
    const [createOpen, setCreateOpen] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [creating, setCreating] = useState(false);
    const [mintedKey, setMintedKey] = useState<{
        id: string;
        label: string;
        rawKey: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    // Revoke confirm state
    const [revokeTarget, setRevokeTarget] = useState<ApiKeySummary | null>(null);
    const [revoking, setRevoking] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const headers = await bearer();
            const { data } = await axios.get('/api/client/api-keys', { headers });
            setKeys(data.keys ?? []);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to load keys');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleCreate = async () => {
        if (!newLabel.trim()) return;
        setCreating(true);
        try {
            const headers = await bearer();
            const { data } = await axios.post(
                '/api/client/api-keys',
                { label: newLabel.trim() },
                { headers }
            );
            setMintedKey(data.key);
            setCreateOpen(false);
            setNewLabel('');
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

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success('Copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Copy failed — select and copy manually');
        }
    };

    const active = keys.filter((k) => !k.revokedAt);
    const revoked = keys.filter((k) => k.revokedAt);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Key className="h-4 w-4 text-blue-600" />
                            Merchant API Keys
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Use these keys to POST paid orders from your storefront
                            backend to Blujay. The resulting shipments appear in your
                            My Shipments page automatically.
                        </CardDescription>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => setCreateOpen(true)}
                        className="shrink-0"
                    >
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
                        <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm font-medium">No API keys yet</p>
                        <p className="text-xs mt-1">
                            Click "New Key" to generate one for your storefront backend.
                        </p>
                    </div>
                )}
                {!loading && !error && keys.length > 0 && (
                    <div className="space-y-2">
                        {active.map((k) => (
                            <KeyRow
                                key={k.id}
                                k={k}
                                onRevoke={() => setRevokeTarget(k)}
                            />
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

                {/* Quick docs */}
                <details className="mt-5">
                    <summary className="text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-800 flex items-center gap-1.5">
                        <Code2 className="h-3.5 w-3.5" />
                        How to use these keys
                    </summary>
                    <div className="mt-3 text-xs text-slate-600 space-y-2 bg-slate-50 rounded-md p-3 border border-slate-200 font-mono">
                        <div className="text-slate-500 font-sans">
                            From your storefront backend, after the customer has paid:
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap">{`POST https://blujaylogistic.com/api/integrations/orders/webhook
Content-Type: application/json
X-Blujay-Api-Key: bj_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "external_order_id": "ORDER-12345",
  "customer": { "name": "Jane Doe", "phone": "9876543210" },
  "shipping_address": {
    "name": "Jane Doe", "phone": "9876543210",
    "line1": "12 MG Road", "city": "Bangalore",
    "state": "Karnataka", "pincode": "560001",
    "country": "India"
  },
  "items": [
    { "name": "T-shirt", "sku": "TS-001",
      "quantity": 1, "unit_price": 49900,
      "weight_g": 200 }
  ],
  "amounts": { "subtotal": 49900, "total": 49900 },
  "payment_method": "prepaid"
}`}</pre>
                        <div className="font-sans text-slate-500">
                            All amounts in paise (smallest unit). Idempotent on
                            external_order_id. Response: {`{ shipmentId }`}.
                        </div>
                    </div>
                </details>
            </CardContent>

            {/* CREATE DIALOG */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create new API key</DialogTitle>
                        <DialogDescription>
                            Give the key a label so you can identify it later (e.g.
                            "Production website" or "Staging").
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-2">
                        <Label htmlFor="key-label">Label</Label>
                        <Input
                            id="key-label"
                            placeholder="Production website"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            disabled={creating}
                            onKeyDown={(e) =>
                                e.key === 'Enter' && newLabel.trim() && handleCreate()
                            }
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCreateOpen(false)}
                            disabled={creating}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={creating || !newLabel.trim()}
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
            <Dialog
                open={!!mintedKey}
                onOpenChange={(v) => !v && setMintedKey(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Your new API key</DialogTitle>
                        <DialogDescription>
                            Copy this key now — for security, we won't show it again.
                            You'll only see a masked preview in the list after this.
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
                                    onClick={() => mintedKey && handleCopy(mintedKey.rawKey)}
                                >
                                    {copied ? (
                                        <Check className="h-4 w-4 text-emerald-600" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                                <strong>Save this key now.</strong> Once you close this
                                dialog you can't see it again — only revoke and create
                                a new one.
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
                            Any storefront still using <strong>{revokeTarget?.label}</strong>{' '}
                            will immediately stop being able to push orders.
                            This action can't be undone — create a new key if needed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revoking}>
                            Keep key
                        </AlertDialogCancel>
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

function KeyRow({
    k,
    onRevoke,
}: {
    k: ApiKeySummary;
    onRevoke?: () => void;
}) {
    const isRevoked = !!k.revokedAt;
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
                    <span className="font-medium text-sm text-slate-900 truncate">
                        {k.label}
                    </span>
                    {isRevoked && (
                        <Badge
                            variant="outline"
                            className="text-xs bg-rose-50 text-rose-700 border-rose-200"
                        >
                            Revoked
                        </Badge>
                    )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-mono truncate">
                    {k.maskedKey}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                    Created {format(new Date(k.createdAt), 'dd MMM yyyy')}
                    {k.lastUsedAt && (
                        <> · Last used {format(new Date(k.lastUsedAt), 'dd MMM yyyy')}</>
                    )}
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
