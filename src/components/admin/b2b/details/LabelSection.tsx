'use client';

import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { AdminShipmentRow } from '@/types/b2b/admin';
import { Button } from '@/components/ui/button';
import { refreshLabelUrlAction, retryLabelAction } from '@/app/(admin)/b2b/shipments/[id]/actions';

// Label section: download + refresh-URL + retry-on-failure.
// `initialUrl` is server-minted on page load. Clicking "Refresh URL" mints
// a fresh signed URL (24h TTL). Clicking "Retry retrieval" invokes the
// LabelService retry path for shipments where the booking-time fetch failed.

export function LabelSection({
    shipment,
    initialUrl,
    initialError,
}: {
    shipment: AdminShipmentRow;
    initialUrl: string | null;
    initialError: string | null;
}) {
    const [url, setUrl] = useState<string | null>(initialUrl);
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(initialError);

    const labelStatus = shipment.label.status;
    const attempts = shipment.label.attempts;

    async function onRefresh() {
        setBusy(true);
        setStatus(null);
        try {
            const r = await refreshLabelUrlAction({
                shipmentId: shipment.shipmentId,
                partnerId: shipment.partnerId,
            });
            if (r.ok && 'signedUrl' in r && r.signedUrl) {
                setUrl(r.signedUrl);
                setError(null);
                setStatus('Fresh signed URL minted');
            } else {
                setError(r.message);
            }
        } finally {
            setBusy(false);
        }
    }

    async function onRetry() {
        setBusy(true);
        setStatus(null);
        try {
            const r = await retryLabelAction({
                shipmentId: shipment.shipmentId,
                partnerId: shipment.partnerId,
            });
            setStatus(r.message);
            if (!r.ok) setError(r.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Label
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-600">
                    status: <span className="font-medium text-slate-900">{labelStatus ?? 'not-generated'}</span>
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">attempts: {attempts}</span>

                <div className="ml-auto flex flex-wrap gap-2">
                    {url ? (
                        <Button asChild size="sm" variant="outline">
                            <a href={url} target="_blank" rel="noopener noreferrer">
                                <Download className="size-3.5" /> Download
                            </a>
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" disabled>
                            <Download className="size-3.5" /> Download
                        </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={onRefresh} disabled={busy}>
                        <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh URL
                    </Button>
                    {(labelStatus === 'pending' || labelStatus === 'failed') && shipment.courier.awb && (
                        <Button size="sm" variant="ghost" onClick={onRetry} disabled={busy}>
                            <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} /> Retry retrieval
                        </Button>
                    )}
                </div>
            </div>

            {status && <p className="mt-2 text-xs text-emerald-700">{status}</p>}
            {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </section>
    );
}
