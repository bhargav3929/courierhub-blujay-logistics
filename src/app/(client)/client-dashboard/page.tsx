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
import { ClientSpendChart } from "@/components/dashboard/ClientSpendChart";
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

    // Calculate real stats from actual shipment data
    const stats = {
        totalShipments: shipments.length,
        totalWeight: shipments.reduce((sum, s) => sum + (s.weight || 0), 0),
        deliveredCount: shipments.filter(s => s.status === 'delivered').length,
        pendingCount: shipments.filter(s => s.status === 'pending' || s.status === 'transit').length,
    };

    // Build activity chart data aggregated by day (last 7 days)
    const activityData = (() => {
        const dayMap: Record<string, number> = {};
        // Initialize last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = subDays(new Date(), i);
            const key = format(d, "EEE");
            dayMap[key] = 0;
        }
        // Aggregate shipment count from real shipments
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
                {/* Stats Grid */}
                <ClientDashboardStats metrics={stats} loading={loading} />

                {/* Main Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="col-span-1 lg:col-span-3">
                        <ClientSpendChart data={activityData} />
                    </div>
                </div>

                {/* Recent Shipments Table */}
                <ClientShipmentsTable shipments={shipments.slice(0, 10)} />
            </motion.div>
        </div>
    );
};

export default ClientDashboard;
