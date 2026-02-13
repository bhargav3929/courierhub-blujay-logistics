'use client';

import { MotionCard, MotionCardContent } from "@/components/dashboard/MotionCard";
import { Package, IndianRupee, TrendingUp, Clock, PackageCheck } from "lucide-react";

interface ClientDashboardMetrics {
    totalShipments: number;
    totalRevenue: number;
    shippingRate: number;
    toBeProcessed: number;
    processed: number;
}

interface ClientDashboardStatsProps {
    metrics: ClientDashboardMetrics | null;
    loading: boolean;
}

export const ClientDashboardStats = ({ metrics, loading }: ClientDashboardStatsProps) => {
    const rateColor = (metrics?.shippingRate ?? 0) >= 80
        ? 'text-emerald-600'
        : (metrics?.shippingRate ?? 0) >= 50
            ? 'text-amber-600'
            : 'text-red-500';

    const rateIconBg = (metrics?.shippingRate ?? 0) >= 80
        ? 'bg-emerald-100'
        : (metrics?.shippingRate ?? 0) >= 50
            ? 'bg-amber-100'
            : 'bg-red-100';

    const rateIconColor = (metrics?.shippingRate ?? 0) >= 80
        ? 'text-emerald-600'
        : (metrics?.shippingRate ?? 0) >= 50
            ? 'text-amber-600'
            : 'text-red-500';

    const statsCards = [
        {
            title: "Total Shipments",
            value: metrics?.totalShipments.toLocaleString('en-IN') || "0",
            subtitle: "All time",
            icon: Package,
            iconBg: 'bg-primary/10',
            iconColor: 'text-primary',
            valueColor: 'text-foreground',
        },
        {
            title: "Total Revenue",
            value: `₹${(metrics?.totalRevenue || 0).toLocaleString('en-IN')}`,
            subtitle: "Shipping charges",
            icon: IndianRupee,
            iconBg: 'bg-emerald-100',
            iconColor: 'text-emerald-600',
            valueColor: 'text-foreground',
        },
        {
            title: "Shipping Rate",
            value: `${metrics?.shippingRate ?? 0}%`,
            subtitle: "Delivery success",
            icon: TrendingUp,
            iconBg: rateIconBg,
            iconColor: rateIconColor,
            valueColor: rateColor,
        },
        {
            title: "To Be Processed",
            value: metrics?.toBeProcessed.toLocaleString('en-IN') || "0",
            subtitle: "Awaiting shipment",
            icon: Clock,
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
            valueColor: 'text-foreground',
        },
        {
            title: "Processed",
            value: metrics?.processed.toLocaleString('en-IN') || "0",
            subtitle: "Shipped orders",
            icon: PackageCheck,
            iconBg: 'bg-primary/10',
            iconColor: 'text-primary',
            valueColor: 'text-foreground',
        },
    ];

    if (loading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {statsCards.map((stat, index) => (
                <MotionCard key={index} delay={index * 0.08}>
                    <MotionCardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {stat.title}
                            </p>
                            <div className={`p-2 rounded-lg ${stat.iconBg}`}>
                                <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
                            </div>
                        </div>
                        <div className="mt-3">
                            <div className={`text-2xl font-bold ${stat.valueColor}`}>
                                {stat.value}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {stat.subtitle}
                            </p>
                        </div>
                    </MotionCardContent>
                </MotionCard>
            ))}
        </div>
    );
};
