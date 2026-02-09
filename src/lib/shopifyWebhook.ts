const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

const SHOPIFY_API_VERSION = '2024-10';

async function registerSingleWebhook(
    shop: string,
    accessToken: string,
    topic: string,
    callbackUrl: string
): Promise<{ success: boolean; error?: string }> {
    const query = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        userErrors {
          field
          message
        }
        webhookSubscription {
          id
        }
      }
    }
  `;

    const variables = {
        topic,
        webhookSubscription: {
            callbackUrl,
            format: "JSON"
        }
    };

    const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();

    if (result.data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
        return { success: false, error: result.data.webhookSubscriptionCreate.userErrors[0].message };
    }

    return { success: true };
}

export async function registerShopifyWebhook(
    shop: string,
    accessToken: string
): Promise<{ success: boolean; error?: string }> {
    const webhookUrl = `${APP_URL}/api/integrations/shopify/webhook`;

    const topics = ['ORDERS_CREATE', 'APP_UNINSTALLED'];

    try {
        const results = await Promise.all(
            topics.map(topic => registerSingleWebhook(shop, accessToken, topic, webhookUrl))
        );

        const failed = results.find(r => !r.success);
        if (failed) {
            console.error('[Shopify Webhook] Partial failure:', failed.error);
            return failed;
        }

        console.log(`[Shopify Webhook] Registered ${topics.length} webhooks for ${shop}`);
        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
