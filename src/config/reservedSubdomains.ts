// Subdomains we must NEVER hand out to a tenant. Hitting any of these on
// {sub}.blujaylogistic.com would either collide with platform infrastructure,
// confuse the marketing site, or look like a phishing surface. Source of truth
// for both client-side (UX) and server-side (validation on create) checks.
//
// Keep this list aggressive — adding entries later is cheap, but reclaiming a
// subdomain that's already been used by a real tenant is not.

export const RESERVED_SUBDOMAINS = new Set<string>([
    // Platform / infra
    'www',
    'app',
    'api',
    'admin',
    'dashboard',
    'platform',
    'portal',
    'auth',
    'login',
    'signup',
    'signin',
    'logout',
    'register',
    'oauth',
    'sso',

    // Environments
    'dev',
    'staging',
    'stage',
    'test',
    'qa',
    'preview',
    'prod',
    'production',
    'beta',
    'alpha',

    // Common service subdomains
    'mail',
    'email',
    'smtp',
    'imap',
    'pop',
    'ftp',
    'sftp',
    'ssh',
    'webmail',
    'ns',
    'ns1',
    'ns2',

    // CDN / static
    'static',
    'cdn',
    'assets',
    'media',
    'img',
    'images',
    'files',
    'downloads',
    'uploads',

    // Content / marketing
    'blog',
    'docs',
    'help',
    'support',
    'status',
    'about',
    'contact',
    'pricing',
    'careers',
    'jobs',
    'press',
    'news',
    'community',
    'forum',

    // Commerce / billing
    'billing',
    'pay',
    'payment',
    'payments',
    'checkout',
    'invoice',
    'invoices',
    'subscribe',
    'subscription',
    'plans',
    'secure',
    'security',

    // Mobile / apps
    'm',
    'mobile',
    'ios',
    'android',
    'apps',

    // Brand handles we use elsewhere in the codebase
    'blujay',
    'blujaylogistic',
    'blujaylogistics',
    'shop',
    'store',

    // Existing Shopify app IDs (see src/config/shopifyApps.ts conventions)
    'shopify',
    'shopify-public',
    'client2',
    'client3',
    'looms',
    'gayatri',

    // Internal tenant-type identifiers — never let a tenant impersonate a class
    'b2b',
    'b2c',
    'whitelabel',
    'white-label',
    'franchise',
    'partner',
    'partners',
    'merchant',
    'merchants',

    // Misc
    'root',
    'superuser',
    'system',
    'service',
    'services',
    'go',
    'link',
    'links',
    'redirect',
    'health',
    'healthcheck',
    'ping',
    'metrics',
    'webhook',
    'webhooks',
    'callback',
    'callbacks',
]);

export function isReservedSubdomain(value: string): boolean {
    return RESERVED_SUBDOMAINS.has(value.toLowerCase());
}
