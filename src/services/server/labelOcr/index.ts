// OCR provider factory. The route layer asks for a provider by env name;
// adding a new engine = add a new file + register it here.
//
// Env: OCR_PROVIDER = 'groq-vision' (default) | 'tesseract' | 'google-vision'
//   - 'groq-vision' uses Groq's Llama vision model (zero extra deps)
//   - 'tesseract' / 'google-vision' are reserved — register their providers
//     here when we add them.

import { groqVisionProvider } from './groqVisionProvider';
import type { LabelOcrProvider } from './types';

export type { LabelOcrProvider, OcrInput, OcrOutput } from './types';

const PROVIDERS: Record<string, LabelOcrProvider> = {
    'groq-vision': groqVisionProvider,
};

let cached: LabelOcrProvider | null = null;

export function getLabelOcrProvider(): LabelOcrProvider {
    if (cached) return cached;
    const name = process.env.OCR_PROVIDER || 'groq-vision';
    const provider = PROVIDERS[name];
    if (!provider) {
        const available = Object.keys(PROVIDERS).join(', ');
        throw new Error(
            `Unknown OCR_PROVIDER "${name}". Available: ${available}. Add a provider in src/services/server/labelOcr/.`
        );
    }
    cached = provider;
    return provider;
}
