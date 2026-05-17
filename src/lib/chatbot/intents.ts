// Deterministic intent detection — regex/keyword first. We only fall back
// to the LLM for routing decisions when the regex layer can't classify.
//
// Order matters: more specific intents (e.g. AWB pattern) come BEFORE
// more general ones (e.g. "tracking" keyword), because a message like
// "track AWB 123456789" should be classified `tracking` with an extracted
// AWB rather than `tracking` without one.

import type { ChatIntent } from '@/types/chatbot';

export interface IntentMatch {
    intent: ChatIntent;
    /** When intent === 'tracking', the AWB extracted from the message. */
    awb?: string;
    /** Confidence — 1.0 = certain (pattern matched), 0.5 = keyword only. */
    confidence: number;
}

// AWB / tracking-id detection.
// BlueDart: 11 digits.
// Delhivery: 11-14 digits.
// DTDC: alphanumeric, often starts with letters then digits.
// Conservative pattern: 9-15 alphanumeric chars, mostly digits.
const AWB_PATTERN = /\b([A-Z0-9]{9,15})\b/i;
const NUMERIC_AWB_PATTERN = /\b(\d{9,15})\b/;

const GREETING_KEYWORDS = ['hi', 'hello', 'hey', 'hii', 'good morning', 'good evening', 'namaste'];
const TRACKING_KEYWORDS = ['track', 'tracking', 'status', 'where is my', 'shipment status', 'parcel'];
const PRICING_KEYWORDS = ['price', 'pricing', 'cost', 'how much', 'rate', 'rates', 'charges'];
const CARRIER_KEYWORDS = ['carrier', 'courier', 'blue dart', 'bluedart', 'delhivery', 'dtdc', 'supported', 'partners'];
const API_KEYWORDS = ['api', 'webhook', 'integration', 'integrate', 'sdk', 'endpoint', 'developer'];
const BOOKING_KEYWORDS = ['book shipment', 'create shipment', 'how to book', 'how do i book', 'place order', 'create order'];
const COD_KEYWORDS = ['cod', 'cash on delivery', 'cash-on-delivery'];
const SUPPORT_KEYWORDS = ['support', 'contact', 'help me', 'customer service', 'speak to'];

// Words that look like they MIGHT be intent triggers but are noise.
// We strip these before keyword matching to avoid false positives
// (e.g. "What's the cost?" should NOT match "what" as a question intent).
const STOP_WORDS = new Set([
    'what', 'why', 'how', 'when', 'where', 'who', 'the', 'a', 'an', 'is', 'are', 'do', 'does',
    'can', 'could', 'should', 'would', 'will', 'i', 'you', 'me', 'my', 'your', 'and', 'or', 'but',
]);

/**
 * Classify a user message.
 *
 * The classifier is intentionally cheap (no LLM call). If `confidence < 0.5`,
 * the caller should ask the LLM to handle the message generically.
 */
export function classifyIntent(rawMessage: string): IntentMatch {
    const message = rawMessage.trim();
    const lower = message.toLowerCase();

    if (!message) return { intent: 'unknown', confidence: 0 };

    // 1. AWB / tracking-id pattern — strongest signal.
    //    If a message has an AWB-shaped token, treat as tracking regardless of phrasing.
    const numericMatch = message.match(NUMERIC_AWB_PATTERN);
    if (numericMatch) {
        const awb = numericMatch[1];
        // Avoid matching pincodes (6 digits) by requiring 9+ digits — already in pattern.
        return { intent: 'tracking', awb, confidence: 1.0 };
    }
    const alphaMatch = message.match(AWB_PATTERN);
    if (
        alphaMatch &&
        // Must contain at least one digit to be AWB-shaped (not just a word).
        /\d/.test(alphaMatch[1]) &&
        // And the message also references tracking — extra confidence guard.
        TRACKING_KEYWORDS.some((kw) => lower.includes(kw))
    ) {
        return { intent: 'tracking', awb: alphaMatch[1].toUpperCase(), confidence: 1.0 };
    }

    // 2. Pure-greeting message.
    if (GREETING_KEYWORDS.some((kw) => lower === kw || lower.startsWith(`${kw} `) || lower.startsWith(`${kw},`))) {
        return { intent: 'greeting', confidence: 1.0 };
    }

    // 3. Keyword scoring — pick the intent with the most keyword hits.
    const scores: Record<ChatIntent, number> = {
        tracking: countMatches(lower, TRACKING_KEYWORDS),
        pricing: countMatches(lower, PRICING_KEYWORDS),
        carrier_support: countMatches(lower, CARRIER_KEYWORDS),
        api_integration: countMatches(lower, API_KEYWORDS),
        shipment_booking: countMatches(lower, BOOKING_KEYWORDS),
        cod_support: countMatches(lower, COD_KEYWORDS),
        support_contact: countMatches(lower, SUPPORT_KEYWORDS),
        greeting: 0,
        faq: 0,
        unknown: 0,
    };
    const best = (Object.entries(scores) as Array<[ChatIntent, number]>)
        .sort((a, b) => b[1] - a[1])[0];
    if (best[1] >= 1) {
        // Tracking without an AWB → ask for one.
        return { intent: best[0], confidence: best[1] >= 2 ? 0.8 : 0.6 };
    }

    // 4. Default: treat as a generic FAQ-style question. LLM will handle.
    return { intent: 'faq', confidence: 0.3 };
}

function countMatches(haystack: string, needles: string[]): number {
    let n = 0;
    for (const needle of needles) {
        if (haystack.includes(needle)) n++;
    }
    return n;
}

/** Extract an AWB from a message if present. Used when the user follows
 *  up an earlier "ask me your AWB" prompt with just the number. */
export function extractAwb(message: string): string | null {
    const numeric = message.match(NUMERIC_AWB_PATTERN);
    if (numeric) return numeric[1];
    const alpha = message.match(AWB_PATTERN);
    if (alpha && /\d/.test(alpha[1])) return alpha[1].toUpperCase();
    return null;
}

// Exposed so tests can poke at the constants without re-deriving them.
export const __test_internals = {
    GREETING_KEYWORDS,
    TRACKING_KEYWORDS,
    PRICING_KEYWORDS,
    CARRIER_KEYWORDS,
    API_KEYWORDS,
    BOOKING_KEYWORDS,
    COD_KEYWORDS,
    SUPPORT_KEYWORDS,
    STOP_WORDS,
};
