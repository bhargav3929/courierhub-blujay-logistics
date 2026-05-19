// TypeScript interfaces for Firebase data models

import { Timestamp } from 'firebase/firestore';

/**
 * Unified User Role Type
 * Covers all user types in the system: admins and clients
 */
export type UserRole = 'admin' | 'super_admin' | 'franchise' | 'shopify' | 'white_label';

/**
 * Role hierarchy and permissions
 * - super_admin: Full system access
 * - admin: Admin dashboard access
 * - franchise: Franchise partner client access
 * - shopify: Shopify merchant client access
 * - white_label: White-label tenant client access (customized branding)
 */
export const isAdminRole = (role: UserRole): boolean => {
    return role === 'admin' || role === 'super_admin';
};

export const isClientRole = (role: UserRole): boolean => {
    return role === 'franchise' || role === 'shopify' || role === 'white_label';
};

// Sub-account hierarchy type
export type UserType = 'primary' | 'sub_user';

// User (Admin) Interface
export interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole; // Updated to use unified type
    phone?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    lastLogin?: Timestamp;
    isActive: boolean;
    // Optional: Link to client record if this is a client user
    clientId?: string;
    shopifyConfig?: {
        shopUrl: string;
        accessToken: string;
        isConnected: boolean;
        updatedAt: string;
        scopes?: string;
        webhookStatus?: 'active' | 'failed';
        webhookError?: string;
    };
    // Dedicated Shopify app assignment (set by admin for clients with custom apps)
    dedicatedShopifyApp?: 'looms' | 'gayatri';
    // Sub-account hierarchy
    userType?: UserType;  // 'primary' (default) or 'sub_user'
    parentId?: string;    // Only set for sub_users - franchisee owner's ID
}

// White Label Tenant Configuration
// Captured via the white-label onboarding flow on first login.
export interface WhiteLabelConfig {
    brandName: string;
    logoUrl: string;
    // Return / pickup address used when generating courier labels for this tenant
    returnAddress: {
        line1: string;
        city: string;
        state: string;
        pincode: string;
    };
    senderMobile: string;      // 10-digit mobile number used on labels
    supportEmail: string;      // Displayed in client-facing support/contact areas
    supportPhone: string;      // Displayed in client-facing support/contact areas
    onboardingComplete: boolean; // false until the tenant completes setup
}

// --- Courier Integration (per-client) ---------------------------------------
// Couriers we know how to integrate with — keep identifiers stable; they're the
// Firestore keys and also stamped onto Shipment.courier strings.
export type CourierId =
    | 'bluedart'
    | 'dtdc'
    | 'delhivery'
    | 'ecom_express'
    | 'xpressbees';

export type CourierIntegrationStatus = 'connected' | 'error';

// Stored inside `Client.courierIntegrations[courierId]`.
// `credentials` is an AES-256-CBC encrypted JSON blob (shape is per-courier).
export interface CourierIntegration {
    courierId: CourierId;
    status: CourierIntegrationStatus;
    credentials: string;              // encrypted JSON
    connectedAt: Timestamp;
    updatedAt: Timestamp;
    lastTestedAt?: Timestamp;
    lastErrorMessage?: string;
    // Optional public metadata safe to expose to the frontend without decrypting
    publicMeta?: {
        label?: string;               // e.g. "Blue Dart - CC 302282"
        environment?: 'sandbox' | 'production';
        accountIdentifier?: string;   // customer code, client name, etc. — the "which account" display string
    };
}

// Client Interface (Franchise Partners, Shopify Merchants, White Label Tenants)
export interface Client {
    id: string;
    name: string;
    email: string;
    phone: string;
    type: 'franchise' | 'shopify' | 'white_label';
    status: 'active' | 'inactive';
    marginType: 'flat' | 'percentage';
    marginValue: number; // In rupees if flat, or percentage if percentage
    allowedCouriers: string[]; // Array of courier IDs/names
    walletBalance: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    // Optional Shopify-specific fields
    shopifyStoreUrl?: string;
    shopifyAccessToken?: string;
    // Optional White Label-specific fields
    whiteLabelConfig?: WhiteLabelConfig;
    // Courier integrations — map keyed by CourierId. Credentials blob is encrypted.
    courierIntegrations?: Partial<Record<CourierId, CourierIntegration>>;
    // Sub-account hierarchy
    userType?: UserType;  // 'primary' (default) or 'sub_user'
    parentId?: string;    // Only set for sub_users - parent client's ID
}

// Product within a shipment (supports multiple products per order)
export interface ShipmentProduct {
    sku: string;
    name: string;           // commodity/product description
    quantity: number;
    price: number;          // declared value per unit (₹)
    variantTitle?: string;
}

// Shipment Interface
export interface Shipment {
    id: string;
    clientId: string;
    clientName: string;
    clientType: 'franchise' | 'shopify' | 'white_label';

    // Shipment details
    courier: string;
    courierTrackingId?: string;
    status: 'pending' | 'transit' | 'delivered' | 'cancelled' | 'shopify_pending' | 'webhook_pending' | 'declined';

    // ========== Merchant webhook source (Phase 10/11) ==========
    // Set only on shipments created via POST /api/integrations/orders/webhook.
    // Lets the Shipments UI distinguish webhook-sourced orders from
    // platform/Shopify-sourced ones.
    webhookSource?: 'merchant_api';
    webhookExternalOrderId?: string;     // merchant's own order id (idempotency key)
    webhookApiKeyId?: string;            // which API key authored this order
    shopifyOrderId?: string;
    shopifyOrderNumber?: string;
    shopifyFulfillmentId?: string;
    shopifyFulfillmentStatus?: 'pending' | 'fulfilled' | 'failed';
    shopifyFulfillmentSyncedAt?: string;
    shopifyFulfillmentError?: string;
    shopifyLineItems?: Array<{
        sku: string;
        title: string;
        quantity: number;
        price?: string;
        variant_title?: string;
    }>;
    shopifyOrderDate?: string; // ISO date from order.created_at
    products?: ShipmentProduct[]; // Multiple products per order

    // Ad Commission / COD Margin (order-level)
    adCommissionType?: 'flat' | 'percentage';
    adCommissionValue?: number;

    // Origin and Destination
    origin: {
        city: string;
        state?: string;
        pincode: string;
        address?: string;
        phone?: string;
        name?: string;
    };
    destination: {
        city: string;
        state?: string;
        pincode: string;
        address?: string;
        phone?: string;
        name?: string;
    };

    // Package details
    weight: number; // in kg
    dimensions?: {
        length: number;
        width: number;
        height: number;
    };

    // Financial
    courierCharge: number; // What courier charges
    chargedAmount: number; // What we charge client
    marginAmount: number; // Our profit

    // Timestamps
    createdAt: Timestamp;
    updatedAt: Timestamp;
    deliveredAt?: Timestamp;

    // Additional info
    notes?: string;
    expectedDeliveryDate?: string;     // ISO date — self-shipment optional input

    // Fulfillment / tracking mode — set by the booking handler. Drives UI
    // branches (e.g., simplified timeline for self-shipment).
    fulfillmentMode?: 'courier' | 'self_shipment' | 'pickup_only';
    trackingMode?: 'automatic' | 'manual' | 'hybrid';

    // Return shipment metadata
    shipmentType?: 'forward' | 'return';   // undefined = forward (backward compat)
    parentShipmentId?: string;              // links return to original forward shipment

    // ========== BlueDart Excel Export Fields ==========
    // Reference & Billing
    referenceNo?: string;           // Auto-generated ORDER-1, ORDER-2, etc.
    billingArea?: string;           // Pre-filled: "HYD"
    billingCustomerCode?: string;   // Pre-filled from config

    // Pickup Details
    pickupDate?: string;            // Format: M/D/YY
    pickupTime?: string;            // Format: 2000 (24hr)
    shipperName?: string;           // Pre-filled: "RK"
    pickupAddress?: string;         // Pre-filled: "CAPITAL PARK MADHAPUR HYD"
    pickupPincode?: string;         // Pre-filled: "500081"

    // Receiver Details
    companyName?: string;           // Receiver company name
    receiverName?: string;          // Receiver contact name
    receiverMobile?: string;        // Receiver mobile number
    receiverTelephone?: string;     // Receiver landline

    // Sender Details
    senderName?: string;            // Sender name
    senderMobile?: string;          // Sender mobile

    // Product Details
    productCode?: string;           // "D" for Domestic
    productType?: string;           // "NDOX" (Non-Document Express)
    packType?: string;              // Package type
    pieceCount?: number;            // Number of pieces
    actualWeight?: number;          // Actual weight in kg
    declaredValue?: number;         // Declared value in INR

    // Commodity Details
    commodityDetail1?: string;      // Commodity description 1
    commodityDetail2?: string;      // Commodity description 2
    commodityDetail3?: string;      // Commodity description 3

    // Additional References
    referenceNo2?: string;          // Reference No 2
    referenceNo3?: string;          // Reference No 3

    // Delivery Options
    registerPickup?: boolean;       // Register for pickup
    toPayCustomer?: boolean;        // To pay customer (COD)
    otpBasedDelivery?: boolean;     // OTP based delivery
    specialInstruction?: string;    // Special instructions
    officeClosureTime?: string;     // Office closure time format: 2100

    // ========== Tracking Status (auto-synced from courier API) ==========
    trackingStatus?: string;            // Normalized tracking status (see trackingStatusConfig.ts)
    lastTrackingLocation?: string;      // Last scanned location
    lastTrackingActivity?: string;      // Last scan activity/description
    lastTrackingTime?: string;          // Last scan timestamp (ISO string)
    trackingLastSyncedAt?: string;      // When tracking was last fetched (ISO string)

    // ========== API Response Fields ==========
    awbNo?: string;                 // Generated AWB Number
    blueDartStatus?: string;        // Status returned by Blue Dart API
    tokenNumber?: string;           // Pickup Token Number
    destinationArea?: string;       // Destination Area Code
    destinationLocation?: string;   // Destination Location Code

    // ========== Blue Dart Service Options ==========
    blueDartServiceType?: string;   // Service type: Standard, Air, Plus
    blueDartServiceCode?: string;   // Service code: D, A, E
    collectableAmount?: number;     // COD amount to collect

    // ========== DTDC-specific Fields ==========
    dtdcReferenceNumber?: string;           // AWB/reference from DTDC order upload
    dtdcCustomerReferenceNumber?: string;   // Our internal reference sent to DTDC
    dtdcServiceType?: string;               // Service type: B2C SMART EXPRESS, etc.
    dtdcLoadType?: string;                  // DOCUMENT or NON-DOCUMENT
    dtdcChargeableWeight?: number;          // Chargeable weight returned by DTDC
    dtdcStatus?: string;                    // Status from DTDC tracking
    dtdcCodAmount?: number;                 // COD amount if applicable
    dtdcCommodityId?: string;               // Commodity type ID
}

// Courier API Configuration
export interface CourierAPI {
    id: string;
    name: string;
    displayName: string;
    status: 'active' | 'inactive';
    isConnected: boolean;

    // API Credentials (should be encrypted in production)
    apiKey?: string;
    apiSecret?: string;
    apiEndpoint?: string;

    // Sync info
    lastSync?: Timestamp;

    // Settings
    color?: string; // For UI display
    logo?: string;

    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// Wallet Transaction
export interface WalletTransaction {
    id: string;
    clientId: string;
    type: 'credit' | 'debit';
    amount: number;
    balance: number; // Balance after transaction
    description: string;
    shipmentId?: string; // If related to a shipment
    createdAt: Timestamp;
}

// Dashboard Metrics (Calculated values)
export interface DashboardMetrics {
    totalShipments: number;
    totalRevenue: number;
    activeClients: number;
    deliveredThisMonth: number;
    deliveredPercentage: number;

    // Breakdowns
    franchiseClients: number;
    shopifyClients: number;
    whiteLabelClients: number;

    // Status breakdown
    shipmentsByStatus: {
        delivered: number;
        transit: number;
        pending: number;
        cancelled: number;
    };

    // Revenue breakdown
    revenueByType: {
        franchise: number;
        shopify: number;
        white_label: number;
    };
}

// Shipment Trend Data (for charts)
export interface ShipmentTrend {
    date: string; // YYYY-MM-DD or day name
    shipments: number;
    revenue: number;
}

// Top Client Data
export interface TopClient {
    clientId: string;
    name: string;
    type: 'franchise' | 'shopify' | 'white_label';
    shipments: number;
    revenue: number;
}

// Settings Interface
export interface Settings {
    id: string;
    key: string;
    value: any;
    updatedAt: Timestamp;
}

// Notification Preferences
export interface NotificationPreferences {
    emailNotifications: boolean;
    newClientAlerts: boolean;
    weeklyReports: boolean;
    shipmentUpdates: boolean;
}

// System Settings
export interface SystemSettings {
    automaticCourierAssignment: boolean;
    multiFactorAuth: boolean;
    maintenanceMode: boolean;
}

// Client Request (Self-Registration Application)
export interface ClientRequest {
    id: string;
    name: string;
    email: string;
    phone: string;
    companyName: string;
    type: 'franchise' | 'shopify' | 'white_label';
    status: 'pending' | 'accepted' | 'rejected';

    // Business details for admin review
    gstin?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;

    // Margin & courier preferences (admin sets these on acceptance, applicant can suggest)
    marginType?: 'flat' | 'percentage';
    marginValue?: number;
    allowedCouriers?: string[];

    // Optional notes from applicant
    message?: string;

    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// Filter types for queries
export interface ShipmentFilters {
    clientId?: string;
    clientIds?: string[];  // For fetching multiple clients' shipments (sub-accounts)
    status?: Shipment['status'];
    courier?: string;
    startDate?: Date;
    endDate?: Date;
    searchQuery?: string;
}

export interface ClientFilters {
    type?: Client['type'];
    status?: Client['status'];
    searchQuery?: string;
    parentId?: string;     // Filter sub-accounts by parent
    userType?: UserType;   // Filter by primary or sub_user
}

// Sub-account hierarchy helper functions
export const isPrimaryUser = (user: User | null | undefined): boolean =>
    user?.userType === 'primary' || !user?.userType;  // Backward compat: undefined = primary

export const isSubUser = (user: User | null | undefined): boolean =>
    user?.userType === 'sub_user';

export const canManageSubAccounts = (user: User | null | undefined): boolean =>
    (user?.role === 'franchise' || user?.role === 'white_label') && isPrimaryUser(user);

// True for white-label tenants that still need to complete onboarding
export const needsWhiteLabelOnboarding = (
    user: User | null | undefined,
    client: Client | null | undefined
): boolean => {
    if (!user || user.role !== 'white_label') return false;
    // Sub-users inherit parent's tenant config — they do NOT run onboarding
    if (user.userType === 'sub_user') return false;
    return !client?.whiteLabelConfig?.onboardingComplete;
};
