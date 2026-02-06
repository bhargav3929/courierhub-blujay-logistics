'use client';

import { useState, useMemo, useEffect } from "react";
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
    Info,
    Globe,
    Building2,
    PhoneCall,
    UserCircle,
    BadgeCheck,
    Loader2,
    Star,
    ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createShipment, getShipmentById, updateShipment } from "@/services/shipmentService";
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
    const [blueDartServiceType, setBlueDartServiceType] = useState<BlueDartServiceType>('STANDARD');
    const [enableCOD, setEnableCOD] = useState(false);
    const [codAmount, setCodAmount] = useState("");

    // Form States - Pickup starts empty (will load from saved default)
    const [pickup, setPickup] = useState({ name: "", phone: "", pincode: "", address: "", city: "", state: "", country: "India" });
    // Delivery always starts empty
    const [delivery, setDelivery] = useState({ name: "", phone: "", pincode: "", address: "", city: "", state: "", country: "India" });
    const [dimensions, setDimensions] = useState({ length: "10", width: "10", height: "10" });
    const [actualWeight, setActualWeight] = useState("0.5");
    const [commodity, setCommodity] = useState({ description: "", value: "" });

    const router = useRouter();
    const searchParams = useSearchParams();
    const shopifyShipmentId = searchParams.get('shopifyShipmentId');
    const [shopifySourceId, setShopifySourceId] = useState<string | null>(null);
    const { currentUser } = useAuth();

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

            if (shipment.declaredValue) {
                setCommodity(prev => ({ ...prev, value: shipment.declaredValue!.toString() }));
            }
        };
        loadShopifyOrder();
    }, [shopifyShipmentId]);

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
        // Validate COD amount if COD is enabled (Blue Dart only)
        if (selectedCourier === 'Blue Dart' && enableCOD) {
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
            const referenceNo = `ORDER ${Date.now().toString().slice(-6)}`;

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
                    IsToPayCustomer: enableCOD
                },
                Services: {
                    ProductCode: selectedService.code,
                    ProductType: 0,
                    PieceCount: "1",
                    PackType: "",
                    ActualWeight: weights.actual.toString(),
                    Dimensions: [
                        {
                            Length: dimensions.length,
                            Breadth: dimensions.width,
                            Height: dimensions.height,
                            Count: "1"
                        }
                    ],
                    CollectableAmount: codAmountValue,
                    DeclaredValue: parseFloat(commodity.value) || 200,
                    CreditReferenceNo: referenceNo,
                    PickupDate: `/Date(${new Date().getTime() + 24 * 60 * 60 * 1000})/`,
                    PickupTime: BLUEDART_PREDEFINED.pickupTime,
                    PDFOutputNotRequired: false,
                    Commodity: {
                        CommodityDetail1: commodity.description
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
            clientType: shopifySourceId ? 'shopify' as const : 'franchise' as const,
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
            declaredValue: parseFloat(commodity.value) || BLUEDART_PREDEFINED.defaultDeclaredValue,
            commodityDetail1: commodity.description,
            officeClosureTime: BLUEDART_PREDEFINED.officeClosureTime,
            awbNo,
            blueDartStatus,
            destinationArea,
            destinationLocation,
            tokenNumber,
            // Blue Dart service options
            blueDartServiceType: selectedService.name,
            blueDartServiceCode: selectedService.code,
            toPayCustomer: enableCOD,
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
            description: commodity.description || 'General Goods',
            dimension_unit: DTDC_PREDEFINED.dimensionUnit,
            length: dimensions.length,
            width: dimensions.width,
            height: dimensions.height,
            weight_unit: DTDC_PREDEFINED.weightUnit,
            weight: weights.actual.toString(),
            declared_value: commodity.value || DTDC_PREDEFINED.defaultDeclaredValue,
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
            clientType: shopifySourceId ? 'shopify' as const : 'franchise' as const,
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
            declaredValue: parseFloat(commodity.value) || parseFloat(DTDC_PREDEFINED.defaultDeclaredValue),
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

    // STEP 2: Validate package details and move to courier step
    const handlePackageNext = () => {
        if (!weights.billable || weights.billable <= 0) {
            toast.error("Please enter valid weight");
            return;
        }
        if (!commodity.value || parseFloat(commodity.value) <= 0) {
            toast.error("Please enter commodity value");
            return;
        }
        toast.success("Package details saved!");
        setStep(3);
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
                <p className="text-muted-foreground font-medium">Simple 3-step booking</p>
            </div>

            {shopifyShipmentId && (
                <div className="bg-[#95BF47]/10 border border-[#95BF47] rounded-xl p-4 text-center">
                    <p className="text-sm font-bold text-[#5e8e3e]">
                        Pre-filled from Shopify Order — review details and fill any missing fields before booking.
                    </p>
                </div>
            )}

            {/* 3-Step Progress */}
            <div className="flex justify-center items-center gap-4 max-w-2xl mx-auto">
                {[
                    { num: 1, label: "Addresses", icon: MapPin },
                    { num: 2, label: "Package", icon: Package },
                    { num: 3, label: "Courier", icon: Truck },
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
                        {i < 2 && <div className={`w-16 h-1 rounded-full mb-5 ${step > s.num ? "bg-primary" : "bg-muted"}`} />}
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
                                    <div>
                                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 text-[10px] font-bold uppercase tracking-wider">
                                            To
                                        </span>
                                        <h2 className="text-2xl font-black mt-2">Delivery Address</h2>
                                    </div>
                                    <div className="grid gap-4">
                                        <PremiumInput label="Receiver Name *" icon={UserCircle} placeholder="Receiver's name" value={delivery.name} onChange={(v: any) => setDelivery({ ...delivery, name: v })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <PremiumInput label="Mobile *" icon={PhoneCall} placeholder="10 digits" value={delivery.phone} onChange={(v: any) => setDelivery({ ...delivery, phone: v })} />
                                            <PremiumInput label="Pincode *" icon={MapPin} placeholder="6 digits" value={delivery.pincode} onChange={(v: any) => setDelivery({ ...delivery, pincode: v })} />
                                        </div>
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
                                    <p className="text-muted-foreground text-sm mt-1">Enter dimensions, weight, and commodity info</p>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Length (cm)</Label>
                                            <Input type="number" value={dimensions.length} onChange={(e) => setDimensions({ ...dimensions, length: e.target.value })} className="h-14 text-xl font-bold text-center rounded-xl border-2" />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Width (cm)</Label>
                                            <Input type="number" value={dimensions.width} onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })} className="h-14 text-xl font-bold text-center rounded-xl border-2" />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Height (cm)</Label>
                                            <Input type="number" value={dimensions.height} onChange={(e) => setDimensions({ ...dimensions, height: e.target.value })} className="h-14 text-xl font-bold text-center rounded-xl border-2" />
                                        </div>
                                    </div>

                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2">
                                            <Package className="h-3 w-3" /> Actual Weight (kg) *
                                        </Label>
                                        <Input
                                            type="number"
                                            placeholder="e.g. 0.5"
                                            value={actualWeight}
                                            onChange={(e) => setActualWeight(e.target.value)}
                                            className="h-14 text-xl font-bold rounded-xl border-2 pl-5"
                                        />
                                    </div>

                                    {/* Weight Summary */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="p-3 rounded-xl bg-muted/30 text-center">
                                            <div className="text-[10px] font-bold uppercase text-muted-foreground">Volumetric</div>
                                            <div className="text-lg font-black text-foreground">{weights.volumetric} kg</div>
                                        </div>
                                        <div className="p-3 rounded-xl bg-muted/30 text-center">
                                            <div className="text-[10px] font-bold uppercase text-muted-foreground">Actual</div>
                                            <div className="text-lg font-black text-foreground">{weights.actual} kg</div>
                                        </div>
                                        <div className="p-3 rounded-xl bg-primary/10 text-center">
                                            <div className="text-[10px] font-bold uppercase text-primary">Billable</div>
                                            <div className="text-lg font-black text-primary">{weights.billable} kg</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Commodity</Label>
                                            <Input
                                                placeholder="e.g. Electronics"
                                                value={commodity.description}
                                                onChange={(e) => setCommodity({ ...commodity, description: e.target.value })}
                                                className="h-12 rounded-xl border-2"
                                            />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2">
                                                <Info className="h-3 w-3" /> Value (₹) *
                                            </Label>
                                            <Input
                                                type="number"
                                                placeholder="e.g. 500"
                                                value={commodity.value}
                                                onChange={(e) => setCommodity({ ...commodity, value: e.target.value })}
                                                className="h-12 rounded-xl border-2"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Courier Selection */}
                    {step === 3 && (
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
                                        <div className="grid grid-cols-3 gap-3">
                                            {(Object.entries(BLUEDART_SERVICE_TYPES) as [BlueDartServiceType, typeof BLUEDART_SERVICE_TYPES[BlueDartServiceType]][]).map(([key, service]) => (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => setBlueDartServiceType(key)}
                                                    className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                                                        blueDartServiceType === key
                                                            ? 'border-blue-500 bg-blue-50 shadow-md'
                                                            : 'border-muted hover:border-blue-200 bg-white'
                                                    }`}
                                                >
                                                    <div className="font-bold text-sm">{service.displayName}</div>
                                                    <div className="text-[10px] text-muted-foreground mt-1">{service.description}</div>
                                                    {blueDartServiceType === key && (
                                                        <div className="absolute top-2 right-2">
                                                            <BadgeCheck className="h-4 w-4 text-blue-500" />
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>

                                        {/* COD Option */}
                                        <div className="flex items-center justify-between p-4 rounded-xl border-2 border-muted bg-white">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                                                    <Info className="h-5 w-5 text-amber-600" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm">Cash on Delivery (COD)</div>
                                                    <div className="text-[10px] text-muted-foreground">Collect payment on delivery</div>
                                                </div>
                                            </div>
                                            <Switch
                                                checked={enableCOD}
                                                onCheckedChange={setEnableCOD}
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
                                Choose Courier <ChevronRight className="h-5 w-5" />
                            </Button>
                        )}
                        {step === 3 && (
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
