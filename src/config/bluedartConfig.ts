// BlueDart Pre-defined Configuration
// These values will be auto-filled in shipments and Excel exports

// Service Types available for Blue Dart
export const BLUEDART_SERVICE_TYPES = {
    STANDARD: {
        code: 'D',
        name: 'Standard',
        displayName: 'Blue Dart Standard',
        description: 'Ground express delivery (2-5 days)',
    },
    AIR: {
        code: 'A',
        name: 'Air',
        displayName: 'Blue Dart Air Express',
        description: 'Air express delivery (1-2 days)',
    },
    PLUS: {
        code: 'E',
        name: 'Plus',
        displayName: 'Blue Dart Plus',
        description: 'Priority express delivery with extra care',
    },
} as const;

export type BlueDartServiceType = keyof typeof BLUEDART_SERVICE_TYPES;

export const BLUEDART_PREDEFINED = {
    // Billing & Pickup Location - From Environment Variables
    billingArea: process.env.NEXT_PUBLIC_BLUEDART_AREA || "HYD",
    billingCustomerCode: process.env.NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE || "101183",

    // Shipper Details - Hardcoded default can be overridden or updated to env
    shipperName: "ROAST AND KRUNCH CAFE", // Updated to match Customer Name
    pickupAddress: "CAPITAL PARK MADHAPUR HYD",
    pickupPincode: "500081", // Updated to match Customer Pincode
    senderName: "ROAST AND KRUNCH CAFE",
    senderMobile: "9876543210", // Should ideally be dynamic

    // Product Configuration
    productCode: "D",           // D = Domestic
    productType: "NDOX",        // NDOX = Non-Document Express

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
