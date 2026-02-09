'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import {
    Package,
    MapPin,
    Truck,
    Globe,
    Building2,
    PhoneCall,
    UserCircle,
    BadgeCheck,
    Loader2,
    Star,
    ChevronRight,
    Ruler,
    Hash,
    Tag,
    IndianRupee,
    Scale,
    HandCoins,
    Plus,
    Trash2,
    Percent,
    ShoppingBag
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createShipment, getShipmentById, updateShipment, lookupReceiverByPhone, getUniqueSKUs } from "@/services/shipmentService";
import { ShipmentProduct } from "@/types/types";
import { saveDefaultPickupAddress, getDefaultPickupAddress } from "@/services/clientService";
import { blueDartService } from "@/services/blueDartService";
import { BLUEDART_PREDEFINED, BLUEDART_SERVICE_TYPES, BlueDartServiceType } from "@/config/bluedartConfig";
import { dtdcService } from "@/services/dtdcService";
import { DTDC_PREDEFINED } from "@/config/dtdcConfig";
import { Switch } from "@/components/ui/switch";

const PremiumInput = ({ label, icon: Icon, placeholder, value, onChange, type = "text" }: any) => (
    <div className="space-y-2 group text-left">
        <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground group-focus-within:text-primary transition-colors flex items-center gap-2">
            <Icon className="h-3 w-3" /> {label}
        </Label>
        <div className="relative">
            <Input
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-12 bg-white border-2 border-muted focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl transition-all font-medium text-foreground placeholder:text-muted-foreground/50 shadow-sm"
            />
        </div>
    </div>
);

// Simple pricing formula: base rate + per kg rate
const calculatePrice = (weight: number) => {
    const baseRate = 50;
    const perKgRate = 30;
    return Math.round(baseRate + (weight * perKgRate));
};

const AddShipment = () => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [savingDefault, setSavingDefault] = useState(false);
    const [selectedCourier, setSelectedCourier] = useState<'Blue Dart' | 'DTDC'>('Blue Dart');

    // Blue Dart service options
    const [blueDartServiceType, setBlueDartServiceType] = useState<BlueDartServiceType>('APEX');
    const [enableCOD, setEnableCOD] = useState(false);
    const [codAmount, setCodAmount] = useState("");

    // Form States - Pickup starts empty (will load from saved default)
    const [pickup, setPickup] = useState({ name: "", phone: "", pincode: "", address: "", city: "", state: "", country: "India" });
    // Delivery always starts empty
    const [delivery, setDelivery] = useState({ name: "", phone: "", pincode: "", address: "", city: "", state: "", country: "India" });
    const [dimensions, setDimensions] = useState({ length: "10", width: "10", height: "10" });
    const [actualWeight, setActualWeight] = useState("0.5");
    const [products, setProducts] = useState<ShipmentProduct[]>([{ sku: '', name: '', quantity: 1, price: 0 }]);
    const [orderID, setOrderID] = useState("");
    const [skuHistory, setSkuHistory] = useState<string[]>([]);
    const [adCommissionType, setAdCommissionType] = useState<'flat' | 'percentage' | null>(null);
    const [adCommissionValue, setAdCommissionValue] = useState<number>(0);

    // Auto-fill state
    const [receiverLookupLoading, setReceiverLookupLoading] = useState(false);
    const [receiverAutoFilled, setReceiverAutoFilled] = useState(false);
    const lookupTimerRef = useRef<NodeJS.Timeout | null>(null);

    const router = useRouter();
    const searchParams = useSearchParams();
    const shopifyShipmentId = searchParams.get('shopifyShipmentId');
    const [shopifySourceId, setShopifySourceId] = useState<string | null>(null);
    const { currentUser } = useAuth();
    const isB2C = currentUser?.role === 'shopify';

    // Fire-and-forget call to sync fulfillment to Shopify after AWB is assigned
    const triggerShopifyFulfillment = async (shipmentId: string) => {
        try {
            const response = await fetch('/api/integrations/shopify/fulfill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shipmentId }),
            });
            if (response.ok) {
                toast.success('Tracking synced to Shopify', {
                    description: 'Customer will receive tracking notification from Shopify.'
                });
            } else {
                const data = await response.json();
                console.error('Shopify fulfillment sync failed:', data.error);
                toast.warning('Shipment booked, but Shopify tracking sync failed', {
                    description: data.error || 'You can manually fulfill in Shopify.'
                });
            }
        } catch (error) {
            console.error('Shopify fulfillment sync error:', error);
        }
    };

    // Load saved default pickup address on mount
    useEffect(() => {
        const loadDefaultPickup = async () => {
            if (currentUser?.id) {
                const savedAddress = await getDefaultPickupAddress(currentUser.id);
                if (savedAddress) {
                    setPickup(savedAddress);
                }
            }
        };
        loadDefaultPickup();
    }, [currentUser?.id]);

    // Load Shopify order data if coming from Proceed button
    useEffect(() => {
        const loadShopifyOrder = async () => {
            if (!shopifyShipmentId) return;
            const shipment = await getShipmentById(shopifyShipmentId);
            if (!shipment || shipment.status !== 'shopify_pending') return;

            setShopifySourceId(shipment.id);

            setPickup({
                name: shipment.origin?.name || "",
                phone: shipment.origin?.phone || "",
                pincode: shipment.origin?.pincode || "",
                address: shipment.origin?.address || "",
                city: shipment.origin?.city || "",
                state: shipment.origin?.state || "",
                country: "India",
            });

            setDelivery({
                name: shipment.destination?.name || "",
                phone: shipment.destination?.phone || "",
                pincode: shipment.destination?.pincode || "",
                address: shipment.destination?.address || "",
                city: shipment.destination?.city || "",
                state: shipment.destination?.state || "",
                country: "India",
            });

            if (shipment.weight) setActualWeight(shipment.weight.toString());

            if (shipment.dimensions) {
                setDimensions({
                    length: shipment.dimensions.length?.toString() || "10",
                    width: shipment.dimensions.width?.toString() || "10",
                    height: shipment.dimensions.height?.toString() || "10",
                });
            }

            // Pre-fill products from Shopify line items or existing products
            if (shipment.products && shipment.products.length > 0) {
                setProducts(shipment.products);
            } else if (shipment.shopifyLineItems && shipment.shopifyLineItems.length > 0) {
                setProducts(shipment.shopifyLineItems.map(item => ({
                    sku: item.sku || '',
                    name: item.title || '',
                    quantity: item.quantity || 1,
                    price: parseFloat(item.price || '0'),
                    variantTitle: item.variant_title,
                })));
            } else if (shipment.declaredValue || shipment.commodityDetail1) {
                setProducts([{
                    sku: '',
                    name: shipment.commodityDetail1 || '',
                    quantity: shipment.pieceCount || 1,
                    price: shipment.declaredValue || 0,
                }]);
            }

            // Pre-fill order ID from Shopify order number
            if (shipment.shopifyOrderNumber) {
                setOrderID(`#${shipment.shopifyOrderNumber}`);
            } else if (shipment.referenceNo) {
                setOrderID(shipment.referenceNo);
            }
        };
        loadShopifyOrder();
    }, [shopifyShipmentId]);

    // Debounced receiver phone lookup for auto-fill
    const handleReceiverPhoneChange = useCallback((phone: string) => {
        setDelivery(prev => ({ ...prev, phone }));
        setReceiverAutoFilled(false);

        // Clear previous timer
        if (lookupTimerRef.current) {
            clearTimeout(lookupTimerRef.current);
        }

        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length >= 10 && currentUser?.id) {
            setReceiverLookupLoading(true);
            lookupTimerRef.current = setTimeout(async () => {
                try {
                    const result = await lookupReceiverByPhone(currentUser.id, cleanPhone);
                    if (result) {
                        setDelivery({
                            name: result.name,
                            phone: phone, // Keep user's typed value
                            pincode: result.pincode,
                            address: result.address,
                            city: result.city,
                            state: result.state,
                            country: "India",
                        });
                        setReceiverAutoFilled(true);
                        toast.success("Receiver details auto-filled", {
                            description: `Found previous shipment for ${result.name}`,
                        });
                    }
                } catch {
                    // Silently fail - user can still enter manually
                } finally {
                    setReceiverLookupLoading(false);
                }
            }, 500);
        } else {
            setReceiverLookupLoading(false);
        }
    }, [currentUser?.id]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
        };
    }, []);

    // Save pickup address as default
    const handleSetAsDefault = async () => {
        if (!currentUser?.id) {
            toast.error("Please login to save default address");
            return;
        }
        if (!pickup.name || !pickup.phone || !pickup.pincode || !pickup.address) {
            toast.error("Please fill in all pickup fields first");
            return;
        }
        setSavingDefault(true);
        try {
            await saveDefaultPickupAddress(currentUser.id, pickup);
            toast.success("Default pickup address saved!", {
                description: "This address will be auto-filled next time."
            });
        } catch {
            toast.error("Failed to save default address");
        } finally {
            setSavingDefault(false);
        }
    };

    const weights = useMemo(() => {
        const l = parseFloat(dimensions.length);
        const w = parseFloat(dimensions.width);
        const h = parseFloat(dimensions.height);
        const volumetric = (!isNaN(l) && !isNaN(w) && !isNaN(h)) ? Number(((l * w * h) / 5000).toFixed(2)) : 0;
        const actual = parseFloat(actualWeight) || 0;
        const billable = Math.max(volumetric, actual);
        return { volumetric, actual, billable };
    }, [dimensions, actualWeight]);

    const estimatedPrice = useMemo(() => calculatePrice(weights.billable), [weights.billable]);

    // Total declared value from all products
    const totalDeclaredValue = useMemo(() =>
        products.reduce((sum, p) => sum + (p.quantity * p.price), 0),
        [products]
    );

    // Fetch SKU history on mount
    useEffect(() => {
        const loadSKUs = async () => {
            if (currentUser?.id) {
                const skus = await getUniqueSKUs(currentUser.id);
                setSkuHistory(skus);
            }
        };
        loadSKUs();
    }, [currentUser?.id]);

    // Product helpers
    const updateProduct = (index: number, field: keyof ShipmentProduct, value: any) => {
        setProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
    };

    const addProduct = () => {
        setProducts(prev => [...prev, { sku: '', name: '', quantity: 1, price: 0 }]);
    };

    const removeProduct = (index: number) => {
        if (products.length > 1) {
            setProducts(prev => prev.filter((_, i) => i !== index));
        }
    };

    // STEP 1: Validate addresses and move to package step
    const handleRouteNext = async () => {
        // Validate pickup
        if (!pickup.name || !pickup.phone || !pickup.pincode || !pickup.address) {
            toast.error("Please fill all pickup address fields");
            return;
        }
        // Validate delivery
        if (!delivery.name || !delivery.phone || !delivery.pincode || !delivery.address) {
            toast.error("Please fill all delivery address fields");
            return;
        }
        // Validate pincodes are 6 digits
        if (!/^\d{6}$/.test(pickup.pincode)) {
            toast.error("Pickup pincode must be 6 digits");
            return;
        }
        if (!/^\d{6}$/.test(delivery.pincode)) {
            toast.error("Delivery pincode must be 6 digits");
            return;
        }

        toast.success("Addresses verified!");
        setStep(2);
    };

    // Helper: Format mobile number for Blue Dart (10-15 digits, numbers only)
    const formatMobile = (phone: string) => {
        // Remove all non-numeric characters
        const cleaned = phone.replace(/\D/g, '');
        // If it starts with 91 and is 12 digits, keep it.
        // If it is 10 digits, keep it.
        // If it has leading 0, strip it if total length > 10? Blue Dart handles 0 usually.
        // Safest: strict 10-15 numeric string.
        return cleaned;
    };

    // STEP 3: Book directly
    const handleBook = async () => {
        // Validate COD for Blue Dart
        if (selectedCourier === 'Blue Dart' && enableCOD) {
            if (!isB2C && BLUEDART_SERVICE_TYPES[blueDartServiceType].code === 'D') {
                toast.error("COD is not available for Domestic Priority. Please select Dart Apex or Dart Surfaceline.");
                return;
            }
            if (!codAmount || parseFloat(codAmount) <= 0) {
                toast.error("Please enter COD amount");
                return;
            }
        }

        // Validate Phone Numbers strictly before API Call
        const cleanReceiverMobile = formatMobile(delivery.phone);
        const cleanSenderMobile = formatMobile(pickup.phone);

        if (cleanReceiverMobile.length < 10 || cleanReceiverMobile.length > 15) {
            toast.error("Receiver Phone must be 10-15 digits");
            return;
        }
        if (cleanSenderMobile.length < 10 || cleanSenderMobile.length > 15) {
            toast.error("Sender Phone must be 10-15 digits");
            return;
        }

        setLoading(true);
        try {
            const referenceNo = orderID.trim() || `ORDER ${Date.now().toString().slice(-6)}`;

            if (selectedCourier === 'DTDC') {
                await handleBookDTDC(referenceNo, cleanSenderMobile, cleanReceiverMobile);
            } else {
                await handleBookBlueDart(referenceNo, cleanSenderMobile, cleanReceiverMobile);
            }

            setTimeout(() => router.push("/client-shipments"), 1500);

        } catch (error: any) {
            console.error('Shipment creation error:', error);
            toast.error("Booking Failed", { description: error.message || "Could not create shipment" });
        } finally {
            setLoading(false);
        }
    };

    // Book via Blue Dart
    const handleBookBlueDart = async (referenceNo: string, cleanSenderMobile: string, cleanReceiverMobile: string) => {
        const selectedService = BLUEDART_SERVICE_TYPES[blueDartServiceType];
        const codAmountValue = enableCOD ? parseFloat(codAmount) || 0 : 0;

        toast.info(`Generating Blue Dart ${selectedService.displayName} Waybill...`);

        const blueDartPayload = {
            Request: {
                Consignee: {
                    ConsigneeName: delivery.name,
                    ConsigneeAddress1: delivery.address.slice(0, 30),
                    ConsigneeAddress2: delivery.address.slice(30, 60) || "",
                    ConsigneeAddress3: delivery.city,
                    ConsigneePincode: delivery.pincode,
                    ConsigneeMobile: cleanReceiverMobile,
                    ConsigneeTelephone: cleanReceiverMobile,
                    ConsigneeAttention: delivery.name
                },
                Shipper: {
                    CustomerName: BLUEDART_PREDEFINED.shipperName,
                    CustomerCode: BLUEDART_PREDEFINED.billingCustomerCode,
                    CustomerAddress1: BLUEDART_PREDEFINED.pickupAddress.slice(0, 30),
                    CustomerAddress2: BLUEDART_PREDEFINED.pickupAddress.slice(30, 60) || "",
                    CustomerAddress3: "HYD",
                    CustomerPincode: BLUEDART_PREDEFINED.pickupPincode,
                    CustomerMobile: BLUEDART_PREDEFINED.senderMobile,
                    CustomerTelephone: BLUEDART_PREDEFINED.senderMobile,
                    OriginArea: BLUEDART_PREDEFINED.billingArea,
                    Sender: pickup.name || BLUEDART_PREDEFINED.senderName,
                    isToPayCustomer: false,
                },
                Services: {
                    ProductCode: selectedService.code,
                    ProductType: 1,
                    ...(isB2C
                        ? { SubProductCode: enableCOD ? "C" : "P" }
                        : enableCOD ? { SubProductCode: "C" } : {}),
                    PieceCount: "1",
                    PackType: selectedService.packType || "",
                    ActualWeight: weights.actual.toString(),
                    Dimensions: [
                        {
                            Length: dimensions.length,
                            Breadth: dimensions.width,
                            Height: dimensions.height,
                            Count: "1"
                        }
                    ],
                    ...(enableCOD ? { CollectableAmount: codAmountValue } : {}),
                    DeclaredValue: totalDeclaredValue || 200,
                    CreditReferenceNo: referenceNo,
                    PickupDate: `/Date(${new Date().getTime() + 24 * 60 * 60 * 1000})/`,
                    PickupTime: BLUEDART_PREDEFINED.pickupTime,
                    PDFOutputNotRequired: false,
                    Commodity: {
                        CommodityDetail1: products[0]?.name || ''
                    }
                }
            }
        };

        let awbNo = "";
        let blueDartStatus = "Pending";
        let destinationArea = "";
        let destinationLocation = "";
        let tokenNumber = "";

        try {
            const apiResponse = await blueDartService.generateWaybill(blueDartPayload);
            const responseData = apiResponse?.GenerateWayBillResult || apiResponse;
            const statusBlock = responseData?.Status?.[0] || {};

            if (responseData?.IsError === false) {
                awbNo = responseData.AWBNo;
                destinationArea = responseData.DestinationArea || "";
                destinationLocation = responseData.DestinationLocation || "";
                tokenNumber = responseData.TokenNumber || "";
                blueDartStatus = "Generated";
                toast.success(`Waybill Generated: ${awbNo}`);
            } else {
                const errorMessage = statusBlock.StatusInformation || "Unknown Blue Dart Error";
                throw new Error(`Blue Dart Error: ${errorMessage}`);
            }
        } catch (apiError: any) {
            const detail = apiError.response?.data?.details || apiError.response?.data || apiError.message;
            const detailString = typeof detail === 'object' ? JSON.stringify(detail) : detail;
            throw new Error("Blue Dart Booking Failed: " + detailString);
        }

        const shipmentData = {
            clientId: currentUser?.id || 'guest',
            clientName: currentUser?.name || pickup.name,
            clientType: (currentUser?.role === 'shopify' || shopifySourceId) ? 'shopify' as const : 'franchise' as const,
            courier: 'Blue Dart',
            courierTrackingId: awbNo,
            status: 'pending' as const,
            origin: { city: pickup.city, state: pickup.state, pincode: pickup.pincode, address: pickup.address, phone: pickup.phone, name: pickup.name },
            destination: { city: delivery.city, state: delivery.state, pincode: delivery.pincode, address: delivery.address, phone: delivery.phone, name: delivery.name },
            weight: weights.billable,
            dimensions: { length: parseFloat(dimensions.length) || 0, width: parseFloat(dimensions.width) || 0, height: parseFloat(dimensions.height) || 0 },
            courierCharge: estimatedPrice,
            chargedAmount: estimatedPrice,
            marginAmount: 0,
            referenceNo,
            billingArea: BLUEDART_PREDEFINED.billingArea,
            billingCustomerCode: BLUEDART_PREDEFINED.billingCustomerCode,
            pickupTime: BLUEDART_PREDEFINED.pickupTime,
            shipperName: BLUEDART_PREDEFINED.shipperName,
            pickupAddress: pickup.address,
            pickupPincode: pickup.pincode,
            companyName: delivery.name,
            receiverName: delivery.name,
            receiverMobile: delivery.phone,
            senderName: pickup.name,
            senderMobile: pickup.phone,
            productCode: selectedService.code,
            productType: BLUEDART_PREDEFINED.productType,
            pieceCount: BLUEDART_PREDEFINED.defaultPieceCount,
            actualWeight: weights.actual,
            declaredValue: totalDeclaredValue || BLUEDART_PREDEFINED.defaultDeclaredValue,
            commodityDetail1: products[0]?.name || '',
            products: products,
            ...(adCommissionType ? { adCommissionType, adCommissionValue } : {}),
            officeClosureTime: BLUEDART_PREDEFINED.officeClosureTime,
            awbNo,
            blueDartStatus,
            destinationArea,
            destinationLocation,
            tokenNumber,
            // Blue Dart service options
            blueDartServiceType: selectedService.name,
            blueDartServiceCode: selectedService.code,
            packType: selectedService.packType || '',
            codEnabled: enableCOD,
            collectableAmount: codAmountValue,
        };

        if (shopifySourceId) {
            await updateShipment(shopifySourceId, shipmentData);
            triggerShopifyFulfillment(shopifySourceId);
        } else {
            await createShipment(shipmentData);
        }

        toast.success("Shipment Booked Successfully!", {
            description: `Reference: ${referenceNo} | AWB: ${awbNo}`,
        });
    };

    // Book via DTDC
    const handleBookDTDC = async (referenceNo: string, cleanSenderMobile: string, cleanReceiverMobile: string) => {
        toast.info("Creating DTDC Order...");

        const dtdcPayload = {
            customer_code: DTDC_PREDEFINED.customerCode,
            service_type_id: DTDC_PREDEFINED.serviceTypeId,
            load_type: DTDC_PREDEFINED.loadType,
            description: products[0]?.name || 'General Goods',
            dimension_unit: DTDC_PREDEFINED.dimensionUnit,
            length: dimensions.length,
            width: dimensions.width,
            height: dimensions.height,
            weight_unit: DTDC_PREDEFINED.weightUnit,
            weight: weights.actual.toString(),
            declared_value: totalDeclaredValue.toString() || DTDC_PREDEFINED.defaultDeclaredValue,
            num_pieces: DTDC_PREDEFINED.defaultPieceCount,
            customer_reference_number: referenceNo,
            commodity_id: DTDC_PREDEFINED.commodityId,
            is_risk_surcharge_applicable: DTDC_PREDEFINED.isRiskSurchargeApplicable,
            origin_details: {
                name: pickup.name || DTDC_PREDEFINED.shipperName,
                phone: cleanSenderMobile,
                address_line_1: pickup.address || DTDC_PREDEFINED.pickupAddress1,
                pincode: pickup.pincode || DTDC_PREDEFINED.pickupPincode,
                city: pickup.city || DTDC_PREDEFINED.pickupCity,
                state: pickup.state || DTDC_PREDEFINED.pickupState,
            },
            destination_details: {
                name: delivery.name,
                phone: cleanReceiverMobile,
                address_line_1: delivery.address,
                pincode: delivery.pincode,
                city: delivery.city,
                state: delivery.state,
            },
        };

        let dtdcAwb = "";
        let dtdcChargeableWeight = 0;

        try {
            const apiResponse = await dtdcService.createOrder(dtdcPayload);

            if (apiResponse?.status === 'OK' && apiResponse?.data?.[0]?.success) {
                dtdcAwb = apiResponse.data[0].reference_number;
                dtdcChargeableWeight = apiResponse.data[0].chargeable_weight || 0;
                toast.success(`DTDC Order Created: ${dtdcAwb}`);
            } else {
                const errorMsg = apiResponse?.data?.[0]?.message || apiResponse?.message || 'Unknown DTDC Error';
                throw new Error(`DTDC Error: ${errorMsg}`);
            }
        } catch (apiError: any) {
            const detail = apiError.response?.data?.details || apiError.response?.data || apiError.message;
            const detailString = typeof detail === 'object' ? JSON.stringify(detail) : detail;
            throw new Error("DTDC Booking Failed: " + detailString);
        }

        const shipmentData = {
            clientId: currentUser?.id || 'guest',
            clientName: currentUser?.name || pickup.name,
            clientType: (currentUser?.role === 'shopify' || shopifySourceId) ? 'shopify' as const : 'franchise' as const,
            courier: 'DTDC',
            courierTrackingId: dtdcAwb,
            status: 'pending' as const,
            origin: { city: pickup.city, state: pickup.state, pincode: pickup.pincode, address: pickup.address, phone: pickup.phone, name: pickup.name },
            destination: { city: delivery.city, state: delivery.state, pincode: delivery.pincode, address: delivery.address, phone: delivery.phone, name: delivery.name },
            weight: weights.billable,
            dimensions: { length: parseFloat(dimensions.length) || 0, width: parseFloat(dimensions.width) || 0, height: parseFloat(dimensions.height) || 0 },
            courierCharge: estimatedPrice,
            chargedAmount: estimatedPrice,
            marginAmount: 0,
            receiverName: delivery.name,
            receiverMobile: delivery.phone,
            senderName: pickup.name,
            senderMobile: pickup.phone,
            declaredValue: totalDeclaredValue || parseFloat(DTDC_PREDEFINED.defaultDeclaredValue),
            commodityDetail1: products[0]?.name || '',
            products: products,
            ...(adCommissionType ? { adCommissionType, adCommissionValue } : {}),
            // DTDC-specific fields
            dtdcReferenceNumber: dtdcAwb,
            dtdcCustomerReferenceNumber: referenceNo,
            dtdcServiceType: DTDC_PREDEFINED.serviceTypeId,
            dtdcLoadType: DTDC_PREDEFINED.loadType,
            dtdcChargeableWeight: dtdcChargeableWeight,
            dtdcStatus: 'Created',
            dtdcCommodityId: DTDC_PREDEFINED.commodityId,
        };

        if (shopifySourceId) {
            await updateShipment(shopifySourceId, shipmentData);
            triggerShopifyFulfillment(shopifySourceId);
        } else {
            await createShipment(shipmentData);
        }

        toast.success("Shipment Booked Successfully!", {
            description: `Reference: ${referenceNo} | AWB: ${dtdcAwb}`,
        });
    };

    // STEP 2: Validate package details and move to product step
    const handlePackageNext = () => {
        if (!weights.billable || weights.billable <= 0) {
            toast.error("Please enter valid weight");
            return;
        }
        toast.success("Package details saved!");
        setStep(3);
    };

    // STEP 3: Validate product details and move to courier step
    const handleProductNext = () => {
        const hasValidProduct = products.some(p => p.name.trim() && p.price > 0);
        if (!hasValidProduct) {
            toast.error("Please add at least one product with name and price");
            return;
        }
        toast.success("Product details saved!");
        setStep(4);
    };

    const handleBack = () => setStep(step - 1);

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
            {/* Header */}
            <div className="relative text-center space-y-3">
                <div className="inline-flex p-3 rounded-2xl bg-primary/5 border border-primary/10">
                    <Truck className="h-7 w-7 text-primary" />
                </div>
                <h1 className="text-4xl font-black tracking-tighter text-foreground">
                    Book <span className="text-primary">Shipment</span>
                </h1>
                <p className="text-muted-foreground font-medium">Simple 4-step booking</p>
            </div>

            {shopifyShipmentId && (
                <div className="bg-[#95BF47]/10 border border-[#95BF47] rounded-xl p-4 text-center">
                    <p className="text-sm font-bold text-[#5e8e3e]">
                        Pre-filled from Shopify Order — review details and fill any missing fields before booking.
                    </p>
                </div>
            )}

            {/* 4-Step Progress */}
            <div className="flex justify-center items-center gap-3 max-w-3xl mx-auto">
                {[
                    { num: 1, label: "Addresses", icon: MapPin },
                    { num: 2, label: "Package", icon: Package },
                    { num: 3, label: "Products", icon: ShoppingBag },
                    { num: 4, label: "Courier", icon: Truck },
                ].map((s, i) => (
                    <div key={s.num} className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1.5">
                            <div className={`
                                w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all
                                ${step === s.num ? "bg-primary border-primary shadow-lg shadow-primary/25 scale-110" :
                                    step > s.num ? "bg-primary border-primary" : "bg-white border-muted"}
                            `}>
                                {step > s.num ? <BadgeCheck className="h-6 w-6 text-white" /> :
                                    <s.icon className={`h-5 w-5 ${step === s.num ? "text-white" : "text-muted-foreground"}`} />}
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${step >= s.num ? "text-primary" : "text-muted-foreground"}`}>
                                {s.label}
                            </span>
                        </div>
                        {i < 3 && <div className={`w-12 h-1 rounded-full mb-5 ${step > s.num ? "bg-primary" : "bg-muted"}`} />}
                    </div>
                ))}
            </div>

            {/* Form Card */}
            <Card className="border-none shadow-2xl rounded-[32px] overflow-hidden bg-white/80 backdrop-blur-xl">
                <CardContent className="p-0">
                    {/* STEP 1: Addresses */}
                    {step === 1 && (
                        <div className="animate-in fade-in duration-500">
                            <div className="grid grid-cols-1 lg:grid-cols-2">
                                {/* Pickup */}
                                <div className="p-8 lg:p-10 space-y-6 border-r border-muted/30">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                                                From
                                            </span>
                                            <h2 className="text-2xl font-black mt-2">Pickup Address</h2>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleSetAsDefault}
                                            disabled={savingDefault}
                                            className="h-8 gap-1.5 text-xs font-bold"
                                        >
                                            {savingDefault ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                                            Set Default
                                        </Button>
                                    </div>
                                    <div className="grid gap-4">
                                        <PremiumInput label="Name *" icon={UserCircle} placeholder="Contact name" value={pickup.name} onChange={(v: any) => setPickup({ ...pickup, name: v })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <PremiumInput label="Phone *" icon={PhoneCall} placeholder="10 digits" value={pickup.phone} onChange={(v: any) => setPickup({ ...pickup, phone: v })} />
                                            <PremiumInput label="Pincode *" icon={MapPin} placeholder="6 digits" value={pickup.pincode} onChange={(v: any) => setPickup({ ...pickup, pincode: v })} />
                                        </div>
                                        <PremiumInput label="Address *" icon={Building2} placeholder="Full address" value={pickup.address} onChange={(v: any) => setPickup({ ...pickup, address: v })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <PremiumInput label="City" icon={Globe} placeholder="City" value={pickup.city} onChange={(v: any) => setPickup({ ...pickup, city: v })} />
                                            <PremiumInput label="State" icon={Globe} placeholder="State" value={pickup.state} onChange={(v: any) => setPickup({ ...pickup, state: v })} />
                                        </div>
                                    </div>
                                </div>

                                {/* Delivery */}
                                <div className="p-8 lg:p-10 space-y-6 bg-muted/5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 text-[10px] font-bold uppercase tracking-wider">
                                                To
                                            </span>
                                            <h2 className="text-2xl font-black mt-2">Delivery Address</h2>
                                        </div>
                                        {receiverAutoFilled && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-600 text-[10px] font-bold uppercase tracking-wider border border-green-200 animate-in fade-in duration-300">
                                                <BadgeCheck className="h-3 w-3" /> Auto-filled
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid gap-4">
                                        {/* Phone number FIRST for auto-fill lookup */}
                                        <div className="relative">
                                            <PremiumInput
                                                label="Contact Number *"
                                                icon={PhoneCall}
                                                placeholder="Enter 10-digit mobile number"
                                                value={delivery.phone}
                                                onChange={handleReceiverPhoneChange}
                                            />
                                            {receiverLookupLoading && (
                                                <div className="absolute right-3 top-9">
                                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                                </div>
                                            )}
                                            <p className="text-[10px] text-muted-foreground mt-1 ml-1">
                                                Enter the receiver&apos;s number — previously saved details will auto-fill
                                            </p>
                                        </div>
                                        <PremiumInput label="Receiver Name *" icon={UserCircle} placeholder="Receiver's name" value={delivery.name} onChange={(v: any) => setDelivery({ ...delivery, name: v })} />
                                        <PremiumInput label="Pincode *" icon={MapPin} placeholder="6 digits" value={delivery.pincode} onChange={(v: any) => setDelivery({ ...delivery, pincode: v })} />
                                        <PremiumInput label="Address *" icon={Building2} placeholder="Complete address" value={delivery.address} onChange={(v: any) => setDelivery({ ...delivery, address: v })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <PremiumInput label="City" icon={Globe} placeholder="City" value={delivery.city} onChange={(v: any) => setDelivery({ ...delivery, city: v })} />
                                            <PremiumInput label="State" icon={Globe} placeholder="State" value={delivery.state} onChange={(v: any) => setDelivery({ ...delivery, state: v })} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Package Details */}
                    {step === 2 && (
                        <div className="p-8 lg:p-10 animate-in fade-in duration-500">
                            <div className="max-w-3xl mx-auto space-y-8">
                                <div className="text-center">
                                    <h2 className="text-3xl font-black">Package Details</h2>
                                    <p className="text-muted-foreground text-sm mt-1">Enter dimensions and weight</p>
                                </div>

                                {/* Dimensions Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <Ruler className="h-4 w-4 text-primary" />
                                        </div>
                                        <h3 className="font-bold text-sm uppercase tracking-wide text-foreground">Dimensions</h3>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <PremiumInput label="Length (cm)" icon={Ruler} placeholder="10" value={dimensions.length} onChange={(v: string) => setDimensions({ ...dimensions, length: v })} type="number" />
                                        <PremiumInput label="Width (cm)" icon={Ruler} placeholder="10" value={dimensions.width} onChange={(v: string) => setDimensions({ ...dimensions, width: v })} type="number" />
                                        <PremiumInput label="Height (cm)" icon={Ruler} placeholder="10" value={dimensions.height} onChange={(v: string) => setDimensions({ ...dimensions, height: v })} type="number" />
                                    </div>
                                </div>

                                {/* Weight Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <Scale className="h-4 w-4 text-primary" />
                                        </div>
                                        <h3 className="font-bold text-sm uppercase tracking-wide text-foreground">Weight</h3>
                                    </div>
                                    <PremiumInput label="Actual Weight (kg) *" icon={Scale} placeholder="e.g. 0.5" value={actualWeight} onChange={(v: string) => setActualWeight(v)} type="number" />
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="p-4 rounded-xl bg-muted/30 border border-muted/40 text-center">
                                            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Volumetric</div>
                                            <div className="text-xl font-black text-foreground mt-1">{weights.volumetric} <span className="text-xs font-medium text-muted-foreground">kg</span></div>
                                        </div>
                                        <div className="p-4 rounded-xl bg-muted/30 border border-muted/40 text-center">
                                            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Actual</div>
                                            <div className="text-xl font-black text-foreground mt-1">{weights.actual} <span className="text-xs font-medium text-muted-foreground">kg</span></div>
                                        </div>
                                        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                                            <div className="text-[10px] font-bold uppercase tracking-wide text-primary">Billable</div>
                                            <div className="text-xl font-black text-primary mt-1">{weights.billable} <span className="text-xs font-medium text-primary/70">kg</span></div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    )}

                    {/* STEP 3: Product Details */}
                    {step === 3 && (
                        <div className="p-8 lg:p-10 animate-in fade-in duration-500">
                            <div className="max-w-3xl mx-auto space-y-8">
                                <div className="text-center">
                                    <h2 className="text-3xl font-black">Product Details</h2>
                                    <p className="text-muted-foreground text-sm mt-1">Add product info for your shipment</p>
                                </div>

                                {/* Order ID & Ad Commission */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <PremiumInput label="Order ID (Optional)" icon={Hash} placeholder="e.g. ORD-1001" value={orderID} onChange={(v: string) => setOrderID(v)} />
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                            <Percent className="h-3 w-3" /> Ad Commission / COD Margin (Optional)
                                        </Label>
                                        <div className="flex gap-3 items-center">
                                            <div className="flex rounded-xl border-2 border-muted overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => setAdCommissionType(adCommissionType === 'flat' ? null : 'flat')}
                                                    className={`px-4 py-2.5 text-xs font-bold transition-colors ${
                                                        adCommissionType === 'flat'
                                                            ? 'bg-primary text-white'
                                                            : 'bg-white text-muted-foreground hover:bg-muted/30'
                                                    }`}
                                                >
                                                    Flat (₹)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdCommissionType(adCommissionType === 'percentage' ? null : 'percentage')}
                                                    className={`px-4 py-2.5 text-xs font-bold transition-colors ${
                                                        adCommissionType === 'percentage'
                                                            ? 'bg-primary text-white'
                                                            : 'bg-white text-muted-foreground hover:bg-muted/30'
                                                    }`}
                                                >
                                                    Percentage (%)
                                                </button>
                                            </div>
                                            {adCommissionType && (
                                                <Input
                                                    type="number"
                                                    placeholder={adCommissionType === 'flat' ? 'Amount in ₹' : 'e.g. 5'}
                                                    value={adCommissionValue ? adCommissionValue.toString() : ''}
                                                    onChange={(e) => setAdCommissionValue(parseFloat(e.target.value) || 0)}
                                                    className="h-12 w-40 bg-white border-2 border-muted focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl transition-all font-medium"
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Products List */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                <ShoppingBag className="h-4 w-4 text-primary" />
                                            </div>
                                            <h3 className="font-bold text-sm uppercase tracking-wide text-foreground">Products</h3>
                                        </div>
                                        <Button type="button" variant="outline" size="sm" onClick={addProduct} className="h-8 gap-1.5 text-xs font-bold">
                                            <Plus className="h-3 w-3" /> Add Product
                                        </Button>
                                    </div>

                                    {products.map((product, index) => (
                                        <div key={index} className="p-5 rounded-2xl border-2 border-muted/60 bg-white space-y-4 relative">
                                            {products.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeProduct(index)}
                                                    className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                                Product {products.length > 1 ? `#${index + 1}` : ''}
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                {/* SKU with datalist autocomplete */}
                                                <div className="space-y-2 group text-left">
                                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground group-focus-within:text-primary transition-colors flex items-center gap-2">
                                                        <Tag className="h-3 w-3" /> SKU
                                                    </Label>
                                                    <div className="relative">
                                                        <Input
                                                            type="text"
                                                            placeholder="Enter or select SKU"
                                                            value={product.sku}
                                                            onChange={(e) => updateProduct(index, 'sku', e.target.value)}
                                                            list="sku-history"
                                                            className="h-12 bg-white border-2 border-muted focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl transition-all font-medium text-foreground placeholder:text-muted-foreground/50 shadow-sm"
                                                        />
                                                    </div>
                                                </div>
                                                <PremiumInput
                                                    label="Product Name / Commodity *"
                                                    icon={Tag}
                                                    placeholder="e.g. Electronics"
                                                    value={product.name}
                                                    onChange={(v: string) => updateProduct(index, 'name', v)}
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <PremiumInput
                                                    label="Quantity *"
                                                    icon={Hash}
                                                    placeholder="1"
                                                    value={product.quantity.toString()}
                                                    onChange={(v: string) => updateProduct(index, 'quantity', parseInt(v) || 1)}
                                                    type="number"
                                                />
                                                <PremiumInput
                                                    label="Price per unit (₹) *"
                                                    icon={IndianRupee}
                                                    placeholder="e.g. 500"
                                                    value={product.price ? product.price.toString() : ''}
                                                    onChange={(v: string) => updateProduct(index, 'price', parseFloat(v) || 0)}
                                                    type="number"
                                                />
                                            </div>
                                        </div>
                                    ))}

                                    {/* SKU datalist for autocomplete */}
                                    <datalist id="sku-history">
                                        {skuHistory.map(sku => (
                                            <option key={sku} value={sku} />
                                        ))}
                                    </datalist>
                                </div>

                                {/* Total Declared Value */}
                                <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Declared Value</div>
                                        <div className="text-sm text-muted-foreground mt-0.5">Sum of all products (qty × price)</div>
                                    </div>
                                    <div className="text-3xl font-black text-primary">
                                        ₹{totalDeclaredValue.toLocaleString('en-IN')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: Courier Selection */}
                    {step === 4 && (
                        <div className="p-8 lg:p-10 animate-in fade-in duration-500">
                            <div className="max-w-3xl mx-auto space-y-8">
                                <div className="text-center">
                                    <h2 className="text-3xl font-black">Select Courier</h2>
                                    <p className="text-muted-foreground text-sm mt-1">Choose your courier partner and service type</p>
                                </div>

                                {/* Courier Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCourier('Blue Dart')}
                                        className={`group relative p-6 rounded-2xl border-2 transition-all text-left ${
                                            selectedCourier === 'Blue Dart'
                                                ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-white shadow-xl shadow-blue-100/50 scale-[1.02]'
                                                : 'border-muted hover:border-blue-300 hover:shadow-md bg-white'
                                        }`}
                                    >
                                        {selectedCourier === 'Blue Dart' && (
                                            <div className="absolute top-3 right-3">
                                                <BadgeCheck className="h-6 w-6 text-blue-500" />
                                            </div>
                                        )}
                                        <div className="flex items-center gap-4">
                                            <div className="h-14 w-14 rounded-xl overflow-hidden bg-white border border-muted/50 shadow-sm flex items-center justify-center p-1">
                                                <Image src="/logos/bluedart.jpg" alt="Blue Dart" width={48} height={48} className="object-contain" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-lg">Blue Dart</div>
                                                <div className="text-xs text-muted-foreground">Premium Express Delivery</div>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">Next-Day</span>
                                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">COD Available</span>
                                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">Pan India</span>
                                        </div>
                                    </button>

                                    <div
                                        className="group relative p-6 rounded-2xl border-2 border-muted bg-muted/10 text-left opacity-60 cursor-not-allowed"
                                    >
                                        <div className="absolute top-3 right-3">
                                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide">
                                                Coming Soon
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="h-14 w-14 rounded-xl overflow-hidden bg-white border border-muted/50 shadow-sm flex items-center justify-center p-1 grayscale">
                                                <Image src="/logos/dtdc.jpg" alt="DTDC" width={48} height={48} className="object-contain" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-lg text-muted-foreground">DTDC</div>
                                                <div className="text-xs text-muted-foreground">Smart Express Delivery</div>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">Economical</span>
                                            <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">Wide Network</span>
                                            <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">B2C Express</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Blue Dart Service Type Selection */}
                                {selectedCourier === 'Blue Dart' && (
                                    <div className="space-y-4 pt-2">
                                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                            <Truck className="h-3 w-3" /> Blue Dart Service Type
                                        </Label>
                                        <div className={`grid ${isB2C ? 'grid-cols-2 max-w-lg' : 'grid-cols-3'} gap-3`}>
                                            {(Object.entries(BLUEDART_SERVICE_TYPES) as [BlueDartServiceType, typeof BLUEDART_SERVICE_TYPES[BlueDartServiceType]][])
                                                .filter(([, service]) => !isB2C || !service.b2bOnly)
                                                .map(([key, service]) => {
                                                const isCODBlocked = !isB2C && enableCOD && service.code === 'D';
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => !isCODBlocked && setBlueDartServiceType(key)}
                                                        disabled={isCODBlocked}
                                                        className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                                                            isCODBlocked
                                                                ? 'border-muted bg-muted/20 opacity-50 cursor-not-allowed'
                                                                : blueDartServiceType === key
                                                                    ? 'border-blue-500 bg-blue-50 shadow-md'
                                                                    : 'border-muted hover:border-blue-200 bg-white'
                                                        }`}
                                                    >
                                                        <div className="font-bold text-sm">{service.displayName}</div>
                                                        <div className="text-[10px] text-muted-foreground mt-1">{service.description}</div>
                                                        {isCODBlocked && (
                                                            <div className="text-[9px] text-amber-600 font-bold mt-1">No COD</div>
                                                        )}
                                                        {!isCODBlocked && blueDartServiceType === key && (
                                                            <div className="absolute top-2 right-2">
                                                                <BadgeCheck className="h-4 w-4 text-blue-500" />
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* COD Option */}
                                        <div className="flex items-center justify-between p-4 rounded-xl border-2 border-muted bg-white">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                    <HandCoins className="h-5 w-5 text-primary" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm">Cash on Delivery (COD)</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {isB2C ? 'Available with Dart Apex & Bharat Dart' : 'Available with Dart Apex, Bharat Dart & Dart Surfaceline'}
                                                    </div>
                                                </div>
                                            </div>
                                            <Switch
                                                checked={enableCOD}
                                                onCheckedChange={(checked) => {
                                                    setEnableCOD(checked);
                                                    if (!isB2C && checked && BLUEDART_SERVICE_TYPES[blueDartServiceType].code === 'D') {
                                                        setBlueDartServiceType('APEX');
                                                        toast.info("Switched to Dart Apex — COD is not available for Domestic Priority");
                                                    }
                                                }}
                                            />
                                        </div>

                                        {/* COD Amount Input */}
                                        {enableCOD && (
                                            <div className="space-y-2 animate-in fade-in duration-300">
                                                <Label className="text-xs font-bold uppercase text-muted-foreground">COD Amount (₹)</Label>
                                                <Input
                                                    type="number"
                                                    placeholder="Amount to collect"
                                                    value={codAmount}
                                                    onChange={(e) => setCodAmount(e.target.value)}
                                                    className="h-12 rounded-xl border-2"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Order Summary */}
                                <div className="p-5 rounded-2xl bg-muted/20 border border-muted/40 space-y-3">
                                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Order Summary</div>
                                    <div className="grid grid-cols-3 gap-3 text-sm">
                                        <div>
                                            <div className="text-muted-foreground text-[10px] font-bold uppercase">From</div>
                                            <div className="font-semibold truncate">{pickup.city || pickup.pincode}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-[10px] font-bold uppercase">To</div>
                                            <div className="font-semibold truncate">{delivery.city || delivery.pincode}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-[10px] font-bold uppercase">Weight</div>
                                            <div className="font-semibold">{weights.billable} kg</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="p-6 lg:p-8 bg-white/90 border-t flex justify-between items-center">
                        <Button variant="ghost" onClick={handleBack} disabled={step === 1 || loading} className="h-12 px-6 font-bold">
                            Back
                        </Button>

                        {step === 1 && (
                            <Button onClick={handleRouteNext} className="h-14 px-10 rounded-full bg-primary font-bold text-lg gap-2">
                                Continue to Package <ChevronRight className="h-5 w-5" />
                            </Button>
                        )}
                        {step === 2 && (
                            <Button onClick={handlePackageNext} className="h-14 px-10 rounded-full bg-primary font-bold text-lg gap-2">
                                Add Products <ChevronRight className="h-5 w-5" />
                            </Button>
                        )}
                        {step === 3 && (
                            <Button onClick={handleProductNext} className="h-14 px-10 rounded-full bg-primary font-bold text-lg gap-2">
                                Choose Courier <ChevronRight className="h-5 w-5" />
                            </Button>
                        )}
                        {step === 4 && (
                            <Button onClick={handleBook} disabled={loading} className="h-14 px-10 rounded-full bg-primary font-bold text-lg gap-2">
                                {loading ? <Loader2 className="animate-spin" /> : <Truck className="h-5 w-5" />}
                                Book via {selectedCourier}
                            </Button>
                        )}
                    </div>
                </CardContent >
            </Card >
        </div >
    );
};

export default AddShipment;
