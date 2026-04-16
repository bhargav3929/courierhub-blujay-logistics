/**
 * Client-side helper for calling /api/integrations/courier/* routes.
 * Never sends credentials anywhere except our own API route — which then
 * encrypts them server-side before hitting Firestore.
 */

import { getAuth } from 'firebase/auth';
import type { CourierId } from '@/types/types';

export interface ListedIntegration {
    courierId: CourierId;
    status: 'connected' | 'error';
    connectedAt: number | null;
    lastTestedAt?: number | null;
    lastErrorMessage?: string;
    publicMeta?: {
        label?: string;
        environment?: 'sandbox' | 'production';
        accountIdentifier?: string;
    };
}

async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const user = getAuth().currentUser;
    if (!user) throw new Error('You must be logged in.');
    const token = await user.getIdToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');
    return fetch(input, { ...init, headers });
}

export async function listCourierIntegrations(): Promise<ListedIntegration[]> {
    const res = await authedFetch('/api/integrations/courier/list');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load courier integrations');
    return (json.integrations || []) as ListedIntegration[];
}

export async function connectCourier(
    courierId: CourierId,
    credentials: Record<string, string>
): Promise<{ integration: any; warnings?: string[] }> {
    const res = await authedFetch('/api/integrations/courier/connect', {
        method: 'POST',
        body: JSON.stringify({ courierId, credentials }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Could not connect courier');
    }
    return { integration: json.integration, warnings: json.integration?.warnings };
}

export async function disconnectCourier(courierId: CourierId): Promise<void> {
    const res = await authedFetch('/api/integrations/courier/disconnect', {
        method: 'POST',
        body: JSON.stringify({ courierId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to disconnect courier');
}

export async function testCourierConnection(
    courierId: CourierId
): Promise<{ ok: boolean; error?: string; accountIdentifier?: string; warnings?: string[] }> {
    const res = await authedFetch('/api/integrations/courier/test', {
        method: 'POST',
        body: JSON.stringify({ courierId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to test connection');
    return json;
}
