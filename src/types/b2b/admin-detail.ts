import type { AdminShipmentRow } from './admin';

// Detail page view shape — aggregated from multiple Firestore reads.
// Optional sub-sections may be null when their underlying doc is missing
// (saga predates Phase 3 / idempotency record TTL'd out / label not yet
// generated). The UI renders empty-states accordingly.

export interface ShipmentDetailView {
    readonly shipment: AdminShipmentRow;
    readonly rawShipmentDoc: Readonly<Record<string, unknown>>;
    readonly events: readonly StoredEventViewLite[];
    readonly hasMoreEvents: boolean;
    readonly saga: SagaSnapshot | null;
    readonly idempotency: IdempotencyRecordSnapshot | null;
    readonly initialLabelUrl: string | null;
    readonly initialLabelUrlError: string | null;
}

// Pared-down event projection for display. The full event doc lives at
// shipments/{id}/events/{dedupKey}; we project enough for the timeline +
// raw view. `payload` is the carrier's original — kept for the raw-events
// inspector.
export interface StoredEventViewLite {
    readonly eventId: string;
    readonly type: string;
    readonly source: string;
    readonly rawCode: string;
    readonly description: string;
    readonly occurredAt: Date;
    readonly receivedAt: Date;
    readonly recordedAt: Date | null;
    readonly location: {
        readonly city: string | null;
        readonly pincode: string | null;
        readonly raw: string | null;
    };
    readonly facility: string | null;
    readonly impliedStatus: string | null;
    readonly impliedReason: string | null;
    readonly dedupKey: string;
    readonly applied: boolean;
    readonly appliedReason: string;
    readonly statusTransition: { from: string; to: string } | null;
    readonly payload: Readonly<Record<string, unknown>> | null;
}

export interface SagaSnapshot {
    readonly sagaId: string;
    readonly status: string;                   // in_progress | completed | failed | compensated | compensation_failed
    readonly stepIndex: number;
    readonly error: string | null;
    readonly compensatedSteps: readonly string[];
    readonly updatedAt: Date;
    readonly createdAt: Date | null;
    readonly state: Readonly<Record<string, unknown>>;   // parsed from stateJson
}

export interface IdempotencyRecordSnapshot {
    readonly partnerId: string;
    readonly key: string;
    readonly status: string;
    readonly httpStatus: number | null;
    readonly createdAt: Date | null;
    readonly committedAt: Date | null;
    readonly expiresAt: Date | null;
}
