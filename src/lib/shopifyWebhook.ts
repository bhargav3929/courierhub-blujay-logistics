const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export async function registerShopifyWebhook(
    shop: string,
    accessToken: string
): Promise<{ success: boolean; error?: string }> {
    const webhookUrl = `${APP_URL}/api/integrations/shopify/webhook`;

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
        topic: "ORDERS_CREATE",
        webhookSubscription: {
            callbackUrl: webhookUrl,
            format: "JSON"
        }
    };

    try {
        const response = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
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

        console.log('[Shopify Webhook] Registered successfully:', result.data?.webhookSubscriptionCreate?.webhookSubscription?.id);
        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
