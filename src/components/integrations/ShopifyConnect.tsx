
'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, ShoppingBag } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function ShopifyConnect() {
    const { currentUser } = useAuth();
    const [shopUrl, setShopUrl] = useState('');
    const [loading, setLoading] = useState(false);

    // Check if already connected
    // Note: TypeScript might complain if types weren't picked up globally yet, but we updated types.ts
    const isConnected = currentUser?.shopifyConfig?.isConnected;
    const connectedShop = currentUser?.shopifyConfig?.shopUrl;

    const handleConnect = () => {
        if (!shopUrl) return;

        setLoading(true);

        // Clean the URL to get just the subdomain or full myshopify domain
        let cleanShop = shopUrl.replace('https://', '').replace('http://', '').replace(/\/$/, '');
        if (!cleanShop.includes('.')) {
            // Assume just store name given
            cleanShop = `${cleanShop}.myshopify.com`;
        }

        // Redirect to our Install API
        // Pass userId to map the installation back to this user
        // In a real app, we might rely on cookie/session on the server, but explicit ID is robust for this flow
        const installUrl = `/api/integrations/shopify/install?shop=${cleanShop}&userId=${currentUser?.id}`;

        window.location.href = installUrl;
    };

    if (isConnected) {
        return (
            <Card className="border-green-200 bg-green-50/50">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-green-100 rounded-full">
                            <ShoppingBag className="h-5 w-5 text-green-600" />
                        </div>
                        <CardTitle className="text-green-700">Shopify Connected</CardTitle>
                    </div>
                    <CardDescription>
                        Your detailed orders are syncing automatically.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Connected to: {connectedShop}</span>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button variant="outline" className="border-green-200 hover:bg-green-100 text-green-700">
                        Manage Settings
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-slate-100 rounded-full">
                        <ShoppingBag className="h-5 w-5 text-slate-600" />
                    </div>
                    <CardTitle>Connect Shopify Store</CardTitle>
                </div>
                <CardDescription>
                    Automatically import orders from your Shopify store to CourierHub.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Alert className="bg-blue-50 border-blue-100 text-blue-800">
                    <AlertCircle className="h-4 w-4 text-blue-800" />
                    <AlertTitle>One-Click Integration</AlertTitle>
                    <AlertDescription>
                        Enter your store URL below. You will be redirected to Shopify to approve the CourierHub app.
                    </AlertDescription>
                </Alert>

                <div className="space-y-2">
                    <Label htmlFor="shop-url">Shopify Store URL</Label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">https://</span>
                            <Input
                                id="shop-url"
                                placeholder="your-store.myshopify.com"
                                className="pl-16"
                                value={shopUrl}
                                onChange={(e) => setShopUrl(e.target.value)}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        Example: brand-name.myshopify.com
                    </p>
                </div>
            </CardContent>
            <CardFooter>
                <Button
                    onClick={handleConnect}
                    disabled={!shopUrl || loading}
                    className="w-full bg-[#95BF47] hover:bg-[#86ac3f] text-white"
                >
                    {loading ? 'Connecting...' : 'Connect to Shopify'}
                </Button>
            </CardFooter>
        </Card>
    );
}
