'use server';

import { revalidatePath } from 'next/cache';
import {
    mintB2BApiKey,
    revokeB2BApiKey,
    setB2BApiKeyDisabled,
} from '@/services/server/b2bApiKeyService';
import type { B2BApiKeyEnvironment } from '@/types/b2b/api-key';
import { ALL_B2B_API_KEY_ENVIRONMENTS } from '@/types/b2b/api-key';
import { getLogger } from '@/services/b2b/http/logger';

const log = getLogger('admin.b2b.api-keys.actions');

async function requireAdmin(): Promise<{ userId: string }> {
    // TODO: wire to admin Firebase Auth session — same pattern as Step 4.2/4.3.
    return { userId: 'admin' };
}

// ─── create ────────────────────────────────────────────────────────────

export type CreateResult =
    | {
        ok: true;
        keyId: string;
        partnerId: string;
        label: string;
        keyPrefix: string;
        rawKey: string;                  // shown ONCE; never re-fetched
        environment: B2BApiKeyEnvironment;
        expiresAt: number | null;
    }
    | { ok: false; message: string };

export interface CreateInput {
    readonly partnerId: string;
    readonly label: string;
    readonly environment: B2BApiKeyEnvironment;
    readonly expiresAtIso?: string;
}

export async function createB2BApiKeyAction(input: CreateInput): Promise<CreateResult> {
    const session = await requireAdmin();

    if (!input.partnerId || !/^[A-Za-z0-9_\-:.]+$/.test(input.partnerId)) {
        return { ok: false, message: 'Partner ID is required (alphanumeric + - _ : . only)' };
    }
    if (!(ALL_B2B_API_KEY_ENVIRONMENTS as readonly string[]).includes(input.environment)) {
        return { ok: false, message: `Invalid environment '${input.environment}'` };
    }

    let expiresAt: Date | undefined;
    if (input.expiresAtIso) {
        const d = new Date(input.expiresAtIso);
        if (!Number.isFinite(d.getTime())) {
            return { ok: false, message: 'Invalid expiry date' };
        }
        if (d.getTime() < Date.now()) {
            return { ok: false, message: 'Expiry must be in the future' };
        }
        expiresAt = d;
    }

    try {
        const minted = await mintB2BApiKey({
            partnerId: input.partnerId,
            label: input.label,
            environment: input.environment,
            createdBy: session.userId,
            expiresAt,
        });
        revalidatePath('/b2b/api-keys');
        return {
            ok: true,
            keyId: minted.id,
            partnerId: minted.partnerId,
            label: minted.label,
            keyPrefix: minted.keyPrefix,
            rawKey: minted.rawKey,
            environment: minted.environment,
            expiresAt: minted.expiresAt,
        };
    } catch (e) {
        log.error('mint failed', {
            partnerId: input.partnerId,
            error: e instanceof Error ? e.message : String(e),
        });
        return { ok: false, message: 'Failed to mint API key' };
    }
}

// ─── revoke ────────────────────────────────────────────────────────────

export type RevokeActionResult =
    | { ok: true }
    | { ok: false; message: string };

export async function revokeB2BApiKeyAction(input: {
    keyId: string;
    reason: string;
}): Promise<RevokeActionResult> {
    const session = await requireAdmin();
    if (!input.keyId) return { ok: false, message: 'Missing key id' };
    if (!input.reason || input.reason.trim().length < 5) {
        return { ok: false, message: 'Reason is required (≥5 chars) for audit log' };
    }
    try {
        const result = await revokeB2BApiKey({
            keyId: input.keyId,
            revokedBy: session.userId,
            reason: input.reason,
        });
        revalidatePath('/b2b/api-keys');
        if (result.ok) return { ok: true };
        return {
            ok: false,
            message:
                result.reason === 'already_revoked' ? 'Key is already revoked'
                : result.reason === 'not_b2b' ? 'Not a B2B partner key'
                : 'Key not found',
        };
    } catch (e) {
        log.error('revoke failed', {
            keyId: input.keyId,
            error: e instanceof Error ? e.message : String(e),
        });
        return { ok: false, message: 'Internal error revoking key' };
    }
}

// ─── disable / re-enable ───────────────────────────────────────────────

export type DisableActionResult =
    | { ok: true }
    | { ok: false; message: string };

export async function setB2BApiKeyDisabledAction(input: {
    keyId: string;
    disabled: boolean;
}): Promise<DisableActionResult> {
    const session = await requireAdmin();
    if (!input.keyId) return { ok: false, message: 'Missing key id' };
    try {
        const result = await setB2BApiKeyDisabled({
            keyId: input.keyId,
            disabled: input.disabled,
            actorId: session.userId,
        });
        revalidatePath('/b2b/api-keys');
        if (result.ok) return { ok: true };
        return {
            ok: false,
            message:
                result.reason === 'revoked' ? 'Cannot modify a revoked key'
                : result.reason === 'not_b2b' ? 'Not a B2B partner key'
                : 'Key not found',
        };
    } catch (e) {
        log.error('set disabled failed', {
            keyId: input.keyId,
            error: e instanceof Error ? e.message : String(e),
        });
        return { ok: false, message: 'Internal error updating key state' };
    }
}
