import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { EventId } from '@/types/b2b/ids';
import type {
    EventReader,
    ListEventsInput,
    ListEventsResult,
    StoredEventView,
} from '@/types/b2b/ports';
import { COLLECTIONS } from './collections';
import { deserializeEvent, type StoredEventDoc } from './serialization';

// Reads events from shipments/{id}/events with composite-index pagination.
// Cursor is the last seen event's `occurredAt` epoch-millis as a string.
//
// Required composite index (when query volume warrants creating it):
//   shipments/{id}/events:  (partnerId ASC, occurredAt ASC)
// Without the index, Firestore returns a "create index" error linking to
// the console. We filter by partnerId as defense in depth — the parent
// shipment doc was already tenant-checked by the calling route.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class FirestoreEventReader implements EventReader {
    constructor(private readonly db: Firestore) {}

    async listEvents(input: ListEventsInput): Promise<ListEventsResult> {
        const direction = input.direction ?? 'asc';
        const limit = Math.min(
            Math.max(input.limit > 0 ? input.limit : DEFAULT_LIMIT, 1),
            MAX_LIMIT,
        );

        let q = this.db
            .collection(COLLECTIONS.SHIPMENTS)
            .doc(input.shipmentId)
            .collection(COLLECTIONS.SHIPMENT_EVENTS)
            .where('partnerId', '==', input.partnerId)
            .orderBy('occurredAt', direction);

        if (input.cursor) {
            const cursorMs = parseCursor(input.cursor);
            if (cursorMs !== null) {
                q = q.startAfter(cursorMs);
            }
        }

        // Fetch one extra to detect whether there are more pages.
        const snap = await q.limit(limit + 1).get();

        const slice = snap.docs.slice(0, limit);
        const hasMore = snap.docs.length > limit;

        const events: StoredEventView[] = slice.map((d) => {
            const data = d.data() as StoredEventDoc;
            return {
                eventId: EventId(d.id),
                event: deserializeEvent(data),
                applied: data.applied,
                appliedReason: data.appliedReason,
                statusTransition: data.statusTransition,
                recordedAt: data.recordedAt.toDate(),
            };
        });

        const nextCursor =
            hasMore && slice.length > 0
                ? buildCursor((slice[slice.length - 1].data() as StoredEventDoc).occurredAt)
                : null;

        return { events, nextCursor };
    }
}

function buildCursor(ts: Timestamp): string {
    return ts.toMillis().toString();
}

function parseCursor(cursor: string): number | null {
    if (!/^\d+$/.test(cursor)) return null;
    const ms = Number(cursor);
    if (!Number.isFinite(ms) || ms < 0) return null;
    return ms;
}
