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
import { DelhiveryAdapter } from './DelhiveryAdapter';

// Delhivery webhook handler.
//
// IMPORTANT: Delhivery's webhook payload includes a per-partner token in
// the body or header — confirm with each account. The implementation here
// supports either:
//   - X-Delhivery-Signature: HMAC-SHA256 over the raw body
//   - or a `partner_token` query param matched against creds.webhookSecret
// Swap to the partner's actual scheme.

export class DelhiveryWebhookHandler implements CourierWebhookHandler {
    readonly courier = 'delhivery' as const;

    constructor(
        private readonly adapter: DelhiveryAdapter,
        private readonly shipmentLookup: ShipmentLookup,
        private readonly credentials: CredentialsResolver,
    ) {}

    async verifySignature(req: NextRequest, rawBody: string): Promise<SignatureCheck> {
        const partnerIdRaw = req.nextUrl.searchParams.get('partner');
        if (!partnerIdRaw) return { ok: false, reason: 'Missing partner query param' };

        const creds = await this.credentials.resolve(
            partnerIdRaw as PartnerId,
            'delhivery',
        );
        const secret = creds && typeof creds.webhookSecret === 'string' ? creds.webhookSecret : null;
        if (!secret) return { ok: false, reason: 'No webhook secret on file for partner' };

        const provided = req.headers.get('X-Delhivery-Signature') || req.headers.get('x-delhivery-signature');
        if (provided) {
            const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
            return timingSafeEqual(expected, provided)
                ? { ok: true }
                : { ok: false, reason: 'Signature mismatch' };
        }

        // Token-in-query fallback.
        const token = req.nextUrl.searchParams.get('partner_token');
        if (token && timingSafeEqual(token, secret)) return { ok: true };

        return { ok: false, reason: 'No signature header or partner_token provided' };
    }

    parseEvents(body: unknown): readonly RawTrackingEvent[] {
        return this.adapter.parseWebhook(body);
    }

    async resolveShipment(event: RawTrackingEvent) {
        const awb = extractAwbFromPayload(event.payload);
        if (!awb) return null;
        return this.shipmentLookup.findByAwb('delhivery', awb);
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
    const candidates = ['waybill', 'Waybill', 'awb', 'AWB', 'tracking_id'];
    for (const k of candidates) {
        const v = (payload as Record<string, unknown>)[k];
        if (typeof v === 'string' && v.length > 0) return v;
    }
    // Sometimes nested under Shipment
    const shipment = (payload as Record<string, unknown>).Shipment;
    if (shipment && typeof shipment === 'object') {
        const v = (shipment as Record<string, unknown>).AWB;
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
