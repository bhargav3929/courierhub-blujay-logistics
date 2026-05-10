// Shiprocket client-side service.
// Mirrors the existing carrier-service pattern (one singleton-like object
// per courier) and forwards all calls to /api/shiprocket/* with the user's
// Firebase ID token.
import axios from 'axios';
import { getAuth } from 'firebase/auth';

async function bearerHeader(): Promise<{ Authorization: string }> {
    const u = getAuth().currentUser;
    if (!u) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${await u.getIdToken()}` };
}

export interface AvailableCourier {
    courierId: number;
    name: string;
    rate?: number;
    etd?: string;
    rating?: number;
    recommended: boolean;
}

export interface TrackingActivity {
    activity?: string;
    location?: string;
    date?: string;
    status?: string;
    sr_status?: string;
}

export const shiprocketService = {
    async createOrder(orderId: string) {
        const headers = await bearerHeader();
        const { data } = await axios.post(
            '/api/shiprocket/create-order',
            { orderId },
            { headers }
        );
        return data as {
            ok: boolean;
            shiprocketOrderId: string;
            shipmentId: string;
            alreadyCreated?: boolean;
        };
    },

    async checkServiceability(orderId: string) {
        const headers = await bearerHeader();
        const { data } = await axios.post(
            '/api/shiprocket/check-serviceability',
            { orderId },
            { headers }
        );
        return data as {
            ok: boolean;
            recommendedCourierId: number | null;
            couriers: AvailableCourier[];
        };
    },

    /**
     * Assign AWB. When `courierId` is omitted, the route auto-picks
     * Shiprocket's recommended courier for this route.
     */
    async assignAwb(orderId: string, courierId?: number) {
        const headers = await bearerHeader();
        const { data } = await axios.post(
            '/api/shiprocket/assign-awb',
            courierId ? { orderId, courierId } : { orderId },
            { headers }
        );
        return data as {
            ok: boolean;
            awb: string;
            courierId: number;
            courierName: string;
            alreadyAssigned?: boolean;
        };
    },

    async generateLabel(orderId: string) {
        const headers = await bearerHeader();
        const { data } = await axios.post(
            '/api/shiprocket/generate-label',
            { orderId },
            { headers }
        );
        return data as { ok: boolean; labelUrl: string; cached?: boolean };
    },

    async track(orderId: string) {
        const headers = await bearerHeader();
        const { data } = await axios.get('/api/shiprocket/track', {
            headers,
            params: { orderId },
        });
        return data as {
            ok: boolean;
            awb: string;
            status?: string;
            statusCode?: number;
            trackUrl?: string;
            edd?: string;
            activities: TrackingActivity[];
        };
    },

    async cancel(orderId: string) {
        const headers = await bearerHeader();
        const { data } = await axios.post(
            '/api/shiprocket/cancel',
            { orderId },
            { headers }
        );
        return data as { ok: boolean; alreadyCancelled?: boolean };
    },
};
