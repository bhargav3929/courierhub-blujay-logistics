// Tiny sessionStorage broker used to hand a label's extracted fields off
// from the chatbot to the existing /add-shipment page. We avoid stuffing
// the data into the URL because (a) addresses can be long and (b) putting
// customer details in query strings shows up in server logs.
//
// The chatbot stashes, navigates to /add-shipment?prefillKey=<key>, and
// the add-shipment page reads + deletes the entry on mount.

import type { ExtractedShipmentLabel } from '@/types/labelExtraction';

const PREFIX = 'blujay.shipmentPrefill.';
const TTL_MS = 10 * 60 * 1000; // 10 minutes — plenty of time for the user to land on the page

export interface ShipmentPrefill {
    /** Map onto the add-shipment `delivery` state shape directly. */
    delivery: {
        name: string;
        phone: string;
        pincode: string;
        address: string;
        city: string;
        state: string;
        country: 'India';
    };
    orderId: string;
    /** Optional metadata stamped on the shipment for traceability. */
    source: 'chatbot_label_capture';
    capturedAt: number;
}

function newKey(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Build a ShipmentPrefill from the LLM-extracted label fields. */
export function buildPrefill(extracted: ExtractedShipmentLabel): ShipmentPrefill {
    return {
        delivery: {
            name: extracted.customerName,
            phone: extracted.phone,
            pincode: extracted.pincode,
            address: extracted.address,
            city: extracted.city,
            state: extracted.state,
            country: 'India',
        },
        orderId: extracted.orderId,
        source: 'chatbot_label_capture',
        capturedAt: Date.now(),
    };
}

/** Stash the prefill and return the lookup key. SSR-safe (returns '' server-side). */
export function stashPrefill(prefill: ShipmentPrefill): string {
    if (typeof window === 'undefined') return '';
    try {
        const key = newKey();
        window.sessionStorage.setItem(PREFIX + key, JSON.stringify(prefill));
        return key;
    } catch (err) {
        console.error('[shipmentPrefillStash] stash failed:', err);
        return '';
    }
}

/** Read + delete a prefill by key. Returns null if missing, malformed, or expired. */
export function consumePrefill(key: string): ShipmentPrefill | null {
    if (typeof window === 'undefined' || !key) return null;
    try {
        const raw = window.sessionStorage.getItem(PREFIX + key);
        if (!raw) return null;
        window.sessionStorage.removeItem(PREFIX + key);
        const parsed = JSON.parse(raw) as ShipmentPrefill;
        if (!parsed || typeof parsed !== 'object' || !parsed.delivery) return null;
        if (Date.now() - (parsed.capturedAt || 0) > TTL_MS) return null;
        return parsed;
    } catch (err) {
        console.error('[shipmentPrefillStash] consume failed:', err);
        return null;
    }
}
