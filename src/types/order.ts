// Order data model — separate file from types.ts so the existing shipment
// model is untouched. Orders are eCommerce-side records; shipments are
// fulfilment-side records. An order may eventually point at a shipment
// via `shipment.shipmentId` once Phase 4+ wires Shiprocket in.
import { Timestamp } from 'firebase/firestore';

export type PaymentProvider = 'razorpay' | 'cod';

export type PaymentStatus =
    | 'pending'         // order created, no payment attempted yet
    | 'authorized'      // razorpay authorized but not captured (rare)
    | 'paid'            // payment captured / COD ready to ship
    | 'failed'          // last payment attempt failed
    | 'refunded'
    | 'partial_refund';

export type OrderAutomationStage =
    | 'order_created'
    | 'awaiting_payment'
    | 'payment_received'
    | 'shipment_pending'
    | 'shipment_created'
    | 'in_transit'
    | 'delivered'
    | 'cancelled'
    | 'failed';

export interface OrderAddress {
    name: string;
    phone: string;
    email?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;        // 6-digit Indian PIN
    country: string;        // ISO-3166 alpha-2 or human label, sender's choice
}

export interface OrderItem {
    sku?: string;
    name: string;
    quantity: number;
    unitPrice: number;      // PAISE (smallest unit). 100 = ₹1.
    weight?: number;        // grams
    hsn?: string;
}

export interface OrderPayment {
    provider: PaymentProvider;
    providerOrderId?: string;       // razorpay order_id once /create-order runs
    providerPaymentId?: string;     // razorpay payment_id after capture
    status: PaymentStatus;
    amount: number;                 // PAISE — what the customer is charged online
    currency: string;               // 'INR'
    method?: string;                // card / upi / netbanking — surfaced post-payment
    paidAt?: Timestamp;
    failureReason?: string;
    attempts: number;
}

export interface OrderShipmentRef {
    shipmentId?: string;            // FK to existing `shipments` collection (when Phase 4+ links)
    provider?: 'bluedart' | 'delhivery' | 'dtdc' | 'shiprocket';
    providerOrderId?: string;       // shiprocket order_id (Shiprocket's internal numeric/string id)
    providerShipmentId?: string;    // shiprocket shipment_id (separate from order_id; needed for AWB / label calls)
    courierId?: number;             // shiprocket courier_company_id once assigned
    courierName?: string;
    awb?: string;
    labelUrl?: string;
    invoiceUrl?: string;            // optional invoice/manifest PDF
    trackingUrl?: string;
    status?: string;                // human-readable carrier status
    statusCode?: number;            // shiprocket numeric status code
    lastSyncedAt?: Timestamp;
    cancelledAt?: Timestamp;
}

export interface OrderAutomationHistoryEntry {
    stage: OrderAutomationStage;
    at: Timestamp;
    note?: string;
}

export interface OrderAutomation {
    stage: OrderAutomationStage;
    attempts: number;
    lastError?: string;
    nextRetryAt?: Timestamp;
    history: OrderAutomationHistoryEntry[];
}

export interface Order {
    id: string;
    clientId: string;                       // Blujay tenant (uid) that owns this order
    externalOrderId?: string | null;        // optional caller-supplied idempotency key (e.g. storefront's order ID)
    customer: {
        name: string;
        phone: string;
        email?: string;
    };
    shippingAddress: OrderAddress;
    billingAddress?: OrderAddress;
    items: OrderItem[];
    amounts: {
        subtotal: number;       // PAISE
        shipping: number;
        tax: number;
        discount: number;
        total: number;          // PAISE — Razorpay is charged this for prepaid
        codCollect?: number;    // PAISE — what courier collects on delivery (COD)
    };
    payment: OrderPayment;
    shipment?: OrderShipmentRef;
    automation: OrderAutomation;
    metadata?: Record<string, string>;
    notes?: string | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// Input shape for POST /api/orders/create — narrower than Order itself.
export interface CreateOrderInput {
    externalOrderId?: string;
    customer: { name: string; phone: string; email?: string };
    shippingAddress: OrderAddress;
    billingAddress?: OrderAddress;
    items: OrderItem[];
    amounts: {
        subtotal: number;
        shipping?: number;
        tax?: number;
        discount?: number;
        total: number;
        codCollect?: number;
    };
    payment: { provider: PaymentProvider; currency?: string };
    metadata?: Record<string, string>;
    notes?: string;
}
