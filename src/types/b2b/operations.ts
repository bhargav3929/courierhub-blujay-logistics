import type { CourierCode } from './shipment';

// Operational queue item shapes. Each maps directly to a row in one of
// the five monitoring dashboards. Projected from Firestore docs by the
// b2bOperationsService — UI components never read raw docs.

export type Severity = 'critical' | 'severe' | 'warning' | 'degraded' | 'nominal';

export interface ReconciliationQueueItem {
    readonly shipmentId: string;
    readonly partnerId: string;
    readonly courier: CourierCode;
    readonly attempts: number;
    readonly nextAttemptAt: Date | null;
    readonly markedAt: Date | null;
    readonly lastError: string | null;
}

export interface LabelFailureQueueItem {
    readonly shipmentId: string;
    readonly partnerId: string;
    readonly courier: CourierCode | null;
    readonly awb: string | null;
    readonly labelStatus: 'pending' | 'failed';
    readonly attempts: number;
    readonly lastError: string | null;
    readonly createdAt: Date;
}

export interface DeadLetterJobItem {
    readonly jobId: string;
    readonly topic: string;
    readonly status: string;
    readonly attempts: number;
    readonly enqueuedAt: Date | null;
    readonly lastError: string | null;
    // Operationally-useful payload preview. Full payload available in the
    // jobs collection if ops needs to dig deeper.
    readonly payloadPreview: Readonly<Record<string, unknown>>;
    readonly shipmentId: string | null;          // extracted if present in payload
    readonly partnerId: string | null;
}

export interface CompensationFailedSagaItem {
    readonly sagaId: string;
    readonly status: string;                      // typically 'compensation_failed'
    readonly error: string | null;
    readonly stepIndex: number;
    readonly compensatedSteps: readonly string[];
    readonly updatedAt: Date;
    // Derived from the sagaId pattern `book::{partnerId}::{idempotencyKey}`.
    readonly shipmentId: string | null;           // null if not derivable
    readonly partnerId: string | null;
    readonly acknowledged: boolean;
    readonly acknowledgedNote: string | null;
    readonly acknowledgedAt: Date | null;
}

export interface CarrierHealthRow {
    readonly courier: CourierCode;
    readonly stuckInTransitCount: number;        // in_transit with no events ≥3 days
    readonly awaitingReconciliationCount: number;
    readonly pendingLabelsCount: number;
    readonly failedLabelsCount: number;
    readonly severity: Severity;
}

export interface OperationsSnapshot {
    readonly compensationFailed: readonly CompensationFailedSagaItem[];
    readonly deadLetter: readonly DeadLetterJobItem[];
    readonly reconciliation: readonly ReconciliationQueueItem[];
    readonly labelFailures: readonly LabelFailureQueueItem[];
    readonly carrierHealth: readonly CarrierHealthRow[];
    readonly fetchedAt: Date;
    readonly errors: Readonly<Record<string, string>>;     // per-section errors (queries that failed)
}
