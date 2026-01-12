// TypeScript interfaces for Firebase data models

import { Timestamp } from 'firebase/firestore';

/**
 * Unified User Role Type
 * Covers all user types in the system: admins and clients
 */
export type UserRole = 'admin' | 'super_admin' | 'franchise' | 'shopify';

/**
 * Role hierarchy and permissions
 * - super_admin: Full system access
 * - admin: Admin dashboard access
 * - franchise: Franchise partner client access
 * - shopify: Shopify merchant client access
 */
export const isAdminRole = (role: UserRole): boolean => {
    return role === 'admin' || role === 'super_admin';
};

export const isClientRole = (role: UserRole): boolean => {
    return role === 'franchise' || role === 'shopify';
};

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
}

// Client Interface (Franchise Partners & Shopify Merchants)
export interface Client {
    id: string;
    name: string;
    email: string;
    phone: string;
    type: 'franchise' | 'shopify';
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
}

// Shipment Interface
export interface Shipment {
    id: string;
    clientId: string;
    clientName: string;
    clientType: 'franchise' | 'shopify';

    // Shipment details
    courier: string;
    courierTrackingId?: string;
    status: 'pending' | 'transit' | 'delivered' | 'cancelled';

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

    // ========== API Response Fields ==========
    awbNo?: string;                 // Generated AWB Number
    blueDartStatus?: string;        // Status returned by Blue Dart API
    tokenNumber?: string;           // Pickup Token Number
    destinationArea?: string;       // Destination Area Code
    destinationLocation?: string;   // Destination Location Code
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
    type: 'franchise' | 'shopify';
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

// Filter types for queries
export interface ShipmentFilters {
    clientId?: string;
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
}
