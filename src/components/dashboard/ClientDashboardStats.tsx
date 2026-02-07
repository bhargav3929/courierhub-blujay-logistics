'use client';

import { MotionCard, MotionCardContent } from "@/components/dashboard/MotionCard";
import { Package, PackageCheck, Truck, Scale } from "lucide-react";

interface ClientDashboardMetrics {
    totalShipments: number;
    totalWeight: number;
    deliveredCount: number;
    pendingCount: number;
}

interface ClientDashboardStatsProps {
    metrics: ClientDashboardMetrics | null;
    loading: boolean;
}

export const ClientDashboardStats = ({ metrics, loading }: ClientDashboardStatsProps) => {
    const statsCards = [
        {
            title: "Total Shipments",
            value: metrics?.totalShipments.toLocaleString() || "0",
            icon: Package,
        },
        {
            title: "Delivered",
            value: metrics?.deliveredCount.toLocaleString() || "0",
            icon: PackageCheck,
        },
        {
            title: "In Progress",
            value: metrics?.pendingCount.toLocaleString() || "0",
            icon: Truck,
        },
        {
            title: "Total Weight",
            value: `${metrics?.totalWeight.toLocaleString() || "0"} kg`,
            icon: Scale,
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
                            <div className="p-2 rounded-lg bg-primary/10">
                                <stat.icon className="h-4 w-4 text-primary" />
                            </div>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-bold text-foreground">
                                {stat.value}
                            </div>
                        </div>
                    </MotionCardContent>
                </MotionCard>
            ))}
        </div>
    );
};
