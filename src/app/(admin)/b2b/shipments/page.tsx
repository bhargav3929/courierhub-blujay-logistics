/**
 * Admin → B2B → Shipments dashboard.
 *
 * Server Component. Reads filters from `searchParams`, queries Firestore
 * via the admin SDK, renders the table. URL is the source of truth for
 * filter + cursor state; navigating produces a fresh server render.
 *
 * The (admin) route group's layout handles auth — this page assumes the
 * caller is an authenticated admin user.
 */
import { Suspense } from 'react';
import {
    listAdminShipments,
} from '@/services/server/b2bShipmentAdminService';
import type {
    AdminShipmentFilters,
    AdminShipmentPage,
} from '@/types/b2b/admin';
import {
    isCourierCode,
    isFulfillmentMode,
    isShipmentStatus,
    isTrackingMode,
    ALL_SHIPMENT_SOURCES,
    type ShipmentSource,
} from '@/types/b2b/shipment';
import { ShipmentFilters } from '@/components/admin/b2b/ShipmentFilters';
import { ShipmentTable } from '@/components/admin/b2b/ShipmentTable';
import { PaginationBar } from '@/components/admin/b2b/PaginationBar';
import { ALL_LABEL_STATUSES, type LabelStatus } from '@/types/b2b/label';

export const dynamic = 'force-dynamic';   // Firestore reads — never cache

const PAGE_SIZE = 50;

interface SearchParams {
    cursor?: string;
    partnerId?: string;
    clientId?: string;
    status?: string;
    courier?: string;
    fulfillmentMode?: string;
    trackingMode?: string;
    source?: string;
    labelStatus?: string;
    awaiting?: string;
    awb?: string;
    externalRef?: string;
}

export default async function B2BShipmentsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const params = await searchParams;
    const filters = parseFilters(params);
    const cursor = params.cursor ?? null;

    let page: AdminShipmentPage;
    let queryError: string | null = null;
    try {
        page = await listAdminShipments({
            filters,
            limit: PAGE_SIZE,
            cursor,
        });
    } catch (e) {
        queryError = e instanceof Error ? e.message : String(e);
        page = { rows: [], nextCursor: null, prevCursor: null, totalEstimate: null };
    }

    return (
        <div className="flex h-full flex-col">
            <header className="border-b bg-white px-4 py-3">
                <h1 className="text-lg font-semibold text-slate-900">
                    B2B Shipments
                </h1>
                <p className="text-xs text-slate-500">
                    Operations view of all partner shipments. Click any row for details.
                </p>
            </header>

            <Suspense>
                <ShipmentFilters
                    initial={{
                        partnerId: params.partnerId ?? '',
                        status: filters.status ?? '',
                        courier: filters.courier ?? '',
                        fulfillmentMode: filters.fulfillmentMode ?? '',
                        trackingMode: filters.trackingMode ?? '',
                        source: filters.source ?? '',
                        labelStatus: filters.labelStatus ?? '',
                        awaiting: filters.awaitingReconciliation === true ? 'true' : '',
                        awb: filters.awb ?? '',
                        externalRef: filters.externalRef ?? '',
                    }}
                />
            </Suspense>

            <main className="flex-1 overflow-auto">
                {queryError ? (
                    <div className="border-b bg-red-50 px-4 py-3 text-sm text-red-800">
                        Query failed: {queryError}
                    </div>
                ) : (
                    <ShipmentTable rows={page.rows} />
                )}
            </main>

            <PaginationBar
                nextPageUrl={page.nextCursor ? buildUrl(params, page.nextCursor) : null}
                rowCount={page.rows.length}
            />
        </div>
    );
}

function parseFilters(p: SearchParams): AdminShipmentFilters {
    return {
        partnerId: p.partnerId || undefined,
        clientId: p.clientId || undefined,
        status: p.status && isShipmentStatus(p.status) ? p.status : undefined,
        courier: p.courier && isCourierCode(p.courier) ? p.courier : undefined,
        fulfillmentMode:
            p.fulfillmentMode && isFulfillmentMode(p.fulfillmentMode)
                ? p.fulfillmentMode : undefined,
        trackingMode:
            p.trackingMode && isTrackingMode(p.trackingMode)
                ? p.trackingMode : undefined,
        source: (p.source && (ALL_SHIPMENT_SOURCES as readonly string[]).includes(p.source))
            ? (p.source as ShipmentSource) : undefined,
        labelStatus: (p.labelStatus && (ALL_LABEL_STATUSES as readonly string[]).includes(p.labelStatus))
            ? (p.labelStatus as LabelStatus) : undefined,
        awaitingReconciliation: p.awaiting === 'true' ? true : undefined,
        awb: p.awb || undefined,
        externalRef: p.externalRef || undefined,
    };
}

function buildUrl(params: SearchParams, cursor: string | null): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (k === 'cursor' || !v) continue;
        qs.set(k, v);
    }
    if (cursor) qs.set('cursor', cursor);
    const s = qs.toString();
    return s ? `?${s}` : '?';
}
