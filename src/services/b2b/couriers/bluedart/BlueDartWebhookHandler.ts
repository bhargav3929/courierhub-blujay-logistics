import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { CredentialsResolver } from '@/types/b2b/courier-adapter';
import type { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type { ShipmentLookup } from '@/types/b2b/ports';
import type { NormalizedEvent, RawTrackingEvent } from '@/types/b2b/tracking';
import type {
    CourierWebhookHandler,
    SignatureCheck,
} from '@/services/b2b/couriers/CourierWebhookHandler';
import { BlueDartAdapter } from './BlueDartAdapter';

// BlueDart webhook handler.
//
// IMPORTANT: BlueDart does not publish a uniform webhook signature scheme;
// individual integrations differ. The verifySignature() implementation
// here is a STARTING POINT — HMAC-SHA256 over the raw body using a shared
// secret carried in the X-BD-Signature header. Swap for whatever scheme
// the customer's BlueDart account uses (IP allowlist, embedded token,
// etc.). The contract above is what the rest of the system depends on.

export class BlueDartWebhookHandler implements CourierWebhookHandler {
    readonly courier = 'bluedart' as const;

    constructor(
        private readonly adapter: BlueDartAdapter,
        private readonly shipmentLookup: ShipmentLookup,
        private readonly credentials: CredentialsResolver,
    ) {}

    async verifySignature(req: NextRequest, rawBody: string): Promise<SignatureCheck> {
        const provided = req.headers.get('X-BD-Signature') || req.headers.get('x-bd-signature');
        if (!provided) return { ok: false, reason: 'Missing X-BD-Signature header' };

        // Webhook secret is configured per partner. The webhook URL carries
        // a `partner` query param so we can resolve the right secret.
        const partnerIdRaw = req.nextUrl.searchParams.get('partner');
        if (!partnerIdRaw) return { ok: false, reason: 'Missing partner query param' };

        const creds = await this.credentials.resolve(
            partnerIdRaw as PartnerId,
            'bluedart',
        );
        const secret = creds && typeof creds.webhookSecret === 'string' ? creds.webhookSecret : null;
        if (!secret) return { ok: false, reason: 'No webhook secret on file for partner' };

        const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
        if (!timingSafeEqual(expected, provided)) {
            return { ok: false, reason: 'Signature mismatch' };
        }
        return { ok: true };
    }

    parseEvents(body: unknown): readonly RawTrackingEvent[] {
        return this.adapter.parseWebhook(body);
    }

    async resolveShipment(event: RawTrackingEvent) {
        const awb = extractAwbFromPayload(event.payload);
        if (!awb) return null;
        return this.shipmentLookup.findByAwb('bluedart', awb);
    }

    normalize(
        raw: RawTrackingEvent,
        shipmentId: ShipmentId,
        receivedAt: Date,
    ): NormalizedEvent {
        return this.adapter.normalize(raw, shipmentId, receivedAt);
    }
}

function extractAwbFromPayload(payload: Readonly<Record<string, unknown>> | undefined): string | null {
    if (!payload) return null;
    // BlueDart includes the AWB in different shapes depending on payload type.
    const candidates = ['awbNo', 'AWBNo', 'awb', 'Awb', 'waybillNo'];
    for (const k of candidates) {
        const v = (payload as Record<string, unknown>)[k];
        if (typeof v === 'string' && v.length > 0) return v;
    }
    return null;
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
        return false;
    }
}
