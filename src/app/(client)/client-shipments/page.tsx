'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Filter, Download, ExternalLink, MoreVertical, Plus, BadgeCheck, ShoppingBag, Package, AlertTriangle, CheckCircle2, XCircle, Loader2, Truck, RotateCcw, RefreshCw, MapPin, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { BlueDartLabel, printBlueDartLabel } from "@/components/shipments/BlueDartLabel";
import { DTDCLabel, printDTDCLabel } from "@/components/shipments/DTDCLabel";
import { ShopifyLabel, printShopifyLabel, printBulkShopifyLabels } from "@/components/shipments/ShopifyLabel";
import { ShipmentManifest, printManifest } from "@/components/shipments/ShipmentManifest";
import { Printer, FileText as FileTextIcon } from "lucide-react";
import { getAllShipments, updateShipmentStatus, updateShipment } from "@/services/shipmentService";
import { getDefaultPickupAddress } from "@/services/clientService";
import { getSubAccountIds, getSubAccountsByParent } from "@/services/subAccountService";
import { Client } from "@/types/types";
import { blueDartService } from "@/services/blueDartService";
import { dtdcService } from "@/services/dtdcService";
import { delhiveryService } from "@/services/delhiveryService";
import { BLUEDART_PREDEFINED, BLUEDART_SERVICE_TYPES } from "@/config/bluedartConfig";
import { DTDC_PREDEFINED } from "@/config/dtdcConfig";
import { DELHIVERY_PREDEFINED, sanitizeDelhiveryField } from "@/config/delhiveryConfig";
import { normalizeTrackingStatus, getTrackingDisplay, legacyStatusToTracking, type TrackingStatus } from "@/config/trackingStatusConfig";
import { Shipment } from "@/types/types";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

// Validation for bulk shipping
interface OrderValidation {
    shipment: Shipment;
    errors: string[];
    isValid: boolean;
}

interface BulkShipResult {
    id: string;
    orderNumber: string;
    success: boolean;
    awb?: string;
    error?: string;
}

const ClientShipments = () => {
    const router = useRouter();
    const { currentUser, firebaseUser, canManageSubAccounts } = useAuth();
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedShipmentForLabel, setSelectedShipmentForLabel] = useState<Shipment | null>(null);
    const [selectedShipmentForManifest, setSelectedShipmentForManifest] = useState<Shipment | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [resyncingId, setResyncingId] = useState<string | null>(null);
    const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal');

    // Tab state (only used by Shopify merchants). White-label + franchise behave identically here.
    const isFranchise = currentUser?.role === 'franchise' || currentUser?.role === 'white_label';
    const [activeTab, setActiveTab] = useState<string>('new-orders');

    // Hook courier services up to this client's connected integrations.
    useEffect(() => {
        blueDartService.setClientId(currentUser?.id);
        dtdcService.setClientId(currentUser?.id);
        delhiveryService.setClientId(currentUser?.id);
        return () => {
            blueDartService.setClientId(undefined);
            dtdcService.setClientId(undefined);
            delhiveryService.setClientId(undefined);
        };
    }, [currentUser?.id]);

    // Sub-account hierarchy state
    const [subAccounts, setSubAccounts] = useState<Client[]>([]);
    const [createdByFilter, setCreatedByFilter] = useState<string>('all'); // 'all', 'me', or subAccountId

    // Shipped tab: Bulk selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkPrintMode, setBulkPrintMode] = useState<'thermal' | 'a4'>('thermal');
    const [labelsForBulkPrint, setLabelsForBulkPrint] = useState<Shipment[] | null>(null);
    const [showExportConfirm, setShowExportConfirm] = useState(false);

    // New Orders tab: Bulk ship state
    const [selectedNewOrderIds, setSelectedNewOrderIds] = useState<Set<string>>(new Set());
    const [bulkShipCourier, setBulkShipCourier] = useState<'Blue Dart' | 'DTDC' | 'Delhivery'>('Blue Dart');
    const [bulkShipBlueDartService, setBulkShipBlueDartService] = useState<'APEX' | 'BHARAT_DART'>('APEX');
    const [showBulkShipDialog, setShowBulkShipDialog] = useState(false);
    const [bulkShipValidation, setBulkShipValidation] = useState<OrderValidation[] | null>(null);
    const [isBulkShipping, setIsBulkShipping] = useState(false);
    const [bulkShipResults, setBulkShipResults] = useState<BulkShipResult[] | null>(null);
    const [bulkShipProgress, setBulkShipProgress] = useState({ completed: 0, total: 0 });

    // Tracking state
    const [trackingShipment, setTrackingShipment] = useState<Shipment | null>(null);
    const [trackingData, setTrackingData] = useState<any>(null);
    const [trackingLoading, setTrackingLoading] = useState(false);
    const [trackingError, setTrackingError] = useState<string | null>(null);

    // Filter state
    const [filterOpen, setFilterOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [courierFilter, setCourierFilter] = useState<string[]>([]);
    const [paymentFilter, setPaymentFilter] = useState<string[]>([]);
    const [typeFilter, setTypeFilter] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const activeFilterCount = [statusFilter.length > 0, courierFilter.length > 0, paymentFilter.length > 0, typeFilter.length > 0, dateFrom, dateTo, canManageSubAccounts && createdByFilter !== 'all'].filter(Boolean).length;

    const toggleFilter = (arr: string[], setArr: (v: string[]) => void, value: string) => {
        setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]);
    };

    const clearAllFilters = () => {
        setStatusFilter([]);
        setCourierFilter([]);
        setPaymentFilter([]);
        setTypeFilter([]);
        setDateFrom("");
        setDateTo("");
        setCreatedByFilter('all');
    };

    const applyShipmentFilters = (shp: Shipment) => {
        // Created by filter (for franchise primary users)
        if (canManageSubAccounts && createdByFilter !== 'all') {
            if (createdByFilter === 'me') {
                if (shp.clientId !== currentUser?.id) return false;
            } else {
                // Filter by specific sub-account
                if (shp.clientId !== createdByFilter) return false;
            }
        }
        // Status filter (OR within group) — uses tracking status when available
        if (statusFilter.length > 0) {
            const ts = shp.trackingStatus || '';
            const matchesAnyStatus = statusFilter.some(sf => {
                if (sf === 'shipped') {
                    if (ts) return ['booked', 'picked_up', 'in_transit', 'out_for_delivery'].includes(ts);
                    return shp.status === 'pending' || shp.status === 'transit';
                }
                if (sf === 'delivered') {
                    if (ts) return ts === 'delivered';
                    return shp.status === 'delivered';
                }
                if (sf === 'cancelled') {
                    if (ts) return ts === 'cancelled';
                    return shp.status === 'cancelled';
                }
                return false;
            });
            if (!matchesAnyStatus) return false;
        }
        // Courier filter
        if (courierFilter.length > 0 && !courierFilter.includes(shp.courier || '')) return false;
        // Payment filter
        if (paymentFilter.length > 0) {
            const isCOD = !!shp.toPayCustomer;
            const matchesPayment = paymentFilter.some(pf => {
                if (pf === 'COD') return isCOD;
                if (pf === 'Prepaid') return !isCOD;
                return false;
            });
            if (!matchesPayment) return false;
        }
        // Type filter
        if (typeFilter.length > 0) {
            const shipType = shp.shipmentType === 'return' ? 'Return' : 'Forward';
            if (!typeFilter.includes(shipType)) return false;
        }
        // Date range
        if (dateFrom || dateTo) {
            const createdMs = shp.createdAt?.toDate ? shp.createdAt.toDate().getTime() : 0;
            if (!createdMs) return false;
            if (dateFrom && createdMs < new Date(dateFrom).getTime()) return false;
            if (dateTo && createdMs > new Date(dateTo).getTime() + 86400000) return false;
        }
        return true;
    };

    // Helper to get the creator name for a shipment
    const getCreatorName = (clientId: string): string => {
        if (clientId === currentUser?.id) return 'Me';
        const subAccount = subAccounts.find(s => s.id === clientId);
        return subAccount?.name || 'Unknown';
    };

    // Fetch sub-accounts for franchise primary users
    useEffect(() => {
        const fetchSubAccounts = async () => {
            if (canManageSubAccounts && currentUser?.id) {
                try {
                    const accounts = await getSubAccountsByParent(currentUser.id);
                    setSubAccounts(accounts);
                } catch (error) {
                    console.error("Error fetching sub-accounts:", error);
                }
            }
        };
        fetchSubAccounts();
    }, [canManageSubAccounts, currentUser?.id]);

    useEffect(() => {
        if (currentUser?.id) {
            fetchShipments();
        }
    }, [currentUser]);

    const fetchShipments = async () => {
        try {
            setLoading(true);
            let data: Shipment[];

            // For franchise primary users, fetch own + sub-accounts' shipments
            if (canManageSubAccounts) {
                const subAccountIds = await getSubAccountIds(currentUser!.id);
                const allIds = [currentUser!.id, ...subAccountIds];
                data = await getAllShipments({ clientIds: allIds });
            } else {
                // Sub-users and shopify: own shipments only
                data = await getAllShipments({ clientId: currentUser?.id });
            }

            setShipments(data);
            setSelectedIds(new Set());
            setSelectedNewOrderIds(new Set());
        } catch (error) {
            console.error("Error fetching shipments:", error);
            toast.error("Failed to load shipments");
        } finally {
            setLoading(false);
        }
    };

    // Set default tab based on data (franchise always shows shipped)
    useEffect(() => {
        if (isFranchise) {
            setActiveTab('shipped');
        } else if (!loading && shipments.length > 0) {
            const hasPending = shipments.some(
                s => s.status === 'shopify_pending' || s.status === 'webhook_pending'
            );
            setActiveTab(hasPending ? 'new-orders' : 'shipped');
        }
    }, [loading, shipments, isFranchise]);

    // Check if a shipment was created in the last 24 hours (for NEW badge in New Orders tab only)
    const isRecentOrder = (shp: Shipment): boolean => {
        const createdMs = shp.createdAt?.toDate ? shp.createdAt.toDate().getTime() : 0;
        if (!createdMs) return false;
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        return createdMs > twentyFourHoursAgo;
    };

    // Separate shipments into new orders and booked shipments.
    // Franchise users see all shipments in the "shipped" view.
    // "New Orders" covers both Shopify-sourced and merchant-webhook-sourced
    // pending shipments — they share the same Proceed-to-add-shipment flow.
    const isPendingOrder = (s: Shipment) =>
        s.status === 'shopify_pending' || s.status === 'webhook_pending';
    const newOrders = isFranchise ? [] : shipments.filter(isPendingOrder);
    const bookedShipments = isFranchise
        ? shipments
        : shipments.filter(s => !isPendingOrder(s));

    // Per-tab filtering (search + filters)
    const matchesSearch = (shp: Shipment, includeAwb: boolean) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            shp.shopifyOrderNumber?.toLowerCase().includes(q) ||
            shp.referenceNo?.toLowerCase().includes(q) ||
            shp.destination?.name?.toLowerCase().includes(q) ||
            shp.destination?.pincode?.toLowerCase().includes(q) ||
            shp.products?.[0]?.name?.toLowerCase().includes(q) ||
            shp.id?.toLowerCase().includes(q) ||
            (includeAwb && shp.courierTrackingId?.toLowerCase().includes(q))
        );
    };

    const filteredNewOrders = newOrders.filter((shp) =>
        matchesSearch(shp, false) && applyShipmentFilters(shp)
    );

    const filteredBookedShipments = bookedShipments.filter((shp) =>
        matchesSearch(shp, true) && applyShipmentFilters(shp)
    );

    // ==================== SHIPPED TAB: Selection handlers ====================
    const selectableShipments = filteredBookedShipments.filter(s => s.status !== 'declined');

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(selectableShipments.map(s => s.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedIds);
        if (checked) { newSelected.add(id); } else { newSelected.delete(id); }
        setSelectedIds(newSelected);
    };

    const isAllSelected = selectableShipments.length > 0 && selectedIds.size === selectableShipments.length;

    // Bulk print labels
    const handleBulkPrintLabels = () => {
        const selected = shipments.filter(s => selectedIds.has(s.id));
        if (selected.length === 0) { toast.error("No shipments selected"); return; }
        setLabelsForBulkPrint(selected);
        setTimeout(() => {
            printBulkShopifyLabels(bulkPrintMode);
            setTimeout(() => setLabelsForBulkPrint(null), 1000);
        }, 500);
    };

    // ==================== NEW ORDERS TAB: Selection handlers ====================
    const handleSelectAllNewOrders = (checked: boolean) => {
        if (checked) {
            setSelectedNewOrderIds(new Set(filteredNewOrders.map(s => s.id)));
        } else {
            setSelectedNewOrderIds(new Set());
        }
    };

    const handleSelectNewOrderRow = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedNewOrderIds);
        if (checked) { newSelected.add(id); } else { newSelected.delete(id); }
        setSelectedNewOrderIds(newSelected);
    };

    const isAllNewOrdersSelected = filteredNewOrders.length > 0 && selectedNewOrderIds.size === filteredNewOrders.length;

    // ==================== BULK SHIP: Validation ====================
    const validateOrderForShipping = (order: Shipment, pickupAddress: any): string[] => {
        const errors: string[] = [];
        if (!order.destination?.name?.trim()) errors.push('Customer name missing');
        const phone = order.destination?.phone?.replace(/\D/g, '') || '';
        if (phone.length < 10) errors.push('Customer phone missing or invalid');
        if (!order.destination?.pincode?.trim() || order.destination.pincode.replace(/\D/g, '').length !== 6) errors.push('Destination pincode invalid');
        if (!order.destination?.address?.trim()) errors.push('Destination address missing');
        if (!order.destination?.city?.trim()) errors.push('Destination city missing');
        const weight = order.weight || order.actualWeight || 0;
        if (weight <= 0) errors.push('Weight not specified');
        if (!pickupAddress) errors.push('Default pickup address not set — go to Settings');
        return errors;
    };

    const handleInitBulkShip = async () => {
        const selectedOrders = newOrders.filter(s => selectedNewOrderIds.has(s.id));
        if (selectedOrders.length === 0) { toast.error("No orders selected"); return; }

        // Fetch pickup address for validation
        const pickupAddress = currentUser?.id ? await getDefaultPickupAddress(currentUser.id) : null;

        const validations: OrderValidation[] = selectedOrders.map(order => {
            const errors = validateOrderForShipping(order, pickupAddress);
            return { shipment: order, errors, isValid: errors.length === 0 };
        });

        setBulkShipValidation(validations);
        setBulkShipResults(null);
        setBulkShipProgress({ completed: 0, total: 0 });
        setShowBulkShipDialog(true);
    };

    const handleRemoveFromBulkShip = (id: string) => {
        setBulkShipValidation(prev => prev ? prev.filter(v => v.shipment.id !== id) : null);
    };

    // ==================== BULK SHIP: Booking ====================
    const triggerShopifyFulfillment = async (shipmentId: string) => {
        try {
            const idToken = await firebaseUser?.getIdToken();
            await fetch('/api/integrations/shopify/fulfill', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken && { 'Authorization': `Bearer ${idToken}` }),
                },
                body: JSON.stringify({ shipmentId }),
            });
        } catch (error) {
            console.error('Shopify fulfillment sync error:', error);
        }
    };

    const handleRetrySync = async (shipmentId: string) => {
        setResyncingId(shipmentId);
        try {
            const idToken = await firebaseUser?.getIdToken();
            const res = await fetch('/api/integrations/shopify/fulfill', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken && { 'Authorization': `Bearer ${idToken}` }),
                },
                body: JSON.stringify({ shipmentId }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('Fulfillment synced to Shopify');
            } else {
                toast.error(data.error || 'Sync failed');
            }
        } catch (error) {
            toast.error('Failed to retry sync');
        } finally {
            setResyncingId(null);
        }
    };

    const bookSingleOrder = async (order: Shipment, pickupAddress: any): Promise<BulkShipResult> => {
        const orderNum = order.shopifyOrderNumber || order.referenceNo?.replace('ORD-', '') || order.id;
        const weight = order.weight || order.actualWeight || 0.5;
        const declaredValue = order.declaredValue || order.chargedAmount || 200;
        const cleanPhone = (order.destination?.phone || '').replace(/\D/g, '').slice(-10);
        const cleanPickupPhone = (pickupAddress?.phone || '').replace(/\D/g, '').slice(-10);
        const referenceNo = order.referenceNo || `ORD-${order.shopifyOrderNumber || Date.now()}`;

        try {
            if (bulkShipCourier === 'Blue Dart') {
                const isB2C = true; // Shopify orders are always B2C
                const blueDartPayload = {
                    Request: {
                        Consignee: {
                            ConsigneeName: order.destination?.name || '',
                            ConsigneeAddress1: (order.destination?.address || '').slice(0, 30),
                            ConsigneeAddress2: (order.destination?.address || '').slice(30, 60) || "",
                            ConsigneeAddress3: order.destination?.city || '',
                            ConsigneePincode: order.destination?.pincode || '',
                            ConsigneeMobile: cleanPhone,
                            ConsigneeTelephone: cleanPhone,
                            ConsigneeAttention: order.destination?.name || ''
                        },
                        Shipper: {
                            CustomerName: BLUEDART_PREDEFINED.shipperName,
                            CustomerCode: BLUEDART_PREDEFINED.billingCustomerCodeShopify,
                            CustomerAddress1: (pickupAddress?.address || BLUEDART_PREDEFINED.pickupAddress).slice(0, 30),
                            CustomerAddress2: (pickupAddress?.address || BLUEDART_PREDEFINED.pickupAddress).slice(30, 60) || "",
                            CustomerAddress3: pickupAddress?.city || "HYD",
                            CustomerPincode: pickupAddress?.pincode || BLUEDART_PREDEFINED.pickupPincode,
                            CustomerMobile: cleanPickupPhone || BLUEDART_PREDEFINED.senderMobile,
                            CustomerTelephone: cleanPickupPhone || BLUEDART_PREDEFINED.senderMobile,
                            OriginArea: BLUEDART_PREDEFINED.billingArea,
                            Sender: pickupAddress?.name || BLUEDART_PREDEFINED.senderName,
                            isToPayCustomer: false,
                        },
                        Services: {
                            ProductCode: BLUEDART_SERVICE_TYPES[bulkShipBlueDartService].code,
                            ProductType: 1,
                            SubProductCode: order.toPayCustomer ? "C" : "P",
                            PieceCount: "1",
                            PackType: BLUEDART_SERVICE_TYPES[bulkShipBlueDartService].packType,
                            ActualWeight: weight.toString(),
                            Dimensions: [{ Length: "10", Breadth: "10", Height: "10", Count: "1" }],
                            ...(order.toPayCustomer ? { CollectableAmount: declaredValue } : {}),
                            DeclaredValue: declaredValue || 200,
                            CreditReferenceNo: referenceNo,
                            PickupDate: `/Date(${new Date().getTime() + 24 * 60 * 60 * 1000})/`,
                            PickupTime: BLUEDART_PREDEFINED.pickupTime,
                            PDFOutputNotRequired: false,
                            Commodity: { CommodityDetail1: order.products?.[0]?.name || '' }
                        }
                    }
                };

                const apiResponse = await blueDartService.generateWaybill(blueDartPayload);
                const responseData = apiResponse?.GenerateWayBillResult || apiResponse;

                if (responseData?.IsError === false) {
                    const awbNo = responseData.AWBNo;
                    // Update Firestore
                    await updateShipment(order.id, {
                        courier: 'Blue Dart',
                        courierTrackingId: awbNo,
                        status: 'pending' as const,
                        origin: { city: pickupAddress?.city || '', state: pickupAddress?.state || '', pincode: pickupAddress?.pincode || '', address: pickupAddress?.address || '', phone: pickupAddress?.phone || '', name: pickupAddress?.name || '' },
                        weight,
                        declaredValue,
                        receiverName: order.destination?.name || '',
                        receiverMobile: cleanPhone,
                        senderName: pickupAddress?.name || BLUEDART_PREDEFINED.senderName,
                        senderMobile: cleanPickupPhone || BLUEDART_PREDEFINED.senderMobile,
                        productCode: BLUEDART_SERVICE_TYPES[bulkShipBlueDartService].code,
                        packType: BLUEDART_SERVICE_TYPES[bulkShipBlueDartService].packType,
                        productType: BLUEDART_PREDEFINED.productType,
                        awbNo,
                        blueDartStatus: 'Generated',
                        billingCustomerCode: BLUEDART_PREDEFINED.billingCustomerCodeShopify,
                        toPayCustomer: !!order.toPayCustomer,
                    });
                    triggerShopifyFulfillment(order.id);
                    return { id: order.id, orderNumber: orderNum, success: true, awb: awbNo };
                } else {
                    const errorMsg = responseData?.Status?.[0]?.StatusInformation || 'Unknown Blue Dart Error';
                    return { id: order.id, orderNumber: orderNum, success: false, error: errorMsg };
                }
            } else if (bulkShipCourier === 'Delhivery') {
                const weightGrams = Math.max(1, Math.round((weight || DELHIVERY_PREDEFINED.defaultWeightGrams / 1000) * 1000));
                const codAmt = order.toPayCustomer ? declaredValue : 0;

                const delhiveryPayload = {
                    pickup_location: {
                        name: DELHIVERY_PREDEFINED.pickupLocationName,
                        add: sanitizeDelhiveryField(pickupAddress?.address || DELHIVERY_PREDEFINED.pickupAddress),
                        city: sanitizeDelhiveryField(pickupAddress?.city || DELHIVERY_PREDEFINED.pickupCity),
                        pin_code: (pickupAddress?.pincode || DELHIVERY_PREDEFINED.pickupPincode || '').replace(/\D/g, ''),
                        country: 'India',
                        phone: (cleanPickupPhone || DELHIVERY_PREDEFINED.pickupPhone || '').replace(/\D/g, ''),
                    },
                    shipments: [
                        {
                            name: sanitizeDelhiveryField(order.destination?.name || ''),
                            add: sanitizeDelhiveryField(order.destination?.address || ''),
                            pin: order.destination?.pincode || '',
                            city: sanitizeDelhiveryField(order.destination?.city || ''),
                            state: sanitizeDelhiveryField(order.destination?.state || ''),
                            country: 'India',
                            phone: cleanPhone,
                            order: referenceNo,
                            payment_mode: (order.toPayCustomer ? 'COD' : 'Prepaid') as 'COD' | 'Prepaid',
                            products_desc: sanitizeDelhiveryField(order.products?.[0]?.name || DELHIVERY_PREDEFINED.defaultProductDesc),
                            hsn_code: DELHIVERY_PREDEFINED.defaultHsnCode,
                            ...(order.toPayCustomer ? { cod_amount: codAmt } : {}),
                            total_amount: declaredValue,
                            seller_add: sanitizeDelhiveryField(pickupAddress?.address || DELHIVERY_PREDEFINED.pickupAddress),
                            seller_name: sanitizeDelhiveryField(pickupAddress?.name || ''),
                            quantity: (order.products || []).reduce((sum, p) => sum + (p.quantity || 0), 0) || 1,
                            shipment_width: DELHIVERY_PREDEFINED.defaultDimensionsCm.width,
                            shipment_height: DELHIVERY_PREDEFINED.defaultDimensionsCm.height,
                            shipment_length: DELHIVERY_PREDEFINED.defaultDimensionsCm.length,
                            weight: weightGrams,
                            shipping_mode: DELHIVERY_PREDEFINED.defaultShippingMode,
                            address_type: 'home' as const,
                        },
                    ],
                };

                const apiResponse = await delhiveryService.createOrder(delhiveryPayload);
                const pkg = Array.isArray(apiResponse?.packages) ? apiResponse.packages[0] : null;
                const success = apiResponse?.success === true || pkg?.status === 'Success' || !!pkg?.waybill;

                if (success && pkg?.waybill) {
                    const delhiveryAwb = pkg.waybill as string;
                    await updateShipment(order.id, {
                        courier: 'Delhivery',
                        courierTrackingId: delhiveryAwb,
                        status: 'pending' as const,
                        origin: { city: pickupAddress?.city || '', state: pickupAddress?.state || '', pincode: pickupAddress?.pincode || '', address: pickupAddress?.address || '', phone: pickupAddress?.phone || '', name: pickupAddress?.name || '' },
                        weight,
                        declaredValue,
                        receiverName: order.destination?.name || '',
                        receiverMobile: cleanPhone,
                        senderName: pickupAddress?.name || '',
                        senderMobile: cleanPickupPhone || DELHIVERY_PREDEFINED.pickupPhone,
                    });
                    triggerShopifyFulfillment(order.id);
                    return { id: order.id, orderNumber: orderNum, success: true, awb: delhiveryAwb };
                } else {
                    const remarks = Array.isArray(pkg?.remarks) ? pkg.remarks.join('; ') : (pkg?.remarks || '');
                    const errorMsg = remarks || apiResponse?.rmk || apiResponse?.error || apiResponse?.message || 'Unknown Delhivery Error';
                    return { id: order.id, orderNumber: orderNum, success: false, error: errorMsg };
                }
            } else {
                // DTDC
                const dtdcPayload = {
                    customer_code: DTDC_PREDEFINED.customerCode,
                    service_type_id: DTDC_PREDEFINED.serviceTypeId,
                    load_type: DTDC_PREDEFINED.loadType,
                    description: order.products?.[0]?.name || 'General Goods',
                    dimension_unit: DTDC_PREDEFINED.dimensionUnit,
                    length: "10", width: "10", height: "10",
                    weight_unit: DTDC_PREDEFINED.weightUnit,
                    weight: weight.toString(),
                    declared_value: declaredValue,
                    num_pieces: DTDC_PREDEFINED.defaultPieceCount,
                    customer_reference_number: referenceNo,
                    commodity_id: DTDC_PREDEFINED.commodityId,
                    is_risk_surcharge_applicable: DTDC_PREDEFINED.isRiskSurchargeApplicable,
                    origin_details: {
                        name: pickupAddress?.name || DTDC_PREDEFINED.shipperName,
                        phone: cleanPickupPhone || DTDC_PREDEFINED.senderMobile,
                        address_line_1: pickupAddress?.address || DTDC_PREDEFINED.pickupAddress1,
                        pincode: pickupAddress?.pincode || DTDC_PREDEFINED.pickupPincode,
                        city: pickupAddress?.city || DTDC_PREDEFINED.pickupCity,
                        state: pickupAddress?.state || DTDC_PREDEFINED.pickupState,
                    },
                    destination_details: {
                        name: order.destination?.name || '',
                        phone: cleanPhone,
                        address_line_1: order.destination?.address || '',
                        pincode: order.destination?.pincode || '',
                        city: order.destination?.city || '',
                        state: order.destination?.state || '',
                    },
                };

                const apiResponse = await dtdcService.createOrder(dtdcPayload);

                if (apiResponse?.status === 'OK' && apiResponse?.data?.[0]?.success) {
                    const dtdcAwb = apiResponse.data[0].reference_number;
                    await updateShipment(order.id, {
                        courier: 'DTDC',
                        courierTrackingId: dtdcAwb,
                        status: 'pending' as const,
                        origin: { city: pickupAddress?.city || '', state: pickupAddress?.state || '', pincode: pickupAddress?.pincode || '', address: pickupAddress?.address || '', phone: pickupAddress?.phone || '', name: pickupAddress?.name || '' },
                        weight,
                        declaredValue,
                        receiverName: order.destination?.name || '',
                        receiverMobile: cleanPhone,
                        senderName: pickupAddress?.name || DTDC_PREDEFINED.shipperName,
                        senderMobile: cleanPickupPhone || DTDC_PREDEFINED.senderMobile,
                        dtdcReferenceNumber: dtdcAwb,
                        dtdcCustomerReferenceNumber: referenceNo,
                        dtdcServiceType: DTDC_PREDEFINED.serviceTypeId,
                        dtdcStatus: 'Created',
                    });
                    triggerShopifyFulfillment(order.id);
                    return { id: order.id, orderNumber: orderNum, success: true, awb: dtdcAwb };
                } else {
                    const errorMsg = apiResponse?.data?.[0]?.message || apiResponse?.message || 'Unknown DTDC Error';
                    return { id: order.id, orderNumber: orderNum, success: false, error: errorMsg };
                }
            }
        } catch (err: any) {
            const errMsg = err.response?.data?.error || err.message || 'Booking failed';
            return { id: order.id, orderNumber: orderNum, success: false, error: errMsg };
        }
    };

    const handleExecuteBulkShip = async () => {
        if (!bulkShipValidation) return;
        const validOrders = bulkShipValidation.filter(v => v.isValid);
        if (validOrders.length === 0) { toast.error("No valid orders to ship"); return; }

        setIsBulkShipping(true);
        setBulkShipResults([]);
        setBulkShipProgress({ completed: 0, total: validOrders.length });

        const pickupAddress = currentUser?.id ? await getDefaultPickupAddress(currentUser.id) : null;
        const results: BulkShipResult[] = [];

        for (const { shipment } of validOrders) {
            const result = await bookSingleOrder(shipment, pickupAddress);
            results.push(result);
            setBulkShipResults([...results]);
            setBulkShipProgress({ completed: results.length, total: validOrders.length });
        }

        setIsBulkShipping(false);

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        if (successCount > 0) {
            toast.success(`${successCount} order${successCount > 1 ? 's' : ''} shipped successfully!`);
        }
        if (failCount > 0) {
            toast.error(`${failCount} order${failCount > 1 ? 's' : ''} failed to ship`);
        }

        // Refresh shipments list
        fetchShipments();
    };

    const handleCancelShipment = async (shipment: Shipment) => {
        if (!shipment.id || !shipment.courierTrackingId) {
            toast.error("Invalid shipment data for cancellation");
            return;
        }
        if (!confirm("Are you sure you want to cancel this shipment? This action cannot be undone.")) return;

        setCancellingId(shipment.id);
        const toastId = toast.loading("Cancelling shipment...");

        try {
            if (shipment.courier === 'DTDC') {
                await dtdcService.cancelShipment(shipment.courierTrackingId);
            } else if (shipment.courier === 'Delhivery') {
                await delhiveryService.cancelShipment(shipment.courierTrackingId);
            } else {
                await blueDartService.cancelWaybill(shipment.courierTrackingId);
            }
            await updateShipmentStatus(shipment.id, 'cancelled');
            toast.success("Shipment cancelled successfully", { id: toastId });
            setShipments(prev => prev.filter(s => s.id !== shipment.id));
        } catch (error: any) {
            console.error("Cancellation failed:", error);
            const errorMsg = error.response?.data?.error || error.message || "Failed to cancel shipment";
            toast.error(`Cancellation failed: ${errorMsg}`, { id: toastId });
        } finally {
            setCancellingId(null);
        }
    };

    const handleProceedShopify = (shipment: Shipment) => {
        router.push(`/add-shipment?shopifyShipmentId=${shipment.id}`);
    };

    const handleDeclineShopify = async (shipment: Shipment) => {
        if (!confirm("Decline this Shopify order? It will be marked as declined.")) return;
        try {
            await updateShipmentStatus(shipment.id!, 'declined');
            toast.success("Shopify order declined");
            fetchShipments();
        } catch {
            toast.error("Failed to decline order");
        }
    };

    // ==================== TRACKING ====================

    /** Helper: get the effective tracking status for a shipment */
    const getEffectiveTrackingStatus = (shp: Shipment): TrackingStatus => {
        if (shp.trackingStatus) return shp.trackingStatus as TrackingStatus;
        if (shp.status === 'cancelled' || shp.status === 'declined') return 'cancelled';
        if (shp.status === 'delivered') return 'delivered';
        if (shp.courierTrackingId) return 'booked';
        return legacyStatusToTracking(shp.status);
    };

    /** Sync tracking status to Firestore and local state after fetching tracking data */
    const syncTrackingStatus = async (shipment: Shipment, trackingData: any) => {
        try {
            const courier = shipment.courier || 'Blue Dart';

            // Extract raw status — handle multiple response shapes
            let rawStatus = '';
            if (courier === 'DTDC') {
                rawStatus = trackingData?.trackHeader?.strStatus || trackingData?.statusCode || '';
            } else if (courier === 'Delhivery') {
                const ship = trackingData?.ShipmentData?.[0]?.Shipment || trackingData?.shipmentData?.[0]?.shipment || trackingData?.Shipment;
                rawStatus = ship?.Status?.Status || ship?.status?.Status || ship?.Status?.status || '';
            } else {
                const sd = trackingData?.ShipmentData?.[0] || trackingData?.shipmentData?.[0];
                const si = sd?.Shipment || sd?.shipment || trackingData?.Shipment || trackingData;
                rawStatus = si?.Status || si?.status || si?.StatusCode || '';
            }

            if (!rawStatus) return;

            const normalizedStatus = normalizeTrackingStatus(rawStatus, courier);

            // Get last scan info
            let lastLocation = '';
            let lastActivity = '';
            let lastTime = '';

            if (courier === 'DTDC') {
                const scans = trackingData?.trackDetails || trackingData?.TrackDetails || [];
                if (Array.isArray(scans) && scans.length > 0) {
                    const latest = scans[scans.length - 1];
                    lastLocation = latest?.strOrigin || latest?.origin || '';
                    lastActivity = latest?.strAction || latest?.activity || latest?.status || '';
                    lastTime = `${latest?.strActionDate || ''} ${latest?.strActionTime || ''}`.trim();
                }
            } else if (courier === 'Delhivery') {
                const ship = trackingData?.ShipmentData?.[0]?.Shipment || trackingData?.shipmentData?.[0]?.shipment || trackingData?.Shipment;
                const scans = ship?.Scans || ship?.scans || [];
                if (Array.isArray(scans) && scans.length > 0) {
                    const latest = scans[scans.length - 1];
                    const detail = latest?.ScanDetail || latest?.scanDetail || latest;
                    lastLocation = detail?.ScannedLocation || detail?.scannedLocation || '';
                    lastActivity = detail?.Instructions || detail?.instructions || detail?.Scan || '';
                    lastTime = detail?.ScanDateTime || detail?.scanDateTime || '';
                }
            } else {
                // Blue Dart — handle multiple nesting shapes (JSON vs XML-parsed)
                const sd = trackingData?.ShipmentData?.[0] || trackingData?.shipmentData?.[0];
                const si = sd?.Shipment || sd?.shipment || trackingData?.Shipment || trackingData;
                let scans = si?.Scans || si?.scans || [];

                // JSON may nest as { Scans: { ScanDetail: [...] } }
                if (!Array.isArray(scans) && typeof scans === 'object') {
                    const inner = scans?.ScanDetail || scans?.scanDetail;
                    scans = Array.isArray(inner) ? inner.map((s: any) => ({ ScanDetail: s })) : inner ? [{ ScanDetail: inner }] : [];
                }

                if (Array.isArray(scans) && scans.length > 0) {
                    const latest = scans[scans.length - 1];
                    const detail = latest?.ScanDetail || latest?.scanDetail || latest;
                    lastLocation = detail?.ScannedLocation || detail?.scannedLocation || detail?.Location || '';
                    lastActivity = detail?.Instructions || detail?.instructions || detail?.Scan || detail?.scan || detail?.Activity || '';
                    lastTime = detail?.ScanDateTime || detail?.scanDateTime || detail?.DateTime || '';
                }
            }

            // Update Firestore
            const updates: Partial<Shipment> = {
                trackingStatus: normalizedStatus,
                lastTrackingLocation: lastLocation,
                lastTrackingActivity: lastActivity,
                lastTrackingTime: lastTime,
                trackingLastSyncedAt: new Date().toISOString(),
            };

            // Also sync the main status field for delivered/cancelled
            if (normalizedStatus === 'delivered' && shipment.status !== 'delivered') {
                updates.status = 'delivered';
            }

            await updateShipment(shipment.id, updates as any);

            // Update local state
            setShipments(prev => prev.map(s =>
                s.id === shipment.id
                    ? { ...s, ...updates }
                    : s
            ));
        } catch (err) {
            console.error('Failed to sync tracking status:', err);
        }
    };

    const handleTrackShipment = async (shipment: Shipment) => {
        if (!shipment.courierTrackingId) {
            toast.error("No AWB/tracking ID available for this shipment");
            return;
        }

        setTrackingShipment(shipment);
        setTrackingData(null);
        setTrackingError(null);
        setTrackingLoading(true);

        try {
            let data;
            if (shipment.courier === 'DTDC') {
                data = await dtdcService.trackShipment(shipment.courierTrackingId);
            } else if (shipment.courier === 'Delhivery') {
                data = await delhiveryService.trackShipment(shipment.courierTrackingId);
            } else {
                data = await blueDartService.trackShipment(shipment.courierTrackingId);
            }
            setTrackingData(data);

            // Auto-sync tracking status to Firestore
            syncTrackingStatus(shipment, data);
        } catch (error: any) {
            console.error('Tracking error:', error);
            const msg = error.response?.data?.error || error.response?.data?.details || error.message || 'Failed to fetch tracking information';
            setTrackingError(typeof msg === 'string' ? msg : JSON.stringify(msg));
        } finally {
            setTrackingLoading(false);
        }
    };

    /** Bulk refresh tracking for all non-terminal shipments (silent background sync) */
    const [isRefreshingTracking, setIsRefreshingTracking] = useState(false);
    const handleRefreshAllTracking = async () => {
        const activeShipments = bookedShipments.filter(s =>
            s.courierTrackingId &&
            s.status !== 'cancelled' &&
            s.status !== 'declined' &&
            s.trackingStatus !== 'delivered' &&
            s.trackingStatus !== 'rto_delivered' &&
            s.trackingStatus !== 'cancelled'
        );

        if (activeShipments.length === 0) {
            toast.info("No active shipments to refresh");
            return;
        }

        setIsRefreshingTracking(true);
        toast.info(`Refreshing tracking for ${activeShipments.length} shipments...`);

        let successCount = 0;
        for (const shp of activeShipments) {
            try {
                let data;
                if (shp.courier === 'DTDC') {
                    data = await dtdcService.trackShipment(shp.courierTrackingId!);
                } else if (shp.courier === 'Delhivery') {
                    data = await delhiveryService.trackShipment(shp.courierTrackingId!);
                } else {
                    data = await blueDartService.trackShipment(shp.courierTrackingId!);
                }
                await syncTrackingStatus(shp, data);
                successCount++;
            } catch {
                // Silently skip failed ones
            }
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 300));
        }

        setIsRefreshingTracking(false);
        toast.success(`Updated tracking for ${successCount}/${activeShipments.length} shipments`);
    };

    // Parse Blue Dart tracking scans from response
    // Handles both JSON format (from GET endpoint) and XML-parsed format (from POST fallback)
    const parseBlueDartScans = (data: any): Array<{ date: string; time: string; location: string; activity: string; statusCode?: string }> => {
        if (!data) return [];

        // Find the shipment object — multiple possible paths
        const shipmentData = data?.ShipmentData?.[0] || data?.shipmentData?.[0];
        const shipment = shipmentData?.Shipment || shipmentData?.shipment || data?.Shipment || data;

        // Find scans array — Blue Dart nests differently in JSON vs XML
        let scans = shipment?.Scans || shipment?.scans || [];

        // JSON format may have scans as direct array of objects (not wrapped in ScanDetail)
        if (!Array.isArray(scans) && typeof scans === 'object') {
            // Sometimes Scans is { ScanDetail: [...] } or { ScanDetail: { ... } }
            const innerScans = scans?.ScanDetail || scans?.scanDetail;
            scans = Array.isArray(innerScans) ? innerScans.map((s: any) => ({ ScanDetail: s })) : innerScans ? [{ ScanDetail: innerScans }] : [];
        }

        if (!Array.isArray(scans) || scans.length === 0) return [];

        return scans.map((scan: any) => {
            const detail = scan?.ScanDetail || scan?.scanDetail || scan;
            const dateTime = detail?.ScanDateTime || detail?.scanDateTime || detail?.DateTime || '';
            let datePart = '';
            let timePart = '';
            if (dateTime.includes('T')) {
                [datePart, timePart] = dateTime.split('T');
                timePart = timePart?.replace('Z', '') || '';
            } else if (dateTime.includes(' ')) {
                [datePart, timePart] = dateTime.split(' ');
            } else {
                datePart = dateTime;
            }
            return {
                date: datePart || detail?.StatusDate || detail?.statusDate || '',
                time: timePart || detail?.StatusTime || detail?.statusTime || '',
                location: detail?.ScannedLocation || detail?.scannedLocation || detail?.Location || '',
                activity: detail?.Instructions || detail?.instructions || detail?.Scan || detail?.scan || detail?.Activity || '',
                statusCode: detail?.ScanCode || detail?.scanCode || detail?.ScanType || '',
            };
        }).reverse(); // Most recent first
    };

    // Parse DTDC tracking scans from response
    const parseDtdcScans = (data: any): Array<{ date: string; time: string; location: string; activity: string; statusCode?: string }> => {
        if (!data) return [];
        const trackDetails = data?.trackDetails || data?.TrackDetails || [];
        if (Array.isArray(trackDetails)) {
            return trackDetails.map((event: any) => ({
                date: event?.strActionDate || event?.date || '',
                time: event?.strActionTime || event?.time || '',
                location: event?.strOrigin || event?.origin || '',
                activity: event?.strAction || event?.activity || event?.status || '',
                statusCode: event?.strStatusCode || '',
            })).reverse();
        }
        return [];
    };

    // Parse Delhivery tracking scans
    const parseDelhiveryScans = (data: any): Array<{ date: string; time: string; location: string; activity: string; statusCode?: string }> => {
        if (!data) return [];
        const ship = data?.ShipmentData?.[0]?.Shipment || data?.shipmentData?.[0]?.shipment || data?.Shipment;
        const scans = ship?.Scans || ship?.scans || [];
        if (!Array.isArray(scans) || scans.length === 0) return [];
        return scans.map((scan: any) => {
            const detail = scan?.ScanDetail || scan?.scanDetail || scan;
            const dateTime = detail?.ScanDateTime || detail?.scanDateTime || detail?.StatusDateTime || '';
            let datePart = '';
            let timePart = '';
            if (typeof dateTime === 'string') {
                if (dateTime.includes('T')) {
                    [datePart, timePart] = dateTime.split('T');
                    timePart = (timePart || '').replace('Z', '');
                } else if (dateTime.includes(' ')) {
                    [datePart, timePart] = dateTime.split(' ');
                } else {
                    datePart = dateTime;
                }
            }
            return {
                date: datePart,
                time: timePart,
                location: detail?.ScannedLocation || detail?.scannedLocation || '',
                activity: detail?.Instructions || detail?.instructions || detail?.Scan || '',
                statusCode: detail?.StatusCode || detail?.statusCode || '',
            };
        }).reverse();
    };

    const getTrackingCurrentStatus = (data: any, courier: string): string => {
        if (!data) return 'Unknown';
        if (courier === 'DTDC') {
            return data?.trackHeader?.strStatus || data?.statusCode || 'Unknown';
        }
        if (courier === 'Delhivery') {
            const ship = data?.ShipmentData?.[0]?.Shipment || data?.shipmentData?.[0]?.shipment || data?.Shipment;
            return ship?.Status?.Status || ship?.status?.Status || ship?.Status?.status || 'Unknown';
        }
        // Blue Dart — handle multiple response shapes
        const shipmentData = data?.ShipmentData?.[0] || data?.shipmentData?.[0];
        const shipment = shipmentData?.Shipment || shipmentData?.shipment || data?.Shipment || data;
        return shipment?.Status || shipment?.status || shipment?.StatusCode || 'Unknown';
    };

    // ==================== EXPORT CSV ====================
    const handleExportCSV = () => {
        const shipmentsToExport = selectedIds.size > 0
            ? filteredBookedShipments.filter(s => selectedIds.has(s.id))
            : filteredBookedShipments;

        if (shipmentsToExport.length === 0) {
            toast.error("No shipments to export");
            return;
        }

        const escapeCSV = (val: string): string => {
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        };

        const safe = (val: any): string => {
            if (val === null || val === undefined) return '';
            return String(val).trim();
        };

        const formatDate = (timestamp: any): string => {
            if (!timestamp) return '';
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            return format(date, 'dd MMM yyyy');
        };

        const headers = [
            'Channel', 'Order #', 'Shopify Order ID', 'Date',
            'Product', 'SKU', 'Qty', 'Declared Value',
            'Payment', 'COD Amount',
            'Customer Name', 'Customer Phone', 'Address', 'City', 'State', 'Pincode',
            'Courier', 'AWB / Tracking ID', 'Weight (kg)',
            'Status', 'Courier Charge', 'Amount Charged', 'Notes'
        ];

        const rows = shipmentsToExport.map(s => {
            const products = s.products || [];
            const productNames = products.map(p => p.name).filter(Boolean).join(' | ');
            const productSkus = products.map(p => p.sku).filter(Boolean).join(' | ');
            const totalQty = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
            const declaredValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0);
            const codAmount = s.collectableAmount || s.dtdcCodAmount || 0;
            const payment = codAmount > 0 ? 'COD' : 'Prepaid';

            return [
                s.clientType === 'shopify' ? 'Shopify' : 'Franchise',
                safe(s.shopifyOrderNumber || s.referenceNo),
                safe(s.shopifyOrderId),
                formatDate(s.createdAt),
                productNames,
                productSkus,
                totalQty || '',
                declaredValue || '',
                payment,
                codAmount > 0 ? codAmount : '',
                safe(s.destination?.name),
                safe(s.destination?.phone),
                safe(s.destination?.address),
                safe(s.destination?.city),
                safe(s.destination?.state),
                safe(s.destination?.pincode),
                safe(s.courier),
                safe(s.courierTrackingId),
                s.weight || '',
                safe(s.status).toUpperCase(),
                s.courierCharge || '',
                s.chargedAmount || '',
                safe(s.notes),
            ].map(v => escapeCSV(String(v)));
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const filename = `Shipments_Export_${new Date().toISOString().split('T')[0]}.csv`;
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(`Exported ${shipmentsToExport.length} shipment${shipmentsToExport.length > 1 ? 's' : ''}`, {
            description: `File: ${filename}`,
        });
    };

    // Counts for validation dialog
    const validCount = bulkShipValidation?.filter(v => v.isValid).length || 0;
    const invalidCount = bulkShipValidation?.filter(v => !v.isValid).length || 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">My Shipments</h1>
                    <p className="text-muted-foreground">Manage and track all your outgoing packages</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleRefreshAllTracking}
                        disabled={isRefreshingTracking || bookedShipments.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-muted hover:border-primary/50 rounded-xl text-sm font-bold transition-all text-foreground disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-muted"
                    >
                        <RefreshCw className={`h-4 w-4 ${isRefreshingTracking ? 'animate-spin' : ''}`} />
                        {isRefreshingTracking ? 'Syncing...' : 'Sync Tracking'}
                    </button>
                    <button
                        onClick={() => {
                            if (filteredBookedShipments.length === 0) return;
                            if (selectedIds.size > 0) {
                                handleExportCSV();
                            } else {
                                setShowExportConfirm(true);
                            }
                        }}
                        disabled={filteredBookedShipments.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-muted hover:border-primary/50 rounded-xl text-sm font-bold transition-all text-foreground disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-muted"
                    >
                        <Download className="h-4 w-4" /> Export CSV
                        {selectedIds.size > 0 && (
                            <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary text-xs px-1.5 py-0">
                                {selectedIds.size}
                            </Badge>
                        )}
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
                                placeholder="Search by Order #, Customer, AWB or Zip..."
                                className="pl-10 bg-muted/30 border-none h-11"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                                <PopoverTrigger asChild>
                                    <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted rounded-lg text-sm font-medium transition-colors relative">
                                        <Filter className="h-4 w-4" /> Filters
                                        {activeFilterCount > 0 && (
                                            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-white text-[10px] font-bold">
                                                {activeFilterCount}
                                            </span>
                                        )}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-80 p-5 rounded-xl">
                                    <div className="space-y-5">
                                        {/* Header */}
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-bold">Filters</h3>
                                            {activeFilterCount > 0 && (
                                                <button onClick={clearAllFilters} className="text-xs text-primary font-semibold hover:underline">
                                                    Clear All
                                                </button>
                                            )}
                                        </div>

                                        {/* Created By — only for franchise primary users with sub-accounts */}
                                        {canManageSubAccounts && subAccounts.length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Created By</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { id: 'all', label: 'All' },
                                                        { id: 'me', label: 'Me' },
                                                        ...subAccounts.map(sa => ({ id: sa.id, label: sa.name }))
                                                    ].map(option => (
                                                        <button
                                                            key={option.id}
                                                            onClick={() => setCreatedByFilter(option.id)}
                                                            className={`rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                                                                createdByFilter === option.id
                                                                    ? 'bg-primary text-white'
                                                                    : 'bg-muted/50 text-foreground hover:bg-muted'
                                                            }`}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Status */}
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</p>
                                            <div className="flex flex-wrap gap-2">
                                                {['Shipped', 'Delivered', 'Cancelled'].map(val => (
                                                    <button
                                                        key={val}
                                                        onClick={() => toggleFilter(statusFilter, setStatusFilter, val.toLowerCase())}
                                                        className={`rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                                                            statusFilter.includes(val.toLowerCase())
                                                                ? 'bg-primary text-white'
                                                                : 'bg-muted/50 text-foreground hover:bg-muted'
                                                        }`}
                                                    >
                                                        {val}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Courier */}
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Courier</p>
                                            <div className="flex flex-wrap gap-2">
                                                {['Blue Dart', 'DTDC', 'Delhivery'].map(val => (
                                                    <button
                                                        key={val}
                                                        onClick={() => toggleFilter(courierFilter, setCourierFilter, val)}
                                                        className={`rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                                                            courierFilter.includes(val)
                                                                ? 'bg-primary text-white'
                                                                : 'bg-muted/50 text-foreground hover:bg-muted'
                                                        }`}
                                                    >
                                                        {val}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Payment — only for Shopify merchants */}
                                        {!isFranchise && (
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payment</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {['COD', 'Prepaid'].map(val => (
                                                        <button
                                                            key={val}
                                                            onClick={() => toggleFilter(paymentFilter, setPaymentFilter, val)}
                                                            className={`rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                                                                paymentFilter.includes(val)
                                                                    ? 'bg-primary text-white'
                                                                    : 'bg-muted/50 text-foreground hover:bg-muted'
                                                            }`}
                                                        >
                                                            {val}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Type */}
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</p>
                                            <div className="flex flex-wrap gap-2">
                                                {['Forward', 'Return'].map(val => (
                                                    <button
                                                        key={val}
                                                        onClick={() => toggleFilter(typeFilter, setTypeFilter, val)}
                                                        className={`rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                                                            typeFilter.includes(val)
                                                                ? 'bg-primary text-white'
                                                                : 'bg-muted/50 text-foreground hover:bg-muted'
                                                        }`}
                                                    >
                                                        {val}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Date Range */}
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Date Range</p>
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">From</label>
                                                    <Input
                                                        type="date"
                                                        value={dateFrom}
                                                        onChange={(e) => setDateFrom(e.target.value)}
                                                        className="h-9 text-xs bg-muted/30 border-none"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">To</label>
                                                    <Input
                                                        type="date"
                                                        value={dateTo}
                                                        onChange={(e) => setDateTo(e.target.value)}
                                                        className="h-9 text-xs bg-muted/30 border-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Apply */}
                                        <button
                                            onClick={() => setFilterOpen(false)}
                                            className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
                                        >
                                            Apply Filters
                                        </button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </CardHeader>

                <Tabs value={isFranchise ? 'shipped' : activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds(new Set()); setSelectedNewOrderIds(new Set()); }}>
                    {/* Tab strip — only for Shopify merchants */}
                    {!isFranchise && (
                        <div className="px-6 pt-4 border-b">
                            <TabsList className="bg-muted/40 h-11 p-1 border border-border/50">
                                <TabsTrigger value="new-orders" className="gap-2 px-5 bg-white border border-border/40 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-primary/25 data-[state=active]:border-primary transition-all">
                                    New Orders
                                    {newOrders.length > 0 && (
                                        <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-white/20 text-[10px] font-bold">
                                            {newOrders.length}
                                        </span>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="shipped" className="gap-2 px-5 bg-white border border-border/40 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-primary/25 data-[state=active]:border-primary transition-all">
                                    Shipped
                                    {filteredBookedShipments.length > 0 && (
                                        <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-white/20 text-[10px] font-bold">
                                            {filteredBookedShipments.length}
                                        </span>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                        </div>
                    )}

                    {/* ==================== NEW ORDERS TAB ==================== */}
                    <TabsContent value="new-orders" className="mt-0">
                        {/* Bulk Ship Action Bar */}
                        {selectedNewOrderIds.size > 0 && (
                            <div className="flex items-center gap-3 px-6 py-3 bg-primary/5 border-b border-primary/20 animate-in fade-in duration-200">
                                <Badge variant="outline" className="text-primary border-primary font-bold">
                                    {selectedNewOrderIds.size} selected
                                </Badge>
                                <div className="flex items-center bg-muted/50 rounded-lg p-1 text-xs border border-border/50">
                                    <button
                                        onClick={() => setBulkShipCourier('Blue Dart')}
                                        className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                            bulkShipCourier === 'Blue Dart'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-white text-muted-foreground border border-border/40 shadow-sm hover:text-foreground'
                                        }`}
                                    >
                                        Blue Dart
                                    </button>
                                    <button
                                        onClick={() => setBulkShipCourier('DTDC')}
                                        className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                            bulkShipCourier === 'DTDC'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-white text-muted-foreground border border-border/40 shadow-sm hover:text-foreground'
                                        }`}
                                    >
                                        DTDC
                                    </button>
                                    <button
                                        onClick={() => setBulkShipCourier('Delhivery')}
                                        className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                            bulkShipCourier === 'Delhivery'
                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                : 'bg-white text-muted-foreground border border-border/40 shadow-sm hover:text-foreground'
                                        }`}
                                    >
                                        Delhivery
                                    </button>
                                </div>
                                {bulkShipCourier === 'Blue Dart' && (
                                    <div className="flex items-center bg-blue-50 rounded-lg p-1 text-xs border border-blue-200">
                                        <button
                                            onClick={() => setBulkShipBlueDartService('APEX')}
                                            className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                                bulkShipBlueDartService === 'APEX'
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'bg-white text-blue-500 border border-blue-200 shadow-sm hover:text-blue-700'
                                            }`}
                                        >
                                            ✈ Air
                                        </button>
                                        <button
                                            onClick={() => setBulkShipBlueDartService('BHARAT_DART')}
                                            className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                                bulkShipBlueDartService === 'BHARAT_DART'
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'bg-white text-blue-500 border border-blue-200 shadow-sm hover:text-blue-700'
                                            }`}
                                        >
                                            🚛 Surface
                                        </button>
                                    </div>
                                )}
                                {bulkShipCourier === 'DTDC' && (
                                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                                        Coming Soon
                                    </span>
                                )}
                                {bulkShipCourier === 'Delhivery' && (
                                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                                        Pan-India · 28k+ Pincodes
                                    </span>
                                )}
                                <button
                                    onClick={handleInitBulkShip}
                                    disabled={bulkShipCourier === 'DTDC'}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Truck className="h-3.5 w-3.5" /> Bulk Ship {selectedNewOrderIds.size} Orders
                                </button>
                                <button
                                    onClick={() => setSelectedNewOrderIds(new Set())}
                                    className="ml-auto text-xs text-muted-foreground hover:text-foreground font-medium"
                                >
                                    Clear selection
                                </button>
                            </div>
                        )}

                        {loading ? (
                            <div className="text-center py-12">
                                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                                <p className="mt-4 text-muted-foreground">Loading orders...</p>
                            </div>
                        ) : filteredNewOrders.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="inline-flex p-4 rounded-full bg-primary/10 mb-4">
                                    <BadgeCheck className="h-8 w-8 text-primary" />
                                </div>
                                <p className="text-muted-foreground font-medium">All caught up! No new orders.</p>
                                <p className="text-xs text-muted-foreground mt-1">New Shopify orders will appear here automatically.</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-primary/5 text-muted-foreground text-[10px] uppercase tracking-widest font-black">
                                                <th className="px-3 py-4 w-[40px]">
                                                    <Checkbox
                                                        checked={isAllNewOrdersSelected}
                                                        onCheckedChange={handleSelectAllNewOrders}
                                                        aria-label="Select all orders"
                                                    />
                                                </th>
                                                <th className="px-4 py-4">Channel</th>
                                                <th className="px-4 py-4">Order #</th>
                                                <th className="px-4 py-4">Date</th>
                                                <th className="px-4 py-4">Product</th>
                                                <th className="px-4 py-4">Payment</th>
                                                <th className="px-4 py-4">Customer</th>
                                                <th className="px-4 py-4">Zip</th>
                                                <th className="px-4 py-4">Weight</th>
                                                <th className="px-4 py-4 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {filteredNewOrders.map((shp) => (
                                                <tr key={shp.id} className={`hover:bg-primary/[0.02] transition-colors ${selectedNewOrderIds.has(shp.id) ? 'bg-blue-50/50' : ''}`}>
                                                    <td className="px-3 py-4 w-[40px]">
                                                        <Checkbox
                                                            checked={selectedNewOrderIds.has(shp.id)}
                                                            onCheckedChange={(checked) => handleSelectNewOrderRow(shp.id, !!checked)}
                                                            aria-label={`Select order ${shp.id}`}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        {shp.clientType === 'shopify' ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                                                                <ShoppingBag className="h-3 w-3" /> Shopify
                                                            </span>
                                                        ) : shp.webhookSource === 'merchant_api' ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">
                                                                <ExternalLink className="h-3 w-3" /> Webhook
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground text-[10px] font-bold">
                                                                <Package className="h-3 w-3" /> Direct
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-sm font-bold text-blue-700">
                                                                #{shp.shopifyOrderNumber || shp.referenceNo?.replace('ORD-', '') || '-'}
                                                            </span>
                                                            {isRecentOrder(shp) && (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary text-white text-[9px] font-bold leading-none">
                                                                    NEW
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-sm font-medium whitespace-nowrap">
                                                        {shp.createdAt?.toDate ? format(shp.createdAt.toDate(), "dd MMM yyyy") : "N/A"}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="max-w-[180px]">
                                                            <span className="text-sm font-medium block truncate">
                                                                {shp.products?.[0]?.name || shp.shopifyLineItems?.[0]?.title || '-'}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                ₹{(shp.declaredValue || shp.chargedAmount || 0).toLocaleString('en-IN')}
                                                                {(shp.products?.length || 0) > 1 && (
                                                                    <span className="ml-1 text-[10px] text-muted-foreground">+{(shp.products?.length || 0) - 1} more</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        {shp.toPayCustomer ? (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">COD</span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground text-[10px] font-bold">Prepaid</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className="font-semibold text-sm block">{shp.destination?.name || "N/A"}</span>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className="font-mono text-sm">{shp.destination?.pincode || "-"}</span>
                                                    </td>
                                                    <td className="px-4 py-4 text-sm font-medium">
                                                        {(shp.weight || shp.actualWeight || 0) > 0
                                                            ? `${shp.weight || shp.actualWeight}kg`
                                                            : '-'}
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => handleProceedShopify(shp)}
                                                                className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
                                                            >
                                                                Proceed
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeclineShopify(shp)}
                                                                className="px-4 py-2 bg-red-100 text-red-600 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors"
                                                            >
                                                                Decline
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="p-6 border-t bg-muted/10">
                                    <p className="text-xs text-muted-foreground">
                                        {filteredNewOrders.length} order{filteredNewOrders.length !== 1 ? 's' : ''} waiting to be processed
                                    </p>
                                </div>
                            </>
                        )}
                    </TabsContent>

                    {/* ==================== SHIPPED TAB ==================== */}
                    <TabsContent value="shipped" className="mt-0">
                        {/* Bulk Action Bar */}
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-3 px-6 py-3 bg-primary/5 border-b border-primary/20 animate-in fade-in duration-200">
                                <Badge variant="outline" className="text-primary border-primary font-bold">
                                    {selectedIds.size} selected
                                </Badge>
                                <div className="flex items-center bg-muted/50 rounded-lg p-1 text-xs border border-border/50">
                                    <button
                                        onClick={() => setBulkPrintMode('thermal')}
                                        className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                            bulkPrintMode === 'thermal'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-white text-muted-foreground border border-border/40 shadow-sm hover:text-foreground'
                                        }`}
                                    >
                                        Thermal 4×6
                                    </button>
                                    <button
                                        onClick={() => setBulkPrintMode('a4')}
                                        className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                            bulkPrintMode === 'a4'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-white text-muted-foreground border border-border/40 shadow-sm hover:text-foreground'
                                        }`}
                                    >
                                        A4 Sheet
                                    </button>
                                </div>
                                <button
                                    onClick={handleBulkPrintLabels}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
                                >
                                    <Printer className="h-3.5 w-3.5" /> Print {selectedIds.size} Labels
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="ml-auto text-xs text-muted-foreground hover:text-foreground font-medium"
                                >
                                    Clear selection
                                </button>
                            </div>
                        )}

                        {loading ? (
                            <div className="text-center py-12">
                                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                                <p className="mt-4 text-muted-foreground">Loading shipments...</p>
                            </div>
                        ) : filteredBookedShipments.length === 0 ? (
                            <div className="text-center py-16">
                                <p className="text-muted-foreground font-medium">No shipments found.</p>
                                <Link href="/add-shipment">
                                    <button className="mt-4 px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold">
                                        Book Your First Shipment
                                    </button>
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-primary/5 text-muted-foreground text-[10px] uppercase tracking-widest font-black">
                                                <th className="px-3 py-4 w-[40px]">
                                                    <Checkbox
                                                        checked={isAllSelected}
                                                        onCheckedChange={handleSelectAll}
                                                        aria-label="Select all"
                                                    />
                                                </th>
                                                {isFranchise ? (
                                                    <>
                                                        <th className="px-4 py-4">AWB</th>
                                                        <th className="px-4 py-4">Date</th>
                                                        <th className="px-4 py-4">Sender</th>
                                                        <th className="px-4 py-4">Receiver</th>
                                                        <th className="px-4 py-4">Zip</th>
                                                        <th className="px-4 py-4">Weight</th>
                                                        <th className="px-4 py-4">Status</th>
                                                        <th className="px-4 py-4 text-right">Action</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th className="px-4 py-4">Channel</th>
                                                        <th className="px-4 py-4">Order #</th>
                                                        <th className="px-4 py-4">Date</th>
                                                        <th className="px-4 py-4">Product</th>
                                                        <th className="px-4 py-4">Payment</th>
                                                        <th className="px-4 py-4">Customer</th>
                                                        <th className="px-4 py-4">Zip</th>
                                                        <th className="px-4 py-4">Weight</th>
                                                        <th className="px-4 py-4">Status</th>
                                                        <th className="px-4 py-4 text-right">Action</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {filteredBookedShipments.map((shp) => (
                                                <tr
                                                    key={shp.id}
                                                    className={`hover:bg-primary/[0.02] transition-colors group ${selectedIds.has(shp.id) ? 'bg-blue-50/50' : ''}`}
                                                >
                                                    <td className="px-3 py-4 w-[40px]">
                                                        {shp.status !== 'declined' && (
                                                            <Checkbox
                                                                checked={selectedIds.has(shp.id)}
                                                                onCheckedChange={(checked) => handleSelectRow(shp.id, !!checked)}
                                                                aria-label={`Select shipment ${shp.id}`}
                                                            />
                                                        )}
                                                    </td>
                                                    {isFranchise ? (
                                                        <>
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-sm font-bold text-blue-700">
                                                                        {shp.courierTrackingId || '-'}
                                                                    </span>
                                                                    {shp.shipmentType === 'return' && (
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[9px] font-bold leading-none">
                                                                            RETURN
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-sm font-medium whitespace-nowrap">
                                                                {shp.createdAt?.toDate ? format(shp.createdAt.toDate(), "dd MMM yyyy") : "N/A"}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className="font-semibold text-sm block">{shp.senderName || shp.origin?.name || "N/A"}</span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className="font-semibold text-sm block">{shp.destination?.name || "N/A"}</span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className="font-mono text-sm">{shp.destination?.pincode || "-"}</span>
                                                            </td>
                                                            <td className="px-4 py-4 text-sm font-medium">
                                                                {(shp.weight || shp.actualWeight || 0) > 0
                                                                    ? `${shp.weight || shp.actualWeight}kg`
                                                                    : '-'}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {(() => {
                                                                    const ts = getEffectiveTrackingStatus(shp);
                                                                    const display = getTrackingDisplay(ts);
                                                                    return (
                                                                        <div className="flex flex-col gap-1">
                                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${display.bg} ${display.text}`}>
                                                                                <span className={`h-1.5 w-1.5 rounded-full ${display.dotColor}`} />
                                                                                {display.label}
                                                                            </span>
                                                                            {shp.lastTrackingLocation && (
                                                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 pl-0.5">
                                                                                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                                                                                    <span className="truncate max-w-[120px]">{shp.lastTrackingLocation}</span>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="px-4 py-4">
                                                                {shp.clientType === 'shopify' ? (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                                                                        <ShoppingBag className="h-3 w-3" /> Shopify
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground text-[10px] font-bold">
                                                                        <Package className="h-3 w-3" /> Direct
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="flex flex-col gap-0.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-mono text-sm font-bold text-blue-700">
                                                                            {shp.shopifyOrderNumber ? `#${shp.shopifyOrderNumber}` : shp.referenceNo || '-'}
                                                                        </span>
                                                                        {shp.shipmentType === 'return' && (
                                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[9px] font-bold leading-none">
                                                                                RETURN
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="font-mono text-[10px] text-muted-foreground">
                                                                        {shp.courierTrackingId || shp.id?.substring(0, 10).toUpperCase()}
                                                                    </span>
                                                                    {shp.shopifyFulfillmentStatus === 'fulfilled' && (
                                                                        <span className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-bold w-fit">
                                                                            SYNCED
                                                                        </span>
                                                                    )}
                                                                    {shp.shopifyFulfillmentStatus === 'failed' && (
                                                                        <span
                                                                            className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold w-fit cursor-help"
                                                                            title={shp.shopifyFulfillmentError || 'Shopify sync failed'}
                                                                        >
                                                                            SYNC FAILED
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-sm font-medium whitespace-nowrap">
                                                                {shp.createdAt?.toDate ? format(shp.createdAt.toDate(), "dd MMM yyyy") : "N/A"}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="max-w-[180px]">
                                                                    <span className="text-sm font-medium block truncate">
                                                                        {shp.products?.[0]?.name || shp.shopifyLineItems?.[0]?.title || '-'}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">
                                                                        ₹{(shp.declaredValue || shp.chargedAmount || 0).toLocaleString('en-IN')}
                                                                        {(shp.products?.length || 0) > 1 && (
                                                                            <span className="ml-1 text-[10px] text-muted-foreground">+{(shp.products?.length || 0) - 1} more</span>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {shp.toPayCustomer ? (
                                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">COD</span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground text-[10px] font-bold">Prepaid</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className="font-semibold text-sm block">{shp.destination?.name || "N/A"}</span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className="font-mono text-sm">{shp.destination?.pincode || "-"}</span>
                                                            </td>
                                                            <td className="px-4 py-4 text-sm font-medium">
                                                                {(shp.weight || shp.actualWeight || 0) > 0
                                                                    ? `${shp.weight || shp.actualWeight}kg`
                                                                    : '-'}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {(() => {
                                                                    const ts = getEffectiveTrackingStatus(shp);
                                                                    const display = getTrackingDisplay(ts);
                                                                    return (
                                                                        <div className="flex flex-col gap-1">
                                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${display.bg} ${display.text}`}>
                                                                                <span className={`h-1.5 w-1.5 rounded-full ${display.dotColor}`} />
                                                                                {display.label}
                                                                            </span>
                                                                            {shp.lastTrackingLocation && (
                                                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 pl-0.5">
                                                                                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                                                                                    <span className="truncate max-w-[120px]">{shp.lastTrackingLocation}</span>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                        </>
                                                    )}
                                                    <td className="px-4 py-4 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger className="p-2 hover:bg-muted rounded-lg transition-colors">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48 p-2 rounded-xl">
                                                                <DropdownMenuItem
                                                                    className="flex items-center gap-2 cursor-pointer p-3 rounded-lg"
                                                                    onClick={() => handleTrackShipment(shp)}
                                                                >
                                                                    <ExternalLink className="h-4 w-4" /> Track Package
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    className="flex items-center gap-2 cursor-pointer p-3 rounded-lg"
                                                                    onClick={() => setSelectedShipmentForLabel(shp)}
                                                                >
                                                                    <Download className="h-4 w-4" /> Invoice
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    className="flex items-center gap-2 cursor-pointer p-3 rounded-lg"
                                                                    onClick={() => setSelectedShipmentForManifest(shp)}
                                                                >
                                                                    <FileTextIcon className="h-4 w-4" /> Manifest
                                                                </DropdownMenuItem>
                                                                {shp.shopifyFulfillmentStatus === 'failed' && shp.courierTrackingId && (
                                                                    <DropdownMenuItem
                                                                        className="flex items-center gap-2 cursor-pointer p-3 rounded-lg text-blue-600 focus:text-blue-600 focus:bg-blue-50"
                                                                        onClick={() => handleRetrySync(shp.id)}
                                                                        disabled={resyncingId === shp.id}
                                                                    >
                                                                        <RefreshCw className={`h-4 w-4 ${resyncingId === shp.id ? 'animate-spin' : ''}`} />
                                                                        {resyncingId === shp.id ? 'Syncing...' : 'Retry Shopify Sync'}
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {shp.status !== 'cancelled' && shp.shipmentType !== 'return' && (
                                                                    <DropdownMenuItem
                                                                        className="flex items-center gap-2 cursor-pointer p-3 rounded-lg text-orange-600 focus:text-orange-600 focus:bg-orange-50"
                                                                        onClick={() => router.push(`/add-shipment?returnShipmentId=${shp.id}`)}
                                                                    >
                                                                        <RotateCcw className="h-4 w-4" /> Return Shipment
                                                                    </DropdownMenuItem>
                                                                )}
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
                                        Showing {filteredBookedShipments.length} of {bookedShipments.length} shipments
                                    </p>
                                </div>
                            </>
                        )}
                    </TabsContent>
                </Tabs>
            </Card>

            {/* Hidden container for bulk label rendering */}
            {labelsForBulkPrint && (
                <div id="bulk-print-labels" style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                    {labelsForBulkPrint.map((shp) => (
                        <div key={shp.id} className="shopify-label-item">
                            <ShopifyLabel shipment={shp} />
                        </div>
                    ))}
                </div>
            )}

            {/* ==================== BULK SHIP VALIDATION DIALOG ==================== */}
            <Dialog open={showBulkShipDialog} onOpenChange={(open) => {
                if (!open && !isBulkShipping) {
                    setShowBulkShipDialog(false);
                    setBulkShipValidation(null);
                    setBulkShipResults(null);
                }
            }}>
                <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden [&>button:last-child]:hidden">
                    <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-b from-muted/40 to-white">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                                    <Truck className="h-5 w-5 text-primary" />
                                    Bulk Ship via {bulkShipCourier === 'Blue Dart' ? BLUEDART_SERVICE_TYPES[bulkShipBlueDartService].displayName : bulkShipCourier}
                                </h2>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {bulkShipResults
                                        ? `Shipping complete — ${bulkShipResults.filter(r => r.success).length} succeeded, ${bulkShipResults.filter(r => !r.success).length} failed`
                                        : `${validCount} ready to ship, ${invalidCount} with issues`}
                                </p>
                            </div>
                            {!isBulkShipping && (
                                <button
                                    onClick={() => { setShowBulkShipDialog(false); setBulkShipValidation(null); setBulkShipResults(null); }}
                                    className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                >
                                    <span className="text-lg leading-none">&times;</span>
                                </button>
                            )}
                        </div>

                        {/* Progress bar during shipping */}
                        {isBulkShipping && (
                            <div className="mt-4">
                                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                                    <span>Shipping orders...</span>
                                    <span>{bulkShipProgress.completed} / {bulkShipProgress.total}</span>
                                </div>
                                <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary rounded-full transition-all duration-500"
                                        style={{ width: `${bulkShipProgress.total > 0 ? (bulkShipProgress.completed / bulkShipProgress.total) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="max-h-[50vh] overflow-y-auto">
                        {/* Show results if shipping is done */}
                        {bulkShipResults && !isBulkShipping ? (
                            <div className="divide-y divide-border/50">
                                {bulkShipResults.map((result) => (
                                    <div key={result.id} className={`px-6 py-3 flex items-center gap-3 ${result.success ? 'bg-green-50/30' : 'bg-red-50/30'}`}>
                                        {result.success ? (
                                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                                        ) : (
                                            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <span className="font-mono text-sm font-bold">#{result.orderNumber}</span>
                                            {result.success && result.awb && (
                                                <span className="ml-2 text-xs text-emerald-700">AWB: {result.awb}</span>
                                            )}
                                            {!result.success && result.error && (
                                                <p className="text-xs text-red-600 mt-0.5 truncate">{result.error}</p>
                                            )}
                                        </div>
                                        {!result.success && (
                                            <button
                                                onClick={() => {
                                                    setShowBulkShipDialog(false);
                                                    setBulkShipValidation(null);
                                                    setBulkShipResults(null);
                                                    router.push(`/add-shipment?shopifyShipmentId=${result.id}`);
                                                }}
                                                className="shrink-0 text-xs px-3 py-1.5 bg-white border rounded-lg font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                                            >
                                                Ship Manually
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* Show validation list before shipping */
                            <div className="divide-y divide-border/50">
                                {bulkShipValidation?.map((item) => (
                                    <div key={item.shipment.id} className={`px-6 py-3 flex items-start gap-3 ${item.isValid ? '' : 'bg-amber-50/30'}`}>
                                        {item.isValid ? (
                                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                                        ) : (
                                            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-bold text-blue-700">
                                                    #{item.shipment.shopifyOrderNumber || item.shipment.referenceNo?.replace('ORD-', '') || '-'}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {item.shipment.destination?.name}
                                                </span>
                                                {item.shipment.toPayCustomer && (
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-bold">COD</span>
                                                )}
                                            </div>
                                            {!item.isValid && (
                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                    {item.errors.map((err, i) => (
                                                        <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">
                                                            <XCircle className="h-2.5 w-2.5" /> {err}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {!item.isValid && !isBulkShipping && (
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    onClick={() => {
                                                        setShowBulkShipDialog(false);
                                                        setBulkShipValidation(null);
                                                        router.push(`/add-shipment?shopifyShipmentId=${item.shipment.id}`);
                                                    }}
                                                    className="text-xs px-3 py-1.5 bg-white border rounded-lg font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveFromBulkShip(item.shipment.id)}
                                                    className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg font-semibold text-red-600 hover:bg-red-100 transition-colors"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t bg-muted/10 flex items-center justify-between">
                        {bulkShipResults && !isBulkShipping ? (
                            <button
                                onClick={() => { setShowBulkShipDialog(false); setBulkShipValidation(null); setBulkShipResults(null); setSelectedNewOrderIds(new Set()); }}
                                className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
                            >
                                Done
                            </button>
                        ) : (
                            <>
                                <div className="text-xs text-muted-foreground">
                                    {validCount > 0 && <span className="text-emerald-700 font-semibold">{validCount} ready</span>}
                                    {validCount > 0 && invalidCount > 0 && <span className="mx-1">·</span>}
                                    {invalidCount > 0 && <span className="text-amber-600 font-semibold">{invalidCount} need attention</span>}
                                </div>
                                <button
                                    onClick={handleExecuteBulkShip}
                                    disabled={isBulkShipping || validCount === 0}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isBulkShipping ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> Shipping...</>
                                    ) : (
                                        <><Truck className="h-4 w-4" /> Ship {validCount} Order{validCount !== 1 ? 's' : ''}</>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Print Label Dialog */}
            <Dialog open={!!selectedShipmentForLabel} onOpenChange={(open) => !open && setSelectedShipmentForLabel(null)}>
                <DialogContent className={`${
                    currentUser?.role === 'shopify' ? 'max-w-lg' :
                    (selectedShipmentForLabel?.courier === 'DTDC' || selectedShipmentForLabel?.courier === 'Delhivery') ? 'max-w-2xl' : 'max-w-md'
                } bg-white p-0 overflow-hidden [&>button:last-child]:hidden`}>
                    <div className="px-5 pt-5 pb-4 border-b bg-gradient-to-b from-muted/40 to-white space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold text-foreground">
                                    Shipping Label
                                </h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {currentUser?.role === 'shopify'
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
                            {(selectedShipmentForLabel?.courier !== 'DTDC' && selectedShipmentForLabel?.courier !== 'Delhivery') ? (
                                <div className="flex items-center bg-muted/50 rounded-lg p-1 text-xs border border-border/50">
                                    <button
                                        onClick={() => setPrintMode('thermal')}
                                        className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                            printMode === 'thermal'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-white text-muted-foreground border border-border/40 shadow-sm hover:text-foreground'
                                        }`}
                                    >
                                        Thermal 4×6
                                    </button>
                                    <button
                                        onClick={() => setPrintMode('a4')}
                                        className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                                            printMode === 'a4'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-white text-muted-foreground border border-border/40 shadow-sm hover:text-foreground'
                                        }`}
                                    >
                                        A4 Sheet
                                    </button>
                                </div>
                            ) : <div />}
                            <button
                                onClick={() => {
                                    if (currentUser?.role === 'shopify') {
                                        printShopifyLabel(printMode);
                                    } else if (selectedShipmentForLabel?.courier === 'DTDC') {
                                        printDTDCLabel();
                                    } else if (selectedShipmentForLabel?.courier === 'Delhivery') {
                                        const frame = document.getElementById('delhivery-label-iframe') as HTMLIFrameElement | null;
                                        if (frame?.contentWindow) {
                                            try { frame.contentWindow.print(); }
                                            catch { if (frame.src) window.open(frame.src, '_blank'); }
                                        } else if (frame?.src) {
                                            window.open(frame.src, '_blank');
                                        }
                                    } else {
                                        printBlueDartLabel(printMode);
                                    }
                                }}
                                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
                            >
                                <Printer className="h-3.5 w-3.5" /> Print Label
                            </button>
                        </div>
                    </div>
                    <div className="p-6 flex justify-center bg-gray-50/50">
                        {selectedShipmentForLabel && (
                            currentUser?.role === 'shopify' ? (
                                <ShopifyLabel shipment={selectedShipmentForLabel} />
                            ) : selectedShipmentForLabel.courier === 'DTDC' ? (
                                <DTDCLabel referenceNumber={selectedShipmentForLabel.courierTrackingId || selectedShipmentForLabel.dtdcReferenceNumber || ''} />
                            ) : selectedShipmentForLabel.courier === 'Delhivery' ? (
                                <iframe
                                    id="delhivery-label-iframe"
                                    src={`/api/delhivery/shipping-label?waybill=${encodeURIComponent(selectedShipmentForLabel.courierTrackingId || '')}&pdf=true${currentUser?.id ? `&clientId=${encodeURIComponent(currentUser.id)}` : ''}`}
                                    className="w-full border-0 rounded-lg"
                                    style={{ height: '500px' }}
                                    title={`Delhivery Label - ${selectedShipmentForLabel.courierTrackingId}`}
                                />
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

            {/* Export CSV Confirmation Dialog */}
            <AlertDialog open={showExportConfirm} onOpenChange={setShowExportConfirm}>
                <AlertDialogContent className="max-w-md rounded-2xl border-0 shadow-2xl bg-white p-0 overflow-hidden">
                    <div className="px-6 pt-6 pb-4">
                        <AlertDialogHeader className="space-y-3">
                            <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Download className="h-5 w-5 text-primary" />
                            </div>
                            <AlertDialogTitle className="text-center text-lg font-bold tracking-tight">
                                Export All Shipments?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-center text-sm text-muted-foreground leading-relaxed">
                                You haven&apos;t selected any specific shipments. This will export{' '}
                                <span className="font-semibold text-foreground">
                                    all {filteredBookedShipments.length} shipment{filteredBookedShipments.length !== 1 ? 's' : ''}
                                </span>{' '}
                                to a CSV file.
                                <br />
                                <span className="text-xs mt-2 block text-muted-foreground/80">
                                    To export specific shipments only, close this and select them using the checkboxes first.
                                </span>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                    </div>
                    <AlertDialogFooter className="px-6 py-4 border-t bg-muted/20 flex-row gap-3 sm:gap-3">
                        <AlertDialogCancel className="flex-1 rounded-xl border-2 border-muted font-semibold hover:bg-muted/50 mt-0">
                            Go Back & Select
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleExportCSV()}
                            className="flex-1 rounded-xl bg-primary font-semibold hover:bg-primary/90 shadow-md shadow-primary/20"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Export All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Tracking Dialog */}
            <Dialog open={!!trackingShipment} onOpenChange={(open) => { if (!open) { setTrackingShipment(null); setTrackingData(null); setTrackingError(null); } }}>
                <DialogContent className="max-w-lg bg-white p-0 overflow-hidden rounded-2xl">
                    <div className="p-5 border-b bg-muted/20">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold tracking-tight">Track Shipment</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="font-mono text-xs text-muted-foreground">AWB: {trackingShipment?.courierTrackingId}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-bold text-muted-foreground">{trackingShipment?.courier || 'Blue Dart'}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => { setTrackingShipment(null); setTrackingData(null); setTrackingError(null); }}
                                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <span className="text-lg leading-none">&times;</span>
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[65vh] overflow-y-auto">
                        {trackingLoading && (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground font-medium">Fetching tracking details...</p>
                            </div>
                        )}

                        {trackingError && (
                            <div className="p-6">
                                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100">
                                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-red-800">Tracking Failed</p>
                                        <p className="text-xs text-red-600 mt-1 leading-relaxed">{trackingError}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {trackingData && !trackingLoading && (
                            <div className="p-5 space-y-5">
                                {/* Current Status */}
                                {(() => {
                                    const rawStatus = getTrackingCurrentStatus(trackingData, trackingShipment?.courier || '');
                                    const normalized = normalizeTrackingStatus(rawStatus, trackingShipment?.courier || '');
                                    const display = getTrackingDisplay(normalized);
                                    return (
                                        <div className={`flex items-center gap-3 p-4 rounded-xl ${display.bg} border ${display.border}`}>
                                            <div className={`h-10 w-10 rounded-full ${display.bg} flex items-center justify-center shrink-0`}>
                                                <Truck className={`h-5 w-5 ${display.text}`} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current Status</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${display.bg} ${display.text}`}>
                                                        <span className={`h-2 w-2 rounded-full ${display.dotColor}`} />
                                                        {display.label}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">{rawStatus}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Shipment Info */}
                                <div className="grid grid-cols-2 gap-3">
                                    {trackingShipment?.destination?.name && (
                                        <div className="p-3 rounded-lg bg-muted/30">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Receiver</p>
                                            <p className="text-sm font-semibold mt-0.5">{trackingShipment.destination.name}</p>
                                        </div>
                                    )}
                                    {trackingShipment?.destination?.city && (
                                        <div className="p-3 rounded-lg bg-muted/30">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Destination</p>
                                            <p className="text-sm font-semibold mt-0.5">{trackingShipment.destination.city} — {trackingShipment.destination.pincode}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Timeline */}
                                {(() => {
                                    const scans = trackingShipment?.courier === 'DTDC'
                                        ? parseDtdcScans(trackingData)
                                        : trackingShipment?.courier === 'Delhivery'
                                            ? parseDelhiveryScans(trackingData)
                                            : parseBlueDartScans(trackingData);

                                    if (scans.length > 0) {
                                        return (
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Tracking Timeline</p>
                                                <div className="space-y-0">
                                                    {scans.map((scan, idx) => (
                                                        <div key={idx} className="flex gap-3">
                                                            {/* Timeline line */}
                                                            <div className="flex flex-col items-center">
                                                                <div className={`h-3 w-3 rounded-full shrink-0 mt-1 ${idx === 0 ? 'bg-primary ring-4 ring-primary/10' : 'bg-muted-foreground/30'}`} />
                                                                {idx < scans.length - 1 && (
                                                                    <div className="w-px flex-1 bg-border min-h-[32px]" />
                                                                )}
                                                            </div>
                                                            {/* Content */}
                                                            <div className="pb-5 min-w-0">
                                                                <p className={`text-sm font-semibold leading-tight ${idx === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                                    {scan.activity || 'Update'}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                    {scan.location && (
                                                                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                            <MapPin className="h-3 w-3" /> {scan.location}
                                                                        </span>
                                                                    )}
                                                                    {(scan.date || scan.time) && (
                                                                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                            <Clock className="h-3 w-3" /> {scan.date} {scan.time}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }

                                    // No parsed scans — show raw data
                                    return (
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Raw Tracking Data</p>
                                            <pre className="text-xs bg-muted/30 p-4 rounded-xl overflow-x-auto max-h-60 text-muted-foreground font-mono leading-relaxed">
                                                {JSON.stringify(trackingData, null, 2)}
                                            </pre>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ClientShipments;
