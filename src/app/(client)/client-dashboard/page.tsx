'use client';

import { useState, useEffect } from "react";
import { getAllShipments } from "@/services/shipmentService";
import { Shipment } from "@/types/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format, subDays, isToday } from "date-fns";

// Components
import { ClientDashboardStats } from "@/components/dashboard/ClientDashboardStats";
import { ClientActivityChart, ClientSourceChart } from "@/components/dashboard/ClientSpendChart";
import { ClientShipmentsTable } from "@/components/dashboard/ClientShipmentsTable";

const ClientDashboard = () => {
    const { currentUser } = useAuth();
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [loading, setLoading] = useState(true);

    const isFranchise = currentUser?.role === 'franchise';

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

    // Franchise-specific metrics
    const totalWeight = shipments.reduce((sum, s) => sum + (s.weight || s.actualWeight || 0), 0);
    const todayShipments = shipments.filter(s => {
        const d = s.createdAt?.toDate ? s.createdAt.toDate() : null;
        return d ? isToday(d) : false;
    }).length;

    const stats = {
        totalShipments: shipments.length,
        totalRevenue,
        shippingRate,
        toBeProcessed,
        processed,
        totalWeight,
        todayShipments,
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

    // Pie chart data — different for franchise vs shopify
    const sourceData = (() => {
        if (isFranchise) {
            // Franchise: Courier Distribution (Blue Dart vs DTDC)
            const blueDartCount = shipments.filter(s => s.courier === 'Blue Dart').length;
            const dtdcCount = shipments.filter(s => s.courier === 'DTDC').length;
            const otherCount = shipments.length - blueDartCount - dtdcCount;
            const data = [
                { name: 'Blue Dart', value: blueDartCount, color: '#2563eb' },
                { name: 'DTDC', value: dtdcCount, color: '#dc2626' },
            ];
            if (otherCount > 0) {
                data.push({ name: 'Other', value: otherCount, color: '#94a3b8' });
            }
            return data.filter(d => d.value > 0);
        } else {
            // Shopify: Order Sources
            const shopifyCount = shipments.filter(s => s.shopifyOrderId || s.clientType === 'shopify').length;
            const directCount = shipments.length - shopifyCount;
            return [
                { name: 'Shopify', value: shopifyCount, color: 'hsl(var(--primary))' },
                { name: 'Direct', value: directCount, color: '#94a3b8' },
            ].filter(d => d.value > 0);
        }
    })();

    // Pie chart title/subtitle
    const pieChartTitle = isFranchise ? "Courier Distribution" : "Order Sources";
    const pieChartSubtitle = isFranchise ? "Shipments by courier" : "Shipments by platform";

    // Table data: Shopify gets pending orders, Franchise gets recent shipments
    const tableShipments = isFranchise
        ? [...shipments].sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime;
        }).slice(0, 10)
        : shipments.filter(s => s.status === 'shopify_pending');
    const displayOrders = isFranchise ? tableShipments : tableShipments.slice(0, 10);
    const totalTableCount = isFranchise ? shipments.length : tableShipments.length;

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
                {/* Stats Grid */}
                <ClientDashboardStats metrics={stats} loading={loading} userRole={currentUser?.role} />

                {/* Charts — 50/50 split */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ClientActivityChart data={activityData} />
                    <ClientSourceChart
                        data={sourceData}
                        title={pieChartTitle}
                        subtitle={pieChartSubtitle}
                    />
                </div>

                {/* Shipments Table */}
                <ClientShipmentsTable
                    shipments={displayOrders}
                    totalPendingCount={totalTableCount}
                    userRole={currentUser?.role}
                />
            </motion.div>
        </div>
    );
};

export default ClientDashboard;
