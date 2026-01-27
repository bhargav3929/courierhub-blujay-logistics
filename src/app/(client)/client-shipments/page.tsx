'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Filter, Download, ExternalLink, MoreVertical, Plus } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BlueDartLabel, printBlueDartLabel } from "@/components/shipments/BlueDartLabel";
import { Printer } from "lucide-react";
import { getAllShipments, updateShipmentStatus } from "@/services/shipmentService";
import { blueDartService } from "@/services/blueDartService";
import { Shipment } from "@/types/types";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

const getStatusStyle = (status: string) => {
    switch (status) {
        case "delivered": return "bg-status-delivered/10 text-status-delivered border-status-delivered/20";
        case "transit": return "bg-status-transit/10 text-status-transit border-status-transit/20";
        case "pending": return "bg-status-pending/10 text-status-pending border-status-pending/20";
        case "cancelled": return "bg-status-cancelled/10 text-status-cancelled border-status-cancelled/20";
        default: return "bg-muted text-muted-foreground";
    }
};

const ClientShipments = () => {
    const { currentUser } = useAuth();
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedShipmentForLabel, setSelectedShipmentForLabel] = useState<Shipment | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

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
            toast.error("Failed to load shipments");
        } finally {
            setLoading(false);
        }
    };

    const handleCancelShipment = async (shipment: Shipment) => {
        if (!shipment.id || !shipment.courierTrackingId) {
            toast.error("Invalid shipment data for cancellation");
            return;
        }

        if (!confirm("Are you sure you want to cancel this shipment? This action cannot be undone.")) {
            return;
        }

        setCancellingId(shipment.id);
        const toastId = toast.loading("Cancelling shipment...");

        try {
            // 1. Cancel via Blue Dart API
            await blueDartService.cancelWaybill(shipment.courierTrackingId);

            // 2. Update status in Firestore
            await updateShipmentStatus(shipment.id, 'cancelled');

            toast.success("Shipment cancelled successfully", { id: toastId });

            // 3. Refresh list
            fetchShipments();
        } catch (error: any) {
            console.error("Cancellation failed:", error);
            const errorMsg = error.response?.data?.error || error.message || "Failed to cancel shipment";
            toast.error(`Cancellation failed: ${errorMsg}`, { id: toastId });
        } finally {
            setCancellingId(null);
        }
    };

    const filteredShipments = shipments.filter((shp) =>
        shp.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shp.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shp.destination?.city?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">My Shipments</h1>
                    <p className="text-muted-foreground">Manage and track all your outgoing packages</p>
                </div>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-muted hover:border-primary/50 rounded-xl text-sm font-bold transition-all text-foreground">
                        <Download className="h-4 w-4" /> Export CSV
                    </button>
                    <Link href="/add-shipment">
                        <button className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-primary/20 transition-all">
                            <Plus className="h-4 w-4" /> Book New Shipment
                        </button>
                    </Link>
                </div>
            </div>

            <Card className="border-none shadow-xl bg-white overflow-hidden">
                <CardHeader className="p-6 border-b">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by ID, Receiver or City..."
                                className="pl-10 bg-muted/30 border-none h-11"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted rounded-lg text-sm font-medium transition-colors">
                                <Filter className="h-4 w-4" /> Filters
                            </button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                            <p className="mt-4 text-muted-foreground">Loading shipments...</p>
                        </div>
                    ) : filteredShipments.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground">No shipments found.</p>
                            <Link href="/add-shipment">
                                <button className="mt-4 px-6 py-2 bg-primary text-white rounded-lg">
                                    Create Your First Shipment
                                </button>
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-muted/30 text-muted-foreground text-[10px] uppercase tracking-widest font-black">
                                            <th className="px-6 py-4">Shipment ID</th>
                                            <th className="px-6 py-4">Date</th>
                                            <th className="px-6 py-4">Receiver</th>
                                            <th className="px-6 py-4">Destination</th>
                                            <th className="px-6 py-4">Courier</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {filteredShipments.map((shp) => (
                                            <tr key={shp.id} className="hover:bg-primary/[0.02] transition-colors group">
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col">
                                                        <span className="font-mono text-sm text-primary font-bold">
                                                            {shp.courierTrackingId || shp.id?.substring(0, 12).toUpperCase()}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground uppercase">
                                                            {shp.weight}kg | Express
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-sm font-medium">
                                                    {shp.createdAt?.toDate ? format(shp.createdAt.toDate(), "dd MMM yyyy") : "N/A"}
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className="font-bold text-sm block">{shp.destination?.address || shp.destination?.city || "N/A"}</span>
                                                    <span className="text-xs text-muted-foreground">Pincode: {shp.destination?.pincode || ""}</span>
                                                </td>
                                                <td className="px-6 py-5 text-sm">{shp.destination?.city}, {shp.destination?.state}</td>
                                                <td className="px-6 py-5">
                                                    <span className="text-sm font-semibold">{shp.courier}</span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${getStatusStyle(shp.status)}`}>
                                                        {shp.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger className="p-2 hover:bg-muted rounded-lg transition-colors">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48 p-2 rounded-xl">
                                                            <DropdownMenuItem className="flex items-center gap-2 cursor-pointer p-3 rounded-lg">
                                                                <ExternalLink className="h-4 w-4" /> Track Package
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="flex items-center gap-2 cursor-pointer p-3 rounded-lg"
                                                                onClick={() => setSelectedShipmentForLabel(shp)}
                                                            >
                                                                <Download className="h-4 w-4" /> Invoice
                                                            </DropdownMenuItem>
                                                            {shp.status !== 'cancelled' && shp.status !== 'delivered' && (
                                                                <DropdownMenuItem
                                                                    className="flex items-center gap-2 cursor-pointer p-3 rounded-lg text-red-600 focus:text-red-600 focus:bg-red-50"
                                                                    onClick={() => handleCancelShipment(shp)}
                                                                    disabled={cancellingId === shp.id}
                                                                >
                                                                    <div className="flex items-center w-full gap-2">
                                                                        <span className="text-lg">×</span>
                                                                        {cancellingId === shp.id ? 'Cancelling...' : 'Cancel Shipment'}
                                                                    </div>
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-6 border-t bg-muted/10 flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                    Showing {filteredShipments.length} of {shipments.length} shipments
                                </p>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Print Label Dialog */}
            <Dialog open={!!selectedShipmentForLabel} onOpenChange={(open) => !open && setSelectedShipmentForLabel(null)}>
                <DialogContent className="max-w-md bg-white p-0 overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-muted/20">
                        <h2 className="font-bold">Shipping Label</h2>
                        <button
                            onClick={printBlueDartLabel}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90"
                        >
                            <Printer className="h-4 w-4" /> Print Label
                        </button>
                    </div>
                    <div className="p-8 flex justify-center bg-gray-50">
                        {selectedShipmentForLabel && <BlueDartLabel shipment={selectedShipmentForLabel} />}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ClientShipments;
