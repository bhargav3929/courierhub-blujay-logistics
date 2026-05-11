// Generic exponential-backoff retry wrapper. Used by Razorpay/Shiprocket
// service layers to absorb transient 5xx / network blips without surfacing
// them as user-visible errors.
export interface RetryOptions {
    retries?: number;       // default 3 (so up to 4 total attempts)
    baseDelayMs?: number;   // default 1000
    maxDelayMs?: number;    // default 30000
    factor?: number;        // default 4 → delays: 1s, 4s, 16s
    onRetry?: (attempt: number, error: unknown) => void;
    shouldRetry?: (error: unknown) => boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(
    fn: (attempt: number) => Promise<T>,
    opts: RetryOptions = {}
): Promise<T> {
    const {
        retries = 3,
        baseDelayMs = 1000,
        maxDelayMs = 30000,
        factor = 4,
        onRetry,
        shouldRetry = () => true,
    } = opts;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn(attempt);
        } catch (err) {
            lastError = err;
            if (attempt === retries || !shouldRetry(err)) throw err;
            const delay = Math.min(baseDelayMs * Math.pow(factor, attempt), maxDelayMs);
            onRetry?.(attempt + 1, err);
            await sleep(delay);
        }
    }
    throw lastError;
}
