'use client';

import { useState, useEffect } from "react";
import { getAllShipments } from "@/services/shipmentService";
import { Shipment } from "@/types/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format, subDays } from "date-fns";

// Components
import { ClientDashboardStats } from "@/components/dashboard/ClientDashboardStats";
import { ClientActivityChart, ClientSourceChart } from "@/components/dashboard/ClientSpendChart";
import { ClientShipmentsTable } from "@/components/dashboard/ClientShipmentsTable";

const ClientDashboard = () => {
    const { currentUser } = useAuth();
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (currentUser?.id) {
            fetchShipments();
        }
    }, [currentUser]);

    const fetchShipments = async () => {
        try {
            setLoading(true);
            const data = await getAllShipments({ clientId: currentUser?.id });
            setShipments(data);
        } catch (error) {
            console.error("Error fetching shipments:", error);
            toast.error("Failed to load shipments data");
        } finally {
            setLoading(false);
        }
    };

    // Calculate metrics
    const deliveredCount = shipments.filter(s => s.status === 'delivered').length;
    const toBeProcessed = shipments.filter(s => s.status === 'shopify_pending').length;
    const processed = shipments.filter(s => ['pending', 'transit', 'delivered'].includes(s.status || '')).length;
    const totalRevenue = shipments.reduce((sum, s) => sum + (s.chargedAmount || s.declaredValue || 0), 0);
    const shippingRate = shipments.length > 0
        ? Math.round((deliveredCount / shipments.length) * 100)
        : 0;

    const stats = {
        totalShipments: shipments.length,
        totalRevenue,
        shippingRate,
        toBeProcessed,
        processed,
    };

    // Build activity chart data — last 7 days
    const activityData = (() => {
        const dayMap: Record<string, number> = {};
        for (let i = 6; i >= 0; i--) {
            const d = subDays(new Date(), i);
            const key = format(d, "EEE");
            dayMap[key] = 0;
        }
        shipments.forEach(s => {
            const d = s.createdAt?.toDate ? s.createdAt.toDate() : null;
            if (!d) return;
            const now = new Date();
            const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays < 7) {
                const key = format(d, "EEE");
                if (key in dayMap) {
                    dayMap[key] += 1;
                }
            }
        });
        return Object.entries(dayMap).map(([date, shipments]) => ({ date, shipments }));
    })();

    // Build platform distribution data for pie chart
    const sourceData = (() => {
        const shopifyCount = shipments.filter(s => s.shopifyOrderId || s.clientType === 'shopify').length;
        const directCount = shipments.length - shopifyCount;
        return [
            { name: 'Shopify', value: shopifyCount, color: 'hsl(var(--primary))' },
            { name: 'Direct', value: directCount, color: '#94a3b8' },
        ].filter(d => d.value > 0);
    })();

    // New orders for the table (max 10)
    const pendingOrders = shipments.filter(s => s.status === 'shopify_pending');
    const displayOrders = pendingOrders.slice(0, 10);

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
                className="space-y-6 max-w-[1600px] mx-auto"
            >
                {/* Stats Grid — 5 cards */}
                <ClientDashboardStats metrics={stats} loading={loading} />

                {/* Charts — 50/50 split */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ClientActivityChart data={activityData} />
                    <ClientSourceChart data={sourceData} />
                </div>

                {/* New Orders Table */}
                <ClientShipmentsTable
                    shipments={displayOrders}
                    totalPendingCount={pendingOrders.length}
                />
            </motion.div>
        </div>
    );
};

export default ClientDashboard;
