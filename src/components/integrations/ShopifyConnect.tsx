
'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, ShoppingBag, Unlink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { toast } from 'sonner';

export function ShopifyConnect() {
    const { currentUser, retryAuth } = useAuth();
    const [shopUrl, setShopUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    const isConnected = currentUser?.shopifyConfig?.isConnected;
    const connectedShop = currentUser?.shopifyConfig?.shopUrl;

    const handleConnect = () => {
        if (!shopUrl) return;

        setLoading(true);

        let cleanShop = shopUrl.replace('https://', '').replace('http://', '').replace(/\/$/, '');
        if (!cleanShop.includes('.')) {
            cleanShop = `${cleanShop}.myshopify.com`;
        }

        const installUrl = `/api/integrations/shopify/install?shop=${encodeURIComponent(cleanShop)}&userId=${currentUser?.id}`;
        window.location.href = installUrl;
    };

    const handleDisconnect = async () => {
        if (!currentUser?.id) return;

        setDisconnecting(true);
        try {
            await updateDoc(doc(db, 'users', currentUser.id), {
                shopifyConfig: deleteField()
            });
            toast.success('Shopify disconnected successfully');
            await retryAuth();
        } catch (error) {
            console.error('Failed to disconnect:', error);
            toast.error('Failed to disconnect Shopify. Please try again.');
        } finally {
            setDisconnecting(false);
        }
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
                        Your orders are syncing automatically. Tracking info syncs back to Shopify when shipments are booked.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Connected to: {connectedShop}</span>
                    </div>
                    {currentUser?.shopifyConfig?.webhookStatus === 'failed' && (
                        <div className="flex items-center gap-2 text-sm text-amber-600 font-medium mt-1">
                            <AlertCircle className="h-4 w-4" />
                            <span>Webhook issue: Orders may not sync. Try reconnecting.</span>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex gap-2">
                    <Button
                        variant="outline"
                        className="border-red-200 hover:bg-red-50 text-red-600"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                    >
                        <Unlink className="h-4 w-4 mr-2" />
                        {disconnecting ? 'Disconnecting...' : 'Disconnect'}
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
                    <AlertTitle>Connect Your Shopify Store</AlertTitle>
                    <AlertDescription>
                        Enter your store URL and you will be redirected to Shopify to authorize the Blujay Logistics app.
                        New orders will sync automatically, and tracking info will be pushed back to Shopify when shipments are booked.
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
                                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        Enter your myshopify.com domain (e.g., brand-name.myshopify.com)
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
