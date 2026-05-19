import { describe, it, expect } from 'vitest';
import { BLUEDART_SCAN_MAP, mapBlueDartScan } from '../eventMap';

describe('BLUEDART_SCAN_MAP — well-formedness', () => {
    it('maps every known code to a valid TrackingEventType', () => {
        for (const [code, mapping] of Object.entries(BLUEDART_SCAN_MAP)) {
            expect(mapping.type).toMatch(/^shipment\./);
            // Codes are 2 chars in BlueDart spec.
            expect(code).toMatch(/^\d{2}$/);
        }
    });

    it('every undelivered scan carries an impliedReason', () => {
        for (const [, mapping] of Object.entries(BLUEDART_SCAN_MAP)) {
            if (mapping.type === 'shipment.undelivered') {
                expect(mapping.impliedReason).toBeTruthy();
            }
        }
    });

    it('every exception-producing scan carries an impliedReason', () => {
        for (const [, mapping] of Object.entries(BLUEDART_SCAN_MAP)) {
            if (mapping.type === 'shipment.exception') {
                expect(mapping.impliedReason).toBeTruthy();
            }
        }
    });
});

describe('mapBlueDartScan', () => {
    it('returns the canonical mapping for known codes', () => {
        expect(mapBlueDartScan('11').type).toBe('shipment.delivered');
        expect(mapBlueDartScan('08').type).toBe('shipment.out_for_delivery');
        expect(mapBlueDartScan('21').type).toBe('shipment.undelivered');
        expect(mapBlueDartScan('21').impliedReason).toBe('customer_unavailable');
    });

    it('maps unknown codes to shipment.exception (audit, no transition)', () => {
        const r = mapBlueDartScan('99');
        expect(r.type).toBe('shipment.exception');
        expect(r.impliedReason).toBe('other');
    });

    it('maps the empty string to shipment.exception (defensive)', () => {
        const r = mapBlueDartScan('');
        expect(r.type).toBe('shipment.exception');
    });

    it('different undelivered codes carry distinct reason codes', () => {
        expect(mapBlueDartScan('21').impliedReason).toBe('customer_unavailable');
        expect(mapBlueDartScan('22').impliedReason).toBe('address_incorrect');
        expect(mapBlueDartScan('23').impliedReason).toBe('consignee_refused');
        expect(mapBlueDartScan('24').impliedReason).toBe('cod_refused');
    });

    it('RTO flow has all three transitions', () => {
        expect(mapBlueDartScan('31').type).toBe('shipment.rto_initiated');
        expect(mapBlueDartScan('32').type).toBe('shipment.rto_in_transit');
        expect(mapBlueDartScan('33').type).toBe('shipment.rto_delivered');
    });
});
