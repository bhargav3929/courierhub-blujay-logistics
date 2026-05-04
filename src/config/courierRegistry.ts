/**
 * Courier Registry
 *
 * Single source of truth for every courier the platform supports integrating
 * with. Each entry declares:
 *   - `id`         stable Firestore key / internal identifier
 *   - `name`       exact string used in `Client.allowedCouriers` and `Shipment.courier`
 *                  (kept matching the existing code, which writes "Blue Dart", "DTDC", etc.)
 *   - `fields`     credential fields we collect from the client in the connect modal
 *   - `status`     'available' = fully wired + tested (clients can connect today)
 *                  'coming_soon' = UI is shown but the connect form is disabled
 *                  pending sandbox credential validation from our end
 *
 * IMPORTANT: flipping a courier from 'coming_soon' → 'available' requires:
 *   1. Implementing the `testConnection` server handler in
 *      /src/services/server/courierConnectHandlers.ts
 *   2. Teaching the booking routes to use the client's decrypted creds
 *   3. Running the real-credential smoke test described in that file's header
 */

export type CourierFieldType = 'text' | 'password' | 'select';

export interface CourierFieldDef {
    key: string;
    label: string;
    placeholder?: string;
    type: CourierFieldType;
    required: boolean;
    helpText?: string;
    options?: Array<{ value: string; label: string }>;
}

export interface CourierRegistryEntry {
    id: 'bluedart' | 'dtdc' | 'delhivery' | 'ecom_express' | 'xpressbees';
    name: string;           // matches Client.allowedCouriers casing
    tagline: string;
    description: string;
    category: 'Courier API';
    color: string;          // gradient accent, Tailwind classes
    docsUrl?: string;
    fields: CourierFieldDef[];
    status: 'available' | 'coming_soon';
}

export const COURIER_REGISTRY: CourierRegistryEntry[] = [
    {
        id: 'bluedart',
        name: 'Blue Dart',
        tagline: 'Premium air & surface express',
        description:
            'Connect your Blue Dart business account to book waybills and fetch live tracking status directly from Blue Dart APIs.',
        category: 'Courier API',
        color: 'from-blue-600 to-indigo-600',
        docsUrl: 'https://www.bluedart.com/api-integration',
        status: 'available',
        fields: [
            {
                key: 'licenseKey',
                label: 'License Key',
                type: 'password',
                required: true,
                placeholder: 'Your Blue Dart-issued license key',
                helpText: 'Provided by Blue Dart when your API account is created.',
            },
            {
                key: 'loginId',
                label: 'Login ID',
                type: 'text',
                required: true,
                placeholder: 'API login ID',
            },
            {
                key: 'customerCode',
                label: 'Customer Code (B2C)',
                type: 'text',
                required: true,
                placeholder: 'e.g. 302282',
                helpText: 'Your Blue Dart B2C eTail customer code. Used on every waybill.',
            },
            {
                key: 'customerCodeB2B',
                label: 'Customer Code (B2B)',
                type: 'text',
                required: false,
                placeholder: 'Optional — only if you ship B2B',
            },
            {
                key: 'areaCode',
                label: 'Origin Area Code',
                type: 'text',
                required: true,
                placeholder: 'e.g. HYD',
                helpText: '3-letter area code of your pickup hub.',
            },
            {
                key: 'environment',
                label: 'Environment',
                type: 'select',
                required: true,
                options: [
                    { value: 'production', label: 'Production' },
                    { value: 'sandbox', label: 'Sandbox / UAT' },
                ],
            },
        ],
    },
    {
        id: 'dtdc',
        name: 'DTDC',
        tagline: 'Pan-India ground & express',
        description:
            'Connect your DTDC Shipsy platform account. Book orders, fetch labels, and cancel shipments with your own customer code.',
        category: 'Courier API',
        color: 'from-red-600 to-orange-600',
        docsUrl: 'https://dtdcapi.shipsy.io',
        status: 'available',
        fields: [
            {
                key: 'apiKey',
                label: 'API Key',
                type: 'password',
                required: true,
                placeholder: 'Shipsy platform API key',
                helpText: 'From the DTDC Shipsy dashboard, under API settings.',
            },
            {
                key: 'customerCode',
                label: 'Customer Code',
                type: 'text',
                required: true,
                placeholder: 'Your DTDC customer code',
            },
            {
                key: 'trackingUsername',
                label: 'Tracking Username',
                type: 'text',
                required: false,
                placeholder: 'Optional — only needed for auto-tracking sync',
            },
            {
                key: 'trackingPassword',
                label: 'Tracking Password',
                type: 'password',
                required: false,
            },
            {
                key: 'environment',
                label: 'Environment',
                type: 'select',
                required: true,
                options: [
                    { value: 'production', label: 'Production' },
                    { value: 'sandbox', label: 'Sandbox / Alpha' },
                ],
            },
        ],
    },
    {
        id: 'delhivery',
        name: 'Delhivery',
        tagline: 'Largest 3PL, fastest PIN reach',
        description:
            'Connect your Delhivery API token to book shipments across 28k+ pincodes.',
        category: 'Courier API',
        color: 'from-emerald-600 to-teal-600',
        docsUrl: 'https://track.delhivery.com/api/',
        status: 'available',
        fields: [
            {
                key: 'apiToken',
                label: 'API Token',
                type: 'password',
                required: true,
                placeholder: 'Delhivery-issued token',
                helpText: 'Shown in your Delhivery Client Warehouse → API page.',
            },
            {
                key: 'clientName',
                label: 'Client Name',
                type: 'text',
                required: true,
                placeholder: 'Exact client/warehouse name Delhivery configured for you',
            },
            {
                key: 'pickupLocationName',
                label: 'Default Pickup Location Name',
                type: 'text',
                required: true,
                placeholder: 'e.g. Hyderabad-Madhapur-WH',
                helpText:
                    'Exact warehouse name registered with Delhivery (case-sensitive). Find it in Delhivery One → Settings → Warehouses. This is used as the default pickup location for every shipment booked with this account.',
            },
            {
                key: 'environment',
                label: 'Environment',
                type: 'select',
                required: true,
                options: [
                    { value: 'production', label: 'Production' },
                    { value: 'sandbox', label: 'Staging' },
                ],
            },
        ],
    },
    {
        id: 'ecom_express',
        name: 'Ecom Express',
        tagline: 'E-commerce specialist',
        description:
            'Connect your Ecom Express API credentials for forward + RTO shipments.',
        category: 'Courier API',
        color: 'from-amber-600 to-orange-600',
        docsUrl: 'https://api.ecomexpress.in',
        status: 'coming_soon',
        fields: [
            {
                key: 'username',
                label: 'API Username',
                type: 'text',
                required: true,
            },
            {
                key: 'password',
                label: 'API Password',
                type: 'password',
                required: true,
            },
            {
                key: 'environment',
                label: 'Environment',
                type: 'select',
                required: true,
                options: [
                    { value: 'production', label: 'Production' },
                    { value: 'sandbox', label: 'Staging' },
                ],
            },
        ],
    },
    {
        id: 'xpressbees',
        name: 'Xpressbees',
        tagline: 'Express surface & air',
        description:
            'Connect your Xpressbees merchant account for shipment creation and tracking.',
        category: 'Courier API',
        color: 'from-violet-600 to-fuchsia-600',
        docsUrl: 'https://shipment.xpressbees.com',
        status: 'coming_soon',
        fields: [
            {
                key: 'email',
                label: 'Merchant Email',
                type: 'text',
                required: true,
                placeholder: 'Email used to log in to Xpressbees',
            },
            {
                key: 'password',
                label: 'Password',
                type: 'password',
                required: true,
            },
            {
                key: 'environment',
                label: 'Environment',
                type: 'select',
                required: true,
                options: [
                    { value: 'production', label: 'Production' },
                    { value: 'sandbox', label: 'Staging' },
                ],
            },
        ],
    },
];

export const getCourierById = (id: string): CourierRegistryEntry | undefined =>
    COURIER_REGISTRY.find((c) => c.id === id);

export const getCourierByName = (name: string): CourierRegistryEntry | undefined =>
    COURIER_REGISTRY.find((c) => c.name === name);
