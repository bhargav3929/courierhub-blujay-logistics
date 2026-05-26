'use client';

import { useState, useRef } from "react";
import { DateRange } from "react-day-picker";
import { addDays, format, subDays } from "date-fns";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    FileText, Download, IndianRupee, Package, Users, TrendingUp,
    Truck, BarChart3, PieChart as PieChartIcon,
    Filter, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getAllShipments } from "@/services/shipmentService";
import { getDashboardMetrics, getTopClients } from "@/services/metricsService";
import { Shipment, TopClient, DashboardMetrics } from "@/types/types";
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, AreaChart, Area, Legend
} from "recharts";
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "@/components/dashboard/MotionCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ShipmentManifest, printManifest } from "@/components/shipments/ShipmentManifest";

const statusColors: Record<string, string> = {
    delivered: "#10b981",
    transit: "#3b82f6",
    pending: "#f59e0b",
    cancelled: "#ef4444",
};

const statusLabels: Record<string, string> = {
    delivered: "Delivered",
    transit: "In Transit",
    pending: "Pending",
    cancelled: "Cancelled",
};

const courierColors = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function ReportsPage() {
    const [date, setDate] = useState<DateRange | undefined>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });
    const [reportGenerated, setReportGenerated] = useState(false);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // Real data states
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [topClients, setTopClients] = useState<TopClient[]>([]);

    // Derived analytics
    const [statusBreakdown, setStatusBreakdown] = useState<any[]>([]);
    const [courierBreakdown, setCourierBreakdown] = useState<any[]>([]);
    const [dailyTrend, setDailyTrend] = useState<any[]>([]);
    const [revenueByClient, setRevenueByClient] = useState<any[]>([]);

    const reportRef = useRef<HTMLDivElement>(null);
    const [downloadChoiceOpen, setDownloadChoiceOpen] = useState(false);
    const [manifestPreviewOpen, setManifestPreviewOpen] = useState(false);

    const handleGenerate = async () => {
        if (!date?.from || !date?.to) {
            toast.error("Please select a date range first");
            return;
        }
        setLoading(true);
        try {
            // Fetch real data
            const [shipmentsData, metricsData, topClientsData] = await Promise.all([
                getAllShipments({ startDate: date.from, endDate: date.to }),
                getDashboardMetrics(),
                getTopClients(10),
            ]);

            setShipments(shipmentsData);
            setMetrics(metricsData);
            setTopClients(topClientsData);

            // Calculate status breakdown
            const statusMap: Record<string, number> = { delivered: 0, transit: 0, pending: 0, cancelled: 0 };
            shipmentsData.forEach(s => { statusMap[s.status] = (statusMap[s.status] || 0) + 1; });
            setStatusBreakdown(
                Object.entries(statusMap)
                    .filter(([, v]) => v > 0)
                    .map(([name, value]) => ({ name: statusLabels[name] || name, value, color: statusColors[name] || "#94a3b8" }))
            );

            // Calculate courier breakdown
            const courierMap: Record<string, { count: number; revenue: number }> = {};
            shipmentsData.forEach(s => {
                if (!courierMap[s.courier]) courierMap[s.courier] = { count: 0, revenue: 0 };
                courierMap[s.courier].count++;
                courierMap[s.courier].revenue += (s.marginAmount || 0);
            });
            setCourierBreakdown(
                Object.entries(courierMap)
                    .sort(([, a], [, b]) => b.count - a.count)
                    .map(([name, data], i) => ({ name, shipments: data.count, revenue: data.revenue, color: courierColors[i % courierColors.length] }))
            );

            // Calculate daily trend
            const dayMap: Record<string, { shipments: number; revenue: number; charges: number }> = {};
            shipmentsData.forEach(s => {
                const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
                const key = format(d, "MMM dd");
                if (!dayMap[key]) dayMap[key] = { shipments: 0, revenue: 0, charges: 0 };
                dayMap[key].shipments++;
                dayMap[key].revenue += (s.marginAmount || 0);
                dayMap[key].charges += (s.chargedAmount || 0);
            });
            setDailyTrend(Object.entries(dayMap).map(([date, data]) => ({ date, ...data })));

            // Revenue by client type
            const clientTypeMap: Record<string, { count: number; revenue: number; margin: number }> = {};
            shipmentsData.forEach(s => {
                const type = s.clientType || "unknown";
                if (!clientTypeMap[type]) clientTypeMap[type] = { count: 0, revenue: 0, margin: 0 };
                clientTypeMap[type].count++;
                clientTypeMap[type].revenue += (s.chargedAmount || 0);
                clientTypeMap[type].margin += (s.marginAmount || 0);
            });
            setRevenueByClient(Object.entries(clientTypeMap).map(([type, data]) => ({
                type: type.charAt(0).toUpperCase() + type.slice(1),
                ...data
            })));

            setReportGenerated(true);
            toast.success(`Report generated — ${shipmentsData.length} shipments found`);
        } catch (error) {
            console.error("Error generating report:", error);
            toast.error("Failed to generate report. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        toast.info("Preparing PDF download...");
        setTimeout(() => {
            window.print();
        }, 500);
    };

    // Filter shipments for the table
    const filteredShipments = statusFilter === "all"
        ? shipments
        : shipments.filter(s => s.status === statusFilter);

    // Calculated summary from real data
    const totalRevenue = shipments.reduce((sum, s) => sum + (s.marginAmount || 0), 0);
    const totalCharges = shipments.reduce((sum, s) => sum + (s.chargedAmount || 0), 0);
    const totalCourierCost = shipments.reduce((sum, s) => sum + (s.courierCharge || 0), 0);
    const avgOrderValue = shipments.length > 0 ? totalCharges / shipments.length : 0;
    const deliveryRate = shipments.length > 0
        ? ((shipments.filter(s => s.status === 'delivered').length / shipments.length) * 100)
        : 0;

    const uniqueClients = new Set(shipments.map(s => s.clientId)).size;
    const uniqueCouriers = new Set(shipments.map(s => s.courier)).size;

    const tooltipStyle = {
        backgroundColor: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "12px",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
        fontSize: "12px",
    };

    return (
        <div className="space-y-8 min-h-screen pb-20" ref={reportRef}>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Business Reports</h1>
                    <p className="text-muted-foreground text-sm mt-1">Generate comprehensive analytics for your logistics operations</p>
                </div>
                {reportGenerated && (
                    <Button variant="outline" onClick={() => setDownloadChoiceOpen(true)} className="bg-white hover:bg-blue-50 border-blue-200 text-blue-700">
                        <Download className="mr-2 h-4 w-4" />
                        Download
                    </Button>
                )}
            </div>

            {/* Filter Section */}
            <Card className="border-border/60 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Select Date Range</label>
                            <DatePickerWithRange date={date} setDate={setDate} className="w-full" />
                        </div>
                        <Button
                            onClick={handleGenerate}
                            disabled={loading || !date?.from || !date?.to}
                            className="bg-primary text-white hover:bg-primary/90 shadow-md min-w-[160px]"
                        >
                            {loading ? (
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <BarChart3 className="mr-2 h-4 w-4" />
                            )}
                            {loading ? "Generating..." : "Generate Report"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Empty State */}
            {!reportGenerated && !loading && (
                <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-full shadow-sm mb-4">
                        <FileText className="h-12 w-12 text-slate-300 dark:text-slate-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No Report Generated</h3>
                    <p className="text-slate-500 dark:text-slate-400 max-w-sm mt-2">
                        Select a date range above and click &quot;Generate Report&quot; to view your business analytics.
                    </p>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <RefreshCw className="h-10 w-10 text-blue-500 animate-spin mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Generating Report</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Fetching data from all shipments...</p>
                </div>
            )}

            {/* Report Content */}
            <AnimatePresence>
                {reportGenerated && !loading && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="space-y-8"
                    >
                        {/* Report Period Header */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-100 dark:border-blue-900">
                            <div>
                                <h3 className="font-semibold text-blue-900 dark:text-blue-100">Report Summary</h3>
                                <p className="text-blue-700/80 dark:text-blue-300/80 text-sm">
                                    {date?.from ? format(date.from, "MMMM d, yyyy") : ""} — {date?.to ? format(date.to, "MMMM d, yyyy") : ""}
                                    <span className="ml-2 text-blue-600 dark:text-blue-400 font-medium">({shipments.length} shipments)</span>
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleGenerate} className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                <RefreshCw className="mr-2 h-3 w-3" /> Refresh
                            </Button>
                        </div>

                        {/* KPI Summary Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-border/50">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2.5 rounded-xl bg-emerald-500/10">
                                            <IndianRupee className="h-5 w-5 text-emerald-600" />
                                        </div>
                                        <Badge variant="secondary" className="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-xs">
                                            Margin
                                        </Badge>
                                    </div>
                                    <div className="mt-3">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Revenue</p>
                                        <h4 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                                            ₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                        </h4>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-border/50">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2.5 rounded-xl bg-blue-500/10">
                                            <Package className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <Badge variant="secondary" className="text-blue-600 bg-blue-50 dark:bg-blue-950/50 text-xs">
                                            Orders
                                        </Badge>
                                    </div>
                                    <div className="mt-3">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Shipments</p>
                                        <h4 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{shipments.length}</h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">Avg ₹{avgOrderValue.toFixed(0)}/order</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-border/50">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2.5 rounded-xl bg-violet-500/10">
                                            <Users className="h-5 w-5 text-violet-600" />
                                        </div>
                                        <Badge variant="secondary" className="text-violet-600 bg-violet-50 dark:bg-violet-950/50 text-xs">
                                            Clients
                                        </Badge>
                                    </div>
                                    <div className="mt-3">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Active Clients</p>
                                        <h4 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{uniqueClients}</h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">{uniqueCouriers} courier partners</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-border/50">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2.5 rounded-xl bg-amber-500/10">
                                            <TrendingUp className="h-5 w-5 text-amber-600" />
                                        </div>
                                        <Badge variant="secondary" className={`text-xs ${deliveryRate >= 70 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50' : 'text-amber-600 bg-amber-50 dark:bg-amber-950/50'}`}>
                                            {deliveryRate >= 70 ? "Good" : "Needs Attention"}
                                        </Badge>
                                    </div>
                                    <div className="mt-3">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Delivery Rate</p>
                                        <h4 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{deliveryRate.toFixed(1)}%</h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">Courier cost ₹{totalCourierCost.toLocaleString('en-IN')}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Charts Row 1: Trend + Status */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Daily Shipment & Revenue Trend */}
                            <MotionCard delay={0.1} className="lg:col-span-2">
                                <MotionCardHeader>
                                    <MotionCardTitle className="flex items-center gap-2">
                                        <BarChart3 className="h-5 w-5 text-blue-500" />
                                        Shipment & Revenue Trend
                                    </MotionCardTitle>
                                    <p className="text-sm text-muted-foreground">Daily breakdown of orders and revenue</p>
                                </MotionCardHeader>
                                <MotionCardContent>
                                    <div className="h-[300px] w-full">
                                        {dailyTrend.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={dailyTrend}>
                                                    <defs>
                                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                        </linearGradient>
                                                        <linearGradient id="colorShipments" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                                                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                                                    <Tooltip contentStyle={tooltipStyle} />
                                                    <Legend />
                                                    <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#colorRevenue)" name="Revenue (₹)" />
                                                    <Area yAxisId="right" type="monotone" dataKey="shipments" stroke="#10b981" fill="url(#colorShipments)" name="Shipments" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No trend data available</div>
                                        )}
                                    </div>
                                </MotionCardContent>
                            </MotionCard>

                            {/* Status Distribution */}
                            <MotionCard delay={0.2}>
                                <MotionCardHeader>
                                    <MotionCardTitle className="flex items-center gap-2">
                                        <PieChartIcon className="h-5 w-5 text-violet-500" />
                                        Status Breakdown
                                    </MotionCardTitle>
                                    <p className="text-sm text-muted-foreground">Shipment status distribution</p>
                                </MotionCardHeader>
                                <MotionCardContent>
                                    <div className="h-[300px] w-full relative">
                                        {statusBreakdown.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={statusBreakdown}
                                                        cx="50%"
                                                        cy="45%"
                                                        innerRadius={70}
                                                        outerRadius={100}
                                                        paddingAngle={4}
                                                        dataKey="value"
                                                        stroke="none"
                                                        animationDuration={1200}
                                                    >
                                                        {statusBreakdown.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity cursor-pointer stroke-white dark:stroke-slate-900 stroke-2" />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip contentStyle={tooltipStyle} />
                                                    <Legend verticalAlign="bottom" height={36} iconType="circle"
                                                        formatter={(value) => <span className="text-xs font-medium text-muted-foreground ml-1">{value}</span>}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No status data</div>
                                        )}
                                        {statusBreakdown.length > 0 && (
                                            <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                                                <span className="text-2xl font-bold block text-foreground">{shipments.length}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
                                            </div>
                                        )}
                                    </div>
                                </MotionCardContent>
                            </MotionCard>
                        </div>

                        {/* Charts Row 2: Courier Performance + Revenue by Client Type */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Courier Performance */}
                            <MotionCard delay={0.3}>
                                <MotionCardHeader>
                                    <MotionCardTitle className="flex items-center gap-2">
                                        <Truck className="h-5 w-5 text-blue-500" />
                                        Courier Performance
                                    </MotionCardTitle>
                                    <p className="text-sm text-muted-foreground">Shipments & revenue by courier partner</p>
                                </MotionCardHeader>
                                <MotionCardContent>
                                    <div className="h-[280px] w-full">
                                        {courierBreakdown.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={courierBreakdown} layout="vertical" margin={{ left: 10 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                                                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={90} />
                                                    <Tooltip contentStyle={tooltipStyle} formatter={(value: any, name: string) => [name === 'revenue' ? `₹${value.toLocaleString('en-IN')}` : value, name === 'revenue' ? 'Revenue' : 'Shipments']} />
                                                    <Bar dataKey="shipments" fill="#6366f1" radius={[0, 4, 4, 0]} name="Shipments" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No courier data</div>
                                        )}
                                    </div>
                                </MotionCardContent>
                            </MotionCard>

                            {/* Revenue by Client Type */}
                            <MotionCard delay={0.4}>
                                <MotionCardHeader>
                                    <MotionCardTitle className="flex items-center gap-2">
                                        <IndianRupee className="h-5 w-5 text-emerald-500" />
                                        Revenue by Client Type
                                    </MotionCardTitle>
                                    <p className="text-sm text-muted-foreground">Charged amount & margin breakdown</p>
                                </MotionCardHeader>
                                <MotionCardContent>
                                    <div className="h-[280px] w-full">
                                        {revenueByClient.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={revenueByClient}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                                    <XAxis dataKey="type" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                                                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                                                    <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => `₹${value.toLocaleString('en-IN')}`} />
                                                    <Legend />
                                                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Charged Amount" />
                                                    <Bar dataKey="margin" fill="#10b981" radius={[4, 4, 0, 0]} name="Margin" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No revenue data</div>
                                        )}
                                    </div>
                                </MotionCardContent>
                            </MotionCard>
                        </div>

                        {/* Top Clients Table */}
                        <MotionCard delay={0.5}>
                            <MotionCardHeader>
                                <MotionCardTitle className="flex items-center gap-2">
                                    <Users className="h-5 w-5 text-violet-500" />
                                    Top Performing Clients
                                </MotionCardTitle>
                                <p className="text-sm text-muted-foreground">Ranked by total revenue generated</p>
                            </MotionCardHeader>
                            <MotionCardContent>
                                {topClients.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead className="w-8">#</TableHead>
                                                <TableHead>Client Name</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead className="text-center">Shipments</TableHead>
                                                <TableHead className="text-right">Revenue</TableHead>
                                                <TableHead className="text-right">Avg/Order</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {topClients.map((client, i) => (
                                                <TableRow key={client.clientId}>
                                                    <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                                                    <TableCell className="font-medium">{client.name}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={client.type === 'franchise' ? 'border-blue-200 text-blue-700 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-300' : 'border-purple-200 text-purple-700 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-300'}>
                                                            {client.type.charAt(0).toUpperCase() + client.type.slice(1)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">{client.shipments}</TableCell>
                                                    <TableCell className="text-right font-semibold">₹{client.revenue.toLocaleString('en-IN')}</TableCell>
                                                    <TableCell className="text-right text-muted-foreground">
                                                        ₹{client.shipments > 0 ? (client.revenue / client.shipments).toFixed(0) : 0}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <div className="py-8 text-center text-muted-foreground text-sm">No client data available</div>
                                )}
                            </MotionCardContent>
                        </MotionCard>

                        {/* Detailed Transaction Record */}
                        <MotionCard delay={0.6}>
                            <MotionCardHeader>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <MotionCardTitle className="flex items-center gap-2">
                                            <FileText className="h-5 w-5 text-blue-500" />
                                            Detailed Transaction Record
                                        </MotionCardTitle>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Showing {filteredShipments.length} of {shipments.length} shipments
                                        </p>
                                    </div>
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="w-[160px]">
                                            <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                            <SelectValue placeholder="Filter status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Status</SelectItem>
                                            <SelectItem value="delivered">Delivered</SelectItem>
                                            <SelectItem value="transit">In Transit</SelectItem>
                                            <SelectItem value="pending">Pending</SelectItem>
                                            <SelectItem value="cancelled">Cancelled</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </MotionCardHeader>
                            <MotionCardContent>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead>Date</TableHead>
                                                <TableHead>Order ID</TableHead>
                                                <TableHead>Client</TableHead>
                                                <TableHead>Courier</TableHead>
                                                <TableHead>Route</TableHead>
                                                <TableHead className="text-center">Status</TableHead>
                                                <TableHead className="text-right">Charged</TableHead>
                                                <TableHead className="text-right">Margin</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredShipments.length > 0 ? (
                                                filteredShipments.slice(0, 50).map((shipment) => {
                                                    const createdDate = shipment.createdAt?.toDate ? shipment.createdAt.toDate() : null;
                                                    return (
                                                        <TableRow key={shipment.id}>
                                                            <TableCell className="text-muted-foreground text-sm">
                                                                {createdDate ? format(createdDate, "MMM dd, yyyy") : "—"}
                                                            </TableCell>
                                                            <TableCell className="font-mono font-medium text-sm">
                                                                {shipment.id.slice(0, 12)}...
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-sm">{shipment.clientName}</span>
                                                                    <span className="text-xs text-muted-foreground capitalize">{shipment.clientType}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline" className="text-xs">
                                                                    {shipment.courier}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {shipment.origin?.city || "—"} → {shipment.destination?.city || "—"}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge
                                                                    className="text-xs capitalize"
                                                                    style={{
                                                                        backgroundColor: `${statusColors[shipment.status]}15`,
                                                                        color: statusColors[shipment.status],
                                                                        border: `1px solid ${statusColors[shipment.status]}30`,
                                                                    }}
                                                                >
                                                                    {statusLabels[shipment.status] || shipment.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-medium text-sm">
                                                                ₹{(shipment.chargedAmount || 0).toLocaleString('en-IN')}
                                                            </TableCell>
                                                            <TableCell className="text-right font-semibold text-sm text-emerald-600">
                                                                ₹{(shipment.marginAmount || 0).toLocaleString('en-IN')}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                                        No shipments found for the selected filter.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                    {filteredShipments.length > 50 && (
                                        <p className="text-xs text-muted-foreground text-center py-3">
                                            Showing first 50 of {filteredShipments.length} records. Download PDF for full report.
                                        </p>
                                    )}
                                </div>
                            </MotionCardContent>
                        </MotionCard>

                        {/* Financial Summary Footer */}
                        <Card className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 text-white border-0">
                            <CardContent className="p-6">
                                <h3 className="text-lg font-semibold mb-4">Financial Summary</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div>
                                        <p className="text-slate-400 text-xs uppercase tracking-wider">Total Billed</p>
                                        <p className="text-2xl font-bold mt-1">₹{totalCharges.toLocaleString('en-IN')}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs uppercase tracking-wider">Courier Costs</p>
                                        <p className="text-2xl font-bold mt-1">₹{totalCourierCost.toLocaleString('en-IN')}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs uppercase tracking-wider">Net Margin</p>
                                        <p className="text-2xl font-bold mt-1 text-emerald-400">₹{totalRevenue.toLocaleString('en-IN')}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs uppercase tracking-wider">Margin %</p>
                                        <p className="text-2xl font-bold mt-1 text-emerald-400">
                                            {totalCharges > 0 ? ((totalRevenue / totalCharges) * 100).toFixed(1) : 0}%
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Download Choice Dialog */}
            <Dialog open={downloadChoiceOpen} onOpenChange={setDownloadChoiceOpen}>
                <DialogContent className="max-w-md bg-white">
                    <h2 className="text-lg font-bold mb-1">Download Report</h2>
                    <p className="text-sm text-muted-foreground mb-5">Choose the type of report you want to download.</p>
                    <div className="grid grid-cols-1 gap-3">
                        <button
                            onClick={() => { setDownloadChoiceOpen(false); handleDownload(); }}
                            className="flex items-center gap-4 p-4 border rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-all text-left group"
                        >
                            <div className="p-3 rounded-lg bg-blue-100 text-blue-600 group-hover:bg-blue-200">
                                <BarChart3 className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="font-semibold text-sm">Business Report</p>
                                <p className="text-xs text-muted-foreground">Full analytics with charts, KPIs, and financial summary</p>
                            </div>
                        </button>
                        <button
                            onClick={() => { setDownloadChoiceOpen(false); setManifestPreviewOpen(true); }}
                            className="flex items-center gap-4 p-4 border rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all text-left group"
                        >
                            <div className="p-3 rounded-lg bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200">
                                <FileText className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="font-semibold text-sm">Shipment Manifest</p>
                                <p className="text-xs text-muted-foreground">Dispatch manifest with tracking numbers, barcodes, and amounts</p>
                            </div>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Manifest Preview Dialog */}
            <Dialog open={manifestPreviewOpen} onOpenChange={setManifestPreviewOpen}>
                <DialogContent className="max-w-4xl bg-white p-0 overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-muted/20">
                        <h2 className="font-bold">Shipment Manifest</h2>
                        <button
                            onClick={printManifest}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90"
                        >
                            <Download className="h-4 w-4" /> Print Manifest
                        </button>
                    </div>
                    <div className="max-h-[75vh] overflow-auto bg-gray-50 p-4">
                        {shipments.length > 0 && <ShipmentManifest shipments={filteredShipments} />}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
