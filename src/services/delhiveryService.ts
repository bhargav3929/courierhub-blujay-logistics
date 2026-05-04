import axios from 'axios';

// Shape of one Delhivery shipment row in the order-creation payload. Only the
// fields we actually populate are typed — Delhivery accepts more (return_*,
// seller_*, etc.) but we keep the surface small.
export interface DelhiveryShipmentRow {
    name: string;
    add: string;
    pin: number | string;
    city: string;
    state: string;
    country: string;
    phone: string;
    order: string;
    payment_mode: 'Prepaid' | 'COD' | 'Pickup';
    products_desc: string;
    hsn_code?: string;
    cod_amount?: number;
    order_date?: string;
    total_amount?: number;
    seller_add?: string;
    seller_name?: string;
    seller_inv?: string;
    quantity?: number;
    waybill?: string;
    shipment_width?: number;
    shipment_height?: number;
    shipment_length?: number;
    weight?: number;          // grams per Delhivery convention
    shipping_mode?: 'Surface' | 'Express';
    address_type?: 'home' | 'office';
}

export interface DelhiveryPickupLocation {
    name: string;             // Must match a warehouse registered with Delhivery
    add: string;
    city: string;
    pin_code: string | number;
    country: string;
    phone: string;
}

export interface DelhiveryCreateOrderPayload {
    shipments: DelhiveryShipmentRow[];
    pickup_location: DelhiveryPickupLocation;
}

class DelhiveryService {
    /** Logged-in client id — when set, the API route will use that client's
     *  stored Delhivery creds instead of the platform-wide env vars. */
    public clientId: string | undefined;

    public setClientId(id: string | undefined) {
        this.clientId = id || undefined;
    }

    public async createOrder(payload: DelhiveryCreateOrderPayload) {
        try {
            const body: any = { ...payload };
            if (this.clientId) body.__clientId = this.clientId;
            const response = await axios.post('/api/delhivery/create-order', body);
            return response.data;
        } catch (error) {
            console.error('Delhivery order creation failed:', error);
            throw error;
        }
    }

    public async trackShipment(awbNumber: string) {
        try {
            const params = new URLSearchParams({ waybill: awbNumber });
            if (this.clientId) params.set('clientId', this.clientId);
            const response = await axios.get(`/api/delhivery/track-shipment?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Delhivery tracking failed:', error);
            throw error;
        }
    }

    public async cancelShipment(awbNumber: string) {
        try {
            const response = await axios.post('/api/delhivery/cancel-shipment', {
                waybill: awbNumber,
                ...(this.clientId ? { clientId: this.clientId } : {}),
            });
            return response.data;
        } catch (error) {
            console.error('Delhivery cancellation failed:', error);
            throw error;
        }
    }

    public async getShippingLabel(awbNumber: string) {
        try {
            const params = new URLSearchParams({ waybill: awbNumber });
            if (this.clientId) params.set('clientId', this.clientId);
            const response = await axios.get(`/api/delhivery/shipping-label?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Delhivery label fetch failed:', error);
            throw error;
        }
    }
}

export const delhiveryService = new DelhiveryService();
