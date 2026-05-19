import type { CourierCode } from '@/types/b2b/shipment';

// Error category drives downstream behavior:
//   - transient  → retry-able (network blips, 5xx, gateway timeout)
//   - permanent  → never retry (4xx with payload problem, AWB doesn't exist)
//   - auth       → permanent, but surfaced separately for credential rotation
//   - unknown    → conservative: retry up to limit but trip circuit faster

export type CarrierErrorCategory = 'transient' | 'permanent' | 'auth' | 'unknown';

export interface CarrierErrorDetail {
    readonly courier: CourierCode;
    readonly operation: string;        // e.g. 'book', 'pollStatus'
    readonly category: CarrierErrorCategory;
    readonly httpStatus?: number;
    readonly rawCode?: string;
    readonly rawMessage?: string;
}

export class CarrierError extends Error {
    public readonly courier: CourierCode;
    public readonly operation: string;
    public readonly category: CarrierErrorCategory;
    public readonly httpStatus?: number;
    public readonly rawCode?: string;
    public readonly rawMessage?: string;

    constructor(detail: CarrierErrorDetail, message?: string) {
        super(
            message
                ?? `${detail.courier}.${detail.operation} failed (${detail.category})`
                + (detail.httpStatus ? ` [HTTP ${detail.httpStatus}]` : '')
                + (detail.rawMessage ? `: ${detail.rawMessage}` : ''),
        );
        this.name = 'CarrierError';
        this.courier = detail.courier;
        this.operation = detail.operation;
        this.category = detail.category;
        this.httpStatus = detail.httpStatus;
        this.rawCode = detail.rawCode;
        this.rawMessage = detail.rawMessage;
    }
}

// Predicate for the retry layer. Transient + unknown retry; permanent +
// auth do not. CarrierError is the only error type that gets retried —
// generic errors are treated as permanent (don't mask real bugs).
export function shouldRetryCarrierError(err: unknown): boolean {
    if (err instanceof CarrierError) {
        return err.category === 'transient' || err.category === 'unknown';
    }
    return false;
}

// Classify a raw HTTP error from the carrier. Adapters use this to wrap
// axios errors uniformly before letting them propagate.
export function classifyHttpStatus(status: number | undefined): CarrierErrorCategory {
    if (status === undefined) return 'transient';     // network / timeout
    if (status === 401 || status === 403) return 'auth';
    if (status >= 500) return 'transient';
    if (status === 408 || status === 429) return 'transient';
    if (status >= 400) return 'permanent';
    return 'unknown';
}
