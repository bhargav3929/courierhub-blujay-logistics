import { Timestamp } from 'firebase-admin/firestore';
import type { PartnerId } from '@/types/b2b/ids';
import type { AppliedReason } from '@/types/b2b/ports';
import type { ShipmentStatus } from '@/types/b2b/shipment';
import { isShipmentStatus } from '@/types/b2b/shipment';
import type { NormalizedEvent } from '@/types/b2b/tracking';
import { isTrackingEventType } from '@/types/b2b/tracking';

// The on-the-wire shape of `shipments/{id}/events/{dedupKey}`. Bumping
// `eventVersion` is the schema-migration signal — readers must tolerate
// any version <= currentSupported and reject above.

export const CURRENT_EVENT_VERSION = 1;

export interface StoredEventDoc {
    eventVersion: 1;
    type: string;
    rawCode: string;
    source: string;
    occurredAt: Timestamp;
    receivedAt: Timestamp;
    location: { city: string | null; pincode: string | null; raw: string | null };
    facility: string | null;
    description: string;
    impliedStatus: string | null;
    impliedReason: string | null;
    dedupKey: string;
    partnerId: PartnerId;
    applied: boolean;
    appliedReason: AppliedReason;
    statusTransition: { from: ShipmentStatus; to: ShipmentStatus } | null;
    recordedAt: Timestamp;
}

export interface SerializeOpts {
    partnerId: PartnerId;
    applied: boolean;
    appliedReason: AppliedReason;
    statusTransition: { from: ShipmentStatus; to: ShipmentStatus } | null;
    recordedAt: Date;
}

export function serializeEvent(event: NormalizedEvent, opts: SerializeOpts): StoredEventDoc {
    return {
        eventVersion: CURRENT_EVENT_VERSION,
        type: event.type,
        rawCode: event.rawCode,
        source: event.source,
        occurredAt: Timestamp.fromDate(event.occurredAt),
        receivedAt: Timestamp.fromDate(event.receivedAt),
        location: {
            city: event.location.city,
            pincode: event.location.pincode,
            raw: event.location.raw,
        },
        facility: event.facility,
        description: event.description,
        impliedStatus: event.impliedStatus,
        impliedReason: event.impliedReason,
        dedupKey: event.dedupKey,
        partnerId: opts.partnerId,
        applied: opts.applied,
        appliedReason: opts.appliedReason,
        statusTransition: opts.statusTransition,
        recordedAt: Timestamp.fromDate(opts.recordedAt),
    };
}

export function deserializeEvent(doc: StoredEventDoc): NormalizedEvent {
    if (!isTrackingEventType(doc.type)) {
        throw new Error(`deserializeEvent: unknown event type '${doc.type}' (dedupKey=${doc.dedupKey})`);
    }
    const impliedStatus = doc.impliedStatus;
    if (impliedStatus !== null && !isShipmentStatus(impliedStatus)) {
        throw new Error(`deserializeEvent: unknown impliedStatus '${impliedStatus}' (dedupKey=${doc.dedupKey})`);
    }
    return {
        type: doc.type,
        rawCode: doc.rawCode,
        source: doc.source as NormalizedEvent['source'],
        occurredAt: doc.occurredAt.toDate(),
        receivedAt: doc.receivedAt.toDate(),
        location: doc.location,
        facility: doc.facility,
        description: doc.description,
        impliedStatus: impliedStatus,
        impliedReason: doc.impliedReason,
        dedupKey: doc.dedupKey,
    };
}
