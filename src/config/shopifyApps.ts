export type ShopifyAppId = 'default' | 'app2';

interface ShopifyAppConfig {
    apiKey: string;
    apiSecret: string;
}

export function getShopifyAppConfig(appId: ShopifyAppId): ShopifyAppConfig {
    switch (appId) {
        case 'app2':
            return {
                apiKey: process.env.SHOPIFY2_API_KEY || '',
                apiSecret: process.env.SHOPIFY2_API_SECRET || '',
            };
        case 'default':
        default:
            return {
                apiKey: process.env.SHOPIFY_API_KEY || '',
                apiSecret: process.env.SHOPIFY_API_SECRET || '',
            };
    }
}
