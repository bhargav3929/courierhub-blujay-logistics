import type { ServiceabilityChecker } from '@/types/b2b/ports';
import type { CourierCode } from '@/types/b2b/shipment';
import type { ServiceabilityResult } from '@/types/b2b/quote';

// Thin orchestration helper that batches serviceability checks across
// multiple couriers for the same origin/destination pair. The actual
// per-courier check (pincode db lookup, carrier API call, cache) lives in
// the ServiceabilityChecker implementation — this just fans out.

export interface BatchServiceabilityInput {
    readonly couriers: readonly CourierCode[];
    readonly originPincode: string;
    readonly destinationPincode: string;
}

export class ServiceabilityFilter {
    constructor(private readonly checker: ServiceabilityChecker) {}

    async checkAll(
        input: BatchServiceabilityInput,
    ): Promise<ReadonlyMap<CourierCode, ServiceabilityResult>> {
        const out = new Map<CourierCode, ServiceabilityResult>();
        const results = await Promise.allSettled(
            input.couriers.map(async (c) => {
                const r = await this.checker.check(
                    c,
                    input.originPincode,
                    input.destinationPincode,
                );
                return [c, r] as const;
            }),
        );
        for (const r of results) {
            if (r.status === 'fulfilled') {
                out.set(r.value[0], r.value[1]);
            }
            // Failed checks default to "not serviceable" implicitly — they
            // simply aren't in the map. QuoteEngine reads `result ?? notServiceable`.
        }
        return out;
    }
}
