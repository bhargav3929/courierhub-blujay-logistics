import crypto from 'node:crypto';
import type { PartnerId } from '@/types/b2b/ids';
import type {
    QuoteTokenPayload,
    VerifyQuoteTokenResult,
} from '@/types/b2b/quote';

// Self-contained, HMAC-signed quote envelope.
//
// Form: `bjqt_<base64url(payloadJson)>.<hex(hmac-sha256)>`
//
// The platform secret is configured via env (`B2B_QUOTE_TOKEN_SECRET`).
// Per-partner rotating secrets are a future enhancement; until then, the
// platform secret is global. Rotation strategy: keep N most-recent
// secrets; verify against any; sign with the newest.

const TOKEN_PREFIX = 'bjqt_';

function getSecret(): string {
    const s = process.env.B2B_QUOTE_TOKEN_SECRET;
    if (!s || s.length < 32) {
        throw new Error(
            'B2B_QUOTE_TOKEN_SECRET env var is missing or too short (need ≥32 chars)',
        );
    }
    return s;
}

function base64urlEncode(buf: Buffer): string {
    return buf
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64urlDecode(s: string): Buffer | null {
    try {
        const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
        return Buffer.from(
            padded.replace(/-/g, '+').replace(/_/g, '/'),
            'base64',
        );
    } catch {
        return null;
    }
}

function timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
        return false;
    }
}

export interface IssueQuoteTokenInput {
    readonly partnerId: PartnerId;
    readonly courier: QuoteTokenPayload['courier'];
    readonly serviceCode: string;
    readonly totalPaise: number;
    readonly ttlSeconds: number;
    readonly requestHash: string;
}

export function issueQuoteToken(input: IssueQuoteTokenInput): {
    token: string;
    payload: QuoteTokenPayload;
} {
    const now = Date.now();
    const payload: QuoteTokenPayload = {
        version: 1,
        partnerId: input.partnerId,
        courier: input.courier,
        serviceCode: input.serviceCode,
        totalPaise: input.totalPaise,
        issuedAt: now,
        expiresAt: now + input.ttlSeconds * 1000,
        nonce: crypto.randomBytes(8).toString('hex'),
        requestHash: input.requestHash,
    };
    const json = JSON.stringify(payload);
    const encoded = base64urlEncode(Buffer.from(json, 'utf8'));
    const sig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('hex');
    return { token: `${TOKEN_PREFIX}${encoded}.${sig}`, payload };
}

export function verifyQuoteToken(
    token: string,
    expectedPartnerId: PartnerId,
): VerifyQuoteTokenResult {
    if (!token.startsWith(TOKEN_PREFIX)) {
        return { ok: false, reason: 'malformed' };
    }
    const body = token.slice(TOKEN_PREFIX.length);
    const dot = body.indexOf('.');
    if (dot < 0) return { ok: false, reason: 'malformed' };

    const encoded = body.slice(0, dot);
    const providedSig = body.slice(dot + 1);
    const expectedSig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('hex');
    if (!timingSafeEqualHex(expectedSig, providedSig)) {
        return { ok: false, reason: 'bad_signature' };
    }

    const decoded = base64urlDecode(encoded);
    if (!decoded) return { ok: false, reason: 'malformed' };

    let payload: QuoteTokenPayload;
    try {
        payload = JSON.parse(decoded.toString('utf8')) as QuoteTokenPayload;
    } catch {
        return { ok: false, reason: 'malformed' };
    }

    if (payload.version !== 1) return { ok: false, reason: 'malformed' };
    if (payload.partnerId !== expectedPartnerId) {
        return { ok: false, reason: 'partner_mismatch' };
    }
    if (payload.expiresAt < Date.now()) {
        return { ok: false, reason: 'expired' };
    }
    return { ok: true, payload };
}

// Stable hash of the request shape — partner cannot reuse a token with a
// different parcel weight / pincodes. The token's `requestHash` is
// compared to this at book time; mismatch is rejected.
export function computeQuoteRequestHash(input: {
    originPincode: string;
    destinationPincode: string;
    weightGrams: number;
    isCod: boolean;
    codAmountPaise: number;
}): string {
    const serialized = [
        input.originPincode,
        input.destinationPincode,
        input.weightGrams,
        input.isCod ? '1' : '0',
        input.codAmountPaise,
    ].join('|');
    return crypto.createHash('sha256').update(serialized).digest('hex');
}
