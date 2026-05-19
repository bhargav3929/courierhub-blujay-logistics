import type { AddressInput, ParcelInput } from '@/types/b2b/address';
import type { CarrierLabel } from '@/types/b2b/courier-adapter';
import type { ShipmentId } from '@/types/b2b/ids';

// Generates a Blujay-branded PDF for self_shipment shipments.
//
// Production swap path: replace `buildMinimalPdf` with a pdf-lib or
// puppeteer-based renderer for QR codes, barcodes, and richer typography.
// The class contract — `generate(input): Promise<CarrierLabel>` — stays the
// same. The booking saga's generate_label step doesn't change.
//
// Until that swap, we hand-roll a minimal valid PDF (A6 single page,
// Helvetica 10pt, text only). The QR/barcode upgrade is a single-file
// edit in this directory.

export interface SelfShipmentLabelInput {
    readonly shipmentId: ShipmentId;
    readonly origin: AddressInput;
    readonly destination: AddressInput;
    readonly parcel: ParcelInput;
}

export class SelfShipmentLabelGenerator {
    async generate(input: SelfShipmentLabelInput): Promise<CarrierLabel> {
        const trackingNumber = SelfShipmentLabelGenerator.buildTrackingNumber(input.shipmentId);
        const bytes = buildMinimalPdf({
            trackingNumber,
            origin: input.origin,
            destination: input.destination,
            parcel: input.parcel,
        });
        return {
            format: 'pdf',
            bytes,
            filename: `blujay-self-${trackingNumber}.pdf`,
        };
    }

    // Deterministic tracking reference: `BJ-<uppercase last 8 of shipmentId>`.
    // Stable across replays — the same shipmentId always yields the same
    // tracking number. Partners can render it as a QR pointing to
    // `https://<host>/track/<trackingNumber>` once that public route exists.
    static buildTrackingNumber(shipmentId: ShipmentId): string {
        const suffix = shipmentId.slice(-8).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
        return `BJ-${suffix}`;
    }
}

// ─── minimal hand-rolled PDF ─────────────────────────────────────────────
//
// Layout: A6-ish (300 × 400 pt). One Helvetica font. Plain text.
// Result is a valid PDF that opens in any viewer.

interface PdfInput {
    trackingNumber: string;
    origin: AddressInput;
    destination: AddressInput;
    parcel: ParcelInput;
}

function buildMinimalPdf(input: PdfInput): Uint8Array {
    const lines = buildLines(input);
    const contentStream = buildContentStream(lines);

    const objects: string[] = [
        // 1: Catalog
        '<</Type/Catalog/Pages 2 0 R>>',
        // 2: Pages
        '<</Type/Pages/Kids[3 0 R]/Count 1>>',
        // 3: Page
        '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
        // 4: Font
        '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
        // 5: Content stream
        `<</Length ${contentStream.length}>>\nstream\n${contentStream}\nendstream`,
    ];

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let i = 0; i < objects.length; i++) {
        offsets.push(out.length);
        out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefOffset = out.length;
    out += `xref\n0 ${objects.length + 1}\n`;
    out += `0000000000 65535 f \n`;
    for (const off of offsets) {
        out += `${off.toString().padStart(10, '0')} 00000 n \n`;
    }
    out += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\n`;
    out += `startxref\n${xrefOffset}\n%%EOF\n`;

    return new TextEncoder().encode(out);
}

function buildLines(input: PdfInput): string[] {
    const codAmount = input.parcel.isCod
        ? `Rs ${(input.parcel.codAmountPaise / 100).toFixed(2)}`
        : 'No';
    return [
        'BLUJAY LOGISTICS',
        '',
        `Tracking: ${input.trackingNumber}`,
        '',
        'FROM:',
        truncate(input.origin.name, 40),
        truncate(input.origin.line1, 40),
        truncate(`${input.origin.city}, ${input.origin.state} ${input.origin.pincode}`, 40),
        truncate(`Phone: ${input.origin.phone}`, 40),
        '',
        'TO:',
        truncate(input.destination.name, 40),
        truncate(input.destination.line1, 40),
        truncate(`${input.destination.city}, ${input.destination.state} ${input.destination.pincode}`, 40),
        truncate(`Phone: ${input.destination.phone}`, 40),
        '',
        `Weight: ${input.parcel.weightGrams} g`,
        `Contents: ${truncate(input.parcel.contents, 30)}`,
        `COD: ${codAmount}`,
    ];
}

function buildContentStream(lines: string[]): string {
    // BT … ET = "begin text" / "end text". Tf = set font. Td = move
    // position. Tj = show string. Leading newlines (TL/T*) for line breaks.
    const startX = 25;
    const startY = 370;
    const leading = 14;
    let s = 'BT\n/F1 10 Tf\n';
    s += `${startX} ${startY} Td\n`;
    s += `${leading} TL\n`;
    for (let i = 0; i < lines.length; i++) {
        const line = escapePdfString(lines[i]);
        if (i === 0) s += `(${line}) Tj\n`;
        else s += `T*\n(${line}) Tj\n`;
    }
    s += 'ET';
    return s;
}

function escapePdfString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
