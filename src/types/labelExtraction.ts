// Types for the AI-powered shipping-label capture flow.
//
// A user photographs a courier label inside the chatbot; the server runs
// OCR + an LLM extraction pass and returns this structure. The chatbot then
// shows a review screen and (on confirm) prefills the existing add-shipment
// page via sessionStorage.

export type FieldConfidence = 'high' | 'medium' | 'low' | 'missing';

/** Structured shipment fields lifted from a label image. */
export interface ExtractedShipmentLabel {
    customerName: string;
    phone: string;
    altPhone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    /** Order ID / reference / AWB number printed on the label. */
    orderId: string;
    /** Free-text consignee block — used when the label has extra detail (company, attn, etc.). */
    consigneeNotes: string;
}

/** Per-field confidence parallel to ExtractedShipmentLabel. */
export type ExtractedShipmentConfidence = Record<keyof ExtractedShipmentLabel, FieldConfidence>;

/** Server response for POST /api/ocr/extract-shipment. */
export interface LabelExtractionResult {
    extracted: ExtractedShipmentLabel;
    confidence: ExtractedShipmentConfidence;
    /** Keys flagged for manual review (medium/low/missing). */
    lowConfidenceFields: Array<keyof ExtractedShipmentLabel>;
    /** Raw OCR text — useful for debugging and for showing the user "what we saw". */
    rawText: string;
    /** Provider that ran the OCR pass — useful in logs. */
    provider: string;
}

/** Empty value used while waiting for the server response. */
export const EMPTY_LABEL: ExtractedShipmentLabel = {
    customerName: '',
    phone: '',
    altPhone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    orderId: '',
    consigneeNotes: '',
};

export const EMPTY_CONFIDENCE: ExtractedShipmentConfidence = {
    customerName: 'missing',
    phone: 'missing',
    altPhone: 'missing',
    address: 'missing',
    city: 'missing',
    state: 'missing',
    pincode: 'missing',
    orderId: 'missing',
    consigneeNotes: 'missing',
};

/** Fields required to proceed with shipment creation. */
export const REQUIRED_FIELDS: Array<keyof ExtractedShipmentLabel> = [
    'customerName',
    'phone',
    'address',
    'city',
    'state',
    'pincode',
];
