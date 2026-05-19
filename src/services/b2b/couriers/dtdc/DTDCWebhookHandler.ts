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
import { DTDCAdapter } from './DTDCAdapter';

// DTDC webhook handler.
//
// IMPORTANT: DTDC does not currently publish a uniform webhook signature
// scheme. Many integrations rely on an IP allowlist plus a per-partner
// token sent as a header. The implementation here checks
// `x-dtdc-token == creds.webhookSecret` — swap for the real scheme.

export class DTDCWebhookHandler implements CourierWebhookHandler {
    readonly courier = 'dtdc' as const;

    constructor(
        private readonly adapter: DTDCAdapter,
        private readonly shipmentLookup: ShipmentLookup,
        private readonly credentials: CredentialsResolver,
    ) {}

    async verifySignature(req: NextRequest, _rawBody: string): Promise<SignatureCheck> {
        const partnerIdRaw = req.nextUrl.searchParams.get('partner');
        if (!partnerIdRaw) return { ok: false, reason: 'Missing partner query param' };

        const creds = await this.credentials.resolve(
            partnerIdRaw as PartnerId,
            'dtdc',
        );
        const secret = creds && typeof creds.webhookSecret === 'string' ? creds.webhookSecret : null;
        if (!secret) return { ok: false, reason: 'No webhook secret on file for partner' };

        const provided = req.headers.get('x-dtdc-token') || req.headers.get('X-DTDC-Token');
        if (!provided) return { ok: false, reason: 'Missing x-dtdc-token header' };

        return timingSafeEqual(provided, secret)
            ? { ok: true }
            : { ok: false, reason: 'Token mismatch' };
    }

    parseEvents(body: unknown): readonly RawTrackingEvent[] {
        return this.adapter.parseWebhook(body);
    }

    async resolveShipment(event: RawTrackingEvent) {
        const awb = extractAwbFromPayload(event.payload);
        if (!awb) return null;
        return this.shipmentLookup.findByAwb('dtdc', awb);
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
    const candidates = ['strShipmentNo', 'awb_number', 'awbNumber', 'awb', 'cnno', 'strcnno'];
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
