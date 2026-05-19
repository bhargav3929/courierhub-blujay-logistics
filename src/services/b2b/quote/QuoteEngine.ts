import type { CarrierQuote, CourierAdapter } from '@/types/b2b/courier-adapter';
import { ShipmentId, type PartnerId } from '@/types/b2b/ids';
import type {
    Quote,
    QuoteFailure,
    QuoteFailureCode,
    QuoteRequest,
    QuoteResponse,
} from '@/types/b2b/quote';
import type { RateCardStore, ServiceabilityChecker } from '@/types/b2b/ports';
import type { CourierCode } from '@/types/b2b/shipment';
import type { PricingSnapshot } from '@/types/b2b/pricing';
import { getLogger } from '@/services/b2b/http/logger';
import { CarrierError } from '@/services/b2b/couriers/shared/carrierErrors';
import { CircuitOpenError } from '@/services/b2b/couriers/shared/circuitBreaker';
import { RateCardEngine } from './RateCardEngine';
import { ServiceabilityFilter } from './ServiceabilityFilter';
import { computeQuoteRequestHash, issueQuoteToken } from './quoteToken';

// Multi-carrier quote aggregator.
//
// Flow:
//   1. Resolve eligible couriers (request hint ∩ registered adapters)
//   2. Serviceability filter (per (courier, lane))
//   3. Fan out adapter.quote() in parallel
//   4. Apply rate-card markup per result
//   5. Issue quote tokens
//   6. Return successes + failures (no carrier failure kills the response)

const log = getLogger('b2b.quote.engine');

// 5-minute default token TTL. Long enough for a partner to render the
// quote, get user approval, and book. Short enough that carrier rates
// don't drift far.
const DEFAULT_QUOTE_TTL_SECONDS = 5 * 60;

export interface QuoteEngineDeps {
    readonly getAdapter: (courier: CourierCode) => CourierAdapter | null;
    readonly listAdapters: () => readonly CourierAdapter[];
    readonly rateCardStore: RateCardStore;
    readonly serviceabilityChecker: ServiceabilityChecker;
    readonly tokenTtlSeconds?: number;
}

export class QuoteEngine {
    private readonly serviceability: ServiceabilityFilter;
    private readonly tokenTtlSeconds: number;

    constructor(private readonly deps: QuoteEngineDeps) {
        this.serviceability = new ServiceabilityFilter(deps.serviceabilityChecker);
        this.tokenTtlSeconds = deps.tokenTtlSeconds ?? DEFAULT_QUOTE_TTL_SECONDS;
    }

    async quote(req: QuoteRequest): Promise<QuoteResponse> {
        // ─── Step 1: eligibility — preference ∩ registered adapters ──
        const eligibleAdapters = this.resolveEligibleAdapters(req.preferredCouriers);
        if (eligibleAdapters.length === 0) {
            return { quotes: [], failures: [] };
        }

        // ─── Step 2: serviceability ─────────────────────────────────
        const serviceabilityResults = await this.serviceability.checkAll({
            couriers: eligibleAdapters.map(a => a.courier),
            originPincode: req.origin.pincode,
            destinationPincode: req.destination.pincode,
        });

        const failures: QuoteFailure[] = [];
        const serviceableAdapters: CourierAdapter[] = [];
        for (const adapter of eligibleAdapters) {
            const r = serviceabilityResults.get(adapter.courier);
            if (!r || !r.serviceable) {
                failures.push({
                    courier: adapter.courier,
                    code: 'not_serviceable',
                    message: r?.reason ?? 'Lane not serviceable',
                });
                continue;
            }
            serviceableAdapters.push(adapter);
        }

        if (serviceableAdapters.length === 0) {
            return { quotes: [], failures };
        }

        // ─── Step 3: load rate card once ────────────────────────────
        const rateCard = await this.deps.rateCardStore.findActive(
            req.partnerId,
            req.clientId ?? null,
            new Date(),
        );

        // ─── Step 4: parallel quote + markup + token issue ──────────
        const requestHash = computeQuoteRequestHash({
            originPincode: req.origin.pincode,
            destinationPincode: req.destination.pincode,
            weightGrams: req.parcel.weightGrams,
            isCod: req.parcel.isCod,
            codAmountPaise: req.parcel.codAmountPaise,
        });

        const settled = await Promise.allSettled(
            serviceableAdapters.map(adapter =>
                this.quoteFromAdapter(adapter, req, rateCard, requestHash),
            ),
        );

        const quotes: Quote[] = [];
        for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            const adapter = serviceableAdapters[i];
            if (r.status === 'fulfilled') {
                if (r.value) quotes.push(r.value);
                // null = rate-card excluded this carrier
                else failures.push({
                    courier: adapter.courier,
                    code: 'rate_card_excludes',
                    message: 'Rate card excludes this carrier',
                });
            } else {
                const { code, message } = classifyQuoteError(r.reason);
                log.warn('quote failed', {
                    partnerId: req.partnerId,
                    courier: adapter.courier,
                    error: message,
                });
                failures.push({ courier: adapter.courier, code, message });
            }
        }

        // Sort by cheapest first so the partner's "default" choice is the
        // lowest price. Same price → stable by carrier code.
        quotes.sort((a, b) => {
            if (a.pricingSnapshot.totalPaise !== b.pricingSnapshot.totalPaise) {
                return a.pricingSnapshot.totalPaise - b.pricingSnapshot.totalPaise;
            }
            return a.courier.localeCompare(b.courier);
        });

        return { quotes, failures };
    }

    private resolveEligibleAdapters(
        preferred: readonly CourierCode[] | undefined,
    ): CourierAdapter[] {
        const registered = this.deps.listAdapters();
        if (!preferred || preferred.length === 0) return [...registered];
        const allowed = new Set(preferred);
        return registered.filter(a => allowed.has(a.courier));
    }

    private async quoteFromAdapter(
        adapter: CourierAdapter,
        req: QuoteRequest,
        rateCard: Awaited<ReturnType<RateCardStore['findActive']>>,
        requestHash: string,
    ): Promise<Quote | null> {
        const carrierQuote: CarrierQuote = await adapter.quote({
            partnerId: req.partnerId,
            // shipmentId not yet assigned at quote time — use a placeholder
            // so the adapter contract is satisfied; carriers don't store it.
            shipmentId: ShipmentId('quote-only'),
            origin: req.origin,
            destination: req.destination,
            parcel: req.parcel,
            serviceCode: req.preferredServiceCode,
        });

        const markup = RateCardEngine.applyMarkup({
            card: rateCard,
            courier: adapter.courier,
            serviceCode: carrierQuote.serviceCode,
            carrierQuote,
            parcel: req.parcel,
        });

        const { token } = issueQuoteToken({
            partnerId: req.partnerId,
            courier: adapter.courier,
            serviceCode: carrierQuote.serviceCode,
            totalPaise: markup.totalPaise,
            ttlSeconds: this.tokenTtlSeconds,
            requestHash,
        });

        const pricing: PricingSnapshot = {
            courier: adapter.courier,
            serviceCode: carrierQuote.serviceCode,
            ...markup.breakdown,
            totalPaise: markup.totalPaise,
            currency: 'INR',
            rateCardId: rateCard?.id ?? null,
            rateCardVersion: rateCard?.version ?? null,
            quotedAt: new Date(),
            quoteToken: token,
            appliedRules: markup.appliedRules,
        };

        return {
            courier: adapter.courier,
            serviceCode: carrierQuote.serviceCode,
            etaDays: carrierQuote.etaDays,
            pricingSnapshot: pricing,
            quoteToken: token,
            expiresAt: new Date(Date.now() + this.tokenTtlSeconds * 1000),
        };
    }
}

function classifyQuoteError(err: unknown): { code: QuoteFailureCode; message: string } {
    if (err instanceof CircuitOpenError) {
        return { code: 'carrier_unavailable', message: 'Carrier circuit is open — try again shortly' };
    }
    if (err instanceof CarrierError) {
        if (err.category === 'permanent') {
            return { code: 'not_eligible', message: err.rawMessage ?? 'Carrier rejected the quote' };
        }
        return { code: 'carrier_unavailable', message: err.rawMessage ?? 'Carrier transient failure' };
    }
    return {
        code: 'carrier_unavailable',
        message: err instanceof Error ? err.message : 'Unexpected quote failure',
    };
}
