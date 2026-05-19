// Single import-time wiring entry point for all carrier adapters and
// webhook handlers. Import this module exactly once from the application
// bootstrap (typically a Next.js instrumentation hook or the first route
// that needs carriers) before any code touches the registries.
//
//   import '@/services/b2b/couriers/register';
//
// After import, the registries in ./index.ts are populated:
//   - bluedart, delhivery, dtdc: adapter + webhook handler
//
// To add a new carrier:
//   1. Implement <Carrier>Adapter (CourierAdapter)
//   2. Implement <Carrier>WebhookHandler (CourierWebhookHandler)
//   3. Add one line below
//   4. Add the CourierCode to ALL_COURIER_CODES in types/b2b/shipment.ts

import type { CredentialsResolver } from '@/types/b2b/courier-adapter';
import type { ShipmentLookup } from '@/types/b2b/ports';
import { BlueDartAdapter } from './bluedart/BlueDartAdapter';
import { BlueDartWebhookHandler } from './bluedart/BlueDartWebhookHandler';
import { DelhiveryAdapter } from './delhivery/DelhiveryAdapter';
import { DelhiveryWebhookHandler } from './delhivery/DelhiveryWebhookHandler';
import { DTDCAdapter } from './dtdc/DTDCAdapter';
import { DTDCWebhookHandler } from './dtdc/DTDCWebhookHandler';
import {
    registerCourierAdapter,
    registerCourierWebhookHandler,
} from './index';

export interface RegisterCarriersInput {
    readonly credentials: CredentialsResolver;
    readonly shipmentLookup: ShipmentLookup;
}

// Idempotent: safe to call multiple times. Subsequent calls are no-ops
// (the underlying registry rejects duplicate registrations, which we
// catch and ignore here).
let registered = false;

export function registerCarriers(deps: RegisterCarriersInput): void {
    if (registered) return;
    registered = true;

    const bluedartAdapter = new BlueDartAdapter(deps.credentials);
    const delhiveryAdapter = new DelhiveryAdapter(deps.credentials);
    const dtdcAdapter = new DTDCAdapter(deps.credentials);

    registerCourierAdapter(bluedartAdapter);
    registerCourierAdapter(delhiveryAdapter);
    registerCourierAdapter(dtdcAdapter);

    registerCourierWebhookHandler(
        new BlueDartWebhookHandler(bluedartAdapter, deps.shipmentLookup, deps.credentials),
    );
    registerCourierWebhookHandler(
        new DelhiveryWebhookHandler(delhiveryAdapter, deps.shipmentLookup, deps.credentials),
    );
    registerCourierWebhookHandler(
        new DTDCWebhookHandler(dtdcAdapter, deps.shipmentLookup, deps.credentials),
    );
}

// Test helper. Resets the local "already registered" flag so tests can
// re-run registerCarriers() after clearing the registry.
export function _resetCarrierRegistration(): void {
    registered = false;
}
