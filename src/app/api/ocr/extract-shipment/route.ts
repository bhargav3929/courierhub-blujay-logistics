/**
 * POST /api/ocr/extract-shipment
 *
 * AI-powered shipping-label intake. The chatbot's LabelCapture overlay
 * sends a photographed label here; the route runs OCR + LLM extraction
 * and returns structured shipment fields with per-field confidence flags.
 *
 * Body (application/json):
 *   {
 *     "image": "<base64 without data: prefix>",
 *     "mimeType": "image/jpeg" | "image/png" | "image/webp"
 *   }
 *
 * Response: LabelExtractionResult (see src/types/labelExtraction.ts)
 *
 * Auth: Bearer token OR X-Blujay-Api-Key (same as the rest of the API).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/serverAuth';
import { getLabelOcrProvider } from '@/services/server/labelOcr';
import {
    lowConfidenceFields,
    parseShipmentFromText,
} from '@/services/server/labelExtraction';
import type { LabelExtractionResult } from '@/types/labelExtraction';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // seconds — vision + LLM round-trips can take ~5-10s

// Cap incoming images at ~5 MB of base64 (~3.75 MB binary). The client
// resizes before upload so this is a safety net, not the primary limit.
const MAX_BASE64_LENGTH = 5 * 1024 * 1024;

const Body = z.object({
    image: z
        .string()
        .min(100, 'Image data is too small')
        .max(MAX_BASE64_LENGTH, 'Image is too large (max ~3.75 MB binary)'),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;

    let body: z.infer<typeof Body>;
    try {
        const json = await req.json();
        body = Body.parse(json);
    } catch (err: any) {
        return NextResponse.json(
            { error: 'Invalid request body', detail: err?.message ?? String(err) },
            { status: 400 }
        );
    }

    // Strip a data URL prefix if the client accidentally included one.
    const imageBase64 = body.image.replace(/^data:[^;]+;base64,/, '');

    let rawText = '';
    let providerName = 'unknown';
    try {
        const provider = getLabelOcrProvider();
        providerName = provider.name;
        const ocr = await provider.extractText({ imageBase64, mimeType: body.mimeType });
        rawText = ocr.text;
    } catch (err: any) {
        console.error('[ocr/extract-shipment] OCR failed:', err);
        const message =
            typeof err?.message === 'string'
                ? err.message
                : 'OCR failed. Please try a clearer photo.';
        return NextResponse.json({ error: message }, { status: 502 });
    }

    if (!rawText || rawText.trim().length === 0) {
        return NextResponse.json(
            { error: 'No text could be read from the image. Try a clearer photo.' },
            { status: 422 }
        );
    }

    try {
        const { extracted, confidence } = await parseShipmentFromText(rawText);

        const payload: LabelExtractionResult = {
            extracted,
            confidence,
            lowConfidenceFields: lowConfidenceFields(confidence),
            rawText,
            provider: providerName,
        };

        return NextResponse.json(payload, { status: 200 });
    } catch (err: any) {
        console.error('[ocr/extract-shipment] parser failed:', err);
        return NextResponse.json(
            { error: 'Could not structure the label data. Please review manually.' },
            { status: 500 }
        );
    }
}
