'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Package,
    Wallet,
    TrendingUp,
    Clock,
    Truck,
    ArrowUpRight,
    Plus
} from "lucide-react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip
} from "recharts";
import { useWallet } from "@/hooks/useWallet";
import { getAllShipments } from "@/services/shipmentService";
import { Shipment } from "@/types/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const getStatusStyle = (status: string) => {
    switch (status) {
        case "delivered": return "bg-status-delivered/10 text-status-delivered border-status-delivered/20";
        case "transit": return "bg-status-transit/10 text-status-transit border-status-transit/20";
        case "pending": return "bg-status-pending/10 text-status-pending border-status-pending/20";
        default: return "bg-muted text-muted-foreground";
    }
};

const ClientDashboard = () => {
    const { balance, addMoney } = useWallet();
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

    // Calculate real stats from shipments
    const stats = {
        total: shipments.length,
        inTransit: shipments.filter(s => s.status === 'transit').length,
        delivered: shipments.filter(s => s.status === 'delivered').length,
        pending: shipments.filter(s => s.status === 'pending').length,
    };

    // Get recent shipments (last 4)
    const recentShipments = shipments.slice(0, 4);

    const statsCards = [
        {
            title: "Total Shipments",
            value: loading ? "..." : stats.total.toString(),
            change: `${stats.total} total`,
            icon: Package,
            color: "text-primary"
        },
        {
            title: "Wallet Balance",
            value: `₹${balance.toLocaleString()}`,
            subtitle: "Instant credit available",
            icon: Wallet,
            color: "text-blujay-dark",
            action: true
        },
        {
            title: "In Transit",
            value: loading ? "..." : stats.inTransit.toString(),
            change: "Active now",
            icon: Clock,
            color: "text-status-transit"
        },
        {
            title: "Delivered",
            value: loading ? "..." : stats.delivered.toString(),
            change: "Completed",
            icon: Truck,
            color: "text-status-delivered"
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Page Header */}
            <div className="bg-gradient-to-r from-primary via-blujay-dark to-blujay-light rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10">
                    <h1 className="text-4xl font-extrabold mb-2 tracking-tight">Merchant Dashboard</h1>
                    <p className="text-white/80 text-lg max-w-2xl">Overview of your shipping performance and wallet transactions.</p>
                    <div className="mt-6 flex flex-wrap gap-4">
                        <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-lg border border-white/30 text-sm font-medium">
                            Active Tier: <span className="text-secondary font-bold">Gold Merchant</span>
                        </div>
                        <button
                            onClick={() => addMoney(5000)}
                            className="bg-secondary text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:scale-105 transition-all text-sm flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" /> Quick Recharge ₹5000
                        </button>
                    </div>
                </div>
                {/* Abstract background shapes */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-secondary/20 rounded-full blur-3xl"></div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statsCards.map((stat, index) => (
                    <Card key={index} className="border-none shadow-md hover:shadow-xl transition-all duration-300 group overflow-hidden">
                        <CardContent className="p-6 relative">
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-xl bg-muted group-hover:bg-primary/10 transition-colors duration-300`}>
                                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                                </div>
                                {stat.change && (
                                    <span className="text-xs font-bold text-status-delivered bg-status-delivered/10 px-2 py-1 rounded-full flex items-center gap-1">
                                        <TrendingUp className="h-3 w-3" />
                                        {stat.change}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">{stat.title}</p>
                                    <h3 className="text-2xl font-bold">{stat.value}</h3>
                                    {stat.subtitle && (
                                        <p className="text-xs text-muted-foreground mt-1 italic">{stat.subtitle}</p>
                                    )}
                                </div>
                                {stat.action && (
                                    <button
                                        onClick={() => addMoney(1000)}
                                        className="mt-3 text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                    >
                                        <Plus className="h-3 w-3" /> Add ₹1000
                                    </button>
                                )}
                            </div>
                            <div className="absolute bottom-0 right-0 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-300">
                                <stat.icon className="h-20 w-20 -mr-4 -mb-4" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Recent Shipments Table */}
            <Card className="border-none shadow-md overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 bg-muted/20">
                    <CardTitle className="text-lg font-bold">Recent Bookings</CardTitle>
                    <button className="text-sm px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                        View All
                    </button>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                            <p className="mt-4 text-muted-foreground">Loading recent shipments...</p>
                        </div>
                    ) : recentShipments.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground">No shipments yet.</p>
                            <button className="mt-4 px-6 py-2 bg-primary text-white rounded-lg">
                                Create Your First Shipment
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                                        <th className="px-6 py-4 font-bold">Order ID</th>
                                        <th className="px-6 py-4 font-bold">Destination</th>
                                        <th className="px-6 py-4 font-bold">Courier</th>
                                        <th className="px-6 py-4 font-bold">Status</th>
                                        <th className="px-6 py-4 font-bold">Details</th>
                                        <th className="px-6 py-4 font-bold text-right">Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {recentShipments.map((shp) => (
                                        <tr key={shp.id} className="hover:bg-muted/20 transition-colors group">
                                            <td className="px-6 py-4">
                                                <span className="font-mono text-sm text-primary font-semibold">
                                                    {shp.courierTrackingId || shp.id?.substring(0, 12).toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-sm">{shp.destination?.city || 'N/A'}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">{shp.courier}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${getStatusStyle(shp.status)}`}>
                                                    {shp.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-muted-foreground">
                                                {shp.weight}kg | {shp.courier}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-foreground">
                                                ₹{shp.chargedAmount || 0}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ClientDashboard;
