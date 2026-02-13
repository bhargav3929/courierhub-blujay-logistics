'use client';

import Link from "next/link";
import { MotionCard, MotionCardContent } from "@/components/dashboard/MotionCard";
import { Package, IndianRupee, Clock, PackageCheck, PackagePlus, ScrollText, Weight, CalendarCheck } from "lucide-react";
import { motion } from "framer-motion";
import { UserRole } from "@/types/types";

interface ClientDashboardMetrics {
    totalShipments: number;
    totalRevenue: number;
    shippingRate: number;
    toBeProcessed: number;
    processed: number;
    // Franchise-specific
    totalWeight?: number;
    todayShipments?: number;
}

interface ClientDashboardStatsProps {
    metrics: ClientDashboardMetrics | null;
    loading: boolean;
    userRole?: UserRole;
}

export const ClientDashboardStats = ({ metrics, loading, userRole }: ClientDashboardStatsProps) => {
    const isFranchise = userRole === 'franchise';

    const statsCards = isFranchise
        ? [
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
                title: "Total Weight",
                value: `${(metrics?.totalWeight || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`,
                subtitle: "Across all shipments",
                icon: Weight,
                iconBg: 'bg-violet-100',
                iconColor: 'text-violet-600',
                valueColor: 'text-foreground',
            },
            {
                title: "Today's Shipments",
                value: metrics?.todayShipments?.toLocaleString('en-IN') || "0",
                subtitle: "Booked today",
                icon: CalendarCheck,
                iconBg: 'bg-amber-100',
                iconColor: 'text-amber-600',
                valueColor: 'text-foreground',
            },
        ]
        : [
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

            {/* Quick Actions */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.32, ease: "easeOut" }}
                className="flex flex-col gap-2.5 h-full"
            >
                <Link
                    href="/add-shipment"
                    className="flex-1 group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center gap-3 px-4 shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-0.5 transition-all duration-200"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative p-1.5 rounded-lg bg-white/20">
                        <PackagePlus className="h-4 w-4" />
                    </div>
                    <span className="relative text-sm font-semibold">Add Shipment</span>
                </Link>
                <Link
                    href="/client-shipments"
                    className="flex-1 group rounded-xl border border-border/50 bg-white/70 backdrop-blur-md text-foreground flex items-center gap-3 px-4 hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5 transition-all duration-200"
                >
                    <div className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-primary/10 transition-colors">
                        <ScrollText className="h-4 w-4 text-slate-500 group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700 group-hover:text-foreground transition-colors">Shipment Logs</span>
                </Link>
            </motion.div>
        </div>
    );
};
