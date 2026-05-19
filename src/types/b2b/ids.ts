// Branded ID types. Each is a `string` at runtime; at compile time, a
// PartnerId cannot be passed where a ShipmentId is expected. The repository
// layer relies on this to make cross-tenant access uncallable, not just
// rejected at runtime.

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type PartnerId = Brand<string, 'PartnerId'>;
export type ClientId = Brand<string, 'ClientId'>;
export type ShipmentId = Brand<string, 'ShipmentId'>;
export type EventId = Brand<string, 'EventId'>;
export type ApiKeyId = Brand<string, 'ApiKeyId'>;
export type UserId = Brand<string, 'UserId'>;

// Type-and-value pairing (declaration merging). Use the same identifier to
// construct a branded value from a raw string: `PartnerId('p_123')`.
// Runtime no-op; compile-time brand.
export const PartnerId = (raw: string): PartnerId => raw as PartnerId;
export const ClientId = (raw: string): ClientId => raw as ClientId;
export const ShipmentId = (raw: string): ShipmentId => raw as ShipmentId;
export const EventId = (raw: string): EventId => raw as EventId;
export const ApiKeyId = (raw: string): ApiKeyId => raw as ApiKeyId;
export const UserId = (raw: string): UserId => raw as UserId;
