// AI parser — converts raw OCR text from a shipping label into the
// structured ExtractedShipmentLabel shape, with per-field confidence.
//
// Stays deliberately separate from the OCR layer so any OCR engine
// (Groq vision today, Tesseract / Google Vision tomorrow) plugs into
// the same parser.

import { z } from 'zod';
import { getGroqClient, CHATBOT_MODEL } from '@/services/server/aiClient';
import {
    EMPTY_CONFIDENCE,
    EMPTY_LABEL,
    REQUIRED_FIELDS,
    type ExtractedShipmentConfidence,
    type ExtractedShipmentLabel,
    type FieldConfidence,
} from '@/types/labelExtraction';

const CONFIDENCE_VALUES = ['high', 'medium', 'low', 'missing'] as const;

const ConfidenceSchema = z.enum(CONFIDENCE_VALUES);

// What the LLM is asked to return. Loose strings — we normalise + validate
// downstream so a slightly off response still yields usable data.
const LlmResponseSchema = z.object({
    customerName: z.string().default(''),
    phone: z.string().default(''),
    altPhone: z.string().default(''),
    address: z.string().default(''),
    city: z.string().default(''),
    state: z.string().default(''),
    pincode: z.string().default(''),
    orderId: z.string().default(''),
    consigneeNotes: z.string().default(''),
    confidence: z
        .object({
            customerName: ConfidenceSchema.default('missing'),
            phone: ConfidenceSchema.default('missing'),
            altPhone: ConfidenceSchema.default('missing'),
            address: ConfidenceSchema.default('missing'),
            city: ConfidenceSchema.default('missing'),
            state: ConfidenceSchema.default('missing'),
            pincode: ConfidenceSchema.default('missing'),
            orderId: ConfidenceSchema.default('missing'),
            consigneeNotes: ConfidenceSchema.default('missing'),
        })
        .default(() => ({ ...EMPTY_CONFIDENCE })),
});

const SYSTEM_PROMPT = `You convert raw OCR text from a shipping label into a structured JSON object.

You will receive OCR output that may be noisy, partial, or in mixed Hindi/English. Extract only what is clearly present — never invent values.

Output JSON ONLY (no markdown, no commentary) matching this exact shape:

{
  "customerName": "consignee / customer / 'To' / 'Deliver to' name",
  "phone": "10-digit Indian mobile if present, else empty",
  "altPhone": "secondary / alternate mobile if present, else empty",
  "address": "street + locality (everything that isn't city/state/pincode)",
  "city": "city / town",
  "state": "Indian state name (full form, e.g. 'Maharashtra' not 'MH')",
  "pincode": "6-digit Indian PIN, digits only",
  "orderId": "order id / reference / AWB / waybill number",
  "consigneeNotes": "extra consignee info worth keeping (company, attention line, landmark, etc.)",
  "confidence": {
    "customerName": "high | medium | low | missing",
    "phone": "high | medium | low | missing",
    "altPhone": "high | medium | low | missing",
    "address": "high | medium | low | missing",
    "city": "high | medium | low | missing",
    "state": "high | medium | low | missing",
    "pincode": "high | medium | low | missing",
    "orderId": "high | medium | low | missing",
    "consigneeNotes": "high | medium | low | missing"
  }
}

Rules:
- Use empty string "" for a field you cannot find. Mark its confidence "missing".
- Use "low" when the field is present but ambiguous or partially garbled.
- Use "medium" when the field is clear but the OCR text has nearby noise.
- Use "high" when the field is unambiguous and clean.
- Normalise: strip "Mr/Mrs/Ms" honorifics from names. Strip "+91"/"91" prefix from phones. Strip leading zeros from PIN codes (a real Indian PIN is exactly 6 digits, no leading zero).
- Never include sender / pickup details in the consignee fields. If the label has both "From" and "To" sections, only extract the "To" / consignee side.
- Do NOT translate. Keep names and addresses in their original script.
- Output ONLY the JSON object. No preface. No code fences.`;

/**
 * Parse OCR text into structured shipment fields. Returns the extracted
 * data plus per-field confidence flags.
 *
 * If the LLM call fails or returns malformed JSON we degrade gracefully —
 * empty fields with `missing` confidence — so the UI can still show the
 * raw OCR text for the user to fill in manually.
 */
export async function parseShipmentFromText(
    rawText: string
): Promise<{
    extracted: ExtractedShipmentLabel;
    confidence: ExtractedShipmentConfidence;
}> {
    if (!rawText || rawText.trim().length === 0) {
        return { extracted: { ...EMPTY_LABEL }, confidence: { ...EMPTY_CONFIDENCE } };
    }

    const client = getGroqClient();

    let parsed: z.infer<typeof LlmResponseSchema>;
    try {
        const completion = await client.chat.completions.create({
            model: CHATBOT_MODEL,
            temperature: 0,
            max_tokens: 900,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `OCR text:\n\n${rawText}` },
            ],
        });
        const raw = completion.choices?.[0]?.message?.content ?? '{}';
        const json = JSON.parse(raw);
        parsed = LlmResponseSchema.parse(json);
    } catch (err) {
        console.error('[labelExtraction] LLM parse failed:', err);
        return { extracted: { ...EMPTY_LABEL }, confidence: { ...EMPTY_CONFIDENCE } };
    }

    const { confidence, ...fields } = parsed;
    const extracted: ExtractedShipmentLabel = normaliseFields(fields);
    const normalisedConfidence = reconcileConfidence(extracted, confidence);

    return { extracted, confidence: normalisedConfidence };
}

/** Returns the keys flagged for manual review (medium/low/missing). */
export function lowConfidenceFields(
    confidence: ExtractedShipmentConfidence
): Array<keyof ExtractedShipmentConfidence> {
    return (Object.keys(confidence) as Array<keyof ExtractedShipmentConfidence>).filter(
        (k) => confidence[k] !== 'high'
    );
}

/** Required fields must be non-empty for the shipment to proceed. */
export function missingRequiredFields(
    extracted: ExtractedShipmentLabel
): Array<keyof ExtractedShipmentLabel> {
    return REQUIRED_FIELDS.filter((k) => !extracted[k] || extracted[k].trim().length === 0);
}

// --- Normalisation ---------------------------------------------------------

function normaliseFields(input: Omit<z.infer<typeof LlmResponseSchema>, 'confidence'>): ExtractedShipmentLabel {
    return {
        customerName: stripHonorifics(trim(input.customerName)),
        phone: normalisePhone(input.phone),
        altPhone: normalisePhone(input.altPhone),
        address: collapseWhitespace(input.address),
        city: titleCase(trim(input.city)),
        state: titleCase(trim(input.state)),
        pincode: normalisePincode(input.pincode),
        orderId: trim(input.orderId),
        consigneeNotes: collapseWhitespace(input.consigneeNotes),
    };
}

/** If the LLM said "high" but the value is empty / invalid, demote to "missing". */
function reconcileConfidence(
    extracted: ExtractedShipmentLabel,
    confidence: ExtractedShipmentConfidence
): ExtractedShipmentConfidence {
    const out: ExtractedShipmentConfidence = { ...confidence };
    (Object.keys(extracted) as Array<keyof ExtractedShipmentLabel>).forEach((key) => {
        if (!extracted[key] || extracted[key].trim().length === 0) {
            out[key] = 'missing';
        }
    });
    // Sanity: invalid pincode/phone — even if present — drops to low.
    if (extracted.pincode && !/^\d{6}$/.test(extracted.pincode)) {
        out.pincode = downgrade(out.pincode);
    }
    if (extracted.phone && !/^\d{10}$/.test(extracted.phone)) {
        out.phone = downgrade(out.phone);
    }
    if (extracted.altPhone && !/^\d{10}$/.test(extracted.altPhone)) {
        out.altPhone = downgrade(out.altPhone);
    }
    return out;
}

function downgrade(c: FieldConfidence): FieldConfidence {
    if (c === 'high') return 'low';
    if (c === 'medium') return 'low';
    return c;
}

const HONORIFIC_RE = /^(mr|mrs|ms|miss|dr|shri|smt|sri)\.?\s+/i;
function stripHonorifics(s: string): string {
    return s.replace(HONORIFIC_RE, '').trim();
}

function normalisePhone(s: string): string {
    if (!s) return '';
    const digits = s.replace(/\D/g, '');
    // Strip country code if present.
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits;
}

function normalisePincode(s: string): string {
    if (!s) return '';
    const digits = s.replace(/\D/g, '');
    return digits.slice(0, 6);
}

function trim(s: string): string {
    return (s || '').trim();
}

function collapseWhitespace(s: string): string {
    return (s || '').replace(/\s+/g, ' ').trim();
}

function titleCase(s: string): string {
    if (!s) return '';
    return s
        .toLowerCase()
        .split(/\s+/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
}
