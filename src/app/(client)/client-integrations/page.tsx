'use client';

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
    ShoppingBag,
    Globe,
    Search,
    Plus,
    Zap,
    Store,
    Puzzle,
    Truck,
    ShieldCheck,
    Loader2,
    RefreshCcw,
    AlertCircle,
    Cable,
    Sparkles,
    ArrowRight,
    KeyRound,
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
        accent: "text-emerald-600",
        bg: "bg-emerald-500/10",
        ring: "ring-emerald-500/20",
        live: true,
        logoUrl: "https://cdn.simpleicons.org/shopify/95BF47",
    },
    {
        id: "woocommerce",
        name: "WooCommerce",
        description: "Connect your WordPress store for seamless label generation and tracking.",
        icon: Store,
        category: "E-commerce",
        accent: "text-purple-600",
        bg: "bg-purple-500/10",
        ring: "ring-purple-500/20",
        live: false,
        logoUrl: "/logos/woocommerce.png",
    },
    {
        id: "magento",
        name: "Magento 2",
        description: "Enterprise-grade integration for large-scale Adobe Commerce stores.",
        icon: Globe,
        category: "E-commerce",
        accent: "text-orange-600",
        bg: "bg-orange-500/10",
        ring: "ring-orange-500/20",
        live: false,
        logoUrl: "/logos/magento.png",
    },
    {
        id: "amazon",
        name: "Amazon Seller",
        description: "Fulfil your Amazon orders directly through Blujay Logistics.",
        icon: ShoppingBag,
        category: "Marketplace",
        accent: "text-amber-600",
        bg: "bg-amber-500/10",
        ring: "ring-amber-500/20",
        live: false,
        logoUrl: "/logos/amazon.png",
    },
    {
        id: "ebay",
        name: "eBay",
        description: "Global marketplace integration for international shipping and customs.",
        icon: Globe,
        category: "Marketplace",
        accent: "text-blue-600",
        bg: "bg-blue-500/10",
        ring: "ring-blue-500/20",
        live: false,
        logoUrl: "/logos/ebay.png",
    },
] as const;

// Local logo files in /public/logos/. Couriers not listed here fall back to
// the gradient letter tile. Drop a matching JPG/SVG here to enable a logo for
// a new courier (filename must match the id, e.g. `ecom_express.jpg`).
const COURIER_LOGOS: Record<string, string> = {
    bluedart: "/logos/bluedart.png",
    delhivery: "/logos/delhivery.png",
    dtdc: "/logos/dtdc.png",
    ecom_express: "/logos/ecom_express.png",
    xpressbees: "/logos/xpressbees.png",
};

type Platform = (typeof platforms)[number];

// ----------------------------------------------------------------------------
// Renders a brand logo with graceful fallback to a custom node (lucide icon
// or letter tile) if the image fails to load. Lets us mix local files and
// CDN-hosted SVGs without breaking the layout when one is missing.
// ----------------------------------------------------------------------------
function IntegrationLogo({
    src,
    alt,
    fallback,
    className,
}: {
    src?: string;
    alt: string;
    fallback: React.ReactNode;
    className?: string;
}) {
    const [errored, setErrored] = useState(false);
    if (!src || errored) return <>{fallback}</>;
    return (
        // Plain <img> instead of next/image — these are small icons and
        // avoiding the external-domain whitelist in next.config keeps the
        // setup zero-config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={alt}
            onError={() => setErrored(true)}
            className={className}
        />
    );
}

// ----------------------------------------------------------------------------
// Status pill — used across both channel cards and courier cards so the visual
// language is identical regardless of integration kind.
// ----------------------------------------------------------------------------
type PillTone = "active" | "available" | "soon" | "error";
function StatusPill({ tone, label }: { tone: PillTone; label: string }) {
    const styles: Record<PillTone, string> = {
        active:
            "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
        available:
            "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
        soon: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
        error: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
    };
    return (
        <Badge
            variant="outline"
            className={cn(
                "h-5 px-2 text-[10px] font-medium gap-1 rounded-full",
                styles[tone]
            )}
        >
            {tone === "active" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            {tone === "error" && <AlertCircle className="h-2.5 w-2.5" />}
            {label}
        </Badge>
    );
}

// Section header with title, optional eyebrow icon, optional count chip + action.
function SectionHeader({
    icon: Icon,
    eyebrow,
    title,
    description,
    count,
    action,
}: {
    icon?: React.ComponentType<{ className?: string }>;
    eyebrow?: string;
    title: string;
    description?: string;
    count?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="space-y-1">
                {eyebrow && (
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold text-blue-600 dark:text-blue-400">
                        {Icon && <Icon className="h-3.5 w-3.5" />}
                        {eyebrow}
                    </div>
                )}
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        {title}
                    </h2>
                    {count && (
                        <span className="text-xs text-muted-foreground font-medium">{count}</span>
                    )}
                </div>
                {description && (
                    <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                        {description}
                    </p>
                )}
            </div>
            {action}
        </div>
    );
}

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
        } catch (err) {
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
        } catch (err) {
            toast.error((err as Error)?.message || "Test failed");
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
        } catch (err) {
            toast.error((err as Error)?.message || "Failed to disconnect");
        } finally {
            setDisconnectLoading(false);
        }
    };

    // Shopify OAuth callback param handling — preserved verbatim from the
    // previous design.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("shopifySuccess") === "true") {
            toast.success("Shopify Connected Successfully!", {
                description: "Your store orders will now sync automatically.",
            });
            retryAuth();
            window.history.replaceState({}, "", "/client-integrations");
        }
        if (params.get("shopifyPending") === "true") {
            const pendingShop = params.get("pendingShop") || "";
            toast.info("Shopify Store Authorized!", {
                description: `Your store ${
                    pendingShop ? `(${pendingShop}) ` : ""
                }was authorized. Click "Connect" on Shopify below and enter your store URL to complete the setup.`,
                duration: 10000,
            });
            setIsShopifyModalOpen(true);
            window.history.replaceState({}, "", "/client-integrations");
        }
        const shopifyError = params.get("shopifyError");
        if (shopifyError) {
            const errorMessages: Record<string, string> = {
                missing_params: "Missing parameters from Shopify. Please try again.",
                server_error: "Server configuration error. Contact support.",
                invalid_signature: "Security verification failed. Please try again.",
                invalid_state: "Session expired or invalid. Please try connecting again.",
                token_exchange_failed: "Failed to authenticate with Shopify. Please try again.",
                no_token: "Shopify did not return an access token. Please try again.",
                callback_failed: "Connection failed. Please try again.",
            };
            toast.error("Shopify Connection Failed", {
                description: errorMessages[shopifyError] || "An unknown error occurred.",
            });
            window.history.replaceState({}, "", "/client-integrations");
        }
    }, [retryAuth]);

    const isShopifyConnected = !!currentUser?.shopifyConfig?.isConnected;

    const handleConnectChannel = (platform: Platform) => {
        if (platform.id === "shopify") {
            setIsShopifyModalOpen(true);
            return;
        }
        toast.info(`${platform.name} Coming Soon`, {
            description: "This integration is not yet available. Stay tuned!",
        });
    };

    // ---- Filters & derived counts -------------------------------------------
    const q = searchQuery.trim().toLowerCase();
    const filteredPlatforms = q
        ? platforms.filter(
              (p) =>
                  p.name.toLowerCase().includes(q) ||
                  p.category.toLowerCase().includes(q)
          )
        : platforms;

    const channelsConnected = isShopifyConnected ? 1 : 0;
    const couriersConnected = courierIntegrations.filter(
        (i) => i.status === "connected"
    ).length;
    const couriersAvailable = COURIER_REGISTRY.filter(
        (c) => c.status !== "coming_soon"
    ).length;

    return (
        <div className="space-y-10 animate-in fade-in duration-700 pb-20">
            {/* ----- Page header -------------------------------------------- */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-sm shadow-blue-500/30">
                            <Cable className="h-5 w-5 text-white" />
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight">Integrations</h1>
                    </div>
                    <p className="text-muted-foreground max-w-2xl">
                        Connect your sales channels and courier accounts. Orders sync in,
                        labels go out — Blujay sits in the middle and handles the busywork.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search channels..."
                            className="pl-9 h-10 rounded-lg"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* ----- Stats strip -------------------------------------------- */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile
                    label="Channels connected"
                    value={`${channelsConnected} / ${platforms.length}`}
                    tone="emerald"
                    icon={Store}
                />
                <StatTile
                    label="Couriers active"
                    value={`${couriersConnected} / ${couriersAvailable}`}
                    tone="blue"
                    icon={Truck}
                    loading={couriersLoading}
                />
                <StatTile
                    label="Total integrations"
                    value={`${platforms.length + COURIER_REGISTRY.length}`}
                    tone="violet"
                    icon={Puzzle}
                />
                <StatTile
                    label="API keys"
                    value="Manage"
                    tone="slate"
                    icon={KeyRound}
                    href="/client-merchant-api-keys"
                />
            </div>

            {/* ----- Sales Channels ----------------------------------------- */}
            <section className="space-y-5">
                <SectionHeader
                    icon={Store}
                    eyebrow="Sales Channels"
                    title="Where your orders come from"
                    description="Plug in the storefronts you sell on. Paid orders flow into Blujay automatically — no manual entry."
                    count={`${filteredPlatforms.length} of ${platforms.length}`}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredPlatforms.map((p) => {
                        const connected = p.id === "shopify" && isShopifyConnected;
                        return (
                            <Card
                                key={p.id}
                                className={cn(
                                    "border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-200 group overflow-hidden",
                                    connected
                                        ? "ring-2 ring-emerald-500/30 border-emerald-200 dark:border-emerald-900"
                                        : "hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md"
                                )}
                            >
                                <CardContent className="p-5 space-y-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="h-16 w-16 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm grid place-items-center p-1 overflow-hidden">
                                            <IntegrationLogo
                                                src={p.logoUrl}
                                                alt={`${p.name} logo`}
                                                className="h-full w-full object-contain"
                                                fallback={
                                                    <p.icon
                                                        className={cn("h-7 w-7", p.accent)}
                                                    />
                                                }
                                            />
                                        </div>
                                        {connected ? (
                                            <StatusPill tone="active" label="Connected" />
                                        ) : p.live ? (
                                            <StatusPill tone="available" label="Available" />
                                        ) : (
                                            <StatusPill tone="soon" label="Coming soon" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100">
                                            {p.name}
                                        </h3>
                                        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-0.5">
                                            {p.category}
                                        </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed min-h-[2.5rem]">
                                        {p.description}
                                    </p>
                                    <div className="pt-1">
                                        {connected ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setIsShopifyModalOpen(true)}
                                                className="w-full justify-between"
                                            >
                                                Manage
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                onClick={() => handleConnectChannel(p)}
                                                className="w-full"
                                                disabled={!p.live}
                                                variant={p.live ? "default" : "outline"}
                                            >
                                                {p.live ? (
                                                    <>
                                                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                                                        Connect
                                                    </>
                                                ) : (
                                                    "Notify me"
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}

                    {/* Empty state when search matches nothing */}
                    {filteredPlatforms.length === 0 && (
                        <div className="col-span-full text-center text-sm text-muted-foreground py-10">
                            No channels match "{searchQuery}".
                        </div>
                    )}
                </div>
            </section>

            {/* ----- Courier APIs ------------------------------------------- */}
            <section className="space-y-5">
                <SectionHeader
                    icon={Truck}
                    eyebrow="Courier APIs"
                    title="Bring your own courier account"
                    description="Plug in API credentials for couriers you already have contracts with. Once connected, they appear as booking options with your rates, not ours."
                    count={`${couriersConnected} / ${couriersAvailable} active`}
                    action={
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadCourierIntegrations}
                            disabled={couriersLoading}
                            className="gap-2"
                        >
                            <RefreshCcw
                                className={cn("h-3.5 w-3.5", couriersLoading && "animate-spin")}
                            />
                            Refresh
                        </Button>
                    }
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {COURIER_REGISTRY.map((c) => {
                        const integ = getIntegration(c.id);
                        // Blue Dart is the platform default — every client ships through it
                        // using Blujay's contracted credentials unless they connect their own.
                        const isPlatformDefault = c.id === "bluedart" && !integ;
                        const isConnected = integ?.status === "connected" || isPlatformDefault;
                        const isError = integ?.status === "error";
                        const comingSoon = c.status === "coming_soon";

                        return (
                            <Card
                                key={c.id}
                                className={cn(
                                    "border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-200 overflow-hidden",
                                    isConnected
                                        ? "ring-2 ring-emerald-500/30 border-emerald-200 dark:border-emerald-900"
                                        : isError
                                        ? "ring-2 ring-rose-500/30 border-rose-200 dark:border-rose-900"
                                        : "hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md"
                                )}
                            >
                                <CardContent className="p-5 space-y-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="h-16 w-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 grid place-items-center shadow-sm shrink-0">
                                            <IntegrationLogo
                                                src={COURIER_LOGOS[c.id]}
                                                alt={`${c.name} logo`}
                                                className="h-full w-full object-contain p-1"
                                                fallback={
                                                    <div
                                                        className={cn(
                                                            "h-full w-full bg-gradient-to-br grid place-items-center",
                                                            c.color
                                                        )}
                                                    >
                                                        <span className="text-white font-bold text-lg">
                                                            {c.name.charAt(0)}
                                                        </span>
                                                    </div>
                                                }
                                            />
                                        </div>
                                        {isConnected ? (
                                            <StatusPill tone="active" label="Connected" />
                                        ) : isError ? (
                                            <StatusPill tone="error" label="Error" />
                                        ) : comingSoon ? (
                                            <StatusPill tone="soon" label="Coming soon" />
                                        ) : (
                                            <StatusPill tone="available" label="Not connected" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100">
                                            {c.name}
                                        </h3>
                                        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-0.5">
                                            {c.tagline}
                                        </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed min-h-[2.5rem]">
                                        {c.description}
                                    </p>

                                    {isPlatformDefault && (
                                        <div className="rounded-md bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/60 p-2.5 text-xs space-y-1">
                                            <div className="flex justify-between gap-2">
                                                <span className="text-muted-foreground">Account</span>
                                                <span className="font-medium font-mono text-emerald-800 dark:text-emerald-200">
                                                    Managed by Blujay · Production
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 leading-snug">
                                                Every client ships through Blujay's Blue Dart contract by default. Connect your own credentials below to override.
                                            </div>
                                        </div>
                                    )}

                                    {isConnected && !isPlatformDefault && integ?.publicMeta && (
                                        <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 p-2.5 text-xs space-y-1">
                                            <div className="flex justify-between gap-2">
                                                <span className="text-muted-foreground">Account</span>
                                                <span className="font-medium truncate font-mono">
                                                    {integ.publicMeta.accountIdentifier ||
                                                        integ.publicMeta.environment}
                                                </span>
                                            </div>
                                            {integ.lastTestedAt && (
                                                <div className="flex justify-between gap-2">
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
                                        <div className="rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-2.5 text-xs text-rose-700 dark:text-rose-200">
                                            {integ.lastErrorMessage}
                                        </div>
                                    )}

                                    <div className="pt-1 flex gap-1.5">
                                        {isPlatformDefault ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => setCourierDialogFor(c)}
                                            >
                                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                                Connect your own account
                                            </Button>
                                        ) : isConnected ? (
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
                                                            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
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
                                                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2"
                                                    aria-label={`Disconnect ${c.name}`}
                                                >
                                                    ×
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                onClick={() => setCourierDialogFor(c)}
                                                disabled={comingSoon}
                                                size="sm"
                                                className="w-full"
                                                variant={comingSoon ? "outline" : "default"}
                                            >
                                                {comingSoon ? (
                                                    "Pending verification"
                                                ) : (
                                                    <>
                                                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                                                        Connect
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>

            {/* ----- Developer / custom integration ------------------------- */}
            <section className="space-y-3">
                <Card className="border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40">
                    <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="h-11 w-11 rounded-xl bg-slate-200/70 dark:bg-slate-800 grid place-items-center shrink-0">
                            <Puzzle className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                                Build your own integration
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                                Sell on a custom website or a platform we don't list? Push paid
                                orders into Blujay directly with a Merchant API key.
                            </p>
                        </div>
                        <Link href="/client-merchant-api-keys" className="shrink-0">
                            <Button variant="outline" size="sm" className="gap-1.5">
                                <KeyRound className="h-3.5 w-3.5" />
                                Manage API keys
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </section>

            {/* ----- Shopify promo (only when not connected) ---------------- */}
            {!isShopifyConnected && (
                <section>
                    <Card className="border-none bg-gradient-to-r from-blue-600 via-blue-600 to-violet-600 text-white shadow-lg overflow-hidden relative">
                        <CardContent className="p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center gap-5 relative z-10">
                            <div className="h-12 w-12 rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur grid place-items-center shrink-0">
                                <Zap className="h-6 w-6 text-amber-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                                    <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/80">
                                        Limited launch offer
                                    </span>
                                </div>
                                <div className="font-bold text-lg leading-snug">
                                    Connect Shopify, get 10% off Air Express for 30 days
                                </div>
                                <p className="text-sm text-white/80 mt-0.5 leading-relaxed">
                                    One-click OAuth — your Shopify orders show up here ready to ship.
                                </p>
                            </div>
                            <Button
                                onClick={() => setIsShopifyModalOpen(true)}
                                className="shrink-0 bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-sm"
                            >
                                Set up Shopify
                                <ArrowRight className="h-4 w-4 ml-1.5" />
                            </Button>
                        </CardContent>
                        <div className="absolute -right-12 -top-12 h-48 w-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                    </Card>
                </section>
            )}

            {/* ----- Modals (preserved) ------------------------------------- */}
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

            <CourierConnectDialog
                courier={courierDialogFor}
                open={!!courierDialogFor}
                onOpenChange={(open) => !open && setCourierDialogFor(null)}
                onConnected={async () => {
                    await Promise.all([loadCourierIntegrations(), refreshClient()]);
                }}
            />

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
                            This removes the stored API credentials. Existing shipments are
                            not affected, but you won't be able to book new ones through{" "}
                            {disconnectTarget?.name} until you reconnect.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={disconnectLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDisconnectConfirm}
                            disabled={disconnectLoading}
                            className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
                        >
                            {disconnectLoading && (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            )}
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

// ----------------------------------------------------------------------------
// Tiny stat tile used in the top status strip. Optional `href` makes it act as
// a navigation card (used for the "API keys" tile).
// ----------------------------------------------------------------------------
function StatTile({
    label,
    value,
    tone,
    icon: Icon,
    loading,
    href,
}: {
    label: string;
    value: string;
    tone: "emerald" | "blue" | "violet" | "slate";
    icon: React.ComponentType<{ className?: string }>;
    loading?: boolean;
    href?: string;
}) {
    const tones: Record<"emerald" | "blue" | "violet" | "slate", string> = {
        emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
        blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
        violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
        slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    };

    const inner = (
        <Card
            className={cn(
                "border border-slate-200 dark:border-slate-700 shadow-sm transition-all",
                href && "hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md cursor-pointer"
            )}
        >
            <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("h-9 w-9 rounded-lg grid place-items-center shrink-0", tones[tone])}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        {label}
                    </div>
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums">
                        {loading ? (
                            <span className="inline-block h-3 w-12 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
                        ) : (
                            value
                        )}
                    </div>
                </div>
                {href && (
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
            </CardContent>
        </Card>
    );

    return href ? <Link href={href}>{inner}</Link> : inner;
}

export default ClientIntegrations;
