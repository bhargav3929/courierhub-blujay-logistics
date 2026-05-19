import type { LabelStatus } from './label';
import type {
    CourierCode,
    FulfillmentMode,
    ShipmentSource,
    ShipmentStatus,
    TrackingMode,
} from './shipment';

// Admin-side row shape — projected from a shipment doc for table display.
// Keeps the table query lean; non-displayed fields stay in the doc.

export interface AdminShipmentRow {
    readonly shipmentId: string;
    readonly partnerId: string;
    readonly clientId: string | null;
    readonly externalRef: string | null;
    readonly status: ShipmentStatus;
    readonly statusReason: string | null;
    readonly shipmentSource: ShipmentSource;
    readonly fulfillmentMode: FulfillmentMode;
    readonly trackingMode: TrackingMode;
    readonly courier: {
        readonly code: CourierCode | null;
        readonly awb: string | null;
        readonly serviceCode: string | null;
    };
    readonly label: {
        readonly status: LabelStatus | null;
        readonly attempts: number;
    };
    readonly reconciliation: {
        readonly awaiting: boolean;
        readonly attempts: number;
        readonly nextAttemptAt: Date | null;
    };
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly lastEventAt: Date | null;
}

// All filters are AND'd. Empty/undefined = no filter on that dimension.
// `awb` is exact-match (carriers issue these as opaque strings; partial
// matching is expensive and rarely useful).
export interface AdminShipmentFilters {
    readonly partnerId?: string;
    readonly clientId?: string;
    readonly status?: ShipmentStatus;
    readonly courier?: CourierCode;
    readonly fulfillmentMode?: FulfillmentMode;
    readonly trackingMode?: TrackingMode;
    readonly source?: ShipmentSource;
    readonly awb?: string;
    readonly externalRef?: string;
    readonly createdAfter?: Date;
    readonly createdBefore?: Date;
    // Operational flags — surface problem shipments first.
    readonly awaitingReconciliation?: boolean;
    readonly labelStatus?: LabelStatus;
}

export interface AdminShipmentPage {
    readonly rows: readonly AdminShipmentRow[];
    readonly nextCursor: string | null;
    readonly prevCursor: string | null;
    readonly totalEstimate: number | null;   // null if not computed
}

export interface ListAdminShipmentsInput {
    readonly filters: AdminShipmentFilters;
    readonly limit: number;
    readonly cursor?: string | null;          // last seen doc id; null = first page
    readonly direction?: 'next' | 'prev';
}
