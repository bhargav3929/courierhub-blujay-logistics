'use client';

import { DashboardMetrics } from "@/types/types";
import { MotionCard, MotionCardContent } from "./MotionCard";
import { Package, IndianRupee, Users, Activity } from "lucide-react";

interface DashboardStatsProps {
    metrics: DashboardMetrics | null;
    loading: boolean;
}

export const DashboardStats = ({ metrics, loading }: DashboardStatsProps) => {
    const statsCards = [
        {
            title: "Total Shipments",
            value: metrics?.totalShipments.toLocaleString() || "0",
            icon: Package,
            color: "text-blue-500",
            bg: "bg-blue-500/10",
        },
        {
            title: "Total Revenue",
            value: `₹${metrics?.totalRevenue.toLocaleString() || "0"}`,
            icon: IndianRupee,
            color: "text-emerald-500",
            bg: "bg-emerald-500/10",
        },
        {
            title: "Active Clients",
            value: metrics?.activeClients.toString() || "0",
            subtitle: `${metrics?.franchiseClients || 0} Franchise / ${metrics?.shopifyClients || 0} Shopify`,
            icon: Users,
            color: "text-violet-500",
            bg: "bg-violet-500/10",
        },
        {
            title: "Integrated Couriers",
            value: metrics ? `${metrics.franchiseClients + metrics.shopifyClients > 0 ? "Active" : "—"}` : "—",
            subtitle: "All courier partners",
            icon: Activity,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
        }
    ];

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-40 rounded-xl bg-muted/50 animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statsCards.map((stat, index) => (
                <MotionCard key={index} delay={index * 0.1}>
                    <MotionCardContent className="p-6">
                        <div className="flex items-center justify-between space-y-0 pb-2">
                            <p className="text-sm font-medium text-muted-foreground">
                                {stat.title}
                            </p>
                            <div className={`p-2 rounded-lg ${stat.bg}`}>
                                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                            </div>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                                {stat.value}
                            </div>
                            {stat.subtitle && (
                                <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
                                    {stat.subtitle}
                                </p>
                            )}
                        </div>
                    </MotionCardContent>
                </MotionCard>
            ))}
        </div>
    );
};
