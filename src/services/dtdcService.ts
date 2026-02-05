import axios from 'axios';

// Interfaces
interface DTDCConfig {
    apiKey: string;
    customerCode: string;
    isProduction: boolean;
}

interface DTDCOrderPayload {
    customer_code: string;
    service_type_id: string;
    load_type: string;
    description: string;
    dimension_unit: string;
    length: string;
    width: string;
    height: string;
    weight_unit: string;
    weight: string;
    declared_value: string;
    num_pieces: string;
    origin_details: {
        name: string;
        phone: string;
        alternate_phone?: string;
        address_line_1: string;
        address_line_2?: string;
        pincode: string;
        city: string;
        state: string;
    };
    destination_details: {
        name: string;
        phone: string;
        alternate_phone?: string;
        address_line_1: string;
        address_line_2?: string;
        pincode: string;
        city: string;
        state: string;
    };
    return_details?: {
        name: string;
        phone: string;
        alternate_phone?: string;
        address_line_1: string;
        address_line_2?: string;
        pincode: string;
        city_name: string;
        state_name: string;
        email?: string;
    };
    customer_reference_number: string;
    cod_collection_mode?: string;
    cod_amount?: string;
    commodity_id: string;
    eway_bill?: string;
    is_risk_surcharge_applicable: string;
    invoice_number?: string;
    invoice_date?: string;
    reference_number?: string;
}

// Service Class
class DTDCService {
    private config: DTDCConfig;

    constructor(config: DTDCConfig) {
        this.config = config;
    }

    /**
     * createOrder
     * Upload consignment to DTDC via Shipsy platform
     * Calls Next.js API route to protect API key and avoid CORS
     */
    public async createOrder(orderData: DTDCOrderPayload) {
        try {
            console.log('Creating DTDC order...');
            const response = await axios.post('/api/dtdc/create-order', orderData);
            return response.data;
        } catch (error) {
            console.error('DTDC order creation failed:', error);
            throw error;
        }
    }

    /**
     * cancelShipment
     * Cancel consignment via Shipsy platform
     */
    public async cancelShipment(awbNumber: string) {
        try {
            console.log(`Cancelling DTDC shipment ${awbNumber}...`);
            const response = await axios.post('/api/dtdc/cancel-shipment', {
                awb: awbNumber
            });
            return response.data;
        } catch (error) {
            console.error('DTDC cancellation failed:', error);
            throw error;
        }
    }

    /**
     * trackShipment
     * Track via DTDC's own tracking system (separate from Shipsy)
     * Calls Next.js API route (tracking auth is handled server-side)
     */
    public async trackShipment(awbNumber: string) {
        try {
            console.log(`Tracking DTDC shipment ${awbNumber}...`);
            const response = await axios.get(`/api/dtdc/track-shipment?awb=${awbNumber}`);
            return response.data;
        } catch (error) {
            console.error('DTDC tracking failed:', error);
            throw error;
        }
    }

    /**
     * getShippingLabel
     * Get label as PDF or Base64 via Shipsy platform
     */
    public async getShippingLabel(
        referenceNumber: string,
        labelCode: string = 'SHIP_LABEL_4X6',
        labelFormat: string = 'pdf'
    ) {
        try {
            console.log(`Fetching DTDC label for ${referenceNumber}...`);
            const response = await axios.get('/api/dtdc/shipping-label', {
                params: { referenceNumber, labelCode, labelFormat },
                responseType: labelFormat === 'pdf' ? 'blob' : 'json'
            });
            return response.data;
        } catch (error) {
            console.error('DTDC label fetch failed:', error);
            throw error;
        }
    }
}

// Export singleton (mirroring blueDartService pattern)
export const createDTDCService = () => {
    const config: DTDCConfig = {
        apiKey: process.env.NEXT_PUBLIC_DTDC_API_KEY || '',
        customerCode: process.env.NEXT_PUBLIC_DTDC_CUSTOMER_CODE || '',
        isProduction: (process.env.NEXT_PUBLIC_DTDC_ENV || '').toLowerCase() === 'production',
    };
    return new DTDCService(config);
};

export const dtdcService = createDTDCService();
