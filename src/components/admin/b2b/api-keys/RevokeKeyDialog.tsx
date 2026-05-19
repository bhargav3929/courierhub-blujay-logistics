'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { revokeB2BApiKeyAction } from '@/app/(admin)/b2b/api-keys/actions';

// Revoke confirmation dialog.
//
// Strictly opt-in: ESC + outside-click work normally (this is the "are
// you sure" step, not the irreversible reveal step). Confirms via a typed
// reason (≥5 chars), then submits. On success, parent revalidates.

interface Props {
    readonly keyId: string;
    readonly label: string;
    readonly keyPrefix: string;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}

export function RevokeKeyDialog({ keyId, label, keyPrefix, open, onOpenChange }: Props) {
    const [reason, setReason] = useState('');
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleSubmit() {
        setError(null);
        if (reason.trim().length < 5) {
            setError('Reason must be at least 5 characters');
            return;
        }
        startTransition(async () => {
            const r = await revokeB2BApiKeyAction({ keyId, reason });
            if (r.ok) {
                setReason('');
                onOpenChange(false);
            } else {
                setError(r.message);
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-700">
                        <AlertTriangle className="size-5" />
                        Revoke API key
                    </DialogTitle>
                    <DialogDescription>
                        This is permanent. The key cannot be reactivated.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="text-slate-700">{label}</div>
                        <div className="font-mono text-xs text-slate-500">{keyPrefix}…</div>
                    </div>

                    <div>
                        <Label className="text-xs text-slate-600">
                            Reason for revocation (audit log)
                        </Label>
                        <Input
                            autoFocus
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Compromised; rotated; partner offboarded …"
                            className="mt-1 h-11"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-700">{error}</p>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={pending}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={pending || reason.trim().length < 5}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        {pending && <Loader2 className="size-4 animate-spin" />}
                        Revoke permanently
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
