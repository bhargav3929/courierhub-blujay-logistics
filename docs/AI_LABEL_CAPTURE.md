# AI Label Capture (chatbot → add-shipment)

A user takes a photo of a courier label inside the chatbot. The platform
runs OCR + an LLM extraction pass, presents a review screen with editable
fields and confidence flags, and (on confirm) prefills the existing
`/add-shipment` page. No new booking endpoint — we reuse the carrier
flows that already exist.

## End-to-end flow

```
[Chatbot widget — logged-in client]
   │
   │  Tap ScanLine button (single-row composer, icon-only)
   ▼
[LabelCapture overlay]                      src/components/chatbot/LabelCapture.tsx
   │  idle      → camera (mobile rear) or file picker
   │  ─────────  client-side downscale to 1600px JPEG, ~88% quality
   │  processing→ POST /api/ocr/extract-shipment
   │  review    → editable form, low-confidence fields highlighted
   │  error     → message + retry
   ▼
[POST /api/ocr/extract-shipment]            src/app/api/ocr/extract-shipment/route.ts
   │  1. authenticateRequest()              (Bearer or X-Blujay-Api-Key)
   │  2. LabelOcrProvider.extractText()     (default: Groq vision)
   │  3. parseShipmentFromText()            (Groq LLM, JSON-mode, zod-validated)
   │  4. response: { extracted, confidence, lowConfidenceFields, rawText, provider }
   ▼
[LabelCapture review]
   │  User edits any field → its confidence bumps to `high`
   │  Required field validation: customerName, phone (10 d), address,
   │                             city, state, pincode (6 d)
   ▼
[stashPrefill → sessionStorage]             src/lib/chatbot/shipmentPrefillStash.ts
   │  10-minute TTL, single-use key
   ▼
[router.push('/add-shipment?prefillKey=…')]
   ▼
[add-shipment hydrates delivery + orderID]  src/app/(client)/add-shipment/page.tsx
   │  consumePrefill(key) reads & deletes the stash entry
   │  Existing booking flow continues (carrier choice, weight, COD, …)
```

## Architecture layers

| Layer | Path | Responsibility |
|---|---|---|
| UI overlay | `src/components/chatbot/LabelCapture.tsx` | Capture, preview, review form, image resize |
| Composer entry | `src/components/chatbot/ChatInput.tsx` | Adds Scan-Label icon; only renders for logged-in non-admin users |
| Window glue | `src/components/chatbot/ChatWindow.tsx` | Owns `labelCaptureOpen` state, renders overlay |
| Prefill hand-off | `src/lib/chatbot/shipmentPrefillStash.ts` | sessionStorage-based, single-use key, 10-min TTL |
| Add-shipment intake | `src/app/(client)/add-shipment/page.tsx` | `useEffect` reads `?prefillKey=`, sets `delivery` + `orderID` |
| API route | `src/app/api/ocr/extract-shipment/route.ts` | Auth, body validation, orchestration, error mapping |
| OCR provider layer | `src/services/server/labelOcr/*` | Pluggable `LabelOcrProvider` (Groq vision today) |
| AI parser | `src/services/server/labelExtraction.ts` | Text → structured fields + per-field confidence |
| Types | `src/types/labelExtraction.ts` | `ExtractedShipmentLabel`, `FieldConfidence`, route response shape |

## Why two stages (OCR ≠ parser)

The OCR provider returns raw text only. The parser converts text →
structured JSON. Keeping them separate means we can swap Groq vision out
for Tesseract.js (free, in-browser) or Google Vision later without
touching the parser. The parser does the same job either way.

## OCR provider abstraction

```ts
interface LabelOcrProvider {
    readonly name: string;
    extractText(input: { imageBase64: string; mimeType: string }): Promise<{ text: string; confidence?: number }>;
}
```

Selected via `OCR_PROVIDER` env var. Default `'groq-vision'`. Add a new
provider:

1. Drop `src/services/server/labelOcr/myProvider.ts` exporting a
   `LabelOcrProvider`.
2. Register it in `src/services/server/labelOcr/index.ts` under
   `PROVIDERS`.
3. Set `OCR_PROVIDER=my-provider` in env.

## AI parser contract

`parseShipmentFromText(rawText)` returns:

```ts
{
    extracted: ExtractedShipmentLabel,
    confidence: Record<keyof ExtractedShipmentLabel, 'high' | 'medium' | 'low' | 'missing'>
}
```

Confidence rules (enforced server-side after LLM response):
- Empty string → `missing`
- Pincode not 6 digits → downgrade to `low`
- Phone / alt phone not 10 digits → downgrade to `low`
- Anything else honours the LLM-supplied confidence

Normalisation applied:
- Strip honorifics (Mr/Mrs/Ms/Dr/Shri/Smt/Sri) from names
- Strip `+91`/`91`/`0` prefix from phones (Indian numbers)
- Strip non-digits from pincodes; clamp to 6 chars
- Collapse whitespace in addresses
- Title-case city/state

## Confidence UI

In the review form:
- `high` → no badge, normal slate border
- `medium` / `low` → "Review" / "Low confidence" amber badge + amber border
- `missing` on a required field → "Missing" red badge + red border
- The instant the user types in a field, its confidence bumps to `high`
  so the border-highlight goes away — this is the implicit confirmation

## Required fields

`customerName, phone, address, city, state, pincode` — enforced both at
parse time (downgrade to `missing` if empty) and at confirm time (toast
listing what's still missing).

`altPhone`, `orderId`, `consigneeNotes` are optional. `orderId` is
prefilled into the add-shipment Order ID field when present;
`altPhone` and `consigneeNotes` are captured but not currently mapped to
the booking schema (kept in the review screen so the user sees the full
label content).

## Env

```
OCR_PROVIDER=groq-vision            # default; reserved: tesseract, google-vision
GROQ_VISION_MODEL=...               # override Groq's vision model
GROQ_API_KEY=...                    # already required by the chatbot
```

## Error model

| HTTP | Cause | UI behaviour |
|---|---|---|
| 400 | Body schema invalid / image missing | Error stage with the server message |
| 401 | Auth failed | Error stage — "You need to be signed in." |
| 422 | OCR returned empty text | "No text could be read. Try a clearer photo." |
| 502 | OCR provider error or "NOT_A_LABEL" verdict | Provider's message surfaced verbatim |
| 500 | Parser crashed | "Could not structure the label data. Please review manually." |

All server-side failures are `console.error`'d with the route prefix
(`[ocr/extract-shipment]`, `[labelExtraction]`). The image bytes are
never logged.

## Privacy / storage

The image is processed in memory only — there is **no Firebase Storage
write**. The base64 payload lives in:
- the browser tab (preview `<img>` + state) until the overlay closes
- the request body during the round-trip
- the Groq SDK call to the OCR model

Nothing is persisted at rest. If we later want diagnostic captures, add
an opt-in flag — don't make it the default.

## Auth

Reuses the platform's standard `authenticateRequest()` helper. Accepts
both:
- `Authorization: Bearer <Firebase ID token>` (used by the chatbot UI)
- `X-Blujay-Api-Key: bj_<32hex>` (available if a merchant ever wants to
  POST a label image programmatically)

The Scan-Label button itself is gated client-side too: only rendered for
authenticated non-admin users via `useAuth()` in `ChatInput.tsx`.

## Adding fields

If a future label format includes a useful field we want to keep:

1. Extend `ExtractedShipmentLabel` in `src/types/labelExtraction.ts`.
2. Add a confidence default in `EMPTY_CONFIDENCE`.
3. Document the field in the LLM system prompt
   (`src/services/server/labelExtraction.ts`).
4. Add a corresponding `FIELD_LABELS` entry + position in `REVIEW_ORDER`
   in `LabelCapture.tsx`.
5. If the field maps to a booking-schema field, map it in
   `buildPrefill()` (`shipmentPrefillStash.ts`) and the add-shipment
   hydration effect.
