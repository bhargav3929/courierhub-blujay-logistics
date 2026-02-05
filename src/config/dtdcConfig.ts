// DTDC Pre-defined Configuration
// These values will be auto-filled in shipments

export const DTDC_PREDEFINED = {
    // Customer Code - From Environment Variables
    customerCode: process.env.NEXT_PUBLIC_DTDC_CUSTOMER_CODE || '',

    // Service Configuration
    serviceTypeId: 'B2C SMART EXPRESS',  // Default service type
    loadType: 'NON-DOCUMENT',            // NON-DOCUMENT or DOCUMENT

    // Shipper Details - Same physical location as BlueDart
    shipperName: "ROAST AND KRUNCH CAFE",
    pickupAddress1: "CAPITAL PARK MADHAPUR HYD",
    pickupPincode: "500081",
    pickupCity: "Hyderabad",
    pickupState: "Telangana",
    senderMobile: "9876543210",

    // Commodity defaults
    commodityId: '1',     // General commodity

    // Default Package Settings
    defaultPieceCount: '1',
    defaultWeight: '0.5',
    defaultDeclaredValue: '200',
    dimensionUnit: 'cm',
    weightUnit: 'kg',

    // Label Configuration
    defaultLabelCode: 'SHIP_LABEL_4X6',
    defaultLabelFormat: 'pdf',

    // Risk surcharge
    isRiskSurchargeApplicable: 'false',
};

// DTDC API Environment Configuration
const IS_PRODUCTION = (process.env.NEXT_PUBLIC_DTDC_ENV || '').toLowerCase() === 'production';

export const DTDC_API_CONFIG = {
    // Shipsy Platform (Order Upload, Cancel, Label)
    shipsyBaseUrl: IS_PRODUCTION
        ? 'https://dtdcapi.shipsy.io'
        : 'https://alphademodashboardapi.shipsy.io',

    // DTDC Tracking System (separate from Shipsy)
    trackingBaseUrl: 'https://blktracksvc.dtdc.com/dtdc-api',

    isProduction: IS_PRODUCTION,
};
