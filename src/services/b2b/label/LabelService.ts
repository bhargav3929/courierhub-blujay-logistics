import type { CourierAdapter } from '@/types/b2b/courier-adapter';
import type { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type { LabelArtifact, LabelFormat } from '@/types/b2b/label';
import type {
    LabelStore,
    ShipmentReader,
    ShipmentWriter,
} from '@/types/b2b/ports';
import type { CourierCode } from '@/types/b2b/shipment';
import { getLogger } from '@/services/b2b/http/logger';

// Public-facing label operations. The booking saga handles the happy-path
// label upload synchronously; this service supports the async paths:
//
//   - GET /shipments/:id/label → returns a fresh signed URL
//   - retry pending labels (called by LabelRetrievalJob — Phase 3 Step 2+)
//   - re-fetch a label after carrier replaces it
//
// Cross-tenant guard: every operation requires partnerId. The
// ShipmentReader does the actual ownership check.

const log = getLogger('b2b.label.service');
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;   // 24h

export interface LabelServiceDeps {
    readonly shipmentReader: ShipmentReader;
    readonly shipmentWriter: ShipmentWriter;
    readonly labelStore: LabelStore;
    readonly getAdapter: (courier: CourierCode) => CourierAdapter | null;
}

export type GetLabelResult =
    | { kind: 'available'; signedUrl: string; format: LabelFormat; expiresAt: Date }
    | { kind: 'pending'; attempts: number; lastError: string | null }
    | { kind: 'failed'; lastError: string | null; attempts: number }
    | { kind: 'not_found' };

export class LabelService {
    constructor(private readonly deps: LabelServiceDeps) {}

    async getLabel(
        partnerId: PartnerId,
        shipmentId: ShipmentId,
        artifact: LabelArtifact | null,
    ): Promise<GetLabelResult> {
        // Caller should pre-resolve the artifact from the shipment doc.
        // (Avoids a second Firestore read here.) If null, treat as missing.
        if (!artifact) return { kind: 'not_found' };

        if (artifact.status === 'available' && artifact.labelRef && artifact.format) {
            const { signedUrl, expiresAt } = await this.deps.labelStore.sign(
                artifact.labelRef,
                SIGNED_URL_TTL_SECONDS,
            );
            return {
                kind: 'available',
                signedUrl,
                format: artifact.format,
                expiresAt,
            };
        }
        if (artifact.status === 'pending') {
            return { kind: 'pending', attempts: artifact.attempts, lastError: artifact.lastError };
        }
        if (artifact.status === 'failed') {
            return { kind: 'failed', attempts: artifact.attempts, lastError: artifact.lastError };
        }
        return { kind: 'not_found' };
    }

    // Retries a pending label retrieval. Idempotent: calls can repeat
    // safely. Called by the LabelRetrievalJob cron worker.
    async retryPending(
        partnerId: PartnerId,
        shipmentId: ShipmentId,
        courier: CourierCode,
        awb: string,
        currentArtifact: LabelArtifact,
    ): Promise<LabelArtifact> {
        const adapter = this.deps.getAdapter(courier);
        if (!adapter) {
            return { ...currentArtifact, lastError: `no adapter for ${courier}` };
        }
        try {
            const carrierLabel = await adapter.generateLabel(awb, partnerId);
            const put = await this.deps.labelStore.put({
                partnerId,
                shipmentId,
                bytes: carrierLabel.bytes,
                format: carrierLabel.format,
            });
            const next: LabelArtifact = {
                status: 'available',
                format: carrierLabel.format,
                labelRef: put.labelRef,
                retrievedAt: new Date(),
                lastError: null,
                attempts: currentArtifact.attempts + 1,
            };
            await this.deps.shipmentWriter.attachLabel({
                partnerId,
                shipmentId,
                artifact: next,
            });
            return next;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const next: LabelArtifact = {
                ...currentArtifact,
                attempts: currentArtifact.attempts + 1,
                lastError: message,
                // After several failed attempts the job marks `failed` and
                // alerts ops. Threshold lives in the job, not here.
            };
            log.warn('label retry failed', { shipmentId, courier, awb, error: message });
            await this.deps.shipmentWriter.attachLabel({
                partnerId,
                shipmentId,
                artifact: next,
            });
            return next;
        }
    }
}
