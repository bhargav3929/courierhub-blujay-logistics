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
    };
    destination: {
        city: string;
        state?: string;
        pincode: string;
        address?: string;
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
