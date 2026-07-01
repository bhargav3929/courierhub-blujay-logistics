const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

const SHOPIFY_API_VERSION = '2026-01';

// List all webhook subscriptions for a given topic on the shop.
// Returns an array of { id, callbackUrl } objects.
async function listWebhooksForTopic(
    shop: string,
    accessToken: string,
    topic: string
): Promise<Array<{ id: string; callbackUrl: string }>> {
    const gql = `
    query listWebhooks($topic: WebhookSubscriptionTopic!) {
      webhookSubscriptions(first: 20, topics: [$topic]) {
        nodes { id callbackUrl }
      }
    }`;
    try {
        const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
            body: JSON.stringify({ query: gql, variables: { topic } }),
        });
        const data = await res.json();
        return data.data?.webhookSubscriptions?.nodes ?? [];
    } catch {
        return [];
    }
}

// Delete a webhook subscription by its GID.
async function deleteWebhook(shop: string, accessToken: string, id: string): Promise<void> {
    const gql = `
    mutation delete($id: ID!) {
      webhookSubscriptionDelete(id: $id) { userErrors { message } }
    }`;
    await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ query: gql, variables: { id } }),
    });
}

// Register a single webhook subscription, ensuring exactly one exists.
// Any pre-existing subscriptions for this topic+URL are deleted first.
async function registerSingleWebhook(
    shop: string,
    accessToken: string,
    topic: string,
    callbackUrl: string
): Promise<{ success: boolean; error?: string }> {
    // 1. List existing subscriptions for this topic
    const existing = await listWebhooksForTopic(shop, accessToken, topic);
    const forThisUrl = existing.filter(w => w.callbackUrl === callbackUrl);

    // 2. If exactly one already exists for our URL, nothing to do
    if (forThisUrl.length === 1) {
        console.log(`[Shopify Webhook] ${topic} already registered for ${shop}, skipping`);
        return { success: true };
    }

    // 3. If duplicates exist (the root cause of double-firing), delete all but keep none — recreate cleanly
    for (const w of forThisUrl) {
        console.log(`[Shopify Webhook] Removing duplicate ${topic} subscription ${w.id} for ${shop}`);
        await deleteWebhook(shop, accessToken, w.id);
    }

    // 4. Create fresh subscription
    const createGql = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        userErrors { field message }
        webhookSubscription { id }
      }
    }`;

    const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ query: createGql, variables: { topic, webhookSubscription: { callbackUrl, format: 'JSON' } } }),
    });

    const result = await res.json();
    if (result.data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
        return { success: false, error: result.data.webhookSubscriptionCreate.userErrors[0].message };
    }
    return { success: true };
}

export async function registerShopifyWebhook(
    shop: string,
    accessToken: string,
    webhookBasePath?: string
): Promise<{ success: boolean; error?: string }> {
    const webhookUrl = `${APP_URL}${webhookBasePath || '/api/integrations/shopify/webhook'}`;

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

        console.log(`[Shopify Webhook] Webhooks verified for ${shop}`);
        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Dedup webhook subscriptions for an already-connected shop without going
// through a full reinstall. Call this once per shop to clean up extra subs.
export async function deduplicateShopifyWebhooks(
    shop: string,
    accessToken: string,
    webhookBasePath?: string
): Promise<{ removed: number; error?: string }> {
    const callbackUrl = `${APP_URL}${webhookBasePath || '/api/integrations/shopify/webhook'}`;
    const topics = ['ORDERS_CREATE', 'APP_UNINSTALLED'];
    let removed = 0;
    try {
        for (const topic of topics) {
            const existing = await listWebhooksForTopic(shop, accessToken, topic);
            const forUrl = existing.filter(w => w.callbackUrl === callbackUrl);
            // Keep the first, delete the rest
            for (const w of forUrl.slice(1)) {
                await deleteWebhook(shop, accessToken, w.id);
                removed++;
                console.log(`[Shopify Webhook] Removed duplicate ${topic} sub ${w.id} for ${shop}`);
            }
        }
        return { removed };
    } catch (error: any) {
        return { removed, error: error.message };
    }
}
