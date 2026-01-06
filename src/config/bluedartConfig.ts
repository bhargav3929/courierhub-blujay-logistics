// BlueDart Pre-defined Configuration
// These values will be auto-filled in shipments and Excel exports

export const BLUEDART_PREDEFINED = {
    // Billing & Pickup Location
    billingArea: "HYD",
    billingCustomerCode: "101183",

    // Shipper Details
    shipperName: "RK",
    pickupAddress: "CAPITAL PARK MADHAPUR HYD",
    pickupPincode: "500081",
    senderName: "RK",
    senderMobile: "9381816882",

    // Product Configuration
    productCode: "D",           // D = Domestic
    productType: "NDOX",        // NDOX = Non-Document Express

    // Default Times
    pickupTime: "2000",         // 8:00 PM in 24hr format
    officeClosureTime: "2100",  // 9:00 PM

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
