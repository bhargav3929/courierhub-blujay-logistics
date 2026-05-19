import type { ShipmentId } from '@/types/b2b/ids';
import { isShipmentStatus, type ShipmentStatus } from '@/types/b2b/shipment';
import type { LocationHint } from '@/types/b2b/state-machine';
import type { NormalizedEvent } from '@/types/b2b/tracking';
import { STATUS_TO_EVENT_TYPE } from '../shipment/eventMapper';
import { computeDedupKey } from './dedupKey';

// Builds NormalizedEvent from semantic inputs supplied by the partner API
// endpoint and admin UI. Courier-driven events take a different path:
// each CourierEventAdapter implements its own `normalize()` because the
// raw → normalized translation is carrier-specific.

// ─── partner API input ───────────────────────────────────────────────────

export interface ManualEventInput {
    readonly status: ShipmentStatus;
    readonly occurredAt: Date;
    readonly location?: LocationHint;
    readonly description?: string;
    readonly reasonCode?: string;
}

// ─── admin UI input ──────────────────────────────────────────────────────

export interface AdminEventInput {
    readonly status: ShipmentStatus;
    readonly occurredAt: Date;
    readonly note: string;
    readonly location?: LocationHint;
    readonly reasonCode?: string;
}

export const EventNormalizer = {
    fromManualEvent(
        input: ManualEventInput,
        shipmentId: ShipmentId,
        receivedAt: Date,
    ): NormalizedEvent {
        if (!isShipmentStatus(input.status)) {
            throw new Error(`EventNormalizer.fromManualEvent: unknown status '${input.status}'`);
        }
        const locationRaw = input.location?.raw ?? null;
        const rawCode = input.status.toUpperCase();
        return {
            type: STATUS_TO_EVENT_TYPE[input.status],
            rawCode,
            source: 'partner_api',
            occurredAt: input.occurredAt,
            receivedAt,
            location: {
                city: input.location?.city ?? null,
                pincode: input.location?.pincode ?? null,
                raw: locationRaw,
            },
            facility: null,
            description: input.description ?? `Partner status update: ${input.status}`,
            impliedStatus: input.status,
            impliedReason: input.reasonCode ?? null,
            dedupKey: computeDedupKey({
                source: 'partner_api',
                rawCode,
                occurredAt: input.occurredAt,
                locationRaw,
                shipmentId,
            }),
        };
    },

    fromAdminEvent(
        input: AdminEventInput,
        shipmentId: ShipmentId,
        receivedAt: Date,
    ): NormalizedEvent {
        if (!isShipmentStatus(input.status)) {
            throw new Error(`EventNormalizer.fromAdminEvent: unknown status '${input.status}'`);
        }
        const locationRaw = input.location?.raw ?? null;
        // Admin's free-text note participates in the rawCode so two admin
        // corrections with the same status but different notes are distinct
        // events (different dedupKey). Two admin corrections with the same
        // note at the same instant are intentionally deduped — that's the
        // accidental double-click case.
        const rawCode = `ADMIN:${input.note}`;
        return {
            type: STATUS_TO_EVENT_TYPE[input.status],
            rawCode,
            source: 'admin_ui',
            occurredAt: input.occurredAt,
            receivedAt,
            location: {
                city: input.location?.city ?? null,
                pincode: input.location?.pincode ?? null,
                raw: locationRaw,
            },
            facility: null,
            description: input.note,
            impliedStatus: input.status,
            impliedReason: input.reasonCode ?? null,
            dedupKey: computeDedupKey({
                source: 'admin_ui',
                rawCode,
                occurredAt: input.occurredAt,
                locationRaw,
                shipmentId,
            }),
        };
    },
};
