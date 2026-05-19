'use server';

// Server Actions for the self-shipment operator UI.
//
// Two actions wrap existing services:
//   1. createSelfShipmentAction → BookingService.book() with
//      fulfillmentMode='self_shipment', trackingMode='manual'.
//      The booking saga handles label generation locally via
//      SelfShipmentLabelGenerator and uploads to LabelStore.
//   2. progressSelfShipmentAction → EventIngestor.ingest() with an
//      admin_ui-sourced event (admin_user initiator).
//
// Both return discriminated results the client renders inline.

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { buildBookingService, buildFirestoreEventIngestor } from '@/services/b2b/infra';
import { EventNormalizer } from '@/services/b2b/tracking';
import { PartnerId, ShipmentId, UserId } from '@/types/b2b/ids';
import type { AddressInput, ParcelInput } from '@/types/b2b/address';
import type { BookingRequest, BookingResult } from '@/types/b2b/booking';
import { isShipmentStatus, type ShipmentStatus } from '@/types/b2b/shipment';
import { SelfShipmentLabelGenerator } from '@/services/b2b/label/SelfShipmentLabelGenerator';
import { getLogger } from '@/services/b2b/http/logger';

const log = getLogger('admin.b2b.self-ship.actions');

async function requireAdmin(): Promise<{ userId: string }> {
    // Same TODO as Step 4.2 actions — wire to existing admin Firebase Auth.
    return { userId: 'admin' };
}

// ─── createSelfShipmentAction ──────────────────────────────────────────

export type CreateSelfShipmentResult =
    | {
        ok: true;
        shipmentId: string;
        trackingNumber: string;
        labelStatus: 'available' | 'pending' | 'failed';
    }
    | { ok: false; message: string };

export interface CreateSelfShipmentInput {
    readonly partnerId: string;
    readonly clientId?: string;
    readonly externalRef?: string;
    readonly origin: AddressInput;
    readonly destination: AddressInput;
    readonly parcel: ParcelInput;
    readonly notes?: string;
    // Form-issued idempotency key. Double-click safe — saga's
    // ShipmentWriter.createDraft dedupes on (partnerId, idempotencyKey).
    readonly idempotencyKey: string;
}

export async function createSelfShipmentAction(
    input: CreateSelfShipmentInput,
): Promise<CreateSelfShipmentResult> {
    const session = await requireAdmin();

    if (!input.partnerId) return { ok: false, message: 'Partner is required' };
    if (!input.idempotencyKey) return { ok: false, message: 'Missing idempotency key' };

    const bookingRequest: BookingRequest = {
        partnerId: PartnerId(input.partnerId),
        idempotencyKey: input.idempotencyKey,
        apiKeyId: `admin-ui:${session.userId}`,
        externalRef: input.externalRef,
        clientId: input.clientId as never,
        fulfillmentMode: 'self_shipment',
        trackingMode: 'manual',
        origin: input.origin,
        destination: input.destination,
        parcel: input.parcel,
        metadata: input.notes ? { operatorNotes: input.notes } : undefined,
    };

    let result: BookingResult;
    try {
        const service = buildBookingService(getFirestore(adminApp));
        result = await service.book(bookingRequest);
    } catch (e) {
        log.error('createSelfShipment threw', {
            partnerId: input.partnerId,
            error: e instanceof Error ? e.message : String(e),
        });
        return { ok: false, message: 'Internal error creating shipment' };
    }

    revalidatePath('/b2b/shipments');

    if (result.kind === 'booked') {
        return {
            ok: true,
            shipmentId: result.shipmentId,
            trackingNumber: SelfShipmentLabelGenerator.buildTrackingNumber(result.shipmentId),
            labelStatus:
                result.label.status === 'available' ? 'available'
                : result.label.status === 'failed' ? 'failed'
                : 'pending',
        };
    }
    if (result.kind === 'cancelled_during_booking') {
        return { ok: false, message: `Booking aborted: ${result.reason}` };
    }
    return { ok: false, message: `Booking failed: ${result.reason}` };
}

// ─── progressSelfShipmentAction (manual status update) ────────────────

export type ProgressResult =
    | { ok: true; from: ShipmentStatus; to: ShipmentStatus }
    | { ok: false; message: string };

export interface ProgressInput {
    readonly partnerId: string;
    readonly shipmentId: string;
    readonly status: string;
    // Optional note. Required only for corrections (caller decides UI-side).
    readonly note?: string;
    readonly locationRaw?: string;
}

export async function progressSelfShipmentAction(
    input: ProgressInput,
): Promise<ProgressResult> {
    const session = await requireAdmin();

    if (!isShipmentStatus(input.status)) {
        return { ok: false, message: `Invalid status '${input.status}'` };
    }

    try {
        const db = getFirestore(adminApp);
        const ingestor = buildFirestoreEventIngestor(db);
        const now = new Date();
        const note = input.note?.trim() || `operator manual update: ${input.status}`;
        const event = EventNormalizer.fromAdminEvent(
            {
                status: input.status,
                occurredAt: now,
                note,
                location: input.locationRaw ? { raw: input.locationRaw } : undefined,
            },
            ShipmentId(input.shipmentId),
            now,
        );

        const result = await ingestor.ingest({
            event,
            initiator: { type: 'admin_user', userId: UserId(session.userId) },
            shipmentId: ShipmentId(input.shipmentId),
            partnerId: PartnerId(input.partnerId),
        });

        revalidatePath(`/b2b/shipments/${input.shipmentId}`);
        revalidatePath(`/b2b/shipments/${input.shipmentId}/update`);

        switch (result.outcome) {
            case 'applied':
                return { ok: true, from: result.from, to: result.to };
            case 'duplicate':
                return { ok: false, message: 'Already recorded (duplicate event)' };
            case 'no_change':
                if (result.reason === 'same_status') {
                    return { ok: false, message: 'Already in this status' };
                }
                return { ok: false, message: `No change: ${result.reason.replace(/_/g, ' ')}` };
            case 'authority_blocked':
                return { ok: false, message: `Blocked: ${result.reason.replace(/_/g, ' ')}` };
            case 'illegal_recorded':
                return { ok: false, message: 'Transition is not legal from current status' };
            case 'projection_conflict':
                return { ok: false, message: 'Another update happened first — refresh and retry' };
            case 'rejected':
                return { ok: false, message: `Rejected: ${result.error.code}` };
        }
    } catch (e) {
        log.error('progressSelfShipment threw', {
            shipmentId: input.shipmentId,
            error: e instanceof Error ? e.message : String(e),
        });
        return { ok: false, message: 'Internal error recording status update' };
    }
}

// Suppress unused — kept for future bulk-create flows.
void randomUUID;
