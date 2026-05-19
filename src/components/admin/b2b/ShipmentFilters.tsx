'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useTransition } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
    ALL_COURIER_CODES,
    ALL_FULFILLMENT_MODES,
    ALL_SHIPMENT_SOURCES,
    ALL_SHIPMENT_STATUSES,
    ALL_TRACKING_MODES,
} from '@/types/b2b/shipment';

// URL-driven filter state. The page's Server Component reads searchParams
// and re-fetches; this client component just pushes URL updates. No local
// filter state survives navigation — a shared link reproduces the view.
//
// Layout: single row of compact controls. Per user UI preference, this is
// minimal over feature-dense.

const ALL = '__all__';

export function ShipmentFilters({
    initial,
}: {
    initial: {
        readonly partnerId: string;
        readonly status: string;
        readonly courier: string;
        readonly fulfillmentMode: string;
        readonly trackingMode: string;
        readonly source: string;
        readonly labelStatus: string;
        readonly awaiting: string;
        readonly awb: string;
        readonly externalRef: string;
    };
}) {
    const router = useRouter();
    const search = useSearchParams();
    const [pending, startTransition] = useTransition();

    const [awb, setAwb] = useState(initial.awb);
    const [externalRef, setExternalRef] = useState(initial.externalRef);
    useEffect(() => { setAwb(initial.awb); }, [initial.awb]);
    useEffect(() => { setExternalRef(initial.externalRef); }, [initial.externalRef]);

    function apply(updates: Record<string, string | null>) {
        const params = new URLSearchParams(search.toString());
        // Reset cursor whenever filters change — old cursor doesn't apply.
        params.delete('cursor');
        for (const [k, v] of Object.entries(updates)) {
            if (v === null || v === '' || v === ALL) params.delete(k);
            else params.set(k, v);
        }
        const qs = params.toString();
        startTransition(() => {
            router.push(qs ? `?${qs}` : '?');
        });
    }

    const hasFilters = !!(
        initial.partnerId || initial.status || initial.courier ||
        initial.fulfillmentMode || initial.trackingMode || initial.source ||
        initial.labelStatus || initial.awaiting === 'true' ||
        initial.awb || initial.externalRef
    );

    return (
        <div className="border-b bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
                {/* AWB exact-match — operator's primary tool */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        apply({ awb: awb.trim() || null, externalRef: null });
                    }}
                    className="relative"
                >
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                        value={awb}
                        onChange={(e) => setAwb(e.target.value)}
                        placeholder="Search AWB…"
                        className="h-8 w-44 pl-8 pr-2 text-sm"
                    />
                </form>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        apply({ externalRef: externalRef.trim() || null, awb: null });
                    }}
                >
                    <Input
                        value={externalRef}
                        onChange={(e) => setExternalRef(e.target.value)}
                        placeholder="External ref…"
                        className="h-8 w-40 text-sm"
                    />
                </form>

                <FilterSelect
                    value={initial.status}
                    onChange={(v) => apply({ status: v })}
                    placeholder="Status"
                    options={[...ALL_SHIPMENT_STATUSES]}
                />
                <FilterSelect
                    value={initial.courier}
                    onChange={(v) => apply({ courier: v })}
                    placeholder="Courier"
                    options={[...ALL_COURIER_CODES]}
                />
                <FilterSelect
                    value={initial.fulfillmentMode}
                    onChange={(v) => apply({ fulfillmentMode: v })}
                    placeholder="Fulfillment"
                    options={[...ALL_FULFILLMENT_MODES]}
                />
                <FilterSelect
                    value={initial.trackingMode}
                    onChange={(v) => apply({ trackingMode: v })}
                    placeholder="Tracking"
                    options={[...ALL_TRACKING_MODES]}
                />
                <FilterSelect
                    value={initial.source}
                    onChange={(v) => apply({ source: v })}
                    placeholder="Source"
                    options={[...ALL_SHIPMENT_SOURCES]}
                />

                <FilterSelect
                    value={initial.labelStatus}
                    onChange={(v) => apply({ labelStatus: v })}
                    placeholder="Label"
                    options={['pending', 'available', 'failed', 'archived']}
                />

                <button
                    type="button"
                    onClick={() =>
                        apply({ awaiting: initial.awaiting === 'true' ? null : 'true' })
                    }
                    className={`h-8 rounded-md border px-2.5 text-xs transition-colors ${
                        initial.awaiting === 'true'
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                >
                    Awaiting reconciliation
                </button>

                {hasFilters && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-slate-500"
                        onClick={() => router.push('?')}
                        disabled={pending}
                    >
                        <X className="size-3.5" /> Clear
                    </Button>
                )}
            </div>
        </div>
    );
}

function FilterSelect({
    value,
    onChange,
    placeholder,
    options,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    options: readonly string[];
}) {
    return (
        <Select value={value || ALL} onValueChange={onChange}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{placeholder} (any)</SelectItem>
                {options.map((o) => (
                    <SelectItem key={o} value={o} className="text-xs">
                        {o.replace(/_/g, ' ')}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
