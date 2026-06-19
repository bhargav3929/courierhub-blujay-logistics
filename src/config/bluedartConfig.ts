// BlueDart Pre-defined Configuration
// These values will be auto-filled in shipments and Excel exports

// Service Types available for Blue Dart
export const BLUEDART_SERVICE_TYPES = {
    PRIORITY: {
        code: 'D',
        name: 'Domestic Priority',
        displayName: 'Domestic Priority',
        description: 'Premium next-day air express',
        b2bOnly: true,
        packType: '',
    },
    APEX: {
        code: 'A',
        name: 'Dart Apex',
        displayName: 'Blue Dart Air',
        description: '',
        b2bOnly: false,
        packType: '',
    },
    BHARAT_DART: {
        code: 'A',
        name: 'Bharat Dart',
        displayName: 'Blue Dart Surface',
        description: '',
        b2bOnly: false,
        packType: 'L',
    },
    SURFACE: {
        code: 'E',
        name: 'Dart Surfaceline',
        displayName: 'Dart Surfaceline',
        description: 'Economical ground delivery (3-7 days)',
        b2bOnly: true,
        packType: '',
    },
} as const;

export type BlueDartServiceType = keyof typeof BLUEDART_SERVICE_TYPES;

// Pack Type selection (mandatory when booking with Blue Dart).
// The `value` is sent to Blue Dart in the Services.PackType field; the
// `label` is what the user sees in the dropdown.
export const BLUEDART_PACK_TYPES = [
    { value: 'N', label: 'N-12:30' },
    { value: 'T', label: 'T-10:30' },
    { value: 'C', label: 'C-critical' },
] as const;

export type BlueDartPackType = typeof BLUEDART_PACK_TYPES[number]['value'];

export const BLUEDART_PREDEFINED = {
    // Billing & Pickup Location - From Environment Variables
    // Codes are .trim()'d — a stray newline/space in an env var produces an
    // invalid code and Blue Dart rejects it with "UnauthorizedUser".
    billingArea: (process.env.NEXT_PUBLIC_BLUEDART_AREA || "HYD").trim(),
    billingCustomerCode: (process.env.NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE || "302282").trim(),
    billingCustomerCodeB2B: (process.env.NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE_B2B || "101183").trim(),
    // Shopify clients ship under a separate Blue Dart contract — same account,
    // dedicated customer code. Falls back to the generic B2C code if unset.
    billingCustomerCodeShopify: (
        process.env.NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE_SHOPIFY ||
        process.env.NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE ||
        "302282"
    ).trim(),

    // Shipper Details - Hardcoded default can be overridden or updated to env
    shipperName: "ROAST AND KRUNCH CAFE", // Updated to match Customer Name
    pickupAddress: "CAPITAL PARK MADHAPUR HYD",
    pickupPincode: "500081", // Updated to match Customer Pincode
    senderName: "ROAST AND KRUNCH CAFE",
    senderMobile: "9876543210", // Should ideally be dynamic

    // Product Configuration
    productCode: "A",           // A = Dart Apex (default, B2C eTail)
    productType: "NDOX",        // NDOX = Non-Document (Dutiables) — API value: 1

    // Default Times
    pickupTime: "1600",         // 4:00 PM (Safest default)
    officeClosureTime: "1800",  // 6:00 PM

    // Default Package Settings
    defaultPieceCount: 1,
    defaultWeight: 0.5,
    defaultDeclaredValue: 200,
};

// Excel column headers matching BlueDart format exactly
export const BLUEDART_EXCEL_COLUMNS = [
    'Reference No *',
    'Billing Area *',
    'Billing Customer Code',
    'Pickup Date *',
    'Pickup Time',
    'Shipper Name',
    'Pickup address *',
    'Pickup pincode *',
    'Company Name *',
    'Delivery address *',
    'Delivery Pincode *',
    'Product Code *',
    'Product Type *',
    'Pack Type',
    'Piece Count *',
    'Actual Weight *',
    'Declared Value',
    'Register Pickup',
    'Length',
    'Breadth',
    'Height',
    'To Pay Customer',
    'Sender',
    'Sender mobile',
    'Receiver Telephone',
    'Receiver mobile',
    'Receiver Name',
    'Special Instruction',
    'Commodity Detail 1',
    'Commodity Detail 2',
    'Commodity Detail 3',
    'Reference No 2',
    'Reference No 3',
    'OTP Based Delivery',
    'Office Closure time',
    'AWB No',
    'Status',
    'Message',
    'Cluster Code',
    'Destination Area',
    'Destination Location',
    'Pick Up Token No',
    'Response pick up date',
    'Transaction Amount',
    'Wallet Balance',
    'Available Booking Amount',
];
