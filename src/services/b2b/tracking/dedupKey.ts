import { createHash } from 'node:crypto';
import type { ShipmentId } from '@/types/b2b/ids';
import type { EventSource } from '@/types/b2b/tracking';

// Cryptographic dedup. Used as the primary key in EventStore so duplicate
// inserts are atomic no-ops. Inputs are joined with a separator that does
// not appear in any of them (in practice — '|' isn't used by carrier
// rawCodes or location strings; if it ever is, the worst case is a false
// duplicate, which is recoverable and observable).

export interface DedupKeyInput {
    readonly source: EventSource;
    readonly rawCode: string;
    readonly occurredAt: Date;
    readonly locationRaw: string | null;
    readonly shipmentId: ShipmentId;
}

export function computeDedupKey(input: DedupKeyInput): string {
    const serialized = [
        input.source,
        input.rawCode,
        input.occurredAt.toISOString(),
        input.locationRaw ?? '',
        input.shipmentId,
    ].join('|');
    return createHash('sha256').update(serialized, 'utf8').digest('hex');
}
