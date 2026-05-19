import { describe, it, expect } from 'vitest';
import { validateCreateShipmentInput } from '../validation';
import type { AddressInput, ParcelInput } from '../../../../types/b2b/address';
import type { CreateShipmentInput } from '../../../../types/b2b/shipment';

const validOrigin: AddressInput = {
    name: 'Asha Kumar',
    phone: '+919876543210',
    line1: '12, MG Road',
    city: 'Bengaluru',
    state: 'KA',
    pincode: '560001',
    country: 'IN',
};

const validDestination: AddressInput = {
    name: 'Rahul Verma',
    phone: '9876500000',
    line1: '1, Connaught Place',
    city: 'New Delhi',
    state: 'DL',
    pincode: '110001',
    country: 'IN',
};

const validParcel: ParcelInput = {
    weightGrams: 500,
    dimensionsCm: { length: 20, width: 15, height: 10 },
    declaredValuePaise: 50_000,
    contents: 'Test goods',
    isCod: false,
    codAmountPaise: 0,
};

const validInput: CreateShipmentInput = {
    fulfillmentMode: 'courier',
    origin: validOrigin,
    destination: validDestination,
    parcel: validParcel,
};

function expectError(result: ReturnType<typeof validateCreateShipmentInput>, field: string) {
    expect(result.ok).toBe(false);
    if (!result.ok) {
        const matched = result.errors.some(e => e.field === field);
        expect(matched).toBe(true);
    }
}

describe('validateCreateShipmentInput — happy path', () => {
    it('accepts a fully-valid input', () => {
        expect(validateCreateShipmentInput(validInput).ok).toBe(true);
    });

    it('accepts COD with positive codAmountPaise', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            parcel: { ...validParcel, isCod: true, codAmountPaise: 49_900 },
        });
        expect(r.ok).toBe(true);
    });

    it('accepts a return address', () => {
        const r = validateCreateShipmentInput({ ...validInput, returnAddress: validOrigin });
        expect(r.ok).toBe(true);
    });
});

describe('validateCreateShipmentInput — mode coherence', () => {
    it('rejects self_shipment with preferredCourier', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            fulfillmentMode: 'self_shipment',
            preferredCourier: 'bluedart',
        });
        expectError(r, 'preferredCourier');
    });
});

describe('validateCreateShipmentInput — address rules', () => {
    it('rejects pincode starting with 0', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            origin: { ...validOrigin, pincode: '012345' },
        });
        expectError(r, 'origin.pincode');
    });

    it('rejects 5-digit pincode', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            destination: { ...validDestination, pincode: '12345' },
        });
        expectError(r, 'destination.pincode');
    });

    it('rejects malformed phone', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            destination: { ...validDestination, phone: 'not-a-phone' },
        });
        expectError(r, 'destination.phone');
    });

    it('rejects malformed email when provided', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            origin: { ...validOrigin, email: 'not-an-email' },
        });
        expectError(r, 'origin.email');
    });

    it('accepts no email (optional field)', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            origin: { ...validOrigin, email: undefined },
        });
        expect(r.ok).toBe(true);
    });

    it('rejects empty line1', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            origin: { ...validOrigin, line1: '' },
        });
        expectError(r, 'origin.line1');
    });

    it('rejects missing country', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            origin: { ...validOrigin, country: '' },
        });
        expectError(r, 'origin.country');
    });
});

describe('validateCreateShipmentInput — parcel rules', () => {
    it('rejects zero weight', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            parcel: { ...validParcel, weightGrams: 0 },
        });
        expectError(r, 'parcel.weightGrams');
    });

    it('rejects weight over 50kg', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            parcel: { ...validParcel, weightGrams: 60_000 },
        });
        expectError(r, 'parcel.weightGrams');
    });

    it('rejects zero dimension', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            parcel: { ...validParcel, dimensionsCm: { length: 0, width: 10, height: 10 } },
        });
        expectError(r, 'parcel.dimensionsCm');
    });

    it('rejects negative declared value', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            parcel: { ...validParcel, declaredValuePaise: -100 },
        });
        expectError(r, 'parcel.declaredValuePaise');
    });

    it('rejects COD with zero amount', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            parcel: { ...validParcel, isCod: true, codAmountPaise: 0 },
        });
        expectError(r, 'parcel.codAmountPaise');
    });

    it('rejects non-COD with non-zero amount', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            parcel: { ...validParcel, isCod: false, codAmountPaise: 1000 },
        });
        expectError(r, 'parcel.codAmountPaise');
    });

    it('rejects empty contents', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            parcel: { ...validParcel, contents: '   ' },
        });
        expectError(r, 'parcel.contents');
    });
});

describe('validateCreateShipmentInput — metadata & external ref', () => {
    it('rejects externalRef longer than 64 chars', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            externalRef: 'x'.repeat(65),
        });
        expectError(r, 'externalRef');
    });

    it('rejects empty externalRef when provided', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            externalRef: '',
        });
        expectError(r, 'externalRef');
    });

    it('rejects metadata over 4 KB', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            metadata: { blob: 'a'.repeat(5000) },
        });
        expectError(r, 'metadata');
    });
});

describe('validateCreateShipmentInput — error aggregation', () => {
    it('returns ALL errors at once (not fail-fast)', () => {
        const r = validateCreateShipmentInput({
            ...validInput,
            origin: { ...validOrigin, pincode: 'BAD', phone: 'BAD' },
            parcel: { ...validParcel, weightGrams: -1, contents: '' },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            const fields = new Set(r.errors.map(e => e.field));
            expect(fields.has('origin.pincode')).toBe(true);
            expect(fields.has('origin.phone')).toBe(true);
            expect(fields.has('parcel.weightGrams')).toBe(true);
            expect(fields.has('parcel.contents')).toBe(true);
        }
    });
});
