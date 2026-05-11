'use client';

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShopifyConnect } from "@/components/integrations/ShopifyConnect";
import { CourierConnectDialog } from "@/components/integrations/CourierConnectDialog";
import { ApiKeyManager } from "@/components/integrations/ApiKeyManager";
import { useAuth } from "@/contexts/AuthContext";
import {
    ShoppingBag,
    Globe,
    Search,
    CheckCircle2,
    Plus,
    Zap,
    Store,
    Puzzle,
    Truck,
    ShieldCheck,
    Loader2,
    RefreshCcw,
    AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { COURIER_REGISTRY, type CourierRegistryEntry } from "@/config/courierRegistry";
import {
    listCourierIntegrations,
    disconnectCourier,
    testCourierConnection,
    type ListedIntegration,
} from "@/services/courierIntegrationService";
import { formatDistanceToNow } from "date-fns";

const platforms = [
    {
        id: "shopify",
        name: "Shopify",
        description: "Auto-sync orders, inventory and shipping status with your Shopify store.",
        icon: ShoppingBag,
        category: "E-commerce",
        status: "available",
        color: "bg-emerald-500",
        accent: "text-emerald-500",
        bg: "bg-emerald-500/10"
    },
    {
        id: "woocommerce",
        name: "WooCommerce",
        description: "Connect your WordPress store for seamless label generation and tracking.",
        icon: Store,
        category: "E-commerce",
        status: "available",
        color: "bg-purple-600",
        accent: "text-purple-600",
        bg: "bg-purple-600/10"
    },
    {
        id: "magento",
        name: "Magento 2",
        description: "Enterprise-grade integration for large scale Adobe Commerce stores.",
        icon: Globe,
        category: "E-commerce",
        status: "available",
        color: "bg-orange-600",
        accent: "text-orange-600",
        bg: "bg-orange-600/10"
    },
    {
        id: "amazon",
        name: "Amazon Seller",
        description: "Fulfill your Amazon orders directly through Blujay Logistics.",
        icon: ShoppingBag,
        category: "Marketplace",
        status: "available",
        color: "bg-amber-500",
        accent: "text-amber-500",
        bg: "bg-amber-500/10"
    },
    {
        id: "ebay",
        name: "eBay",
        description: "Global marketplace integration for international shipping and customs.",
        icon: Globe,
        category: "Marketplace",
        status: "available",
        color: "bg-blue-600",
        accent: "text-blue-600",
        bg: "bg-blue-600/10"
    }
];

const ClientIntegrations = () => {
    const { currentUser, retryAuth, refreshClient } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [isShopifyModalOpen, setIsShopifyModalOpen] = useState(false);

    // --- Courier integrations state ---
    const [courierDialogFor, setCourierDialogFor] = useState<CourierRegistryEntry | null>(null);
    const [courierIntegrations, setCourierIntegrations] = useState<ListedIntegration[]>([]);
    const [couriersLoading, setCouriersLoading] = useState(true);
    const [testingCourier, setTestingCourier] = useState<string | null>(null);
    const [disconnectTarget, setDisconnectTarget] = useState<CourierRegistryEntry | null>(null);
    const [disconnectLoading, setDisconnectLoading] = useState(false);

    const loadCourierIntegrations = useCallback(async () => {
        try {
            setCouriersLoading(true);
            const list = await listCourierIntegrations();
            setCourierIntegrations(list);
        } catch (err: any) {
            console.error("Failed to load courier integrations:", err);
        } finally {
            setCouriersLoading(false);
        }
    }, []);

    useEffect(() => {
        if (currentUser?.id) loadCourierIntegrations();
    }, [currentUser?.id, loadCourierIntegrations]);

    const getIntegration = (courierId: string) =>
        courierIntegrations.find((i) => i.courierId === courierId);

    const handleTestCourier = async (entry: CourierRegistryEntry) => {
        setTestingCourier(entry.id);
        try {
            const res = await testCourierConnection(entry.id);
            if (res.ok) {
                toast.success(`${entry.name} is reachable`, {
                    description: res.accountIdentifier,
                });
            } else {
                toast.error(`${entry.name} test failed`, { description: res.error });
            }
            await loadCourierIntegrations();
        } catch (err: any) {
            toast.error(err?.message || `Test failed`);
        } finally {
            setTestingCourier(null);
        }
    };

    const handleDisconnectConfirm = async () => {
        if (!disconnectTarget) return;
        setDisconnectLoading(true);
        try {
            await disconnectCourier(disconnectTarget.id);
            toast.success(`${disconnectTarget.name} disconnected`);
            await loadCourierIntegrations();
            setDisconnectTarget(null);
        } catch (err: any) {
            toast.error(err?.message || "Failed to disconnect");
        } finally {
            setDisconnectLoading(false);
        }
    };

    // Check for success/error/pending params from Shopify OAuth callback
    // We use window.location because Next.js useSearchParams might need Suspense boundary wrapper
    // which is annoying to refactor right now.
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('shopifySuccess') === 'true') {
                toast.success("Shopify Connected Successfully!", {
                    description: "Your store orders will now sync automatically."
                });
                retryAuth();
                window.history.replaceState({}, '', '/client-integrations');
            }

            // Custom Distribution: merchant authorized via Shopify but wasn't logged in here
            if (params.get('shopifyPending') === 'true') {
                const pendingShop = params.get('pendingShop') || '';
                toast.info("Shopify Store Authorized!", {
                    description: `Your store ${pendingShop ? `(${pendingShop}) ` : ''}was authorized. Click "Connect" on Shopify below and enter your store URL to complete the setup.`,
                    duration: 10000,
                });
                setIsShopifyModalOpen(true);
                window.history.replaceState({}, '', '/client-integrations');
            }

            const shopifyError = params.get('shopifyError');
            if (shopifyError) {
                const errorMessages: Record<string, string> = {
                    missing_params: 'Missing parameters from Shopify. Please try again.',
                    server_error: 'Server configuration error. Contact support.',
                    invalid_signature: 'Security verification failed. Please try again.',
                    invalid_state: 'Session expired or invalid. Please try connecting again.',
                    token_exchange_failed: 'Failed to authenticate with Shopify. Please try again.',
                    no_token: 'Shopify did not return an access token. Please try again.',
                    callback_failed: 'Connection failed. Please try again.',
                };
                toast.error("Shopify Connection Failed", {
                    description: errorMessages[shopifyError] || 'An unknown error occurred.'
                });
                window.history.replaceState({}, '', '/client-integrations');
            }
        }
    }, [retryAuth]);

    const isShopifyConnected = currentUser?.shopifyConfig?.isConnected;

    const handleConnect = (platformId: string, appName: string) => {
        if (platformId === 'shopify') {
            setIsShopifyModalOpen(true);
            return;
        }
        toast.info(`${appName} Coming Soon`, {
            description: "This integration is not yet available. Stay tuned!"
        });
    };

    const filteredPlatforms = platforms.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Store Integrations</h1>
                    <p className="text-muted-foreground">Connect your sales channels to automate order fulfillment.</p>
                </div>
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search platforms (Shopify, eBay...)"
                        className="pl-10 h-12 rounded-xl border-2 focus:border-primary shadow-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {/* Shopify Modal */}
                    <Dialog open={isShopifyModalOpen} onOpenChange={setIsShopifyModalOpen}>
                        <DialogContent className="sm:max-w-[500px] border-none bg-white dark:bg-slate-900 shadow-2xl">
                            <DialogHeader>
                                <DialogTitle>Connect Shopify</DialogTitle>
                            </DialogHeader>
                            <div className="mt-2">
                                <ShopifyConnect />
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Featured Integration */}
            <Card className="border-none shadow-xl bg-gradient-to-r from-primary to-blujay-dark text-white overflow-hidden relative">
                <CardContent className="p-10 relative z-10 flex flex-col md:flex-row items-center gap-10">
                    <div className="bg-white/20 p-6 rounded-[32px] backdrop-blur-xl border border-white/30">
                        <Zap className="h-16 w-16 text-secondary" />
                    </div>
                    <div className="space-y-4 flex-1 text-center md:text-left">
                        <h2 className="text-4xl font-black tracking-tight">One-Click Automation</h2>
                        <p className="text-white/80 text-lg font-medium max-w-2xl">
                            Connect your Shopify store today and get **Flat 10% Off** on all Air Express shipments for the first 30 days.
                        </p>
                        <Button
                            onClick={() => isShopifyConnected ? toast.info('Shopify is already connected!') : setIsShopifyModalOpen(true)}
                            className="h-14 px-8 rounded-2xl bg-white text-primary font-black uppercase tracking-widest hover:bg-secondary hover:text-white transition-all"
                        >
                            {isShopifyConnected ? 'Shopify Connected' : 'Setup Shopify Now'}
                        </Button>
                    </div>
                </CardContent>
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
            </Card>

            {/* Integration Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredPlatforms.map((platform) => (
                    <Card key={platform.id} className="border-none shadow-md hover:shadow-2xl transition-all duration-500 group overflow-hidden flex flex-col">
                        <div className={`h-2 ${platform.color}`} />
                        <CardHeader className="space-y-4">
                            <div className="flex justify-between items-start">
                                <div className={`p-4 rounded-2xl ${platform.bg}`}>
                                    <platform.icon className={`h-8 w-8 ${platform.accent}`} />
                                </div>
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-black">{platform.name}</CardTitle>
                                <CardDescription className="text-xs font-bold uppercase tracking-wider text-primary/60 mt-1">
                                    {platform.category}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 flex-1 flex flex-col">
                            <p className="text-sm text-muted-foreground font-medium leading-relaxed flex-1">
                                {platform.description}
                            </p>
                            <div className="pt-4 border-t border-muted/30">
                                {(platform.id === 'shopify' && isShopifyConnected) ? (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                                            <CheckCircle2 className="h-4 w-4" /> Active
                                        </div>
                                        <Button variant="ghost" size="sm" className="font-bold underline text-xs" onClick={() => setIsShopifyModalOpen(true)}>Manage</Button>
                                    </div>
                                ) : platform.status === 'available' ? (
                                    <Button
                                        onClick={() => handleConnect(platform.id, platform.name)}
                                        className="w-full h-12 rounded-xl font-black uppercase tracking-widest group-hover:bg-primary transition-all"
                                    >
                                        Connect <Plus className="h-4 w-4 ml-2" />
                                    </Button>
                                ) : (
                                    <Button disabled className="w-full h-12 rounded-xl font-black uppercase tracking-widest opacity-50">
                                        Notify Me
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {/* Custom API Webhook */}
                <Card className="border-none shadow-md border-2 border-dashed border-muted flex flex-col items-center justify-center p-10 text-center space-y-6 hover:border-primary/50 transition-all cursor-pointer group">
                    <div className="p-6 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
                        <Puzzle className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black">Custom Integration</h3>
                        <p className="text-sm text-muted-foreground mt-2">Integrate via Webhooks or our Developer API.</p>
                    </div>
                    <Button variant="outline" className="rounded-xl font-bold">Explore Docs</Button>
                </Card>
            </div>

            {/* Courier API Integrations */}
            <div className="pt-6 space-y-6">
                <div className="flex items-end justify-between flex-wrap gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Truck className="h-5 w-5 text-primary" />
                            <span className="text-xs uppercase tracking-[0.25em] font-bold text-primary/80">
                                Courier APIs
                            </span>
                        </div>
                        <h2 className="text-2xl font-extrabold tracking-tight">Bring your own courier account</h2>
                        <p className="text-sm text-muted-foreground max-w-2xl mt-1">
                            Plug in the API credentials for couriers you already have contracts with.
                            Once connected, the courier will appear as a booking option on Book Shipment —
                            with your rates, not ours.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={loadCourierIntegrations}
                        disabled={couriersLoading}
                        className="gap-2"
                    >
                        <RefreshCcw className={`h-3.5 w-3.5 ${couriersLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {COURIER_REGISTRY.map((c) => {
                        const integ = getIntegration(c.id);
                        const isConnected = integ?.status === 'connected';
                        const isError = integ?.status === 'error';
                        const comingSoon = c.status === 'coming_soon';

                        return (
                            <Card
                                key={c.id}
                                className={`border-none shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col ${
                                    isConnected ? 'ring-2 ring-emerald-400/40' : ''
                                }`}
                            >
                                <div className={`h-2 bg-gradient-to-r ${c.color}`} />
                                <CardHeader className="space-y-3">
                                    <div className="flex items-start justify-between">
                                        <div
                                            className={`h-12 w-12 rounded-xl bg-gradient-to-br ${c.color} grid place-items-center shadow-md`}
                                        >
                                            <span className="text-white font-extrabold text-lg">
                                                {c.name.charAt(0)}
                                            </span>
                                        </div>
                                        {comingSoon && !isConnected && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                                                Coming soon
                                            </span>
                                        )}
                                        {isConnected && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Connected
                                            </span>
                                        )}
                                        {isError && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-300">
                                                <AlertCircle className="h-3.5 w-3.5" />
                                                Error
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-black">{c.name}</CardTitle>
                                        <CardDescription className="text-xs font-bold uppercase tracking-wider text-primary/60 mt-0.5">
                                            {c.tagline}
                                        </CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col gap-4">
                                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                                        {c.description}
                                    </p>

                                    {isConnected && integ?.publicMeta && (
                                        <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Account</span>
                                                <span className="font-semibold truncate ml-2">
                                                    {integ.publicMeta.accountIdentifier ||
                                                        integ.publicMeta.environment}
                                                </span>
                                            </div>
                                            {integ.lastTestedAt && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Last tested</span>
                                                    <span className="font-medium">
                                                        {formatDistanceToNow(new Date(integ.lastTestedAt), {
                                                            addSuffix: true,
                                                        })}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isError && integ?.lastErrorMessage && (
                                        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-200">
                                            {integ.lastErrorMessage}
                                        </div>
                                    )}

                                    <div className="pt-2 border-t border-muted/40 flex gap-2">
                                        {isConnected ? (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() => handleTestCourier(c)}
                                                    disabled={testingCourier === c.id}
                                                >
                                                    {testingCourier === c.id ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                                                            Test
                                                        </>
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() => setCourierDialogFor(c)}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDisconnectTarget(c)}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                >
                                                    Disconnect
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                onClick={() => setCourierDialogFor(c)}
                                                disabled={comingSoon}
                                                className="w-full h-11 rounded-xl font-black uppercase tracking-widest"
                                            >
                                                {comingSoon ? 'Pending verification' : 'Connect'}
                                                {!comingSoon && <Plus className="h-4 w-4 ml-2" />}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Courier Connect Dialog */}
            <CourierConnectDialog
                courier={courierDialogFor}
                open={!!courierDialogFor}
                onOpenChange={(open) => !open && setCourierDialogFor(null)}
                onConnected={async () => { await Promise.all([loadCourierIntegrations(), refreshClient()]); }}
            />

            {/* Disconnect Confirmation */}
            <AlertDialog
                open={!!disconnectTarget}
                onOpenChange={(open) => !open && setDisconnectTarget(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Disconnect {disconnectTarget?.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove the stored API credentials. Existing shipments are not affected,
                            but you won't be able to book new ones through {disconnectTarget?.name} until you
                            reconnect.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={disconnectLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDisconnectConfirm}
                            disabled={disconnectLoading}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {disconnectLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Merchant API keys — for storefront → Blujay webhook auth */}
            <ApiKeyManager />
        </div>
    );
};

export default ClientIntegrations;
