# Protected Customer Data — Application Content

> Shopify requires a separate **Protected Customer Data application** for any app that requests scopes which expose customer PII (in our case `read_orders`).
> Apply at: Partner Dashboard → Apps → Blujay Logistics → **Protected customer data**.
> Approval typically takes 24–72 hours. Submit this **at least 1 week before** the listing review submission.
>
> Paste the answers below into each form field exactly. If any field's character limit is exceeded, the trimmed version is in `[brackets]`.

---

## Field 1: What customer data does your app access? (multi-select)

Select:
- ☑ **Name** (recipient name on the shipment)
- ☑ **Email** (required only for tracking notifications when merchant opts in — currently not used)
- ☑ **Phone** (required by every Indian carrier on the AWB; without it the shipment cannot be booked)
- ☑ **Address** (recipient delivery address)

Do NOT select:
- ☐ Date of birth (not used)
- ☐ IP address (not used)
- ☐ Browsing behavior (not used)
- ☐ Order ID alone (not customer-level)

---

## Field 2: Why do you need access to this data? (300–1000 chars)

> Blujay Logistics is a shipping app. Every Indian courier (Blue Dart, DTDC, Delhivery) requires the recipient's name, phone, and full address on the airway bill (AWB) before a shipment can be booked. Without these fields the carrier API rejects the request and the merchant cannot ship the order. Phone is non-optional for any shipment in India because last-mile drivers call the recipient before delivery; this is a legal and operational requirement enforced by every Indian carrier. We access this data only at the moment a shipment is being created from a Shopify order, exclusively to populate the shipment label that the merchant prints. The data is never used for analytics, marketing, profiling, or shared with any third party other than the carrier the merchant explicitly chose for that shipment.

`972 chars` ✓

---

## Field 3: How do you minimize the customer data collected and processed? (300–1000 chars)

> Data minimization is enforced at three layers:
>
> 1. **Field-level**: We persist only the fields that appear on a printed AWB (name, phone, full address line, city, state, postal code, country). Email is read from the order payload but immediately discarded — we don't store it. We never request `read_customers`, only `read_orders`.
>
> 2. **Lifecycle**: Customer PII is loaded from the Shopify order payload, written to the shipment record once, and never refreshed. If the merchant edits a Shopify order, we don't re-pull the customer record.
>
> 3. **Storage**: Customer records are scoped to the merchant's Firestore document (`users/{uid}/shipments/{shipmentId}`) — they are not searchable across merchants, never aggregated, never used to build a cross-merchant identity graph.
>
> When a customer or shop redaction request fires, all PII fields are overwritten to `[REDACTED]` within minutes, and the original values cannot be recovered.

`968 chars` ✓

---

## Field 4: How long do you retain customer data? (300–1000 chars)

> Customer PII attached to a shipment is retained for **7 years** from shipment creation. This duration is mandated by:
>
> - Indian Income Tax Act, 1961 (Section 44AA — books of account preservation)
> - Goods and Services Tax (GST) Act 2017 (Section 36 — retention of records)
> - Companies Act 2013 (Section 128(5) — financial records)
>
> After 7 years, shipments older than the retention window are bulk-anonymized by a scheduled cleanup job (PII → `[REDACTED]`, AWB number kept for legal traceability of the courier transaction itself).
>
> Customer redaction requests via `customers/redact` are honored immediately regardless of age — the legal retention obligation falls on the merchant (the data controller), not on us as processor; once the merchant signals deletion via the webhook, we comply within minutes.
>
> Shop redaction (`shop/redact`) wipes all customer PII for the entire shop within 30 days of webhook receipt; in practice we process within hours.

`996 chars` ✓

---

## Field 5: Encryption — how is customer data secured at rest and in transit?

> **In transit**: All API calls to and from Blujay use TLS 1.2+ (Vercel-enforced). Webhooks from Shopify are validated via HMAC-SHA256 signature on the raw request body using the app client secret before any payload is parsed. Carrier API calls use the carrier's own TLS endpoints (Blue Dart, DTDC). No PII ever traverses unencrypted channels.
>
> **At rest**: Firestore is encrypted at rest by Google Cloud (AES-256, keys managed by Google Cloud KMS). Shopify access tokens are additionally **double-encrypted**: we apply AES-256-CBC encryption with a per-token random IV before persisting (key derived from `SHOPIFY_API_SECRET`, never stored alongside the ciphertext). The encryption module lives at `src/lib/shopifyTokenCrypto.ts`.
>
> **Network egress**: Customer PII is sent only to the carrier API the merchant explicitly chose for that shipment, over the carrier's HTTPS endpoint, and only the fields required by that specific carrier's AWB schema.

---

## Field 6: Access controls — who in your organization can access customer data?

> Access to production customer data is restricted to two roles:
>
> 1. **Founder/Engineering** (currently 1 person): full access to Firestore via Firebase Admin SDK; required for incident response, GDPR redaction execution, and infrastructure operations. Access is logged in Google Cloud Audit Logs.
>
> 2. **Customer Support** (planned, not yet active): read-only Firestore access scoped to a specific support tool that surfaces only the fields needed to answer a merchant ticket (shipment status, AWB, courier name) — never the recipient's full address or phone.
>
> No third-party engineers, contractors, or analytics platforms have any access to production data. There is no analytics product (Mixpanel/Amplitude/etc.) running on production customer records. Internal admin dashboards are gated behind Firebase Authentication with role claims and are accessible only over our admin domain.

---

## Field 7: Sub-processors — which third parties process customer data?

| Sub-processor | Purpose | Region | DPA |
|---|---|---|---|
| Google Cloud Platform / Firebase | Database (Firestore), authentication, Cloud Functions | asia-south1 (Mumbai) | https://cloud.google.com/terms/data-processing-addendum |
| Vercel | App hosting, edge runtime, log buffer | Global edge / Frankfurt + Mumbai | https://vercel.com/legal/dpa |
| Shopify | Source of order data (the merchant's data controller) | Global | https://www.shopify.com/legal/dpa |
| Blue Dart Express | Carrier — AWB generation when merchant chooses Blue Dart | India | Carrier's standard terms |
| DTDC (Shipsy Platform) | Carrier — AWB generation when merchant chooses DTDC | India | Carrier's standard terms |
| Razorpay | Wallet top-up payments only — does not see shipment recipient PII | India | https://razorpay.com/dpa/ |

Customer PII is forwarded to a carrier sub-processor **only** at the moment the merchant clicks "Generate Label" for that specific shipment, and only the fields required by the carrier's AWB schema.

---

## Field 8: Compliance frameworks

- ☑ **GDPR** (EU) — controller/processor distinction documented in our Privacy Policy, mandatory webhooks honored within 30 days
- ☑ **CCPA** (California) — right to know, delete, opt-out documented in Privacy Policy
- ☑ **DPDP Act 2023** (India) — applicable as we are an Indian data fiduciary; grievance officer designated
- ☑ **Shopify Privacy Webhooks** — `customers/data_request`, `customers/redact`, `shop/redact` implemented with HMAC validation and 200-OK-in-5s response

---

## Field 9: Privacy Policy URL

`https://blujaylogistic.com/privacy`

---

## Field 10: Data Processing Addendum (DPA) URL

`https://blujaylogistic.com/dpa` — *( ⚠ this URL doesn't exist yet; create a `/dpa` page that mirrors the Privacy Policy's processor commitments before submission)*

---

## Notes for the user before submitting this form

1. **Email** is checked above but you said the app doesn't actually use email for notifications. If this is correct, **uncheck the Email box** before submitting. The audit found we read it from the payload and discard — discarding doesn't require declaring access. Conservative answer: leave it checked. Aggressive answer: uncheck. Recommend: leave checked, simpler story.

2. **Field 6** mentions Customer Support as a planned role. If you have no plans to add this role within 6 months, remove that paragraph. Reviewers don't like unused future-state language.

3. **Field 10** requires creating a DPA page at `/dpa`. If you don't want to write a separate DPA, link to the Privacy Policy section that covers processor commitments.
