// Cron-route bearer-token authentication.
//
// Cron routes are POST'd by Vercel cron (configured in vercel.json) or
// Cloud Scheduler. The CRON_SECRET env var holds the shared secret. The
// scheduler sends it as `Authorization: Bearer ${CRON_SECRET}`.
//
// Vercel automatically forwards their `vercel-cron` source header on cron
// invocations; we accept either path so the worker can also be invoked
// manually from ops tooling.

import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
        return false;
    }
}

export function verifyCronAuth(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 16) {
        // Refuse to accept any request when the secret isn't configured.
        // Fail closed: better to break cron than to leave it open.
        return false;
    }
    const header = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!header || !header.startsWith('Bearer ')) return false;
    const token = header.slice('Bearer '.length).trim();
    return timingSafeEqual(token, secret);
}
