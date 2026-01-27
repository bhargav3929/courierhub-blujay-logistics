'use client';

import { useState } from "react";
import { DateRange } from "react-day-picker";
import { addDays, format } from "date-fns";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, TrendingUp, IndianRupee, Package, Users, Printer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { toast } from "sonner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export default function ReportsPage() {
    const [date, setDate] = useState<DateRange | undefined>({
        from: new Date(2026, 0, 1),
        to: addDays(new Date(2026, 0, 1), 20),
    });
    const [reportGenerated, setReportGenerated] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleGenerate = () => {
        if (!date?.from || !date?.to) {
            toast.error("Please select a date range first");
            return;
        }
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            setReportGenerated(true);
            toast.success("Report generated successfully");
        }, 1500);
    };

    const handleDownload = () => {
        toast.info("Preparing PDF download...");
        setTimeout(() => {
            window.print(); // Using browser print as robust "Save as PDF" for now
        }, 500);
    };

    return (
        <div className="space-y-8 min-h-screen pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Business Reports</h1>
                    <p className="text-muted-foreground text-sm mt-1">Generate comprehensive insights for your logistics operations</p>
                </div>
            </div>

            {/* Filter Section */}
            <Card className="border-border/60 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium text-slate-700">Select Date Range</label>
                            <DatePickerWithRange date={date} setDate={setDate} className="w-full" />
                        </div>
                        <Button
                            onClick={handleGenerate}
                            disabled={loading || !date?.from || !date?.to}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-md min-w-[140px]"
                        >
                            {loading ? (
                                <div className="h-4 w-4 border-2 border-white/30 border-t-white animate-spin rounded-full mr-2" />
                            ) : (
                                <FileText className="mr-2 h-4 w-4" />
                            )}
                            Generate Report
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Empty State */}
            {!reportGenerated && !loading && (
                <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                        <FileText className="h-12 w-12 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700">No Report Generated</h3>
                    <p className="text-slate-500 max-w-sm mt-2">
                        Select a date range above and click "Generate Report" to view your business intelligence insights.
                    </p>
                </div>
            )}

            {/* Report Content */}
            <AnimatePresence>
                {reportGenerated && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="space-y-8"
                    >
                        {/* Report Header & Actions */}
                        <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                            <div>
                                <h3 className="font-semibold text-blue-900">Report Summary</h3>
                                <p className="text-blue-700/80 text-sm">
                                    {date?.from ? format(date.from, "MMMM d, yyyy") : ""} - {date?.to ? format(date.to, "MMMM d, yyyy") : ""}
                                </p>
                            </div>
                            <Button variant="outline" onClick={handleDownload} className="bg-white hover:bg-blue-50 border-blue-200 text-blue-700">
                                <Download className="mr-2 h-4 w-4" />
                                Download PDF
                            </Button>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card>
                                <CardContent className="p-6 flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
                                        <IndianRupee className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground font-medium">Total Revenue</p>
                                        <h4 className="text-2xl font-bold text-slate-900">₹45,231.00</h4>
                                        <p className="text-xs text-emerald-600 font-medium mt-1">+12.5% vs previous</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-6 flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
                                        <Package className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground font-medium">Total Shipments</p>
                                        <h4 className="text-2xl font-bold text-slate-900">142</h4>
                                        <p className="text-xs text-blue-600 font-medium mt-1">Av. 7 per day</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-6 flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-violet-500/10 text-violet-600">
                                        <Users className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground font-medium">Active Clients</p>
                                        <h4 className="text-2xl font-bold text-slate-900">8</h4>
                                        <p className="text-xs text-violet-600 font-medium mt-1">2 New this period</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Detailed Table */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Detailed Transaction Record</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead>Date</TableHead>
                                            <TableHead>Order ID</TableHead>
                                            <TableHead>Client</TableHead>
                                            <TableHead>Courier</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {[1, 2, 3, 4, 5].map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell className="text-muted-foreground">Jan {20 - i}, 2026</TableCell>
                                                <TableCell className="font-mono font-medium">ORD-7732-{99 + i}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">SV Enterprises</span>
                                                        <span className="text-xs text-muted-foreground">Franchise</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                        Blue Dart
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">₹450.00</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
