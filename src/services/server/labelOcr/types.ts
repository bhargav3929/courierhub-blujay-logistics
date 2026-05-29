// Provider-agnostic interface for OCR of a shipping label.
//
// The /api/ocr/extract-shipment route calls `getLabelOcrProvider()` from
// `./index.ts` and never knows or cares which engine actually ran. Swap
// providers via the OCR_PROVIDER env var; add a new engine by dropping a
// new file beside groqVisionProvider.ts and registering it in index.ts.

export interface OcrInput {
    /** Image bytes — JPEG/PNG/WebP. */
    imageBase64: string;
    /** MIME type of the source image, e.g. 'image/jpeg'. */
    mimeType: string;
}

export interface OcrOutput {
    /** Raw text the OCR engine read off the label. */
    text: string;
    /**
     * Engine-reported confidence in the [0, 1] range when available.
     * Groq vision doesn't expose this — providers without a score should
     * return `undefined` so the parser can decide based on text quality.
     */
    confidence?: number;
}

export interface LabelOcrProvider {
    /** Human-readable name — used in logs and in the response payload. */
    readonly name: string;
    /** Run OCR and return the raw text + (optional) confidence. */
    extractText(input: OcrInput): Promise<OcrOutput>;
}
