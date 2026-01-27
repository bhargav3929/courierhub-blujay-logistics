'use client';

import { useState, useEffect } from "react";
import { getDashboardMetrics, getShipmentTrend, getTopClients } from "@/services/metricsService";
import { getRecentShipments } from "@/services/shipmentService";
import { DashboardMetrics, ShipmentTrend, TopClient, Shipment } from "@/types/types";
import { toast } from "sonner";
import { motion } from "framer-motion";

// Components
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { ShipmentTrendChart } from "@/components/dashboard/ShipmentTrendChart";

import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { TopClientsTable } from "@/components/dashboard/TopClientsTable";
import { RecentShipmentsTable } from "@/components/dashboard/RecentShipmentsTable";
import { CourierDistributionChart } from "@/components/dashboard/CourierDistributionChart";

const Dashboard = () => {
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [shipmentTrend, setShipmentTrend] = useState<ShipmentTrend[]>([]);
    const [topClients, setTopClients] = useState<TopClient[]>([]);
    const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
    const [revenueByType, setRevenueByType] = useState<any[]>([]);
    const [statusData, setStatusData] = useState<any[]>([]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                setLoading(true);

                const [
                    metricsData,
                    trendData,
                    topClientsData,
                    recentShipmentsData
                ] = await Promise.all([
                    getDashboardMetrics(),
                    getShipmentTrend(7),
                    getTopClients(5),
                    getRecentShipments(10)
                ]);

                setMetrics(metricsData);
                setShipmentTrend(trendData);
                setTopClients(topClientsData);
                setRecentShipments(recentShipmentsData);

                // Format revenue data for chart from metricsData
                setRevenueByType([
                    { type: "Franchise", revenue: metricsData.revenueByType.franchise },
                    { type: "Shopify", revenue: metricsData.revenueByType.shopify }
                ]);

                // Format status data for pie chart from metricsData
                setStatusData([
                    { name: "Delivered", value: metricsData.shipmentsByStatus.delivered, color: "hsl(var(--status-delivered))" },
                    { name: "In Transit", value: metricsData.shipmentsByStatus.transit, color: "hsl(var(--status-transit))" },
                    { name: "Pending", value: metricsData.shipmentsByStatus.pending, color: "hsl(var(--primary))" },
                    { name: "Cancelled", value: metricsData.shipmentsByStatus.cancelled, color: "hsl(var(--status-cancelled))" }
                ]);

            } catch (error: any) {
                console.error("Error fetching dashboard data:", error);
                toast.error("Failed to load dashboard data. Please refresh the page.");
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    return (
        <div className="min-h-screen bg-muted/30 pb-12">
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="space-y-8 max-w-[1600px] mx-auto"
            >
                {/* Header Section */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Welcome back, Super Admin</h2>
                    <p className="text-muted-foreground text-sm flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                        System Operational
                    </p>
                </div>

                {/* Stats Grid */}
                <DashboardStats metrics={metrics} loading={loading} />

                {/* Main Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="col-span-1 lg:col-span-2">
                        <ShipmentTrendChart data={shipmentTrend} />
                    </div>
                    <div className="col-span-1">
                        <CourierDistributionChart />
                    </div>
                </div>

                {/* Secondary Charts & Data */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <RevenueChart data={revenueByType} />
                    <TopClientsTable clients={topClients} />
                </div>

                {/* Recent Shipments Table */}
                <RecentShipmentsTable shipments={recentShipments} />
            </motion.div>
        </div>
    );
};

export default Dashboard;

