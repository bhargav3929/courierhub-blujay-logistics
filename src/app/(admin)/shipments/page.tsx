'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Search,
    Eye,
    MoreHorizontal,
    RefreshCw,
    FileSpreadsheet,
    Trash2,
    FileText,
    Printer
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getAllShipments, deleteShipment } from "@/services/shipmentService";
import { getAllClients } from "@/services/clientService";
import { Shipment, Client } from "@/types/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { ShipmentManifest, printManifest } from "@/components/shipments/ShipmentManifest";
import { BlueDartLabel, printBlueDartLabel } from "@/components/shipments/BlueDartLabel";
import { DTDCLabel, printDTDCLabel } from "@/components/shipments/DTDCLabel";
import { ShopifyLabel, printShopifyLabel } from "@/components/shipments/ShopifyLabel";

const Shipments = () => {
    const [loading, setLoading] = useState(true);
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [clients, setClients] = useState<Client[]>([]);

    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Delete dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [shipmentToDelete, setShipmentToDelete] = useState<Shipment | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Label & Manifest dialog state
    const [selectedShipmentForLabel, setSelectedShipmentForLabel] = useState<Shipment | null>(null);
    const [selectedShipmentForManifest, setSelectedShipmentForManifest] = useState<Shipment | null>(null);
    const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal');

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [clientFilter, setClientFilter] = useState("all");
    const [courierFilter, setCourierFilter] = useState("all");

    useEffect(() => {
        fetchInitialData();
    }, []);

    // Effect to re-fetch when filters change (debounced for search)
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchShipments();
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery, clientFilter, courierFilter]);

    const fetchInitialData = async () => {
        try {
            const [clientsData] = await Promise.all([
                getAllClients()
            ]);
            setClients(clientsData);
        } catch (error) {
            console.error("Error fetching initial data:", error);
            toast.error("Failed to load filter data");
        }
    };

    const fetchShipments = async () => {
        try {
            setLoading(true);
            const filters: any = {};

            if (clientFilter && clientFilter !== "all") filters.clientId = clientFilter;
            if (courierFilter && courierFilter !== "all") filters.courier = courierFilter;
            if (searchQuery) filters.search = searchQuery;

            const data = await getAllShipments(filters);
            setShipments(data);
            // Clear selection when data changes
            setSelectedIds(new Set());
        } catch (error) {
            console.error("Error fetching shipments:", error);
            toast.error("Failed to load shipments");
        } finally {
            setLoading(false);
        }
    };

    // Toggle select all
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(shipments.map(s => s.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    // Toggle individual row selection
    const handleSelectRow = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedIds);
        if (checked) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
        }
        setSelectedIds(newSelected);
    };

    // Check if all are selected
    const isAllSelected = shipments.length > 0 && selectedIds.size === shipments.length;
    const isSomeSelected = selectedIds.size > 0 && selectedIds.size < shipments.length;

    // Export shipments to BlueDart Excel format using official template
    const handleExport = async () => {
        // Get shipments to export (selected or all)
        const shipmentsToExport = selectedIds.size > 0
            ? shipments.filter(s => selectedIds.has(s.id))
            : shipments;

        if (shipmentsToExport.length === 0) {
            toast.error("No shipments to export");
            return;
        }

        try {
            toast.loading("Generating BlueDart Excel...", { id: "export" });

            const response = await fetch('/api/bluedart/export-excel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ shipments: shipmentsToExport }),
            });

            // Handle validation errors
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                // Check if it's a validation error with details
                if (errorData.validationErrors && errorData.validationErrors.length > 0) {
                    const errors = errorData.validationErrors;
                    const errorsByRow: { [key: number]: string[] } = {};

                    // Group errors by row
                    errors.forEach((err: { row: number; field: string; message: string }) => {
                        if (!errorsByRow[err.row]) {
                            errorsByRow[err.row] = [];
                        }
                        errorsByRow[err.row].push(`${err.field}: ${err.message}`);
                    });

                    // Show first few errors
                    const errorSummary = Object.entries(errorsByRow)
                        .slice(0, 3)
                        .map(([row, msgs]) => `Row ${row}: ${msgs.slice(0, 2).join(', ')}${msgs.length > 2 ? '...' : ''}`)
                        .join('\n');

                    toast.error(errorData.error || 'Validation failed', {
                        id: "export",
                        description: `${errorData.errorCount} errors in ${errorData.shipmentsWithErrors} shipment(s). Fix these issues: ${errorSummary}`,
                        duration: 10000,
                    });
                    return;
                }

                throw new Error(errorData.error || 'Failed to generate Excel file');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `BlueDart_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = filenameMatch[1].replace(/['"]/g, '');
                }
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success(`Exported ${shipmentsToExport.length} shipment${shipmentsToExport.length > 1 ? 's' : ''}`, {
                id: "export",
                description: `File: ${filename}`,
            });
        } catch (error) {
            console.error("Export error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to export shipments", {
                id: "export",
            });
        }
    };

    // Handle delete confirmation
    const handleDeleteClick = (shipment: Shipment) => {
        setShipmentToDelete(shipment);
        setDeleteDialogOpen(true);
    };

    // Perform actual delete
    const handleConfirmDelete = async () => {
        if (!shipmentToDelete) return;

        try {
            setIsDeleting(true);
            await deleteShipment(shipmentToDelete.id);

            // Remove from local state
            setShipments(prev => prev.filter(s => s.id !== shipmentToDelete.id));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(shipmentToDelete.id);
                return newSet;
            });

            toast.success("Shipment deleted successfully");
            setDeleteDialogOpen(false);
            setShipmentToDelete(null);
        } catch (error) {
            console.error("Delete error:", error);
            toast.error("Failed to delete shipment");
        } finally {
            setIsDeleting(false);
        }
    };

    // Format datetime for display
    const formatDateTime = (timestamp: any) => {
        if (!timestamp) return "N/A";
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return format(date, "MMM d, yyyy 'at' h:mm a");
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Shipments</h2>
                    <p className="text-muted-foreground text-sm">Track and manage all shipments across your network</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="bg-white" onClick={() => fetchShipments()}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <Button
                        variant="outline"
                        className="bg-white hover:bg-green-50 hover:border-green-500 hover:text-green-700"
                        onClick={handleExport}
                        disabled={shipments.length === 0}
                    >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export BlueDart Excel
                        {selectedIds.size > 0 && (
                            <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">
                                {selectedIds.size}
                            </Badge>
                        )}
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CardTitle>All Shipments ({shipments.length})</CardTitle>
                            {selectedIds.size > 0 && (
                                <Badge variant="outline" className="text-blue-600 border-blue-600">
                                    {selectedIds.size} selected
                                </Badge>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2 w-full md:w-auto">
                            {/* Search */}
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search ID or Client..."
                                    className="pl-8 focus-visible:ring-primary"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* Courier Filter */}
                            <Select value={courierFilter} onValueChange={setCourierFilter}>
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue placeholder="Courier" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Couriers</SelectItem>
                                    <SelectItem value="DTDC">DTDC</SelectItem>
                                    <SelectItem value="Blue Dart">Blue Dart</SelectItem>
                                    <SelectItem value="Delhivery">Delhivery</SelectItem>
                                    <SelectItem value="India Post">India Post</SelectItem>
                                    <SelectItem value="Ecom Express">Ecom Express</SelectItem>
                                    <SelectItem value="Shadowfax">Shadowfax</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Client Filter */}
                            <Select value={clientFilter} onValueChange={setClientFilter}>
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue placeholder="Client" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Clients</SelectItem>
                                    {clients.map(client => (
                                        <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading && shipments.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                            <p className="mt-4 text-muted-foreground">Loading shipments...</p>
                        </div>
                    ) : shipments.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <p>No shipments found matching your filters.</p>
                            <Button variant="link" onClick={() => {
                                setClientFilter("all");
                                setCourierFilter("all");
                                setSearchQuery("");
                            }}>
                                Clear all filters
                            </Button>
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="w-[50px]">
                                            <Checkbox
                                                checked={isAllSelected}
                                                onCheckedChange={handleSelectAll}
                                                aria-label="Select all"
                                                className={isSomeSelected ? "data-[state=checked]:bg-primary" : ""}
                                            />
                                        </TableHead>
                                        <TableHead className="w-[100px]">ID</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead>Registered On</TableHead>
                                        <TableHead>Origin / Dest</TableHead>
                                        <TableHead>Courier</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {shipments.map((shipment) => (
                                        <TableRow
                                            key={shipment.id}
                                            className={`hover:bg-muted/30 transition-colors ${selectedIds.has(shipment.id) ? 'bg-blue-50/50' : ''}`}
                                        >
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedIds.has(shipment.id)}
                                                    onCheckedChange={(checked) => handleSelectRow(shipment.id, !!checked)}
                                                    aria-label={`Select shipment ${shipment.id}`}
                                                />
                                            </TableCell>
                                            <TableCell className="font-mono font-medium text-xs">
                                                {shipment.id ? shipment.id.substring(0, 8).toUpperCase() : "N/A"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">{shipment.clientName}</span>
                                                    <span className="text-xs text-muted-foreground capitalize">{shipment.clientType}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                <div className="flex flex-col">
                                                    <span>{formatDateTime(shipment.createdAt)}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-xs">
                                                    <span className="text-muted-foreground">From: <span className="text-foreground">{shipment.origin?.city}</span></span>
                                                    <span className="text-muted-foreground">To: <span className="text-foreground">{shipment.destination?.city}</span></span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="font-normal text-xs bg-muted">
                                                    {shipment.courier}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem className="cursor-pointer">
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="cursor-pointer" onClick={() => setSelectedShipmentForLabel(shipment)}>
                                                            <Printer className="mr-2 h-4 w-4" />
                                                            Download Label
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="cursor-pointer" onClick={() => setSelectedShipmentForManifest(shipment)}>
                                                            <FileText className="mr-2 h-4 w-4" />
                                                            Download Manifest
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                                                            onClick={() => handleDeleteClick(shipment)}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete Shipment
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Shipment</AlertDialogTitle>
                        <AlertDialogDescription>
                            This shipment will be <span className="font-semibold text-red-600">permanently deleted</span> from the system.
                            This action cannot be undone.
                            {shipmentToDelete && (
                                <div className="mt-3 p-3 bg-muted rounded-md text-sm">
                                    <div><strong>ID:</strong> {shipmentToDelete.id.substring(0, 8).toUpperCase()}</div>
                                    <div><strong>Client:</strong> {shipmentToDelete.clientName}</div>
                                    <div><strong>Courier:</strong> {shipmentToDelete.courier}</div>
                                </div>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                            {isDeleting ? "Deleting..." : "Delete Permanently"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Print Label Dialog */}
            <Dialog open={!!selectedShipmentForLabel} onOpenChange={(open) => !open && setSelectedShipmentForLabel(null)}>
                <DialogContent className={`${
                    (selectedShipmentForLabel?.clientType === 'shopify' || !!selectedShipmentForLabel?.shopifyOrderId) ? 'max-w-lg' :
                    selectedShipmentForLabel?.courier === 'DTDC' ? 'max-w-2xl' : 'max-w-md'
                } bg-white p-0 overflow-hidden [&>button:last-child]:hidden`}>
                    {/* Header */}
                    <div className="px-5 pt-5 pb-4 border-b bg-gradient-to-b from-muted/40 to-white space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold text-foreground">
                                    Shipping Label
                                </h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {(selectedShipmentForLabel?.clientType === 'shopify' || !!selectedShipmentForLabel?.shopifyOrderId)
                                        ? `Shopify · ${selectedShipmentForLabel?.courier || ''}`
                                        : selectedShipmentForLabel?.courier || ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedShipmentForLabel(null)}
                                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <span className="text-lg leading-none">&times;</span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            {(selectedShipmentForLabel?.clientType === 'shopify' || !!selectedShipmentForLabel?.shopifyOrderId) ? (
                                <div className="flex items-center bg-muted/60 rounded-lg p-0.5 text-xs">
                                    <button
                                        onClick={() => setPrintMode('thermal')}
                                        className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                            printMode === 'thermal'
                                                ? 'bg-white text-primary shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        Thermal 4×6
                                    </button>
                                    <button
                                        onClick={() => setPrintMode('a4')}
                                        className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                            printMode === 'a4'
                                                ? 'bg-white text-primary shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        A4 Sheet
                                    </button>
                                </div>
                            ) : <div />}
                            <button
                                onClick={() => {
                                    if (selectedShipmentForLabel?.clientType === 'shopify' || !!selectedShipmentForLabel?.shopifyOrderId) {
                                        printShopifyLabel(printMode);
                                    } else if (selectedShipmentForLabel?.courier === 'DTDC') {
                                        printDTDCLabel();
                                    } else {
                                        printBlueDartLabel();
                                    }
                                }}
                                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
                            >
                                <Printer className="h-3.5 w-3.5" /> Print Label
                            </button>
                        </div>
                    </div>
                    <div className="p-6 flex justify-center bg-gray-50/50 max-h-[70vh] overflow-auto">
                        {selectedShipmentForLabel && (
                            (selectedShipmentForLabel.clientType === 'shopify' || !!selectedShipmentForLabel.shopifyOrderId) ? (
                                <ShopifyLabel shipment={selectedShipmentForLabel} />
                            ) : selectedShipmentForLabel.courier === 'DTDC' ? (
                                <DTDCLabel referenceNumber={selectedShipmentForLabel.courierTrackingId || selectedShipmentForLabel.dtdcReferenceNumber || ''} />
                            ) : (
                                <BlueDartLabel shipment={selectedShipmentForLabel} />
                            )
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Manifest Dialog */}
            <Dialog open={!!selectedShipmentForManifest} onOpenChange={(open) => !open && setSelectedShipmentForManifest(null)}>
                <DialogContent className="max-w-4xl bg-white p-0 overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-muted/20">
                        <h2 className="font-bold">Shipment Manifest</h2>
                        <button
                            onClick={printManifest}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90"
                        >
                            <Printer className="h-4 w-4" /> Print Manifest
                        </button>
                    </div>
                    <div className="max-h-[75vh] overflow-auto bg-gray-50 p-4">
                        {selectedShipmentForManifest && <ShipmentManifest shipments={[selectedShipmentForManifest]} />}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Shipments;

