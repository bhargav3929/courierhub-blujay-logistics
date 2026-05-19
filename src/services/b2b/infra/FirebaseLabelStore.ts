import { getStorage, type Storage } from 'firebase-admin/storage';
import type {
    LabelFormat,
    LabelPutInput,
    LabelPutResult,
    LabelRef,
} from '@/types/b2b/label';
import type { LabelStore } from '@/types/b2b/ports';
import { getLogger } from '@/services/b2b/http/logger';

// Object-storage abstraction backed by Firebase Storage.
//
// Path convention:
//   b2b-labels/{partnerId}/{shipmentId}/{shipmentId}.{format}
//
// - partner-namespaced for security rule enforcement
// - shipment-namespaced for collision avoidance
// - format suffix because some carriers can supply both PDF and ZPL
//
// Two uploads for the same triple overwrite — intentional; that's how
// LabelRetrievalJob replaces a stale or partial label.

const DEFAULT_SIGN_TTL_SECONDS = 24 * 60 * 60;

const log = getLogger('b2b.label.storage');

function contentTypeFor(format: LabelFormat): string {
    switch (format) {
        case 'pdf': return 'application/pdf';
        case 'png': return 'image/png';
        case 'zpl': return 'application/zpl';
    }
}

export interface FirebaseLabelStoreOptions {
    // Override the default bucket. When omitted, uses the Firebase
    // project's default storage bucket. Most installs leave this empty;
    // pass a name for multi-bucket or per-region setups.
    readonly bucketName?: string;
}

export class FirebaseLabelStore implements LabelStore {
    private readonly storage: Storage;
    private readonly bucketName?: string;

    constructor(
        adminApp: Parameters<typeof getStorage>[0],
        opts: FirebaseLabelStoreOptions = {},
    ) {
        this.storage = getStorage(adminApp);
        this.bucketName = opts.bucketName;
    }

    private bucket() {
        return this.bucketName ? this.storage.bucket(this.bucketName) : this.storage.bucket();
    }

    private pathFor(partnerId: string, shipmentId: string, format: LabelFormat): string {
        return `b2b-labels/${partnerId}/${shipmentId}/${shipmentId}.${format}`;
    }

    async put(input: LabelPutInput): Promise<LabelPutResult> {
        const path = this.pathFor(input.partnerId, input.shipmentId, input.format);
        const file = this.bucket().file(path);

        await file.save(Buffer.from(input.bytes), {
            contentType: input.contentType ?? contentTypeFor(input.format),
            metadata: {
                metadata: {
                    partnerId: input.partnerId,
                    shipmentId: input.shipmentId,
                    format: input.format,
                    uploadedAt: new Date().toISOString(),
                },
            },
            resumable: false,        // small files; resumable adds latency
        });

        const expiresAtMs = Date.now() + DEFAULT_SIGN_TTL_SECONDS * 1000;
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: expiresAtMs,
            version: 'v4',
        });

        log.info('label uploaded', {
            partnerId: input.partnerId,
            shipmentId: input.shipmentId,
            format: input.format,
            bytes: input.bytes.byteLength,
            labelRef: path,
        });

        return {
            labelRef: path,
            signedUrl,
            expiresAt: new Date(expiresAtMs),
        };
    }

    async sign(labelRef: LabelRef, ttlSeconds: number): Promise<{ signedUrl: string; expiresAt: Date }> {
        const expiresAtMs = Date.now() + ttlSeconds * 1000;
        const [signedUrl] = await this.bucket()
            .file(labelRef)
            .getSignedUrl({ action: 'read', expires: expiresAtMs, version: 'v4' });
        return { signedUrl, expiresAt: new Date(expiresAtMs) };
    }

    async delete(labelRef: LabelRef): Promise<void> {
        try {
            await this.bucket().file(labelRef).delete({ ignoreNotFound: true });
            log.info('label deleted', { labelRef });
        } catch (err) {
            // ignoreNotFound is set; remaining errors are real (permissions,
            // network). Surface so the caller knows the dangling blob exists.
            log.error('label delete failed', {
                labelRef,
                error: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }
}
