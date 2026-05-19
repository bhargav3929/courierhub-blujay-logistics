import type { CourierAdapter } from '@/types/b2b/courier-adapter';
import type { CourierCode } from '@/types/b2b/shipment';
import type { CourierWebhookHandler } from './CourierWebhookHandler';

// Two registries, one per role:
//   - Webhook handlers: looked up by the carrier-webhook HTTP route
//   - Adapters:          looked up by the polling worker + booking saga
//
// A single carrier (BlueDart, etc.) typically registers both: the adapter
// is constructed first, then a webhook handler that wraps it.
//
// Concrete handlers register on import of `./register`. Call sites use
// `getCourier(Webhook)Handler` / `getCourierAdapter`.

const HANDLERS = new Map<CourierCode, CourierWebhookHandler>();
const ADAPTERS = new Map<CourierCode, CourierAdapter>();

// ─── Webhook handler registry ───────────────────────────────────────────

export function registerCourierWebhookHandler(handler: CourierWebhookHandler): void {
    if (HANDLERS.has(handler.courier)) {
        throw new Error(`Webhook handler for '${handler.courier}' is already registered`);
    }
    HANDLERS.set(handler.courier, handler);
}

export function getCourierWebhookHandler(code: CourierCode): CourierWebhookHandler | null {
    return HANDLERS.get(code) ?? null;
}

// ─── Adapter registry ───────────────────────────────────────────────────

export function registerCourierAdapter(adapter: CourierAdapter): void {
    if (ADAPTERS.has(adapter.courier)) {
        throw new Error(`Adapter for '${adapter.courier}' is already registered`);
    }
    ADAPTERS.set(adapter.courier, adapter);
}

export function getCourierAdapter(code: CourierCode): CourierAdapter | null {
    return ADAPTERS.get(code) ?? null;
}

export function listRegisteredAdapters(): readonly CourierAdapter[] {
    return Array.from(ADAPTERS.values());
}

// ─── Test helpers ───────────────────────────────────────────────────────

export function _resetCourierWebhookRegistry(): void {
    HANDLERS.clear();
}
export function _resetCourierAdapterRegistry(): void {
    ADAPTERS.clear();
}

export type { CourierWebhookHandler, SignatureCheck } from './CourierWebhookHandler';
