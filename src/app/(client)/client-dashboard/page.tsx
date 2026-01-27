'use client';

import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { getAllShipments } from "@/services/shipmentService";
import { Shipment } from "@/types/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { motion } from "framer-motion";

// Components
import { ClientDashboardStats } from "@/components/dashboard/ClientDashboardStats";
import { ClientSpendChart } from "@/components/dashboard/ClientSpendChart";
import { ClientShipmentsTable } from "@/components/dashboard/ClientShipmentsTable";

const ClientDashboard = () => {
    const { currentUser } = useAuth();
    const { balance } = useWallet();
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

    // Calculate real stats (No Status Dependence)
    const stats = {
        totalShipments: shipments.length,
        totalSpend: shipments.reduce((sum, s) => sum + (s.chargedAmount || 0), 0),
        walletBalance: balance,
        totalWeight: shipments.reduce((sum, s) => sum + 0.5, 0), // Approx
    };

    // Mock data for spend chart (since we just have raw shipments list)
    // In production this would be aggregated by date
    const spendData = [
        { date: "Mon", spend: 0 },
        { date: "Tue", spend: 0 },
        { date: "Wed", spend: 0 },
        { date: "Thu", spend: 0 },
        { date: "Fri", spend: 0 },
        { date: "Sat", spend: 0 },
        { date: "Sun", spend: 0 },
    ];

    // Populate chart with recent shipment data roughly
    shipments.slice(0, 7).forEach((shipment, index) => {
        if (spendData[index]) {
            spendData[index].spend = shipment.chargedAmount || 0;
        }
    });

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
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back, Partner</h2>
                    <p className="text-muted-foreground text-sm flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                        System Operational
                    </p>
                </div>

                {/* Stats Grid */}
                <ClientDashboardStats metrics={stats} loading={loading} />

                {/* Main Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="col-span-1 lg:col-span-3">
                        <ClientSpendChart data={spendData} />
                    </div>
                </div>

                {/* Recent Shipments Table */}
                <ClientShipmentsTable shipments={shipments.slice(0, 10)} />
            </motion.div>
        </div>
    );
};

export default ClientDashboard;
