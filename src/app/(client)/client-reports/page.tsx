'use client';

import { useState } from "react";
import { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    FileText, Download, Package, TrendingUp,
    Truck, BarChart3, PieChart as PieChartIcon,
    Filter, RefreshCw, CheckCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getAllShipments } from "@/services/shipmentService";
import { Shipment } from "@/types/types";
import { useAuth } from "@/contexts/AuthContext";
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

export default function ClientReportsPage() {
    const { currentUser } = useAuth();
    const [date, setDate] = useState<DateRange | undefined>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });
    const [reportGenerated, setReportGenerated] = useState(false);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const [downloadChoiceOpen, setDownloadChoiceOpen] = useState(false);
    const [manifestPreviewOpen, setManifestPreviewOpen] = useState(false);

    // Real data states
    const [shipments, setShipments] = useState<Shipment[]>([]);

    // Derived analytics
    const [statusBreakdown, setStatusBreakdown] = useState<any[]>([]);
    const [courierBreakdown, setCourierBreakdown] = useState<any[]>([]);
    const [dailyTrend, setDailyTrend] = useState<any[]>([]);

    const handleGenerate = async () => {
        if (!date?.from || !date?.to) {
            toast.error("Please select a date range first");
            return;
        }
        if (!currentUser?.id) {
            toast.error("User session not found. Please log in again.");
            return;
        }
        setLoading(true);
        try {
            const shipmentsData = await getAllShipments({
                clientId: currentUser.id,
                startDate: date.from,
                endDate: date.to,
            });

            setShipments(shipmentsData);

            // Calculate status breakdown
            const statusMap: Record<string, number> = { delivered: 0, transit: 0, pending: 0, cancelled: 0 };
            shipmentsData.forEach(s => { statusMap[s.status] = (statusMap[s.status] || 0) + 1; });
            setStatusBreakdown(
                Object.entries(statusMap)
                    .filter(([, v]) => v > 0)
                    .map(([name, value]) => ({ name: statusLabels[name] || name, value, color: statusColors[name] || "#94a3b8" }))
            );

            // Calculate courier breakdown
            const courierMap: Record<string, number> = {};
            shipmentsData.forEach(s => {
                courierMap[s.courier] = (courierMap[s.courier] || 0) + 1;
            });
            setCourierBreakdown(
                Object.entries(courierMap)
                    .sort(([, a], [, b]) => b - a)
                    .map(([name, count], i) => ({ name, shipments: count, color: courierColors[i % courierColors.length] }))
            );

            // Calculate daily trend
            const dayMap: Record<string, number> = {};
            shipmentsData.forEach(s => {
                const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
                const key = format(d, "MMM dd");
                dayMap[key] = (dayMap[key] || 0) + 1;
            });
            setDailyTrend(Object.entries(dayMap).map(([date, shipments]) => ({ date, shipments })));

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
    const totalWeight = shipments.reduce((sum, s) => sum + (s.weight || 0), 0);
    const deliveredCount = shipments.filter(s => s.status === 'delivered').length;
    const inTransitCount = shipments.filter(s => s.status === 'transit').length;
    const deliveryRate = shipments.length > 0
        ? ((deliveredCount / shipments.length) * 100)
        : 0;
    const uniqueCouriers = new Set(shipments.map(s => s.courier)).size;

    const tooltipStyle = {
        backgroundColor: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "12px",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
        fontSize: "12px",
    };

    return (
        <div className="space-y-8 min-h-screen pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">My Reports</h1>
                    <p className="text-muted-foreground text-sm mt-1">Generate detailed analytics for your shipping activity</p>
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
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-md min-w-[160px]"
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
                        Select a date range above and click &quot;Generate Report&quot; to view detailed analytics for your shipments.
                    </p>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <RefreshCw className="h-10 w-10 text-blue-500 animate-spin mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Generating Report</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Fetching your shipment data...</p>
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
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-4 rounded-lg border border-blue-100 dark:border-blue-900">
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
                                        <p className="text-xs text-muted-foreground mt-0.5">{uniqueCouriers} courier{uniqueCouriers !== 1 ? 's' : ''} used</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-border/50">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2.5 rounded-xl bg-emerald-500/10">
                                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                                        </div>
                                        <Badge variant="secondary" className="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-xs">
                                            Delivered
                                        </Badge>
                                    </div>
                                    <div className="mt-3">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Delivered</p>
                                        <h4 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{deliveredCount}</h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">{inTransitCount} in transit</p>
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
                                        <p className="text-xs text-muted-foreground mt-0.5">{deliveredCount} of {shipments.length} delivered</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-border/50">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2.5 rounded-xl bg-violet-500/10">
                                            <Truck className="h-5 w-5 text-violet-600" />
                                        </div>
                                        <Badge variant="secondary" className="text-violet-600 bg-violet-50 dark:bg-violet-950/50 text-xs">
                                            Weight
                                        </Badge>
                                    </div>
                                    <div className="mt-3">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Weight</p>
                                        <h4 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{totalWeight.toFixed(1)} kg</h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">Avg {shipments.length > 0 ? (totalWeight / shipments.length).toFixed(1) : 0} kg/order</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Charts Row 1: Trend + Status */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Daily Shipment Trend */}
                            <MotionCard delay={0.1} className="lg:col-span-2">
                                <MotionCardHeader>
                                    <MotionCardTitle className="flex items-center gap-2">
                                        <BarChart3 className="h-5 w-5 text-blue-500" />
                                        Shipping Activity Trend
                                    </MotionCardTitle>
                                    <p className="text-sm text-muted-foreground">Daily shipment volume</p>
                                </MotionCardHeader>
                                <MotionCardContent>
                                    <div className="h-[300px] w-full">
                                        {dailyTrend.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={dailyTrend}>
                                                    <defs>
                                                        <linearGradient id="colorShipments" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                                                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                                                    <Tooltip contentStyle={tooltipStyle} />
                                                    <Area type="monotone" dataKey="shipments" stroke="#6366f1" fill="url(#colorShipments)" name="Shipments" />
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

                        {/* Courier Breakdown */}
                        <MotionCard delay={0.3}>
                            <MotionCardHeader>
                                <MotionCardTitle className="flex items-center gap-2">
                                    <Truck className="h-5 w-5 text-blue-500" />
                                    Courier Usage Breakdown
                                </MotionCardTitle>
                                <p className="text-sm text-muted-foreground">Shipments by courier partner</p>
                            </MotionCardHeader>
                            <MotionCardContent>
                                <div className="h-[280px] w-full">
                                    {courierBreakdown.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={courierBreakdown} layout="vertical" margin={{ left: 10 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                                                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                                                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={90} />
                                                <Tooltip contentStyle={tooltipStyle} />
                                                <Bar dataKey="shipments" fill="#6366f1" radius={[0, 4, 4, 0]} name="Shipments" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No courier data</div>
                                    )}
                                </div>
                            </MotionCardContent>
                        </MotionCard>

                        {/* Detailed Transaction Record */}
                        <MotionCard delay={0.4}>
                            <MotionCardHeader>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <MotionCardTitle className="flex items-center gap-2">
                                            <FileText className="h-5 w-5 text-blue-500" />
                                            Shipment Details
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
                                                <TableHead>AWB/Tracking ID</TableHead>
                                                <TableHead>Courier</TableHead>
                                                <TableHead>Route</TableHead>
                                                <TableHead className="text-center">Status</TableHead>
                                                <TableHead className="text-right">Weight</TableHead>
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
                                                                {shipment.courierTrackingId || shipment.id.slice(0, 12)}
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
                                                            <TableCell className="text-right text-sm">{shipment.weight || 0} kg</TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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

                        {/* Shipment Summary Footer */}
                        <Card className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 text-white border-0">
                            <CardContent className="p-6">
                                <h3 className="text-lg font-semibold mb-4">Shipment Summary</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div>
                                        <p className="text-slate-400 text-xs uppercase tracking-wider">Total Shipments</p>
                                        <p className="text-2xl font-bold mt-1">{shipments.length}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs uppercase tracking-wider">Delivered</p>
                                        <p className="text-2xl font-bold mt-1 text-emerald-400">{deliveredCount}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs uppercase tracking-wider">Total Weight</p>
                                        <p className="text-2xl font-bold mt-1">{totalWeight.toFixed(1)} kg</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs uppercase tracking-wider">Delivery Rate</p>
                                        <p className="text-2xl font-bold mt-1 text-emerald-400">{deliveryRate.toFixed(1)}%</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Download Choice Dialog */}
            <Dialog open={downloadChoiceOpen} onOpenChange={setDownloadChoiceOpen}>
                <DialogContent className="max-w-sm">
                    <h2 className="text-lg font-bold mb-1">Download Report</h2>
                    <p className="text-sm text-muted-foreground mb-4">Choose the type of report to download.</p>
                    <div className="flex flex-col gap-3">
                        <Button
                            className="w-full justify-start gap-3 h-auto py-3"
                            variant="outline"
                            onClick={() => { setDownloadChoiceOpen(false); handleDownload(); }}
                        >
                            <FileText className="h-5 w-5 text-blue-500" />
                            <div className="text-left">
                                <p className="font-semibold text-sm">Business Report</p>
                                <p className="text-xs text-muted-foreground">Analytics, charts & financials</p>
                            </div>
                        </Button>
                        <Button
                            className="w-full justify-start gap-3 h-auto py-3"
                            variant="outline"
                            onClick={() => { setDownloadChoiceOpen(false); setManifestPreviewOpen(true); }}
                        >
                            <Package className="h-5 w-5 text-violet-500" />
                            <div className="text-left">
                                <p className="font-semibold text-sm">Shipment Manifest</p>
                                <p className="text-xs text-muted-foreground">Tracking numbers, barcodes & dispatch details</p>
                            </div>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Manifest Preview Dialog */}
            <Dialog open={manifestPreviewOpen} onOpenChange={setManifestPreviewOpen}>
                <DialogContent className="max-w-4xl bg-white p-0 overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-muted/20">
                        <h2 className="font-bold">Shipment Manifest</h2>
                        <Button size="sm" onClick={printManifest}>
                            Print Manifest
                        </Button>
                    </div>
                    <div className="max-h-[75vh] overflow-auto bg-gray-50 p-4">
                        <ShipmentManifest shipments={filteredShipments} />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
