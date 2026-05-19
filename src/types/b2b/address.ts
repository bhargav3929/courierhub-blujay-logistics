export interface AddressInput {
    name: string;
    phone: string;
    email?: string;
    line1: string;
    line2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;            // ISO-3166 alpha-2, e.g. 'IN'
}

// Today identical to AddressInput. Kept as a separate alias so future
// stored-side fields (normalized pincode, geocoded lat/lng) can be added
// without renaming call sites.
export type Address = AddressInput;

export interface DimensionsCm {
    length: number;
    width: number;
    height: number;
}

export interface ParcelInput {
    weightGrams: number;
    dimensionsCm: DimensionsCm;
    declaredValuePaise: number;     // smallest unit, matches existing repo convention
    contents: string;
    invoiceNumber?: string;
    isCod: boolean;
    codAmountPaise: number;         // 0 when isCod === false
}
