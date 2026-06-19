// Server-only helpers for the subdomain → tenant mapping.
//
// Architecture:
//   - clients/{id}.subdomain holds the canonical value (one per tenant)
//   - subdomainIndex/{subdomain} is a reverse-index doc whose id IS the
//     subdomain, with body { tenantId, tenantType, active }.
//
// Why a separate index collection?
//   Middleware runs on every request and needs O(1) host → tenantId resolution.
//   Querying `clients` by `subdomain` field on every request would (a) cost a
//   Firestore read and (b) require a composite index. Document-id lookup is
//   the only path that's truly O(1) and cheap.
//
// Consistency:
//   Writes go through reserveSubdomain() which performs a transaction:
//   reads subdomainIndex/{slug} → throws if exists → writes both docs.
//   Deletes go through releaseSubdomain() which deletes the index doc.
//
// This file uses firebase-admin and MUST only be imported from server routes
// and server components — never from client components.

import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { validateSubdomain } from '@/lib/subdomainSlug';

const SUBDOMAIN_INDEX_COLLECTION = 'subdomainIndex';
const CLIENTS_COLLECTION = 'clients';

export interface SubdomainIndexEntry {
    tenantId: string;
    tenantType: 'white_label';   // currently only white-label uses subdomains
    active: boolean;             // mirrors clients.{id}.status === 'active'
    createdAt: FirebaseFirestore.Timestamp;
}

export type SubdomainCheckResult =
    | { available: true }
    | { available: false; reason: 'invalid'; message: string }
    | { available: false; reason: 'taken' }
    | { available: false; reason: 'reserved' };

/**
 * Live availability check — used by the admin "Create client" UI to render
 * a green/red state as the admin types. Never throws on user input issues;
 * encodes failures in the result.
 */
export async function checkSubdomainAvailability(
    candidate: string
): Promise<SubdomainCheckResult> {
    const v = validateSubdomain(candidate);
    if (!v.valid) {
        if (v.code === 'reserved') {
            return { available: false, reason: 'reserved' };
        }
        return { available: false, reason: 'invalid', message: v.message };
    }

    const db = getFirestore(adminApp);
    const snap = await db.collection(SUBDOMAIN_INDEX_COLLECTION).doc(candidate).get();
    if (snap.exists) {
        return { available: false, reason: 'taken' };
    }
    return { available: true };
}

/**
 * Resolve a hostname like `svkoreas.blujaylogistic.com` to a tenant.
 * Returns null when:
 *   - the subdomain has no index entry
 *   - the entry is marked inactive
 *
 * Designed to be safe to call from middleware (no throw on missing tenant);
 * callers translate null → 404.
 */
export async function resolveTenantBySubdomain(
    subdomain: string
): Promise<SubdomainIndexEntry | null> {
    if (!subdomain) return null;
    const db = getFirestore(adminApp);
    const snap = await db
        .collection(SUBDOMAIN_INDEX_COLLECTION)
        .doc(subdomain.toLowerCase())
        .get();
    if (!snap.exists) return null;
    const data = snap.data() as SubdomainIndexEntry | undefined;
    if (!data?.active) return null;
    return data;
}

/**
 * Atomically reserve a subdomain for a tenant. Used during client creation.
 *
 * Throws when:
 *   - the subdomain fails validation (caller should have validated client-side)
 *   - the subdomain is already taken (race condition with another admin)
 *
 * Writes BOTH docs in a single transaction so we never end up with a
 * subdomainIndex entry pointing at a non-existent client or vice versa.
 */
export async function reserveSubdomain(args: {
    tenantId: string;
    subdomain: string;
    tenantType: 'white_label';
}): Promise<void> {
    const sub = args.subdomain.toLowerCase();
    const v = validateSubdomain(sub);
    if (!v.valid) {
        throw new Error(`Invalid subdomain: ${v.message}`);
    }

    const db = getFirestore(adminApp);
    const indexRef = db.collection(SUBDOMAIN_INDEX_COLLECTION).doc(sub);
    const clientRef = db.collection(CLIENTS_COLLECTION).doc(args.tenantId);

    await db.runTransaction(async (tx) => {
        const indexSnap = await tx.get(indexRef);
        if (indexSnap.exists) {
            throw new Error(`Subdomain "${sub}" is already taken.`);
        }
        const now = new Date();
        tx.set(indexRef, {
            tenantId: args.tenantId,
            tenantType: args.tenantType,
            active: true,
            createdAt: now,
        });
        // Stamp the canonical field on the client doc too. Use update so we
        // don't accidentally overwrite the rest of the client record.
        tx.update(clientRef, {
            subdomain: sub,
            subdomainLockedAt: now,
            updatedAt: now,
        });
    });
}

/**
 * Mark a tenant's subdomain inactive without deleting the index entry.
 * Use this when a client is deactivated — it makes the subdomain unresolvable
 * (middleware 404s) while still blocking the name from being handed to a new
 * tenant (which would let them impersonate the old one).
 */
export async function deactivateSubdomain(subdomain: string): Promise<void> {
    if (!subdomain) return;
    const db = getFirestore(adminApp);
    await db
        .collection(SUBDOMAIN_INDEX_COLLECTION)
        .doc(subdomain.toLowerCase())
        .update({ active: false });
}

/**
 * Hard-release a subdomain back into the available pool. Use ONLY on client
 * deletion, never on deactivation. Caller is responsible for ensuring the
 * tenant is fully purged first.
 */
export async function releaseSubdomain(subdomain: string): Promise<void> {
    if (!subdomain) return;
    const db = getFirestore(adminApp);
    await db
        .collection(SUBDOMAIN_INDEX_COLLECTION)
        .doc(subdomain.toLowerCase())
        .delete();
}
