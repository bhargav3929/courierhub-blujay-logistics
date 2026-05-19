import type { PartnerId, ShipmentId } from './ids';

// ─── Label lifecycle ───────────────────────────────────────────────────
//
//   pending    — booking succeeded; label retrieval has not yet (some
//                carriers issue the label asynchronously)
//   available  — bytes uploaded to LabelStore; signed URL available
//   failed     — retrieval failed permanently; partner can re-request
//   archived   — retained for compliance, signed URL on demand only

export const ALL_LABEL_STATUSES = [
    'pending',
    'available',
    'failed',
    'archived',
] as const;
export type LabelStatus = typeof ALL_LABEL_STATUSES[number];

export type LabelFormat = 'pdf' | 'png' | 'zpl';

// Opaque reference stored on the shipment doc. The LabelStore knows how to
// turn this into a signed URL or fetch the underlying bytes.
export type LabelRef = string;

// What gets stored on the shipment doc at `artifacts.label`.
export interface LabelArtifact {
    readonly status: LabelStatus;
    readonly format: LabelFormat | null;
    readonly labelRef: LabelRef | null;
    readonly retrievedAt: Date | null;
    readonly lastError: string | null;
    readonly attempts: number;
}

// What LabelStore.put() returns. `signedUrl` is the immediately-usable URL
// (typically 24h TTL). For a fresh URL later, call LabelStore.sign().
export interface LabelPutResult {
    readonly labelRef: LabelRef;
    readonly signedUrl: string;
    readonly expiresAt: Date;
}

// Input to LabelStore.put(). The store decides the storage path based on
// partnerId + shipmentId + format. Two puts for the same triple overwrite.
export interface LabelPutInput {
    readonly partnerId: PartnerId;
    readonly shipmentId: ShipmentId;
    readonly bytes: Uint8Array;
    readonly format: LabelFormat;
    readonly contentType?: string;          // defaults from format
}
