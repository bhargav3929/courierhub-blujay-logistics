/**
 * Admin → B2B → Shipment details.
 *
 * One server-side fetch returns everything: shipment, events, saga,
 * idempotency record, signed label URL. All sub-sections render from that
 * single payload. Per Phase 4 Step 4.2 design: dense, operator-focused.
 */
import { notFound } from 'next/navigation';
import { fetchShipmentDetail } from '@/services/server/b2bShipmentDetailService';
import { StickyHeader } from '@/components/admin/b2b/details/StickyHeader';
import { SummaryCard } from '@/components/admin/b2b/details/SummaryCard';
import { OperationalStatusPanel } from '@/components/admin/b2b/details/OperationalStatusPanel';
import { EventTimeline } from '@/components/admin/b2b/details/EventTimeline';
import { RawEvents } from '@/components/admin/b2b/details/RawEvents';
import { SagaDiagnostics } from '@/components/admin/b2b/details/SagaDiagnostics';
import { LabelSection } from '@/components/admin/b2b/details/LabelSection';
import { ActionsPanel } from '@/components/admin/b2b/details/ActionsPanel';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ eventLimit?: string }>;
}

export default async function ShipmentDetailPage(props: PageProps) {
    const { id } = await props.params;
    const sp = await props.searchParams;
    const eventLimit = sp.eventLimit ? parseInt(sp.eventLimit, 10) : undefined;

    const detail = await fetchShipmentDetail({ shipmentId: id, eventLimit });
    if (!detail) notFound();

    const loadMoreHref = detail.hasMoreEvents
        ? `?eventLimit=${Math.min((eventLimit ?? 100) + 100, 500)}`
        : null;

    return (
        <div className="flex h-full flex-col">
            <StickyHeader shipment={detail.shipment} />

            <main className="flex-1 space-y-4 overflow-auto p-4">
                {/* Summary + Operational status — two columns on desktop */}
                <div className="grid gap-4 md:grid-cols-2">
                    <SummaryCard shipment={detail.shipment} />
                    <OperationalStatusPanel detail={detail} />
                </div>

                {/* Full-width sections */}
                <EventTimeline
                    events={detail.events}
                    hasMore={detail.hasMoreEvents}
                    loadMoreHref={loadMoreHref}
                />
                <RawEvents events={detail.events} />
                <SagaDiagnostics saga={detail.saga} />
                <LabelSection
                    shipment={detail.shipment}
                    initialUrl={detail.initialLabelUrl}
                    initialError={detail.initialLabelUrlError}
                />
                <ActionsPanel shipment={detail.shipment} />
            </main>
        </div>
    );
}
