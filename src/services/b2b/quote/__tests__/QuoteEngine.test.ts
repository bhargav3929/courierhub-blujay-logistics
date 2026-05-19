import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { QuoteEngine } from '../QuoteEngine';
import { PartnerId } from '../../../../types/b2b/ids';
import type {
    CarrierQuote,
    CourierAdapter,
} from '../../../../types/b2b/courier-adapter';
import type { CourierCode } from '../../../../types/b2b/shipment';
import type { QuoteRequest, ServiceabilityResult } from '../../../../types/b2b/quote';
import type {
    RateCard,
} from '../../../../types/b2b/pricing';
import type {
    RateCardStore,
    ServiceabilityChecker,
} from '../../../../types/b2b/ports';
import { CarrierError } from '../../couriers/shared/carrierErrors';

// ─── Set the env var that issueQuoteToken() requires ───────────────────

beforeAll(() => {
    process.env.B2B_QUOTE_TOKEN_SECRET = 'test-quote-token-secret-at-least-32chars';
});

// ─── Stub adapters ────────────────────────────────────────────────────

class StubAdapter implements Partial<CourierAdapter> {
    readonly courier: CourierCode;
    public toReturn: CarrierQuote | null = null;
    public throwError: Error | null = null;

    constructor(courier: CourierCode, defaultTotalPaise: number) {
        this.courier = courier;
        this.toReturn = {
            courier, serviceCode: 'std',
            totalPaise: defaultTotalPaise,
            breakdown: {}, currency: 'INR', etaDays: 3,
        };
    }
    async quote(): Promise<CarrierQuote> {
        if (this.throwError) throw this.throwError;
        if (!this.toReturn) throw new Error('no quote configured');
        return this.toReturn;
    }
}

class StubRateCardStore implements RateCardStore {
    public card: RateCard | null = null;
    async findActive() { return this.card; }
}

class StubServiceability implements ServiceabilityChecker {
    public results = new Map<CourierCode, ServiceabilityResult>();
    setServiceable(c: CourierCode, ok: boolean, reason?: string) {
        this.results.set(c, { serviceable: ok, reason });
    }
    async check(courier: CourierCode): Promise<ServiceabilityResult> {
        return this.results.get(courier) ?? { serviceable: true };
    }
}

const PARTNER = PartnerId('p_1');

function makeRequest(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
    return {
        partnerId: PARTNER,
        origin: {
            name: 'A', phone: '+919876543210', line1: '1', city: 'Bengaluru',
            state: 'KA', pincode: '560001', country: 'IN',
        },
        destination: {
            name: 'B', phone: '+919876500000', line1: '1', city: 'Delhi',
            state: 'DL', pincode: '110001', country: 'IN',
        },
        parcel: {
            weightGrams: 500,
            dimensionsCm: { length: 20, width: 15, height: 10 },
            declaredValuePaise: 50_000,
            contents: 'test', isCod: false, codAmountPaise: 0,
        },
        ...overrides,
    };
}

function build(opts: { adapters: StubAdapter[] }) {
    const rateCardStore = new StubRateCardStore();
    const serviceability = new StubServiceability();
    const adapters = opts.adapters as unknown as CourierAdapter[];
    const engine = new QuoteEngine({
        getAdapter: (c) =>
            (adapters.find(a => a.courier === c) ?? null) as CourierAdapter | null,
        listAdapters: () => adapters,
        rateCardStore,
        serviceabilityChecker: serviceability,
    });
    return { engine, rateCardStore, serviceability };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('QuoteEngine — aggregation', () => {
    let bd: StubAdapter;
    let dh: StubAdapter;

    beforeEach(() => {
        bd = new StubAdapter('bluedart', 12_000);
        dh = new StubAdapter('delhivery', 9_500);
    });

    it('returns one quote per registered, serviceable adapter', async () => {
        const { engine } = build({ adapters: [bd, dh] });
        const resp = await engine.quote(makeRequest());
        expect(resp.quotes).toHaveLength(2);
        expect(resp.failures).toHaveLength(0);
    });

    it('sorts quotes by cheapest first', async () => {
        const { engine } = build({ adapters: [bd, dh] });
        const resp = await engine.quote(makeRequest());
        expect(resp.quotes[0].courier).toBe('delhivery');     // 9500p
        expect(resp.quotes[1].courier).toBe('bluedart');      // 12000p
    });

    it('attaches a quoteToken on each successful quote', async () => {
        const { engine } = build({ adapters: [bd] });
        const resp = await engine.quote(makeRequest());
        expect(resp.quotes[0].quoteToken).toMatch(/^bjqt_/);
    });

    it('respects preferredCouriers filter', async () => {
        const { engine } = build({ adapters: [bd, dh] });
        const resp = await engine.quote(makeRequest({ preferredCouriers: ['delhivery'] }));
        expect(resp.quotes).toHaveLength(1);
        expect(resp.quotes[0].courier).toBe('delhivery');
    });
});

describe('QuoteEngine — serviceability', () => {
    let bd: StubAdapter;
    let dh: StubAdapter;

    beforeEach(() => {
        bd = new StubAdapter('bluedart', 12_000);
        dh = new StubAdapter('delhivery', 9_500);
    });

    it('records serviceability failures and returns successful ones', async () => {
        const { engine, serviceability } = build({ adapters: [bd, dh] });
        serviceability.setServiceable('delhivery', false, 'pincode not in network');

        const resp = await engine.quote(makeRequest());
        expect(resp.quotes).toHaveLength(1);
        expect(resp.quotes[0].courier).toBe('bluedart');
        expect(resp.failures).toHaveLength(1);
        expect(resp.failures[0].courier).toBe('delhivery');
        expect(resp.failures[0].code).toBe('not_serviceable');
    });

    it('returns empty quotes and all failures when no carrier is serviceable', async () => {
        const { engine, serviceability } = build({ adapters: [bd, dh] });
        serviceability.setServiceable('bluedart', false);
        serviceability.setServiceable('delhivery', false);

        const resp = await engine.quote(makeRequest());
        expect(resp.quotes).toHaveLength(0);
        expect(resp.failures).toHaveLength(2);
    });
});

describe('QuoteEngine — partial failures', () => {
    it('classifies CarrierError permanent → not_eligible', async () => {
        const bd = new StubAdapter('bluedart', 12_000);
        const dh = new StubAdapter('delhivery', 9_500);
        bd.throwError = new CarrierError({
            courier: 'bluedart',
            operation: 'quote',
            category: 'permanent',
            httpStatus: 400,
            rawMessage: 'invalid pincode',
        });
        const { engine } = build({ adapters: [bd, dh] });
        const resp = await engine.quote(makeRequest());
        expect(resp.quotes).toHaveLength(1);
        expect(resp.quotes[0].courier).toBe('delhivery');
        const bdFail = resp.failures.find(f => f.courier === 'bluedart');
        expect(bdFail?.code).toBe('not_eligible');
    });

    it('classifies CarrierError transient → carrier_unavailable', async () => {
        const bd = new StubAdapter('bluedart', 12_000);
        bd.throwError = new CarrierError({
            courier: 'bluedart',
            operation: 'quote',
            category: 'transient',
            httpStatus: 503,
        });
        const { engine } = build({ adapters: [bd] });
        const resp = await engine.quote(makeRequest());
        expect(resp.quotes).toHaveLength(0);
        expect(resp.failures[0].code).toBe('carrier_unavailable');
    });
});

describe('QuoteEngine — rate card markup', () => {
    it('applies a flat markup from the partner rate card', async () => {
        const bd = new StubAdapter('bluedart', 10_000);
        const { engine, rateCardStore } = build({ adapters: [bd] });
        rateCardStore.card = {
            id: 'rc_1', partnerId: PARTNER, name: 'std', version: 1,
            activeFrom: new Date('2026-01-01'),
            activeUntil: null,
            rules: [{ id: 'r1', type: 'flat', addPaise: 2_500 }],
        };
        const resp = await engine.quote(makeRequest());
        expect(resp.quotes[0].pricingSnapshot.totalPaise).toBe(12_500);
        expect(resp.quotes[0].pricingSnapshot.markupPaise).toBe(2_500);
        expect(resp.quotes[0].pricingSnapshot.appliedRules).toHaveLength(1);
        expect(resp.quotes[0].pricingSnapshot.rateCardId).toBe('rc_1');
    });
});
