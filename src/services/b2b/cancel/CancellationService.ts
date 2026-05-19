import type { CourierAdapter } from '@/types/b2b/courier-adapter';
import type { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type { ShipmentReader } from '@/types/b2b/ports';
import type { CancellationReason } from '@/types/b2b/reasons';
import type { CourierCode } from '@/types/b2b/shipment';
import { CarrierError } from '@/services/b2b/couriers/shared/carrierErrors';
import { getLogger } from '@/services/b2b/http/logger';
import type { EventIngestor } from '@/services/b2b/tracking/EventIngestor';
import { EventNormalizer } from '@/services/b2b/tracking';

// Cancellation orchestration.
//
// Rules (per Phase 3 design):
//   draft           → immediate transition; no carrier call
//   booked/RFP      → call adapter.cancel(awb); then transition
//   picked_up+      → reject with not_cancellable_post_pickup (caller should
//                     initiate RTO instead)
//   self_shipment   → immediate transition; no carrier call
//
// Carrier cancel retry is built into carrierRequest() at the adapter
// layer. If retries are exhausted and the call still fails transiently,
// we surface `transient_carrier_failure` — the partner can retry the
// cancel later, or ops can intervene with correct_status.

const log = getLogger('b2b.cancel.service');

export interface CancellationServiceDeps {
    readonly shipmentReader: ShipmentReader;
    readonly eventIngestor: EventIngestor;
    readonly getAdapter: (courier: CourierCode) => CourierAdapter | null;
}

export type CancellationResult =
    | { kind: 'cancelled'; shipmentId: ShipmentId }
    | { kind: 'not_found' }
    | { kind: 'not_cancellable'; currentStatus: string; reason: 'post_pickup' | 'terminal' }
    | { kind: 'carrier_rejected'; detail: string }
    | { kind: 'transient_failure'; detail: string }
    | { kind: 'projection_failed'; detail: string };

export interface CancellationInput {
    readonly partnerId: PartnerId;
    readonly shipmentId: ShipmentId;
    readonly reason: CancellationReason;
}

export class CancellationService {
    constructor(private readonly deps: CancellationServiceDeps) {}

    async cancel(input: CancellationInput): Promise<CancellationResult> {
        const ctx = await this.deps.shipmentReader.load(input.partnerId, input.shipmentId);
        if (!ctx) return { kind: 'not_found' };

        const status = ctx.snapshot.status;

        // Terminal — already done (cancelled, delivered, etc.). Treat
        // already-cancelled as success.
        if (status === 'cancelled') {
            return { kind: 'cancelled', shipmentId: input.shipmentId };
        }
        if (['delivered', 'rto_delivered', 'lost', 'damaged'].includes(status)) {
            return { kind: 'not_cancellable', currentStatus: status, reason: 'terminal' };
        }
        if (['picked_up', 'in_transit', 'out_for_delivery', 'undelivered',
             'rto_initiated', 'rto_in_transit'].includes(status)) {
            return { kind: 'not_cancellable', currentStatus: status, reason: 'post_pickup' };
        }

        // Carrier cancel path: booked / ready_for_pickup with a real AWB.
        // Self-shipment skips the carrier call.
        const needsCarrierCall =
            ctx.snapshot.fulfillmentMode !== 'self_shipment' &&
            (status === 'booked' || status === 'ready_for_pickup');

        if (needsCarrierCall) {
            // Load AWB + courier from the shipment doc. The reader's
            // ShipmentContext doesn't include them today; expand it here OR
            // accept that this service makes a second read. For now we
            // accept the second read via the full doc — a real impl in
            // Phase 3 Step 2 will widen ShipmentContext.
            // (Architecture stub — actual carrier/awb resolution path will
            // be wired when ShipmentReader is widened.)
            const carrier = await this.resolveCarrier(input.partnerId, input.shipmentId);
            const awb = await this.resolveAwb(input.partnerId, input.shipmentId);
            if (carrier && awb) {
                const adapter = this.deps.getAdapter(carrier);
                if (!adapter) {
                    return { kind: 'projection_failed', detail: `no adapter for ${carrier}` };
                }
                try {
                    await adapter.cancel(awb, input.partnerId);
                } catch (err) {
                    if (err instanceof CarrierError) {
                        if (err.category === 'permanent') {
                            return { kind: 'carrier_rejected', detail: err.rawMessage ?? '' };
                        }
                        return { kind: 'transient_failure', detail: err.rawMessage ?? '' };
                    }
                    log.error('cancel threw unexpected error', {
                        partnerId: input.partnerId,
                        shipmentId: input.shipmentId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                    return { kind: 'transient_failure', detail: 'unexpected_error' };
                }
            }
        }

        // Apply the cancel transition via the same funnel as everything else.
        const event = EventNormalizer.fromAdminEvent(
            {
                status: 'cancelled',
                occurredAt: new Date(),
                note: `system:cancellation:${input.reason}`,
                reasonCode: input.reason,
            },
            input.shipmentId,
            new Date(),
        );
        const systemEvent = { ...event, source: 'system' as const };
        const result = await this.deps.eventIngestor.ingest({
            event: systemEvent,
            initiator: { type: 'system', job: 'reconcile' },
            shipmentId: input.shipmentId,
            partnerId: input.partnerId,
        });
        if (result.outcome === 'rejected') {
            return { kind: 'projection_failed', detail: JSON.stringify(result.error) };
        }
        return { kind: 'cancelled', shipmentId: input.shipmentId };
    }

    // Stubs — wired to the widened ShipmentReader in Phase 3 Step 2.
    // The current Phase 2 Step 3 ShipmentReader does not surface carrier/awb.
    private async resolveCarrier(_p: PartnerId, _s: ShipmentId): Promise<CourierCode | null> {
        return null;
    }
    private async resolveAwb(_p: PartnerId, _s: ShipmentId): Promise<string | null> {
        return null;
    }
}
