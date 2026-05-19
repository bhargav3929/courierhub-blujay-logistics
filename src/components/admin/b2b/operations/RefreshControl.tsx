'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

// Opt-in auto-refresh control. Off by default. When on, calls
// router.refresh() at the chosen interval. Setting persists in
// localStorage so the operator's preference survives navigation.
//
// Minimum interval is 30s — prevents accidental DDOS of Firestore from
// a tab left open. Default when first turned on: 60s.

const STORAGE_KEY = 'b2b-ops-refresh-v1';
const INTERVALS = [
    { label: 'Off', value: 0 },
    { label: 'Every 30s', value: 30 },
    { label: 'Every 1 min', value: 60 },
    { label: 'Every 5 min', value: 300 },
];

interface Stored {
    intervalSec: number;
}

export function RefreshControl({ fetchedAt }: { fetchedAt: Date }) {
    const router = useRouter();
    const [intervalSec, setIntervalSec] = useState(0);
    const [lastRefreshed, setLastRefreshed] = useState(fetchedAt);
    const [tickNonce, setTickNonce] = useState(0);

    // ─── load persisted preference ──────────────────────────────────
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Stored;
                if (typeof parsed.intervalSec === 'number') {
                    setIntervalSec(parsed.intervalSec);
                }
            }
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ intervalSec }));
        } catch { /* quota */ }
    }, [intervalSec]);

    // ─── schedule refreshes ──────────────────────────────────────────
    useEffect(() => {
        if (intervalSec <= 0) return;
        const id = setInterval(() => {
            router.refresh();
            setLastRefreshed(new Date());
        }, intervalSec * 1000);
        return () => clearInterval(id);
    }, [intervalSec, router]);

    // ─── tick to update "X ago" label ────────────────────────────────
    useEffect(() => {
        const id = setInterval(() => setTickNonce((n) => n + 1), 10_000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-500 md:inline" title={lastRefreshed.toISOString()}>
                {/* tickNonce keeps this fresh */}
                <Tick nonce={tickNonce} />
                fetched {relative(lastRefreshed)}
            </span>
            <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                    router.refresh();
                    setLastRefreshed(new Date());
                }}
                aria-label="Refresh now"
            >
                <RefreshCw className="size-3.5" /> Refresh
            </Button>
            <Select
                value={intervalSec.toString()}
                onValueChange={(v) => setIntervalSec(parseInt(v, 10))}
            >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {INTERVALS.map((i) => (
                        <SelectItem key={i.value} value={i.value.toString()} className="text-xs">
                            {i.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function Tick({ nonce }: { nonce: number }) {
    void nonce;
    return null;
}

function relative(d: Date): string {
    const ms = Date.now() - d.getTime();
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    return `${Math.floor(ms / 3_600_000)}h ago`;
}
