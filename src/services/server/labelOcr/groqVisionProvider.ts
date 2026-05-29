// Default OCR provider — uses Groq's vision-capable Llama model.
//
// Why default: groq-sdk + GROQ_API_KEY are already wired up for the
// chatbot, so this provider needs no new dependencies, no new keys, and
// runs sub-second on Groq's hardware. The vision model is asked to act
// as a pure OCR engine here (no field extraction yet) — structured
// parsing happens downstream in labelExtraction.ts so we can mix-and-
// match OCR engines without changing the parser.

import { getGroqClient } from '@/services/server/aiClient';
import type { LabelOcrProvider, OcrInput, OcrOutput } from './types';

// Groq's currently-recommended multimodal model. Override via env if a
// newer model ships (Groq rotates these every few months).
const DEFAULT_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const OCR_PROMPT = `You are an OCR engine. Your job is to transcribe — not interpret, not judge.

Read every visible string of text in the image and output it verbatim. Preserve line breaks. Keep numbers, hyphens, slashes, and punctuation exactly as printed. Don't summarise. Don't add commentary. Don't translate.

Output ONLY the transcribed text — no preface, no markdown, no explanation. If you genuinely cannot see any text at all in the image, output an empty response.`;

export const groqVisionProvider: LabelOcrProvider = {
    name: 'groq-vision',

    async extractText(input: OcrInput): Promise<OcrOutput> {
        const client = getGroqClient();
        const model = process.env.GROQ_VISION_MODEL || DEFAULT_VISION_MODEL;

        const completion = await client.chat.completions.create({
            model,
            temperature: 0,
            max_tokens: 1500,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: OCR_PROMPT },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${input.mimeType};base64,${input.imageBase64}`,
                            },
                        },
                    ] as any,
                },
            ],
        });

        const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
        return { text };
    },
};
