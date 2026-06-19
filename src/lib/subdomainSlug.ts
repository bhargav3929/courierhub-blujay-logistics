// Pure utilities for deriving and validating tenant subdomains.
// Server and client both import from here — keep it Firebase-free and
// dependency-free so it can run in middleware (Edge runtime) too.

import { isReservedSubdomain } from '@/config/reservedSubdomains';

export const SUBDOMAIN_MIN_LEN = 3;
export const SUBDOMAIN_MAX_LEN = 32;

// DNS label rules (RFC 1035) + our policy:
//   - lowercase a-z, digits 0-9, internal hyphens only
//   - cannot start or end with a hyphen
//   - 3-32 chars
const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export type SubdomainValidationCode =
    | 'ok'
    | 'empty'
    | 'too_short'
    | 'too_long'
    | 'invalid_chars'
    | 'leading_or_trailing_hyphen'
    | 'reserved';

export interface SubdomainValidationResult {
    valid: boolean;
    code: SubdomainValidationCode;
    message: string;
}

/**
 * Derive a candidate subdomain from a free-text business name.
 *   "SVK Oreas"           → "svk-oreas"
 *   "Acme & Sons, Ltd."   → "acme-sons-ltd"
 *   "  Multi   Spaces  "  → "multi-spaces"
 *   "—Hyphens-First-"     → "hyphens-first"
 *
 * Never returns a leading/trailing hyphen. Returns "" if nothing usable remains.
 * Truncates at SUBDOMAIN_MAX_LEN but does NOT pad short values — the UI should
 * surface "too short" via validateSubdomain instead of silently expanding it.
 */
export function deriveSubdomain(businessName: string): string {
    if (!businessName) return '';
    const slug = businessName
        .toLowerCase()
        .normalize('NFKD')                  // strip accents (é → e)
        .replace(/[̀-ͯ]/g, '')    // remove combining marks (NFKD residue)
        .replace(/[^a-z0-9]+/g, '-')        // any non-alphanum run → single hyphen
        .replace(/^-+/, '')                 // trim leading hyphens
        .replace(/-+$/, '');                // trim trailing hyphens
    return slug.slice(0, SUBDOMAIN_MAX_LEN).replace(/-+$/, '');
}

/**
 * Validate a subdomain candidate against syntax + reserved list.
 * Does NOT check uniqueness — that's a Firestore lookup, see
 * src/services/server/subdomainResolver.ts.
 */
export function validateSubdomain(value: string): SubdomainValidationResult {
    if (!value) {
        return { valid: false, code: 'empty', message: 'Subdomain is required.' };
    }
    if (value.length < SUBDOMAIN_MIN_LEN) {
        return {
            valid: false,
            code: 'too_short',
            message: `Must be at least ${SUBDOMAIN_MIN_LEN} characters.`,
        };
    }
    if (value.length > SUBDOMAIN_MAX_LEN) {
        return {
            valid: false,
            code: 'too_long',
            message: `Must be at most ${SUBDOMAIN_MAX_LEN} characters.`,
        };
    }
    if (value.startsWith('-') || value.endsWith('-')) {
        return {
            valid: false,
            code: 'leading_or_trailing_hyphen',
            message: 'Cannot start or end with a hyphen.',
        };
    }
    if (!SUBDOMAIN_REGEX.test(value)) {
        return {
            valid: false,
            code: 'invalid_chars',
            message: 'Use only lowercase letters, numbers, and hyphens.',
        };
    }
    if (isReservedSubdomain(value)) {
        return {
            valid: false,
            code: 'reserved',
            message: 'This subdomain is reserved. Try another.',
        };
    }
    return { valid: true, code: 'ok', message: 'Looks good.' };
}

/**
 * Normalize user input as they type. Lowercases and strips invalid chars
 * eagerly so the field can never carry an invalid character forward.
 * Intentionally keeps interior hyphens — only trims leading hyphens so
 * the user can keep typing.
 */
export function normalizeSubdomainInput(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '')
        .replace(/^-+/, '')
        .slice(0, SUBDOMAIN_MAX_LEN);
}
