// In-process per-IP rate limiter for the chatbot endpoint.
//
// Two windows:
//   - Hourly burst:  30 messages / IP / hour
//   - Daily cap:    200 messages / IP / day
//
// Limits are intentionally generous — they exist to stop a runaway script,
// not to gatekeep humans. A real abuse case rotates IPs anyway; the real
// cost control is server-side hard caps + model choice (Haiku is cheap).
//
// In-process store is fine for a single-instance dev/staging deployment.
// For multi-instance prod (Vercel autoscaling), swap the Map for an
// upstash/Redis token bucket. The function signatures don't change.

export interface RateLimitResult {
    allowed: boolean;
    /** Seconds until the failing window resets. */
    retryAfter?: number;
    /** Reason returned to the user when blocked. */
    reason?: string;
}

interface Bucket {
    hour: { count: number; resetAt: number };
    day: { count: number; resetAt: number };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOUR_LIMIT = 30;
const DAY_LIMIT = 200;

const store = new Map<string, Bucket>();

export function checkRateLimit(ip: string): RateLimitResult {
    const now = Date.now();
    let b = store.get(ip);
    if (!b) {
        b = {
            hour: { count: 0, resetAt: now + HOUR_MS },
            day: { count: 0, resetAt: now + DAY_MS },
        };
        store.set(ip, b);
    }

    if (now >= b.hour.resetAt) {
        b.hour = { count: 0, resetAt: now + HOUR_MS };
    }
    if (now >= b.day.resetAt) {
        b.day = { count: 0, resetAt: now + DAY_MS };
    }

    if (b.hour.count >= HOUR_LIMIT) {
        return {
            allowed: false,
            retryAfter: Math.ceil((b.hour.resetAt - now) / 1000),
            reason: 'Too many requests in the past hour. Please wait a few minutes and try again.',
        };
    }
    if (b.day.count >= DAY_LIMIT) {
        return {
            allowed: false,
            retryAfter: Math.ceil((b.day.resetAt - now) / 1000),
            reason: 'Daily message limit reached. Please contact our team directly for further help.',
        };
    }

    b.hour.count++;
    b.day.count++;
    return { allowed: true };
}

/** Get the client IP from a Next.js request — robust to common proxy headers. */
export function clientIpFrom(headers: Headers): string {
    return (
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headers.get('x-real-ip') ||
        headers.get('cf-connecting-ip') ||
        'unknown'
    );
}

// Periodic cleanup — kicks in once on first call and runs every 10 min.
// Prevents the Map from growing without bound over server lifetime.
let cleanupScheduled = false;
function scheduleCleanup() {
    if (cleanupScheduled || typeof setInterval === 'undefined') return;
    cleanupScheduled = true;
    setInterval(() => {
        const now = Date.now();
        for (const [ip, b] of store.entries()) {
            if (now >= b.day.resetAt && now >= b.hour.resetAt) {
                store.delete(ip);
            }
        }
    }, 10 * 60 * 1000).unref?.();
}
scheduleCleanup();
