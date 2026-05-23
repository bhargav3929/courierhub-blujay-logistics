'use client';

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    CheckCircle2,
    AlertTriangle,
    Server,
    Store,
    RefreshCw,
    Users,
    Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EnvCheck { name: string; present: boolean; }

interface CourierStatus {
    id: string;
    name: string;
    hasFallback: boolean;
    requiredEnv: EnvCheck[];
    missing: string[];
    tenantsConnected: number;
}

interface ShopifyAppStatus {
    id: string;
    handle: string;
    name: string;
    clientId: string;
    apiKeyEnv: string;
    apiSecretEnv: string;
    configured: boolean;
    applicationUrl?: string;
    scopes?: string;
    webhookCount?: number;
    storesInstalled?: number;
}

interface StatusResponse {
    couriers: CourierStatus[];
    shopifyApps: ShopifyAppStatus[];
    fetchedAt: string;
}

const COURIER_LOGOS: Record<string, string> = {
    bluedart: "/logos/bluedart.png",
    delhivery: "/logos/delhivery.png",
    dtdc: "/logos/dtdc.png",
    ecom_express: "/logos/ecom_express.png",
    xpressbees: "/logos/xpressbees.png",
};

const COURIER_TILE_COLOR: Record<string, string> = {
    bluedart: "bg-blue-600",
    dtdc: "bg-red-600",
    delhivery: "bg-emerald-600",
    ecom_express: "bg-indigo-600",
    xpressbees: "bg-pink-600",
};

export default function AdminIntegrationsPage() {
    const { firebaseUser } = useAuth();
    const [data, setData] = useState<StatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchStatus = async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true);
            if (!firebaseUser) {
                toast.error("Not signed in");
                return;
            }
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/admin/integrations/status", {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            const json = (await res.json()) as StatusResponse;
            setData(json);
        } catch (err: any) {
            console.error("[admin-integrations] fetch failed", err);
            toast.error(err?.message || "Failed to load integration status");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Wait for Firebase auth to hydrate before fetching — otherwise on hard
    // refresh `firebaseUser` is null for ~50-200ms and we flash a false toast.
    useEffect(() => {
        if (firebaseUser) fetchStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firebaseUser]);

    return (
        <div className="space-y-8 pb-20 max-w-[1400px] mx-auto">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        Platform Integrations
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                        Master credentials and apps Blujay falls back to when a tenant
                        hasn&apos;t connected their own. Read-only — secrets are managed in
                        Vercel environment variables.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {data && (
                        <span className="text-xs text-muted-foreground">
                            Updated {new Date(data.fetchedAt).toLocaleTimeString()}
                        </span>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchStatus(true)}
                        disabled={refreshing || loading}
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* --- Couriers ---------------------------------------------------- */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <Server className="h-5 w-5 text-slate-600" />
                    <h2 className="text-xl font-semibold text-slate-800">Courier APIs</h2>
                    <span className="text-sm text-muted-foreground">
                        — fallback credentials used when a tenant hasn&apos;t connected their own account
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {loading
                        ? Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
                        : data?.couriers.map((c, i) => (
                            <motion.div
                                key={c.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                            >
                                <CourierCard courier={c} />
                            </motion.div>
                        ))}
                </div>
            </section>

            {/* --- Shopify apps ----------------------------------------------- */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <Store className="h-5 w-5 text-slate-600" />
                    <h2 className="text-xl font-semibold text-slate-800">Shopify Apps</h2>
                    <span className="text-sm text-muted-foreground">
                        — 5 separate Shopify apps, each with its own listing and webhook URLs
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {loading
                        ? Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
                        : data?.shopifyApps.map((app, i) => (
                            <motion.div
                                key={app.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                            >
                                <ShopifyAppCard app={app} />
                            </motion.div>
                        ))}
                </div>
            </section>
        </div>
    );
}

// ----------------------------------------------------------------------------

function CourierCard({ courier }: { courier: CourierStatus }) {
    const hasNoFallback = courier.requiredEnv.length === 0;
    return (
        <Card className="h-full transition-all duration-300 hover:shadow-md hover:border-slate-300">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="h-11 w-11 rounded-lg overflow-hidden border border-slate-200 bg-white grid place-items-center shadow-sm shrink-0">
                            {COURIER_LOGOS[courier.id] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={COURIER_LOGOS[courier.id]}
                                    alt={courier.name}
                                    className="h-full w-full object-contain p-1"
                                />
                            ) : (
                                <div className={cn("h-full w-full grid place-items-center text-white text-xs font-bold", COURIER_TILE_COLOR[courier.id])}>
                                    {courier.name.slice(0, 2).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <CardTitle className="text-base font-semibold leading-tight">
                            {courier.name}
                        </CardTitle>
                    </div>
                    <StatusBadge
                        ok={courier.hasFallback}
                        unavailable={hasNoFallback}
                    />
                </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
                {hasNoFallback ? (
                    <CardDescription className="text-xs leading-relaxed">
                        No platform fallback by design — every tenant must connect their own account.
                    </CardDescription>
                ) : courier.hasFallback ? (
                    <CardDescription className="text-xs leading-relaxed">
                        All {courier.requiredEnv.length} required env variables are set.
                        Tenants without their own creds will use this fallback automatically.
                    </CardDescription>
                ) : (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-800 text-xs font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Missing {courier.missing.length} env variable{courier.missing.length === 1 ? "" : "s"}
                        </div>
                        <ul className="text-[11px] text-amber-700 font-mono space-y-0.5 ml-5 list-disc">
                            {courier.missing.map((m) => <li key={m}>{m}</li>)}
                        </ul>
                    </div>
                )}

                <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3 w-3" />
                        Tenants connected
                    </span>
                    <span className="font-semibold text-slate-800">{courier.tenantsConnected}</span>
                </div>
            </CardContent>
        </Card>
    );
}

// ----------------------------------------------------------------------------

function ShopifyAppCard({ app }: { app: ShopifyAppStatus }) {
    return (
        <Card className="h-full transition-all duration-300 hover:shadow-md hover:border-slate-300">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="h-11 w-11 rounded-lg overflow-hidden border border-slate-200 bg-white grid place-items-center shadow-sm shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="https://cdn.simpleicons.org/shopify/95BF47"
                                alt="Shopify"
                                className="h-full w-full object-contain p-1.5"
                            />
                        </div>
                        <div className="min-w-0">
                            <CardTitle className="text-base font-semibold leading-tight truncate">
                                {app.name}
                            </CardTitle>
                            <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                                handle: {app.handle}
                            </p>
                        </div>
                    </div>
                    <StatusBadge ok={app.configured} />
                </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
                {app.clientId && (
                    <div className="text-xs space-y-1">
                        <div className="text-muted-foreground">Client ID</div>
                        <div className="font-mono text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1 break-all">
                            {app.clientId}
                        </div>
                    </div>
                )}

                {!app.configured && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-800 text-xs font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            API credentials not set
                        </div>
                        <ul className="text-[11px] text-amber-700 font-mono space-y-0.5 ml-5 list-disc">
                            <li>{app.apiKeyEnv}</li>
                            <li>{app.apiSecretEnv}</li>
                        </ul>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-slate-100">
                    <Stat
                        icon={<Webhook className="h-3 w-3" />}
                        label="Webhooks"
                        value={app.webhookCount ?? 0}
                    />
                    <Stat
                        icon={<Store className="h-3 w-3" />}
                        label="Stores installed"
                        value={app.storesInstalled ?? 0}
                    />
                </div>

                {app.applicationUrl && (
                    <a
                        href={app.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-600 hover:text-blue-700 hover:underline truncate"
                    >
                        {app.applicationUrl}
                    </a>
                )}
            </CardContent>
        </Card>
    );
}

// ----------------------------------------------------------------------------

function StatusBadge({ ok, unavailable }: { ok: boolean; unavailable?: boolean }) {
    if (unavailable) {
        return (
            <Badge variant="outline" className="text-slate-500 bg-slate-50 text-[10px] uppercase tracking-wider">
                Tenant-only
            </Badge>
        );
    }
    if (ok) {
        return (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 text-[10px] uppercase tracking-wider">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Configured
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[10px] uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Not configured
        </Badge>
    );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
    return (
        <div className="rounded-md border border-slate-100 bg-slate-50/40 p-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                {icon}
                {label}
            </div>
            <div className="text-base font-semibold text-slate-800 mt-0.5">{value}</div>
        </div>
    );
}

function CardSkeleton() {
    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-11 w-11 rounded-lg" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-5 w-20" />
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-8 w-full" />
            </CardContent>
        </Card>
    );
}
