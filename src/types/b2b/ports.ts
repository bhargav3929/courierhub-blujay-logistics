import type { HybridConfig } from './hybrid';
import type { EventId, PartnerId, ShipmentId } from './ids';
import type { CourierCode, ShipmentStatus } from './shipment';
import type { ShipmentSnapshot, TransitionEffect } from './state-machine';
import type { NormalizedEvent } from './tracking';

// Port interfaces — implemented by the repository layer (Phase 2 step 3).
// The ingestor depends only on these; it never imports Firestore.

// ─── Clock ───────────────────────────────────────────────────────────────

export interface Clock {
    now(): Date;
}

// ─── ShipmentReader ──────────────────────────────────────────────────────

// Loads exactly what the ingestor needs to make a decision. The repository
// will project a full Shipment document down to this shape so the ingestor
// stays small and the persistence layer can evolve independently.
export interface ShipmentContext {
    readonly snapshot: ShipmentSnapshot;
    readonly hybridConfig: HybridConfig | null;
    readonly lastEventAt: Date | null;
    readonly stateVersion: number;
}

export interface ShipmentReader {
    load(partnerId: PartnerId, shipmentId: ShipmentId): Promise<ShipmentContext | null>;
}

// ─── ShipmentLookup ──────────────────────────────────────────────────────

// Separate port from ShipmentReader because the AWB-based lookup is NOT
// tenant-scoped on input — carriers don't know our partnerIds. The lookup
// discovers `partnerId` from the matched document. Whoever owns the AWB
// owns the shipment; the unique index `(courier.code, courier.awb)`
// enforces single-owner.

export interface ShipmentLookup {
    findByAwb(
        courier: CourierCode,
        awb: string,
    ): Promise<{ shipmentId: ShipmentId; partnerId: PartnerId } | null>;
}

// ─── ShipmentWriter ──────────────────────────────────────────────────────

// Non-event field writes. Status changes go through EventIngestor /
// ProjectionWriter; this port owns everything else (courier binding,
// pricing snapshot attachment, label attachment).

import type { AddressInput, ParcelInput } from './address';
import type { LabelArtifact } from './label';
import type { PricingSnapshot } from './pricing';
import type { ClientId, ApiKeyId } from './ids';
import type { FulfillmentMode, TrackingMode } from './shipment';

export interface CreateDraftInput {
    readonly partnerId: PartnerId;
    readonly idempotencyKey: string;
    readonly apiKeyId: ApiKeyId;
    readonly clientId?: ClientId;
    readonly externalRef?: string;
    readonly fulfillmentMode: FulfillmentMode;
    readonly trackingMode: TrackingMode;
    readonly origin: AddressInput;
    readonly destination: AddressInput;
    readonly parcel: ParcelInput;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export type CreateDraftResult =
    | { created: true; shipmentId: ShipmentId }
    | { created: false; existingShipmentId: ShipmentId };

export interface AttachCarrierInput {
    readonly partnerId: PartnerId;
    readonly shipmentId: ShipmentId;
    readonly courier: CourierCode;
    readonly awb: string;
    readonly serviceCode: string;
    readonly bookedAt: Date;
}

export interface AttachPricingInput {
    readonly partnerId: PartnerId;
    readonly shipmentId: ShipmentId;
    readonly pricing: PricingSnapshot;
}

export interface AttachLabelInput {
    readonly partnerId: PartnerId;
    readonly shipmentId: ShipmentId;
    readonly artifact: LabelArtifact;
}

export interface MarkAwaitingReconciliationInput {
    readonly partnerId: PartnerId;
    readonly shipmentId: ShipmentId;
    readonly courier: CourierCode;
    readonly referenceNumber: string;
    readonly attempts: number;                  // current attempt count after the failure that triggered this
    readonly nextAttemptAt: Date;
    readonly lastError: string | null;
}

export interface ClearReconciliationInput {
    readonly partnerId: PartnerId;
    readonly shipmentId: ShipmentId;
    readonly resolvedWithAwb: string | null;    // null = gave up after max attempts
}

export interface ShipmentWriter {
    // Atomic: looks up by (partnerId, idempotencyKey). Returns existing on
    // hit; creates a new doc with status='draft', stateVersion=0 on miss.
    createDraft(input: CreateDraftInput): Promise<CreateDraftResult>;
    attachCarrier(input: AttachCarrierInput): Promise<void>;
    attachPricing(input: AttachPricingInput): Promise<void>;
    attachLabel(input: AttachLabelInput): Promise<void>;

    // Reconciliation meta-fields. Set when book_courier returns indeterminate;
    // cleared when the reconciler either resolves or gives up. The
    // BookingReconciler queries shipments by these fields.
    markAwaitingReconciliation(input: MarkAwaitingReconciliationInput): Promise<void>;
    clearReconciliation(input: ClearReconciliationInput): Promise<void>;
}

// ─── ReconciliationDueQuery ──────────────────────────────────────────────

// Read-side query for the BookingReconciler. Yields shipments whose
// awaitingCarrierReconciliation flag is set and whose nextAttemptAt has
// passed. Separate port from ShipmentReader because it's not tenant-
// scoped (the reconciler operates across all partners).

export interface DueReconciliation {
    readonly shipmentId: ShipmentId;
    readonly partnerId: PartnerId;
    readonly courier: CourierCode;
    readonly referenceNumber: string;
    readonly attempts: number;
}

export interface ReconciliationDueQuery {
    findDue(input: { limit: number; now: Date }): Promise<readonly DueReconciliation[]>;
}

// ─── LabelRetrievalDueQuery ──────────────────────────────────────────────

export interface DueLabelRetrieval {
    readonly shipmentId: ShipmentId;
    readonly partnerId: PartnerId;
    readonly courier: CourierCode;
    readonly awb: string;
    readonly attempts: number;
    readonly lastError: string | null;
}

export interface LabelRetrievalDueQuery {
    findDue(input: { limit: number; maxAttempts: number }): Promise<readonly DueLabelRetrieval[]>;
}

// ─── LabelStore ──────────────────────────────────────────────────────────

import type { LabelPutInput, LabelPutResult, LabelRef } from './label';

export interface LabelStore {
    put(input: LabelPutInput): Promise<LabelPutResult>;
    sign(labelRef: LabelRef, ttlSeconds: number): Promise<{ signedUrl: string; expiresAt: Date }>;
    delete(labelRef: LabelRef): Promise<void>;
}

// ─── RateCardStore ───────────────────────────────────────────────────────

import type { RateCard } from './pricing';

export interface RateCardStore {
    // Returns the currently-active card for this partner (and optional
    // sub-client). Resolution order: client-specific → partner-default → null.
    findActive(
        partnerId: PartnerId,
        clientId: ClientId | null,
        at: Date,
    ): Promise<RateCard | null>;
}

// ─── ServiceabilityChecker ───────────────────────────────────────────────

import type { ServiceabilityResult } from './quote';

export interface ServiceabilityChecker {
    check(
        courier: CourierCode,
        originPincode: string,
        destinationPincode: string,
    ): Promise<ServiceabilityResult>;
}

// ─── EventStore ──────────────────────────────────────────────────────────

// Why one method instead of separate insert/check: dedup is a write-time
// invariant. A two-call (check-then-insert) pattern is racy. The repository
// implementation will use Firestore's set-with-precondition-not-exists so
// the operation is atomic.

export const ALL_APPLIED_REASONS = [
    'applied',
    'same_status',
    'stale_by_rank',
    'no_status_implied',
    'authority_blocked_courier',
    'authority_blocked_partner',
    'authority_blocked_wrong_source',
    'transition_forbidden',
] as const;
export type AppliedReason = typeof ALL_APPLIED_REASONS[number];

export interface AppendEventInput {
    readonly shipmentId: ShipmentId;
    readonly partnerId: PartnerId;
    readonly event: NormalizedEvent;
    readonly applied: boolean;
    readonly appliedReason: AppliedReason;
    readonly statusTransition: { from: ShipmentStatus; to: ShipmentStatus } | null;
}

export type AppendEventResult =
    | { stored: true; eventId: EventId }
    | { stored: false; existingEventId: EventId };

export interface EventStore {
    appendOrFindDuplicate(input: AppendEventInput): Promise<AppendEventResult>;
}

// ─── ProjectionWriter ────────────────────────────────────────────────────

// Optimistic concurrency: caller supplies the version it read. The
// implementation must:
//   1. Re-read the shipment in a transaction
//   2. Verify currentVersion === expectedVersion
//   3. Apply the update with version = expectedVersion + 1
//   4. Throw StaleVersionError otherwise

export interface ProjectionUpdate {
    readonly shipmentId: ShipmentId;
    readonly partnerId: PartnerId;
    readonly expectedVersion: number;
    readonly nextStatus: ShipmentStatus;
    readonly previousStatus: ShipmentStatus;
    readonly statusReason: string | null;
    readonly lastEventAt: Date;
}

export interface ProjectionWriter {
    update(input: ProjectionUpdate): Promise<void>;
}

export class StaleVersionError extends Error {
    constructor(
        public readonly currentVersion: number,
        public readonly expectedVersion: number,
    ) {
        super(`stale_version: expected=${expectedVersion} current=${currentVersion}`);
        this.name = 'StaleVersionError';
    }
}

// ─── EffectDispatcher ────────────────────────────────────────────────────

// Side effects (partner webhook emit, billing settle, etc.) are described
// declaratively by the transition table. The dispatcher's job is to
// schedule them — typically by enqueuing one job per effect onto a queue.
// In step 2 it's a no-op fake; in step 4+ it's backed by a real queue.

export interface EffectDispatchInput {
    readonly shipmentId: ShipmentId;
    readonly partnerId: PartnerId;
    readonly eventId: EventId;
    readonly effects: readonly TransitionEffect[];
    readonly from: ShipmentStatus;
    readonly to: ShipmentStatus;
}

export interface EffectDispatcher {
    dispatch(input: EffectDispatchInput): Promise<void>;
}

// ─── EventReader ─────────────────────────────────────────────────────────

// Read-side query of the event subcollection. Pagination via opaque cursor
// (caller passes back what `nextCursor` returned).

export interface ListEventsInput {
    readonly partnerId: PartnerId;
    readonly shipmentId: ShipmentId;
    readonly limit: number;             // capped by implementation
    readonly cursor?: string;
    readonly direction?: 'asc' | 'desc';
}

export interface StoredEventView {
    readonly eventId: EventId;
    readonly event: NormalizedEvent;
    readonly applied: boolean;
    readonly appliedReason: AppliedReason;
    readonly statusTransition: { from: ShipmentStatus; to: ShipmentStatus } | null;
    readonly recordedAt: Date;
}

export interface ListEventsResult {
    readonly events: readonly StoredEventView[];
    readonly nextCursor: string | null;
}

export interface EventReader {
    listEvents(input: ListEventsInput): Promise<ListEventsResult>;
}

// ─── IdempotencyStore ────────────────────────────────────────────────────

// Stripe-style request idempotency. `reserve()` is atomic; the impl uses
// `create()` semantics so racing requests with the same key cannot both
// land in 'reserved'.

export interface CachedResponse {
    readonly httpStatus: number;
    readonly body: unknown;
}

export interface IdempotencyReserveInput {
    readonly partnerId: PartnerId;
    readonly key: string;
    readonly requestHash: string;
    readonly ttlSeconds: number;
}

export type IdempotencyReserveResult =
    | { state: 'reserved' }
    | { state: 'in_progress' }
    | { state: 'committed'; response: CachedResponse }
    | { state: 'mismatch' };

export interface IdempotencyCommitInput {
    readonly partnerId: PartnerId;
    readonly key: string;
    readonly response: CachedResponse;
}

export interface IdempotencyStore {
    reserve(input: IdempotencyReserveInput): Promise<IdempotencyReserveResult>;
    commit(input: IdempotencyCommitInput): Promise<void>;
}
